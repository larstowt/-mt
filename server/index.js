import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from './env.js';
loadEnv();

import { emit, subscribe } from './bus.js';
import { providerStatus } from './llm.js';
import { readJsonBody, sendJson, serveStatic } from './http.js';
import {
  addMessage,
  clearConversation,
  createAgent,
  createChannel,
  db,
  deleteAgent,
  deleteChannel,
  getMessages,
  listAgents,
  listChannels,
  resolveConversation,
  save,
  updateAgent,
  updateChannel,
} from './store.js';
import {
  isRunning,
  runChannelTurn,
  runDmTurn,
  startDiscussion,
  stopRun,
} from './orchestrator.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

const routes = [
  ['GET', /^\/api\/state$/, handleState],
  ['GET', /^\/api\/events$/, handleEvents],
  ['GET', /^\/api\/conversations\/([^/]+)\/messages$/, handleGetMessages],
  ['POST', /^\/api\/conversations\/([^/]+)\/messages$/, handlePostMessage],
  ['POST', /^\/api\/conversations\/([^/]+)\/stop$/, handleStop],
  ['POST', /^\/api\/conversations\/([^/]+)\/clear$/, handleClear],
  ['POST', /^\/api\/conversations\/([^/]+)\/nudge$/, handleNudge],
  ['POST', /^\/api\/agents$/, handleCreateAgent],
  ['PATCH', /^\/api\/agents\/([^/]+)$/, handleUpdateAgent],
  ['DELETE', /^\/api\/agents\/([^/]+)$/, handleDeleteAgent],
  ['POST', /^\/api\/channels$/, handleCreateChannel],
  ['PATCH', /^\/api\/channels\/([^/]+)$/, handleUpdateChannel],
  ['DELETE', /^\/api\/channels\/([^/]+)$/, handleDeleteChannel],
  ['POST', /^\/api\/channels\/([^/]+)\/discussion$/, handleDiscussion],
  ['PATCH', /^\/api\/settings$/, handleSettings],
];

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    for (const [method, pattern, handler] of routes) {
      if (req.method !== method) continue;
      const match = pattern.exec(url.pathname);
      if (!match) continue;
      await handler(req, res, match.slice(1).map(decodeURIComponent), url);
      return;
    }
    if (req.method === 'GET' && serveStatic(publicDir, url.pathname, res)) return;
    sendJson(res, 404, { error: 'Ikke fundet' });
  } catch (err) {
    console.error('[http]', err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message });
    else res.end();
  }
});

// ------------------------------------------------------------------ handlere

function handleState(req, res) {
  const state = db();
  sendJson(res, 200, {
    agents: state.agents,
    channels: state.channels,
    settings: state.settings,
    provider: providerStatus(),
  });
}

function handleEvents(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(': forbundet\n\n');

  const unsubscribe = subscribe((event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
  });
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  ping.unref?.();

  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
}

function handleGetMessages(req, res, [conversationId]) {
  const conv = resolveConversation(conversationId);
  if (!conv) return sendJson(res, 404, { error: 'Ukendt samtale' });
  sendJson(res, 200, {
    conversation: {
      id: conv.id,
      kind: conv.kind,
      members: conv.members.map((m) => m.id),
      running: isRunning(conv.id),
    },
    messages: getMessages(conversationId),
  });
}

async function handlePostMessage(req, res, [conversationId]) {
  const conv = resolveConversation(conversationId);
  if (!conv) return sendJson(res, 404, { error: 'Ukendt samtale' });

  const body = await readJsonBody(req);
  const text = String(body.text || '').trim();
  if (!text) return sendJson(res, 400, { error: 'Tom besked' });

  const message = addMessage(conversationId, { role: 'user', text });
  emit('message', message);
  emit('message.done', message);

  const mode = body.mode || 'auto';
  const turn = conv.kind === 'dm'
    ? runDmTurn(conversationId)
    : runChannelTurn(conversationId, { mode, lastText: text });
  turn.catch((err) => console.error('[tur]', err.message));

  sendJson(res, 202, { message });
}

function handleStop(req, res, [conversationId]) {
  sendJson(res, 200, { stopped: stopRun(conversationId) });
}

function handleClear(req, res, [conversationId]) {
  stopRun(conversationId);
  clearConversation(conversationId);
  emit('cleared', { conversationId });
  sendJson(res, 200, { ok: true });
}

/** Får en bestemt medarbejder til at tage ordet uden at brugeren skriver noget. */
async function handleNudge(req, res, [conversationId]) {
  const conv = resolveConversation(conversationId);
  if (!conv || conv.kind !== 'channel') return sendJson(res, 400, { error: 'Kun i teamrum' });
  const body = await readJsonBody(req);
  const agent = conv.members.find((m) => m.id === body.agentId);
  if (!agent) return sendJson(res, 404, { error: 'Medarbejderen er ikke i rummet' });

  runChannelTurn(conversationId, { mode: 'mentions', lastText: `@${agent.name.split(/\s+/)[0]}` })
    .catch((err) => console.error('[tur]', err.message));
  sendJson(res, 202, { ok: true });
}

async function handleCreateAgent(req, res) {
  const agent = createAgent(await readJsonBody(req));
  emit('agents', { agents: listAgents() });
  sendJson(res, 201, { agent });
}

async function handleUpdateAgent(req, res, [id]) {
  const agent = updateAgent(id, await readJsonBody(req));
  if (!agent) return sendJson(res, 404, { error: 'Ukendt medarbejder' });
  emit('agents', { agents: listAgents() });
  sendJson(res, 200, { agent });
}

function handleDeleteAgent(req, res, [id]) {
  const ok = deleteAgent(id);
  emit('agents', { agents: listAgents(), channels: listChannels() });
  sendJson(res, ok ? 200 : 404, { ok });
}

async function handleCreateChannel(req, res) {
  const channel = createChannel(await readJsonBody(req));
  emit('channels', { channels: listChannels() });
  sendJson(res, 201, { channel });
}

async function handleUpdateChannel(req, res, [id]) {
  const channel = updateChannel(id, await readJsonBody(req));
  if (!channel) return sendJson(res, 404, { error: 'Ukendt teamrum' });
  emit('channels', { channels: listChannels() });
  sendJson(res, 200, { channel });
}

function handleDeleteChannel(req, res, [id]) {
  const ok = deleteChannel(id);
  emit('channels', { channels: listChannels() });
  sendJson(res, ok ? 200 : 404, { ok });
}

async function handleDiscussion(req, res, [id]) {
  const body = await readJsonBody(req);
  const topic = String(body.topic || '').trim();
  if (!topic) return sendJson(res, 400, { error: 'Diskussionen mangler et emne' });
  try {
    const info = await startDiscussion(`ch:${id}`, {
      topic,
      rounds: body.rounds,
      summarize: body.summarize !== false,
      mode: body.mode === 'auto' ? 'auto' : 'round-robin',
    });
    sendJson(res, 202, info);
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

async function handleSettings(req, res) {
  const patch = await readJsonBody(req);
  const state = db();
  for (const key of ['workspaceName', 'userName', 'companyContext']) {
    if (typeof patch[key] === 'string') state.settings[key] = patch[key];
  }
  save();
  emit('settings', { settings: state.settings });
  sendJson(res, 200, { settings: state.settings });
}

// ---------------------------------------------------------------------- start

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT) || 4173;
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => {
    const status = providerStatus();
    console.log(`\n  AI-medarbejdere kører på http://${host}:${port}`);
    console.log(`  Model: ${status.label} – ${status.model}${status.demo ? '  (DEMO – sæt en API-nøgle i .env)' : ''}\n`);
  });
}
