import { renderMarkdown } from './markdown.js';

const $ = (id) => document.getElementById(id);

const state = {
  agents: [],
  channels: [],
  settings: {},
  provider: null,
  current: null,          // "dm:<id>" eller "ch:<id>"
  messages: [],
  typing: new Map(),      // agentId -> true
  running: false,
  runLabel: '',
};

const els = {
  agentList: $('agentList'),
  channelList: $('channelList'),
  messages: $('messages'),
  input: $('input'),
  sendBtn: $('sendBtn'),
  convName: $('convName'),
  convSub: $('convSub'),
  convAvatar: $('convAvatar'),
  typingRow: $('typingRow'),
  panel: $('panel'),
  memberList: $('memberList'),
  runPill: $('runPill'),
  stopBtn: $('stopBtn'),
  mentionBox: $('mentionBox'),
  providerBadge: $('providerBadge'),
  workspaceName: $('workspaceName'),
  modePickerWrap: $('modePickerWrap'),
};

// ------------------------------------------------------------------ hjælpere

const api = {
  async get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  },
  async send(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.status === 204 ? {} : res.json();
  },
};

const agentById = (id) => state.agents.find((a) => a.id === id);
const channelById = (id) => state.channels.find((c) => c.id === id);

function currentConversation() {
  if (!state.current) return null;
  const [kind, id] = state.current.split(':');
  if (kind === 'dm') {
    const agent = agentById(id);
    return agent ? { kind: 'dm', agent, members: [agent] } : null;
  }
  const channel = channelById(id);
  if (!channel) return null;
  return { kind: 'channel', channel, members: channel.members.map(agentById).filter(Boolean) };
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
}

function avatarHtml(agent, cls = '') {
  if (!agent) return `<span class="avatar ${cls}">?</span>`;
  return `<span class="avatar ${cls}" style="background:${agent.color}22;box-shadow:inset 0 0 0 1px ${agent.color}55">${agent.emoji || '🙂'}</span>`;
}

// ------------------------------------------------------------------- sidebar

function renderSidebar() {
  els.workspaceName.textContent = state.settings.workspaceName || 'Mit hold';

  els.agentList.innerHTML = '';
  for (const agent of state.agents) {
    const li = document.createElement('li');
    li.className = state.current === `dm:${agent.id}` ? 'active' : '';
    li.innerHTML = `
      ${avatarHtml(agent)}
      <span class="entry-text">
        <span class="entry-name">${escape(agent.name)}</span>
        <span class="entry-role">${escape(agent.role)}</span>
      </span>
      <span class="dot ${state.typing.has(agent.id) ? 'busy' : ''}"></span>`;
    li.onclick = () => selectConversation(`dm:${agent.id}`);
    els.agentList.append(li);
  }

  els.channelList.innerHTML = '';
  for (const channel of state.channels) {
    const li = document.createElement('li');
    li.className = state.current === `ch:${channel.id}` ? 'active' : '';
    li.innerHTML = `
      <span class="avatar">#</span>
      <span class="entry-text">
        <span class="entry-name">${escape(channel.name)}</span>
        <span class="entry-role">${channel.members.length} deltagere</span>
      </span>`;
    li.onclick = () => selectConversation(`ch:${channel.id}`);
    els.channelList.append(li);
  }
}

function escape(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

// -------------------------------------------------------------------- samtale

async function selectConversation(id) {
  state.current = id;
  state.typing.clear();
  localStorage.setItem('sidste-samtale', id);
  renderSidebar();
  renderHeader();

  const data = await api.get(`/api/conversations/${id}/messages`);
  state.messages = data.messages;
  state.running = data.conversation.running;
  renderMessages();
  renderRunState();
  renderPanel();
  els.input.focus();
  if (window.innerWidth <= 720) document.getElementById('sidebar').classList.remove('open');
}

/** Rumpanelet vises kun i teamrum, og kun automatisk når der er plads til det. */
function syncPanelVisibility() {
  const conv = currentConversation();
  const auto = conv?.kind === 'channel' && window.innerWidth > 1080;
  els.panel.classList.toggle('hidden-panel', !auto);
  document.getElementById('togglePanel').classList.toggle('hidden', conv?.kind !== 'channel');
}

function renderHeader() {
  const conv = currentConversation();
  if (!conv) {
    els.convName.textContent = 'Vælg en samtale';
    els.convSub.textContent = '';
    els.convAvatar.textContent = '';
    return;
  }
  if (conv.kind === 'dm') {
    els.convAvatar.textContent = conv.agent.emoji || '🙂';
    els.convName.textContent = conv.agent.name;
    els.convSub.textContent = `${conv.agent.role} · privat samtale`;
    els.modePickerWrap.classList.add('hidden');
    els.input.placeholder = `Skriv til ${conv.agent.name}…`;
  } else {
    els.convAvatar.textContent = '#';
    els.convName.textContent = `#${conv.channel.name}`;
    els.convSub.textContent = conv.channel.topic
      ? `${conv.channel.topic} · ${conv.members.map((m) => m.name).join(', ')}`
      : conv.members.map((m) => m.name).join(', ');
    els.modePickerWrap.classList.remove('hidden');
    els.input.placeholder = 'Skriv til holdet…  (@navn for at spørge en bestemt)';
  }
  syncPanelVisibility();
}

function renderMessages() {
  els.messages.innerHTML = '';
  if (!state.messages.length) {
    const conv = currentConversation();
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = conv?.kind === 'channel'
      ? `<h2>#${escape(conv.channel.name)}</h2><p>Skriv til holdet, eller sæt en intern diskussion i gang i panelet til højre.</p>`
      : `<h2>${escape(conv?.agent?.name || '')}</h2><p>${escape(conv?.agent?.role || '')}. Skriv løs – samtalen her er kun mellem jer to.</p>`;
    els.messages.append(empty);
    return;
  }
  for (const msg of state.messages) els.messages.append(messageNode(msg));
  scrollToBottom(true);
}

function messageNode(msg) {
  if (msg.role === 'system') {
    const div = document.createElement('div');
    div.className = 'notice';
    div.dataset.id = msg.id;
    div.innerHTML = renderMarkdown(msg.text);
    return div;
  }

  const agent = msg.agentId ? agentById(msg.agentId) : null;
  const wrap = document.createElement('div');
  wrap.className = `msg ${msg.role === 'user' ? 'user' : 'agent'}`;
  wrap.dataset.id = msg.id;

  const bubbleClass = ['bubble', msg.kind === 'summary' ? 'summary' : '', msg.error ? 'error' : ''].join(' ');
  const who = msg.role === 'user'
    ? `<span class="msg-author">${escape(state.settings.userName || 'Dig')}</span>`
    : `<span class="msg-author" style="color:${agent?.color || '#fff'}">${escape(agent?.name || 'Medarbejder')}</span>
       <span class="msg-role">${escape(agent?.role || '')}</span>`;

  wrap.innerHTML = `
    ${msg.role === 'user' ? '' : avatarHtml(agent, 'lg')}
    <div class="msg-body">
      <div class="msg-head">${who}<span class="msg-time">${timeLabel(msg.ts)}</span></div>
      <div class="${bubbleClass}"></div>
    </div>`;

  const bubble = wrap.querySelector('.bubble');
  setBubble(bubble, msg);
  return wrap;
}

function setBubble(bubble, msg) {
  if (msg.error) {
    bubble.innerHTML = `${renderMarkdown(msg.text || '')}<p><em>Fejl: ${escape(msg.error)}</em></p>`;
  } else {
    bubble.innerHTML = renderMarkdown(msg.text || '');
    if (msg.pending) bubble.insertAdjacentHTML('beforeend', '<span class="caret"></span>');
  }
}

function scrollToBottom(force = false) {
  const box = els.messages;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  if (force || nearBottom) box.scrollTop = box.scrollHeight;
}

function renderTyping() {
  const names = [...state.typing.keys()].map((id) => agentById(id)?.name).filter(Boolean);
  els.typingRow.textContent = names.length
    ? `${names.join(', ')} skriver…`
    : '';
}

function renderRunState() {
  els.runPill.classList.toggle('hidden', !state.running);
  els.stopBtn.classList.toggle('hidden', !state.running);
  els.runPill.textContent = state.runLabel || 'arbejder…';
}

// ---------------------------------------------------------------------- panel

function renderPanel() {
  const conv = currentConversation();
  syncPanelVisibility();
  if (!conv || conv.kind !== 'channel') return;

  els.memberList.innerHTML = '';
  for (const member of conv.members) {
    const li = document.createElement('li');
    li.innerHTML = `
      ${avatarHtml(member)}
      <span class="entry-text">
        <span class="entry-name">${escape(member.name)}</span>
        <span class="entry-role">${escape(member.role)}</span>
      </span>
      <button class="nudge">giv ordet</button>`;
    li.querySelector('.nudge').onclick = () =>
      api.send('POST', `/api/conversations/${state.current}/nudge`, { agentId: member.id }).catch(alertError);
    els.memberList.append(li);
  }
}

// ------------------------------------------------------------------ afsendelse

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text || !state.current) return;
  els.input.value = '';
  autoGrow();
  hideMentions();
  try {
    await api.send('POST', `/api/conversations/${state.current}/messages`, {
      text,
      mode: $('modePicker').value,
    });
  } catch (err) {
    els.input.value = text;
    alertError(err);
  }
}

function alertError(err) {
  console.error(err);
  const div = document.createElement('div');
  div.className = 'notice';
  div.textContent = `Fejl: ${err.message}`;
  els.messages.append(div);
  scrollToBottom(true);
}

// ------------------------------------------------------------- @-autofuldføre

let mentionIndex = 0;
let mentionMatches = [];

function updateMentions() {
  const conv = currentConversation();
  if (!conv || conv.kind !== 'channel') return hideMentions();
  const value = els.input.value.slice(0, els.input.selectionStart);
  const match = /@([\wÆØÅæøå-]*)$/.exec(value);
  if (!match) return hideMentions();

  const query = match[1].toLowerCase();
  mentionMatches = conv.members.filter((m) => m.name.toLowerCase().startsWith(query));
  if (!mentionMatches.length) return hideMentions();

  mentionIndex = Math.min(mentionIndex, mentionMatches.length - 1);
  els.mentionBox.innerHTML = '';
  mentionMatches.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = i === mentionIndex ? 'sel' : '';
    div.innerHTML = `${m.emoji || '🙂'} <strong>${escape(m.name)}</strong> <span style="color:var(--text-faint)">${escape(m.role)}</span>`;
    div.onmousedown = (e) => {
      e.preventDefault();
      applyMention(m);
    };
    els.mentionBox.append(div);
  });
  els.mentionBox.classList.remove('hidden');
}

function applyMention(member) {
  const pos = els.input.selectionStart;
  const before = els.input.value.slice(0, pos).replace(/@[\wÆØÅæøå-]*$/, `@${member.name.split(/\s+/)[0]} `);
  const after = els.input.value.slice(pos);
  els.input.value = before + after;
  els.input.selectionStart = els.input.selectionEnd = before.length;
  hideMentions();
  els.input.focus();
}

function hideMentions() {
  mentionMatches = [];
  mentionIndex = 0;
  els.mentionBox.classList.add('hidden');
}

function autoGrow() {
  els.input.style.height = 'auto';
  els.input.style.height = `${Math.min(200, els.input.scrollHeight)}px`;
}

// --------------------------------------------------------------------- events

function connectEvents() {
  const source = new EventSource('/api/events');

  const forCurrent = (payload) => payload.conversationId === state.current;

  source.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (!forCurrent(msg)) return;
    if (!state.messages.length) els.messages.innerHTML = '';
    state.messages.push(msg);
    els.messages.append(messageNode(msg));
    scrollToBottom();
  });

  source.addEventListener('delta', (e) => {
    const { conversationId, messageId, delta } = JSON.parse(e.data);
    if (conversationId !== state.current) return;
    const msg = state.messages.find((m) => m.id === messageId);
    if (!msg) return;
    msg.text += delta;
    const node = els.messages.querySelector(`[data-id="${messageId}"] .bubble`);
    if (node) setBubble(node, msg);
    scrollToBottom();
  });

  source.addEventListener('message.done', (e) => {
    const done = JSON.parse(e.data);
    if (!forCurrent(done)) return;
    const idx = state.messages.findIndex((m) => m.id === done.id);
    if (idx === -1) return;
    state.messages[idx] = done;
    const node = els.messages.querySelector(`[data-id="${done.id}"]`);
    if (node) node.replaceWith(messageNode(done));
    scrollToBottom();
  });

  source.addEventListener('typing', (e) => {
    const { conversationId, agentId, on } = JSON.parse(e.data);
    if (conversationId !== state.current) return;
    if (on) state.typing.set(agentId, true);
    else state.typing.delete(agentId);
    renderTyping();
    renderSidebar();
  });

  source.addEventListener('run', (e) => {
    const { conversationId, running, label } = JSON.parse(e.data);
    if (conversationId !== state.current) return;
    state.running = running;
    state.runLabel = label || '';
    if (!running) {
      state.typing.clear();
      renderTyping();
    }
    renderRunState();
  });

  source.addEventListener('discussion', (e) => {
    const { conversationId, running, round, rounds } = JSON.parse(e.data);
    if (conversationId !== state.current) return;
    state.runLabel = running ? `diskussion · runde ${round}/${rounds}` : '';
    renderRunState();
  });

  source.addEventListener('cleared', (e) => {
    const { conversationId } = JSON.parse(e.data);
    if (conversationId !== state.current) return;
    state.messages = [];
    renderMessages();
  });

  source.addEventListener('agents', async (e) => {
    state.agents = JSON.parse(e.data).agents;
    await refreshState();
  });
  source.addEventListener('channels', async () => { await refreshState(); });
  source.addEventListener('settings', async () => { await refreshState(); });

  source.onerror = () => {
    els.providerBadge.textContent = 'mistede forbindelsen – prøver igen…';
  };
}

async function refreshState() {
  const data = await api.get('/api/state');
  state.agents = data.agents;
  state.channels = data.channels;
  state.settings = data.settings;
  state.provider = data.provider;
  els.providerBadge.textContent = data.provider.demo
    ? 'Demo-tilstand · ingen API-nøgle'
    : `${data.provider.label} · ${data.provider.model}`;
  els.providerBadge.classList.toggle('demo', data.provider.demo);
  renderSidebar();
  renderHeader();
  renderPanel();
}

// -------------------------------------------------------------------- modaler

function openAgentModal(agent) {
  $('agentModalTitle').textContent = agent ? `Rediger ${agent.name}` : 'Ny medarbejder';
  $('agentName').value = agent?.name || '';
  $('agentEmoji').value = agent?.emoji || '🙂';
  $('agentRole').value = agent?.role || '';
  $('agentPersona').value = agent?.persona || '';
  $('agentModel').value = agent?.model || '';
  $('agentTemp').value = agent?.temperature ?? 0.7;
  $('agentColor').value = agent?.color || '#7c5cff';
  $('deleteAgent').classList.toggle('hidden', !agent);
  $('agentForm').dataset.id = agent?.id || '';
  $('agentModal').showModal();
}

function openChannelModal(channel) {
  $('channelModalTitle').textContent = channel ? `Rediger #${channel.name}` : 'Nyt teamrum';
  $('channelName').value = channel?.name || '';
  $('channelTopic').value = channel?.topic || '';
  $('deleteChannel').classList.toggle('hidden', !channel);
  $('channelForm').dataset.id = channel?.id || '';

  const picker = $('channelMembers');
  picker.innerHTML = '';
  for (const agent of state.agents) {
    const on = channel ? channel.members.includes(agent.id) : true;
    const label = document.createElement('label');
    label.className = on ? 'on' : '';
    label.innerHTML = `<input type="checkbox" value="${agent.id}" ${on ? 'checked' : ''} /> ${agent.emoji || '🙂'} ${escape(agent.name)}`;
    label.querySelector('input').onchange = (e) => label.classList.toggle('on', e.target.checked);
    picker.append(label);
  }
  $('channelModal').showModal();
}

function openSettingsModal() {
  $('setWorkspace').value = state.settings.workspaceName || '';
  $('setUserName').value = state.settings.userName || '';
  $('setContext').value = state.settings.companyContext || '';
  $('providerInfo').textContent = state.provider?.demo
    ? 'Ingen API-nøgle fundet. Appen kører i demo-tilstand med simulerede svar. Sæt ANTHROPIC_API_KEY, XAI_API_KEY eller OPENAI_API_KEY i .env og genstart.'
    : `Model: ${state.provider?.label} – ${state.provider?.model}. Ændres i .env.`;
  $('settingsModal').showModal();
}

// ------------------------------------------------------------------ opsætning

function wireUp() {
  els.sendBtn.onclick = sendMessage;

  els.input.addEventListener('input', () => {
    autoGrow();
    updateMentions();
  });

  els.input.addEventListener('keydown', (e) => {
    if (!els.mentionBox.classList.contains('hidden') && mentionMatches.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionIndex = (mentionIndex + 1) % mentionMatches.length;
        return updateMentions();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionIndex = (mentionIndex - 1 + mentionMatches.length) % mentionMatches.length;
        return updateMentions();
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        return applyMention(mentionMatches[mentionIndex]);
      }
      if (e.key === 'Escape') return hideMentions();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  els.stopBtn.onclick = () => api.send('POST', `/api/conversations/${state.current}/stop`).catch(alertError);

  $('clearBtn').onclick = () => {
    if (!state.current) return;
    if (!confirm('Ryd hele samtalen?')) return;
    api.send('POST', `/api/conversations/${state.current}/clear`).catch(alertError);
  };

  $('editBtn').onclick = () => {
    const conv = currentConversation();
    if (!conv) return;
    if (conv.kind === 'dm') openAgentModal(conv.agent);
    else openChannelModal(conv.channel);
  };

  $('editMembers').onclick = () => {
    const conv = currentConversation();
    if (conv?.kind === 'channel') openChannelModal(conv.channel);
  };

  $('newAgent').onclick = () => openAgentModal(null);
  $('newChannel').onclick = () => openChannelModal(null);
  $('openSettings').onclick = openSettingsModal;
  $('toggleSidebar').onclick = () => $('sidebar').classList.toggle('open');
  $('togglePanel').onclick = () => els.panel.classList.toggle('hidden-panel');

  for (const btn of document.querySelectorAll('[data-close]')) {
    btn.onclick = () => btn.closest('dialog').close();
  }

  $('agentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = e.target.dataset.id;
    const payload = {
      name: $('agentName').value,
      emoji: $('agentEmoji').value,
      role: $('agentRole').value,
      persona: $('agentPersona').value,
      model: $('agentModel').value,
      temperature: Number($('agentTemp').value),
      color: $('agentColor').value,
    };
    try {
      const result = id
        ? await api.send('PATCH', `/api/agents/${id}`, payload)
        : await api.send('POST', '/api/agents', payload);
      $('agentModal').close();
      await refreshState();
      if (!id) await selectConversation(`dm:${result.agent.id}`);
    } catch (err) {
      alertError(err);
    }
  });

  $('deleteAgent').onclick = async () => {
    const id = $('agentForm').dataset.id;
    if (!id || !confirm('Slet medarbejderen og samtalen?')) return;
    await api.send('DELETE', `/api/agents/${id}`);
    $('agentModal').close();
    await refreshState();
    if (state.current === `dm:${id}`) await selectFirst();
  };

  $('channelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = e.target.dataset.id;
    const members = [...$('channelMembers').querySelectorAll('input:checked')].map((i) => i.value);
    const payload = { name: $('channelName').value, topic: $('channelTopic').value, members };
    try {
      const result = id
        ? await api.send('PATCH', `/api/channels/${id}`, payload)
        : await api.send('POST', '/api/channels', payload);
      $('channelModal').close();
      await refreshState();
      if (!id) await selectConversation(`ch:${result.channel.id}`);
      else renderPanel();
    } catch (err) {
      alertError(err);
    }
  });

  $('deleteChannel').onclick = async () => {
    const id = $('channelForm').dataset.id;
    if (!id || !confirm('Slet teamrummet?')) return;
    await api.send('DELETE', `/api/channels/${id}`);
    $('channelModal').close();
    await refreshState();
    if (state.current === `ch:${id}`) await selectFirst();
  };

  $('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api.send('PATCH', '/api/settings', {
      workspaceName: $('setWorkspace').value,
      userName: $('setUserName').value,
      companyContext: $('setContext').value,
    });
    $('settingsModal').close();
    await refreshState();
  });

  $('startDiscussion').onclick = async () => {
    const conv = currentConversation();
    if (conv?.kind !== 'channel') return;
    const topic = $('discussionTopic').value.trim();
    if (!topic) return $('discussionTopic').focus();
    try {
      await api.send('POST', `/api/channels/${conv.channel.id}/discussion`, {
        topic,
        rounds: Number($('discussionRounds').value),
        mode: $('discussionMode').value,
        summarize: $('discussionSummary').checked,
      });
      $('discussionTopic').value = '';
    } catch (err) {
      alertError(err);
    }
  };

  window.addEventListener('resize', () => {
    renderHeader();
    syncPanelVisibility();
  });
}

async function selectFirst() {
  const first = state.agents[0] ? `dm:${state.agents[0].id}` : state.channels[0] ? `ch:${state.channels[0].id}` : null;
  if (first) await selectConversation(first);
}

async function boot() {
  wireUp();
  await refreshState();
  const saved = localStorage.getItem('sidste-samtale');
  const exists = saved && (saved.startsWith('dm:')
    ? agentById(saved.slice(3))
    : channelById(saved.slice(3)));
  if (exists) await selectConversation(saved);
  else await selectFirst();
  connectEvents();
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="padding:2rem;color:#e5484d">Kunne ikke starte: ${err.message}</pre>`;
});
