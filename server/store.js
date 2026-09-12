import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedState } from './seed.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || join(here, '..', 'data');
const dataFile = join(dataDir, 'store.json');

let state = null;
let writeTimer = null;

function emptyState() {
  return { version: 1, agents: [], channels: [], messages: {}, settings: {} };
}

function load() {
  mkdirSync(dataDir, { recursive: true });
  if (existsSync(dataFile)) {
    try {
      const parsed = JSON.parse(readFileSync(dataFile, 'utf8'));
      state = { ...emptyState(), ...parsed };
      state.messages ||= {};
      return;
    } catch (err) {
      console.error(`[store] kunne ikke laese ${dataFile}: ${err.message} – starter forfra`);
    }
  }
  state = { ...emptyState(), ...seedState() };
  flush();
}

function flush() {
  mkdirSync(dataDir, { recursive: true });
  const tmp = `${dataFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, dataFile);
}

/** Gemmer med kort debounce, saa en stroem af deltaer ikke haardt-rammer disken. */
export function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      flush();
    } catch (err) {
      console.error('[store] skrivefejl:', err.message);
    }
  }, 250);
  writeTimer.unref?.();
}

export function saveNow() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  flush();
}

export function db() {
  if (!state) load();
  return state;
}

export function resetForTests() {
  state = { ...emptyState(), ...seedState() };
  flush();
}

// ---------------------------------------------------------------- medarbejdere

export function listAgents() {
  return db().agents;
}

export function getAgent(id) {
  return db().agents.find((a) => a.id === id) || null;
}

export function createAgent(input) {
  const agent = {
    id: input.id || `a_${randomId()}`,
    name: input.name?.trim() || 'Ny medarbejder',
    role: input.role?.trim() || 'Medarbejder',
    emoji: input.emoji || '🙂',
    color: safeColor(input.color) || pickColor(),
    persona: input.persona?.trim() || '',
    model: input.model || '',
    temperature: clampTemp(input.temperature),
    active: input.active !== false,
    createdAt: Date.now(),
  };
  db().agents.push(agent);
  save();
  return agent;
}

export function updateAgent(id, patch) {
  const agent = getAgent(id);
  if (!agent) return null;
  for (const key of ['name', 'role', 'emoji', 'persona', 'model']) {
    if (typeof patch[key] === 'string') agent[key] = patch[key];
  }
  if (typeof patch.color === 'string') agent.color = safeColor(patch.color) || agent.color;
  if (patch.temperature !== undefined) agent.temperature = clampTemp(patch.temperature);
  if (typeof patch.active === 'boolean') agent.active = patch.active;
  save();
  return agent;
}

export function deleteAgent(id) {
  const current = db();
  const idx = current.agents.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  current.agents.splice(idx, 1);
  delete current.messages[`dm:${id}`];
  for (const channel of current.channels) {
    channel.members = channel.members.filter((m) => m !== id);
  }
  save();
  return true;
}

// -------------------------------------------------------------------- kanaler

export function listChannels() {
  return db().channels;
}

export function getChannel(id) {
  return db().channels.find((c) => c.id === id) || null;
}

export function createChannel(input) {
  const channel = {
    id: input.id || `c_${randomId()}`,
    name: (input.name || 'nyt-rum').trim().replace(/^#/, ''),
    topic: input.topic?.trim() || '',
    members: Array.isArray(input.members) ? input.members.filter((m) => !!getAgent(m)) : [],
    createdAt: Date.now(),
  };
  db().channels.push(channel);
  save();
  return channel;
}

export function updateChannel(id, patch) {
  const channel = getChannel(id);
  if (!channel) return null;
  if (typeof patch.name === 'string') channel.name = patch.name.trim().replace(/^#/, '');
  if (typeof patch.topic === 'string') channel.topic = patch.topic;
  if (Array.isArray(patch.members)) {
    channel.members = [...new Set(patch.members.filter((m) => !!getAgent(m)))];
  }
  save();
  return channel;
}

export function deleteChannel(id) {
  const current = db();
  const idx = current.channels.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  current.channels.splice(idx, 1);
  delete current.messages[`ch:${id}`];
  save();
  return true;
}

// ------------------------------------------------------------------- samtaler

/** En samtale er enten en DM med en medarbejder ("dm:<agentId>") eller et teamrum ("ch:<id>"). */
export function resolveConversation(conversationId) {
  const [kind, id] = String(conversationId).split(':');
  if (kind === 'dm') {
    const agent = getAgent(id);
    return agent ? { kind: 'dm', id: conversationId, agent, members: [agent] } : null;
  }
  if (kind === 'ch') {
    const channel = getChannel(id);
    if (!channel) return null;
    const members = channel.members.map(getAgent).filter(Boolean);
    return { kind: 'channel', id: conversationId, channel, members };
  }
  return null;
}

export function getMessages(conversationId, limit = 0) {
  const all = db().messages[conversationId] || [];
  return limit > 0 ? all.slice(-limit) : all;
}

export function addMessage(conversationId, message) {
  const list = (db().messages[conversationId] ||= []);
  const full = {
    id: message.id || `m_${randomId()}`,
    conversationId,
    role: message.role,
    agentId: message.agentId || null,
    text: message.text || '',
    ts: message.ts || Date.now(),
    kind: message.kind || 'chat',
    pending: message.pending || false,
    error: message.error || null,
  };
  list.push(full);
  if (list.length > 800) list.splice(0, list.length - 800);
  save();
  return full;
}

export function patchMessage(conversationId, messageId, patch) {
  const list = db().messages[conversationId];
  if (!list) return null;
  const msg = list.find((m) => m.id === messageId);
  if (!msg) return null;
  Object.assign(msg, patch);
  save();
  return msg;
}

export function clearConversation(conversationId) {
  db().messages[conversationId] = [];
  save();
}

// -------------------------------------------------------------------- hjaelpere

const palette = ['#7c5cff', '#00b4a6', '#ff8a3d', '#e5484d', '#3d8bff', '#d946a8', '#48b06d', '#c99a2e'];

/** Kun rene hex-farver – de bliver sat direkte ind i style-attributter i browseren. */
function safeColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : '';
}

function pickColor() {
  return palette[Math.floor(Math.random() * palette.length)];
}

function clampTemp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.7;
  return Math.min(1.5, Math.max(0, n));
}

export function randomId() {
  return Math.random().toString(36).slice(2, 10);
}
