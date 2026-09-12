import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isoleret datamappe + demo-udbyder, saa testene aldrig rammer et rigtigt API.
const dataDir = mkdtempSync(join(tmpdir(), 'ai-medarbejdere-test-'));
process.env.DATA_DIR = dataDir;
process.env.AI_PROVIDER = 'mock';
process.env.ANTHROPIC_API_KEY = '';
process.env.XAI_API_KEY = '';
process.env.OPENAI_API_KEY = '';

const { server } = await import('../server/index.js');
const { waitForIdle } = await import('../server/orchestrator.js');

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const get = async (path) => {
  const res = await fetch(base + path);
  assert.ok(res.ok, `GET ${path} -> ${res.status}`);
  return res.json();
};
const post = async (path, body) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json() };
};

test.after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('state indeholder standardholdet og teamrum', async () => {
  const state = await get('/api/state');
  assert.ok(state.agents.length >= 3, 'der bør være et standardhold');
  assert.ok(state.channels.length >= 1, 'der bør være mindst ét teamrum');
  assert.equal(state.provider.demo, true, 'testene skal køre i demo-tilstand');
});

test('privat samtale: medarbejderen svarer', async () => {
  const { agents } = await get('/api/state');
  const agent = agents[0];
  const conv = `dm:${agent.id}`;

  const sent = await post(`/api/conversations/${conv}/messages`, { text: 'Hej, hvad arbejder du med?' });
  assert.equal(sent.status, 202);

  await waitForIdle(conv);
  const { messages } = await get(`/api/conversations/${conv}/messages`);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[1].role, 'agent');
  assert.equal(messages[1].agentId, agent.id);
  assert.ok(messages[1].text.length > 20, 'svaret må ikke være tomt');
  assert.equal(messages[1].pending, false);
});

test('teamrum: @navn rammer den rigtige medarbejder', async () => {
  const { channels, agents } = await get('/api/state');
  const channel = channels[0];
  const conv = `ch:${channel.id}`;
  const target = agents.find((a) => channel.members.includes(a.id));

  await post(`/api/conversations/${conv}/messages`, {
    text: `@${target.name} hvad synes du om at flytte lanceringen?`,
    mode: 'auto',
  });
  await waitForIdle(conv);

  const { messages } = await get(`/api/conversations/${conv}/messages`);
  const replies = messages.filter((m) => m.role === 'agent');
  assert.equal(replies.length, 1, 'kun den nævnte medarbejder skal svare');
  assert.equal(replies[0].agentId, target.id);
});

test('teamrum: mode "all" lader alle svare i rækkefølge', async () => {
  const { channels } = await get('/api/state');
  const channel = channels.find((c) => c.members.length >= 3);
  const conv = `ch:${channel.id}`;

  await post(`/api/conversations/${conv}/clear`);
  await post(`/api/conversations/${conv}/messages`, { text: 'Kort status fra alle, tak.', mode: 'all' });
  await waitForIdle(conv);

  const { messages } = await get(`/api/conversations/${conv}/messages`);
  const replies = messages.filter((m) => m.role === 'agent');
  assert.equal(replies.length, channel.members.length);
  assert.deepEqual(replies.map((r) => r.agentId), channel.members);
});

test('intern diskussion kører runder og slutter med opsamling', async () => {
  const { channels } = await get('/api/state');
  const channel = channels.find((c) => c.members.length >= 3);
  const conv = `ch:${channel.id}`;

  await post(`/api/conversations/${conv}/clear`);
  const started = await post(`/api/channels/${channel.id}/discussion`, {
    topic: 'Skal vi lancere før eller efter sommerferien?',
    rounds: 2,
    summarize: true,
    mode: 'round-robin',
  });
  assert.equal(started.status, 202);
  assert.equal(started.body.rounds, 2);

  await waitForIdle(conv, 60000);
  const { messages } = await get(`/api/conversations/${conv}/messages`);

  const notices = messages.filter((m) => m.role === 'system');
  const replies = messages.filter((m) => m.role === 'agent');
  const summary = messages.filter((m) => m.kind === 'summary');

  assert.equal(notices.length, 1, 'diskussionen skal annonceres i rummet');
  assert.equal(replies.length, channel.members.length * 2 + 1, 'to runder plus opsamling');
  assert.equal(summary.length, 1);
  assert.equal(summary[0].agentId, channel.members[0]);
  assert.ok(replies.every((r) => !r.pending && !r.error));
});

test('diskussion kan stoppes undervejs', async () => {
  const { channels } = await get('/api/state');
  const channel = channels.find((c) => c.members.length >= 3);
  const conv = `ch:${channel.id}`;

  await post(`/api/conversations/${conv}/clear`);
  await post(`/api/channels/${channel.id}/discussion`, { topic: 'Noget langt', rounds: 6 });
  await new Promise((r) => setTimeout(r, 150));

  const stopped = await post(`/api/conversations/${conv}/stop`);
  assert.equal(stopped.body.stopped, true);
  await waitForIdle(conv);

  const { messages } = await get(`/api/conversations/${conv}/messages`);
  const replies = messages.filter((m) => m.role === 'agent');
  assert.ok(replies.length < channel.members.length * 6, 'diskussionen skal være afbrudt før tid');
  assert.ok(replies.every((m) => !m.pending), 'ingen beskeder må hænge i "skriver..."');
});

test('medarbejdere kan oprettes, rettes og slettes', async () => {
  const created = await post('/api/agents', {
    name: 'Test Tanja',
    role: 'Tester',
    persona: 'Du finder fejl.',
    emoji: '🧪',
  });
  assert.equal(created.status, 201);
  const id = created.body.agent.id;

  const patch = await fetch(`${base}/api/agents/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'Chefetester', temperature: 0.2 }),
  });
  const patched = await patch.json();
  assert.equal(patched.agent.role, 'Chefetester');
  assert.equal(patched.agent.temperature, 0.2);

  const del = await fetch(`${base}/api/agents/${id}`, { method: 'DELETE' });
  assert.equal((await del.json()).ok, true);
  const state = await get('/api/state');
  assert.ok(!state.agents.some((a) => a.id === id));
});

test('teamrum kan oprettes med valgte deltagere', async () => {
  const { agents } = await get('/api/state');
  const members = agents.slice(0, 2).map((a) => a.id);
  const created = await post('/api/channels', { name: '#strategi', topic: 'Langsigtet', members });
  assert.equal(created.status, 201);
  assert.equal(created.body.channel.name, 'strategi', 'foranstillet # fjernes');
  assert.deepEqual(created.body.channel.members, members);
});

test('SSE-strømmen sender beskeder ud live', async () => {
  const { agents } = await get('/api/state');
  const conv = `dm:${agents[1].id}`;
  await post(`/api/conversations/${conv}/clear`);

  const controller = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: controller.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let seen = '';

  const collect = (async () => {
    while (!seen.includes('event: message.done')) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += decoder.decode(value, { stream: true });
    }
  })();

  await post(`/api/conversations/${conv}/messages`, { text: 'Sig noget kort.' });
  await Promise.race([collect, new Promise((_, rej) => setTimeout(() => rej(new Error('SSE-timeout')), 20000))]);
  controller.abort();
  await waitForIdle(conv);

  assert.match(seen, /event: message\b/);
  assert.match(seen, /event: delta\b/);
  assert.match(seen, /event: typing\b/);
});

test('ukendt samtale giver 404', async () => {
  const res = await fetch(`${base}/api/conversations/dm:findes-ikke/messages`);
  assert.equal(res.status, 404);
});

test('ugyldige farver afvises, så de ikke kan brydes ud i HTML', async () => {
  const created = await post('/api/agents', {
    name: 'Farvefis',
    color: '" onload="alert(1)',
  });
  assert.match(created.body.agent.color, /^#[0-9a-f]{6}$/i);

  const res = await fetch(`${base}/api/agents/${created.body.agent.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ color: 'javascript:alert(1)' }),
  });
  const patched = await res.json();
  assert.match(patched.agent.color, /^#[0-9a-f]{6}$/i);
  assert.equal((await (await fetch(`${base}/api/agents/${created.body.agent.id}`, { method: 'DELETE' })).json()).ok, true);
});
