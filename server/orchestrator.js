import { emit } from './bus.js';
import { streamCompletion } from './llm.js';
import {
  addMessage,
  db,
  getMessages,
  patchMessage,
  resolveConversation,
} from './store.js';
import {
  channelSystemPrompt,
  dmSystemPrompt,
  routerSystemPrompt,
  summarySystemPrompt,
  transcriptBlock,
} from './prompts.js';

/** Kørende samtaler: conversationId -> { controller, label } */
const runs = new Map();

export function isRunning(conversationId) {
  return runs.has(conversationId);
}

export function runLabel(conversationId) {
  return runs.get(conversationId)?.label || null;
}

export function stopRun(conversationId) {
  const run = runs.get(conversationId);
  if (!run) return false;
  run.controller.abort();
  runs.delete(conversationId);
  emit('run', { conversationId, running: false, stopped: true });
  return true;
}

function beginRun(conversationId, label) {
  stopRun(conversationId);
  const controller = new AbortController();
  runs.set(conversationId, { controller, label });
  emit('run', { conversationId, running: true, label });
  return controller;
}

function endRun(conversationId, controller) {
  const current = runs.get(conversationId);
  if (current?.controller === controller) {
    runs.delete(conversationId);
    emit('run', { conversationId, running: false });
  }
}

function settings() {
  return db().settings || {};
}

// ------------------------------------------------------------- én medarbejder

/** Lader én medarbejder skrive et svar, streamet ud til alle lyttere. */
async function speak({ conversationId, agent, system, messages, signal, temperature, kind = 'chat' }) {
  emit('typing', { conversationId, agentId: agent.id, on: true });
  const placeholder = addMessage(conversationId, {
    role: 'agent',
    agentId: agent.id,
    text: '',
    pending: true,
    kind,
  });
  emit('message', placeholder);

  let buffer = '';
  let flushTimer = null;
  const flush = () => {
    flushTimer = null;
    patchMessage(conversationId, placeholder.id, { text: buffer });
  };

  try {
    const text = await streamCompletion({
      system,
      messages,
      model: agent.model || undefined,
      temperature: temperature ?? agent.temperature ?? 0.7,
      signal,
      onDelta: (delta) => {
        buffer += delta;
        emit('delta', { conversationId, messageId: placeholder.id, delta });
        if (!flushTimer) flushTimer = setTimeout(flush, 300);
      },
    });
    if (flushTimer) clearTimeout(flushTimer);
    const finalText = (text || buffer).trim();
    const done = patchMessage(conversationId, placeholder.id, { text: finalText, pending: false });
    emit('message.done', done);
    emit('typing', { conversationId, agentId: agent.id, on: false });
    return finalText;
  } catch (err) {
    if (flushTimer) clearTimeout(flushTimer);
    const aborted = err?.name === 'AbortError' || signal?.aborted;
    const done = patchMessage(conversationId, placeholder.id, {
      text: buffer.trim() || (aborted ? '_(afbrudt)_' : ''),
      pending: false,
      error: aborted ? null : err.message,
    });
    emit('message.done', done);
    emit('typing', { conversationId, agentId: agent.id, on: false });
    if (!aborted) console.error(`[orkestrator] ${agent.name} fejlede:`, err.message);
    return done?.text || '';
  }
}

// --------------------------------------------------------------- privat samtale

export async function runDmTurn(conversationId) {
  const conv = resolveConversation(conversationId);
  if (!conv || conv.kind !== 'dm') throw new Error('Ukendt samtale');
  const controller = beginRun(conversationId, `${conv.agent.name} svarer`);

  try {
    const history = getMessages(conversationId, 40)
      .filter((m) => m.text?.trim() && !m.error && !m.pending)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text.trim() }));

    // API'erne vil have en brugerbesked foerst og til sidst.
    while (history.length && history[0].role !== 'user') history.shift();
    if (!history.length || history[history.length - 1].role !== 'user') return;

    await speak({
      conversationId,
      agent: conv.agent,
      system: dmSystemPrompt(conv.agent),
      messages: mergeSameRole(history),
      signal: controller.signal,
    });
  } finally {
    endRun(conversationId, controller);
  }
}

// ------------------------------------------------------------------- teamrum

/** Finder @navne i en tekst og oversaetter dem til medarbejdere i rummet. */
export function parseMentions(text, members) {
  if (!text) return [];
  const hits = [];
  for (const member of members) {
    const first = member.name.split(/\s+/)[0];
    const pattern = new RegExp(`@${escapeRegExp(first)}\\b`, 'i');
    if (pattern.test(text)) hits.push(member);
  }
  return hits;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Beder en lille model om at vaelge de mest relevante talere. Falder tilbage til rotation. */
async function pickSpeakers({ channel, members, transcript, signal, max = 3 }) {
  if (members.length <= 1) return members;
  try {
    const raw = await streamCompletion({
      system: routerSystemPrompt(channel, members),
      messages: [{ role: 'user', content: `${transcript}\n\nHvem skal svare nu? Svar kun med id'er.` }],
      temperature: 0,
      maxTokens: 60,
      signal,
    });
    const chosen = members.filter((m) => raw.includes(m.id));
    if (chosen.length) return chosen.slice(0, max);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.error('[orkestrator] ordstyrer fejlede, bruger fallback:', err.message);
  }
  return members.slice(0, Math.min(max, members.length));
}

function channelMessagesFor(conversationId, members, extraInstruction) {
  const history = getMessages(conversationId, 60).filter((m) => !m.pending);
  const transcript = transcriptBlock(history, members, settings().userName);
  const content = [
    transcript ? `--- SAMTALEN INDTIL NU ---\n${transcript}\n--- SLUT PÅ SAMTALEN ---` : 'Samtalen er lige begyndt.',
    extraInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { transcript, messages: [{ role: 'user', content }] };
}

/**
 * Kører en runde i et teamrum efter en besked fra brugeren.
 * mode: 'auto' (ordstyrer vælger) | 'all' (alle svarer) | 'mentions' (kun de nævnte)
 */
export async function runChannelTurn(conversationId, { mode = 'auto', lastText = '' } = {}) {
  const conv = resolveConversation(conversationId);
  if (!conv || conv.kind !== 'channel') throw new Error('Ukendt teamrum');
  if (!conv.members.length) return;

  const controller = beginRun(conversationId, 'Holdet svarer');
  try {
    const mentioned = parseMentions(lastText, conv.members);
    let speakers;
    if (mentioned.length) speakers = mentioned;
    else if (mode === 'mentions') speakers = [];
    else if (mode === 'all') speakers = conv.members;
    else {
      const { transcript } = channelMessagesFor(conversationId, conv.members);
      speakers = await pickSpeakers({ channel: conv.channel, members: conv.members, transcript, signal: controller.signal });
    }

    for (const agent of speakers) {
      if (controller.signal.aborted) break;
      const { messages } = channelMessagesFor(
        conversationId,
        conv.members,
        `Du er ${agent.name}. Skriv din næste replik i samtalen nu.`,
      );
      await speak({
        conversationId,
        agent,
        system: channelSystemPrompt(agent, conv.channel, conv.members),
        messages,
        signal: controller.signal,
      });
    }
  } finally {
    endRun(conversationId, controller);
  }
}

/**
 * Intern diskussion: medarbejderne taler med hinanden i et antal runder,
 * uden at brugeren behøver at skrive imellem.
 */
export async function startDiscussion(conversationId, { topic, rounds = 3, summarize = true, mode = 'round-robin' } = {}) {
  const conv = resolveConversation(conversationId);
  if (!conv || conv.kind !== 'channel') throw new Error('Ukendt teamrum');
  if (conv.members.length < 2) throw new Error('Der skal være mindst to medarbejdere i rummet');

  const totalRounds = Math.min(8, Math.max(1, Number(rounds) || 3));
  const controller = beginRun(conversationId, 'Intern diskussion');

  const opener = addMessage(conversationId, {
    role: 'system',
    text: `Intern diskussion sat i gang: **${topic}** (${totalRounds} runder)`,
    kind: 'notice',
  });
  emit('message', opener);
  emit('message.done', opener);

  (async () => {
    try {
      for (let round = 1; round <= totalRounds; round += 1) {
        if (controller.signal.aborted) break;
        emit('discussion', { conversationId, round, rounds: totalRounds, running: true });

        let speakers;
        if (mode === 'auto') {
          const { transcript } = channelMessagesFor(conversationId, conv.members);
          speakers = await pickSpeakers({
            channel: conv.channel,
            members: conv.members,
            transcript,
            signal: controller.signal,
            max: Math.min(3, conv.members.length),
          });
        } else {
          // Rundgang, med skiftende startperson så det ikke bliver den samme rækkefølge hver gang.
          const offset = (round - 1) % conv.members.length;
          speakers = [...conv.members.slice(offset), ...conv.members.slice(0, offset)];
        }

        for (const agent of speakers) {
          if (controller.signal.aborted) break;
          const instruction = round === 1
            ? `Du er ${agent.name}. Giv din første reaktion på emnet: "${topic}".`
            : `Du er ${agent.name}. Fortsæt diskussionen om "${topic}". Svar på det kollegerne lige har sagt.`;
          const { messages } = channelMessagesFor(conversationId, conv.members, instruction);
          await speak({
            conversationId,
            agent,
            system: channelSystemPrompt(agent, conv.channel, conv.members, {
              discussion: { topic, round, rounds: totalRounds },
            }),
            messages,
            signal: controller.signal,
          });
        }
      }

      if (summarize && !controller.signal.aborted) {
        const lead = conv.members[0];
        const { messages } = channelMessagesFor(
          conversationId,
          conv.members,
          `Du er ${lead.name}. Skriv opsamlingen på diskussionen om "${topic}" nu.`,
        );
        await speak({
          conversationId,
          agent: lead,
          system: summarySystemPrompt(lead, conv.channel, topic),
          messages,
          signal: controller.signal,
          temperature: 0.3,
          kind: 'summary',
        });
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('[orkestrator] diskussion fejlede:', err.message);
        const msg = addMessage(conversationId, {
          role: 'system',
          text: `Diskussionen stoppede med en fejl: ${err.message}`,
          kind: 'notice',
          error: err.message,
        });
        emit('message', msg);
        emit('message.done', msg);
      }
    } finally {
      emit('discussion', { conversationId, running: false });
      endRun(conversationId, controller);
    }
  })();

  return { rounds: totalRounds };
}

/** Slaar to beskeder med samme rolle sammen – nogle API'er afviser to i traek. */
function mergeSameRole(messages) {
  const out = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.content += `\n\n${m.content}`;
    else out.push({ ...m });
  }
  return out;
}

/** Venter til der ikke koerer noget mere i samtalen (bruges af testene). */
export function waitForIdle(conversationId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = setInterval(() => {
      if (!isRunning(conversationId)) {
        clearInterval(tick);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(tick);
        reject(new Error('timeout mens der blev ventet på samtalen'));
      }
    }, 50);
  });
}
