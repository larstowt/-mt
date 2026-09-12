/**
 * Udbyder-lag. Ingen SDK'er – bare fetch mod de to API-former der daekker det meste:
 *   - Anthropic Messages API   (Claude)
 *   - OpenAI-kompatibelt chat/completions (xAI/Grok, OpenAI, OpenRouter, Ollama, LM Studio ...)
 * Uden API-noegle koeres der i demo-tilstand med simulerede svar, saa hele interfacet
 * kan afproeves uden konto.
 */

const env = process.env;

function pick(...names) {
  for (const n of names) {
    const v = env[n];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

export function providerConfig() {
  const forced = pick('AI_PROVIDER').toLowerCase();
  const anthropicKey = pick('ANTHROPIC_API_KEY');
  const xaiKey = pick('XAI_API_KEY');
  const openaiKey = pick('OPENAI_API_KEY');
  const override = pick('DEFAULT_MODEL');

  const build = (name) => {
    switch (name) {
      case 'anthropic':
        return {
          name: 'anthropic',
          label: 'Anthropic (Claude)',
          api: 'anthropic',
          key: anthropicKey,
          baseUrl: pick('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com',
          model: override || pick('ANTHROPIC_MODEL') || 'claude-sonnet-5',
        };
      case 'xai':
        return {
          name: 'xai',
          label: 'xAI (Grok)',
          api: 'openai',
          key: xaiKey,
          baseUrl: pick('XAI_BASE_URL') || 'https://api.x.ai/v1',
          model: override || pick('XAI_MODEL') || 'grok-4',
        };
      case 'openai':
        return {
          name: 'openai',
          label: 'OpenAI-kompatibel',
          api: 'openai',
          key: openaiKey,
          baseUrl: pick('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
          model: override || pick('OPENAI_MODEL') || 'gpt-4.1',
        };
      default:
        return { name: 'mock', label: 'Demo-tilstand (ingen API-nøgle)', api: 'mock', key: '', baseUrl: '', model: 'demo' };
    }
  };

  if (forced) return build(forced);
  if (anthropicKey) return build('anthropic');
  if (xaiKey) return build('xai');
  if (openaiKey) return build('openai');
  return build('mock');
}

export function providerStatus() {
  const cfg = providerConfig();
  return {
    provider: cfg.name,
    label: cfg.label,
    model: cfg.model,
    ready: cfg.api === 'mock' ? false : Boolean(cfg.key),
    demo: cfg.api === 'mock' || !cfg.key,
  };
}

/**
 * Streamer et svar. `onDelta(tekst)` kaldes loebende. Returnerer den fulde tekst.
 * `messages` er [{role:'user'|'assistant', content:string}].
 */
export async function streamCompletion({ system, messages, model, temperature = 0.7, maxTokens = 900, signal, onDelta }) {
  const cfg = providerConfig();
  const useModel = model || cfg.model;

  if (cfg.api === 'mock' || !cfg.key) {
    return mockStream({ system, messages, onDelta, signal });
  }
  if (cfg.api === 'anthropic') {
    return anthropicStream({ cfg, useModel, system, messages, temperature, maxTokens, signal, onDelta });
  }
  return openaiStream({ cfg, useModel, system, messages, temperature, maxTokens, signal, onDelta });
}

// ------------------------------------------------------------------ Anthropic

async function anthropicStream({ cfg, useModel, system, messages, temperature, maxTokens, signal, onDelta }) {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: useModel,
      max_tokens: maxTokens,
      temperature,
      system,
      stream: true,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  await assertOk(res);

  let text = '';
  for await (const evt of sseEvents(res.body)) {
    if (evt.data === '[DONE]') break;
    let payload;
    try {
      payload = JSON.parse(evt.data);
    } catch {
      continue;
    }
    if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
      text += payload.delta.text;
      onDelta?.(payload.delta.text);
    } else if (payload.type === 'error') {
      throw new Error(payload.error?.message || 'Ukendt fejl fra Anthropic');
    }
  }
  return text;
}

// ----------------------------------------------------------- OpenAI-kompatibel

async function openaiStream({ cfg, useModel, system, messages, temperature, maxTokens, signal, onDelta }) {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.key}`,
    },
    body: JSON.stringify({
      model: useModel,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  await assertOk(res);

  let text = '';
  for await (const evt of sseEvents(res.body)) {
    if (evt.data === '[DONE]') break;
    let payload;
    try {
      payload = JSON.parse(evt.data);
    } catch {
      continue;
    }
    const delta = payload.choices?.[0]?.delta?.content;
    if (delta) {
      text += delta;
      onDelta?.(delta);
    }
  }
  return text;
}

async function assertOk(res) {
  if (res.ok) return;
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 500);
  } catch {
    /* ignoreres */
  }
  throw new Error(`API svarede ${res.status}: ${detail || res.statusText}`);
}

/** Generisk SSE-parser over en fetch-body. */
async function* sseEvents(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = { event: 'message', data: '' };
      const dataLines = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event.event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      event.data = dataLines.join('\n');
      if (event.data) yield event;
    }
  }
}

// ---------------------------------------------------------------------- demo

const demoOpeners = [
  'Kort fra mig:',
  'Min vinkel på det:',
  'Jeg er delvist enig, men',
  'Lad mig lige udfordre den:',
  'Konkret forslag:',
];

/** Simuleret svar, saa UI, streaming og diskussioner kan afproeves uden noegle. */
async function mockStream({ system, messages, onDelta, signal }) {
  const who = /Du er ([^,]+),/.exec(system || '')?.[1] || 'Medarbejderen';
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  // I teamrum er beskeden et helt transskript – vis kun selve instruktionen til sidst.
  const tail = last.split('--- SLUT PÅ SAMTALEN ---').pop();
  const subject = tail.replace(/\s+/g, ' ').trim().replace(/^Du er [^.]+\.\s*/, '').slice(0, 120) || 'emnet';
  const opener = demoOpeners[Math.floor(Math.random() * demoOpeners.length)];
  const text =
    `_(demo-tilstand – ingen API-nøgle sat)_\n\n${opener} ${who} her. Jeg har læst "${subject}".\n\n`
    + '1. Det vigtigste at afklare først er hvad succes konkret betyder her.\n'
    + '2. Jeg kan tage første udkast, hvis nogen leverer rammerne.\n'
    + '3. Vi bør have en beslutning inden ugen er omme.\n\n'
    + 'Sæt en API-nøgle i .env for at få rigtige svar.';

  for (const piece of text.match(/.{1,14}/gs) || []) {
    if (signal?.aborted) break;
    onDelta?.(piece);
    await new Promise((r) => setTimeout(r, 12));
  }
  return text;
}
