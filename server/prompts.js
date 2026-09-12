import { db } from './store.js';

const HOUSE_RULES = [
  'Svar på dansk, medmindre der bliver skrevet til dig på et andet sprog.',
  'Vær konkret. Ingen indledende høflighedsfraser, ingen "som AI-model".',
  'Hellere et klart standpunkt med forbehold end et uforpligtende overblik.',
  'Hvis du mangler information for at kunne svare ordentligt, så spørg om præcis det du mangler.',
];

function colleagueLines(exceptId) {
  return db()
    .agents.filter((a) => a.id !== exceptId && a.active !== false)
    .map((a) => `- ${a.name} (${a.role})`)
    .join('\n');
}

function workspaceBlock() {
  const s = db().settings || {};
  const parts = [`Arbejdsplads: ${s.workspaceName || 'teamet'}.`, `Din chef hedder ${s.userName || 'brugeren'}.`];
  if (s.companyContext?.trim()) parts.push(`Om virksomheden/projektet: ${s.companyContext.trim()}`);
  return parts.join(' ');
}

function personaBlock(agent) {
  return [
    `Du er ${agent.name}, ${agent.role}.`,
    agent.persona?.trim() || '',
    workspaceBlock(),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Systemprompt til en privat samtale mellem brugeren og én medarbejder. */
export function dmSystemPrompt(agent) {
  const colleagues = colleagueLines(agent.id);
  return [
    personaBlock(agent),
    colleagues ? `Dine kolleger:\n${colleagues}` : '',
    'Dette er en privat samtale mellem dig og din chef. Ingen andre læser med.',
    `Retningslinjer:\n${HOUSE_RULES.map((r) => `- ${r}`).join('\n')}`,
    'Hold svaret under ca. 250 ord medmindre du bliver bedt om noget længere.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Systemprompt til et teamrum hvor flere medarbejdere taler sammen. */
export function channelSystemPrompt(agent, channel, members, { discussion = null } = {}) {
  const others = members
    .filter((m) => m.id !== agent.id)
    .map((m) => `- ${m.name} (${m.role})`)
    .join('\n');

  const rules = [
    ...HOUSE_RULES,
    'Skriv KUN din egen replik. Sæt ikke dit navn foran – systemet viser afsenderen.',
    'Læg aldrig ord i munden på kollegerne og skriv aldrig deres replikker.',
    'Tal direkte til de andre. Brug @Navn når du henvender dig til en bestemt kollega.',
    'Gentag ikke det der lige er blevet sagt – tilføj, uddyb, eller vær uenig og sig hvorfor.',
    'Højst ca. 120 ord. Det er en samtale, ikke et notat.',
  ];

  const blocks = [
    personaBlock(agent),
    `Du er i teamrummet #${channel.name}${channel.topic ? ` – ${channel.topic}` : ''}.`,
    others ? `Med i rummet:\n${others}` : 'Du er alene i rummet lige nu.',
  ];

  if (discussion) {
    blocks.push(
      `Holdet kører en intern diskussion om: "${discussion.topic}".`
      + ` Det er runde ${discussion.round} af ${discussion.rounds}.`
      + (discussion.round >= discussion.rounds
        ? ' Dette er sidste runde – landet dit standpunkt og peg på det du mener holdet skal gøre.'
        : ' Byg videre på det de andre har sagt, og udfordr det du er uenig i.'),
    );
  }

  blocks.push(`Retningslinjer:\n${rules.map((r) => `- ${r}`).join('\n')}`);
  return blocks.filter(Boolean).join('\n\n');
}

/** Systemprompt til den lille "hvem skal svare?"-router. */
export function routerSystemPrompt(channel, members) {
  const list = members.map((m) => `${m.id} = ${m.name} (${m.role})`).join('\n');
  return [
    'Du er en ordstyrer i et team-chatrum. Du skriver ikke svar – du vælger kun hvem der skal tale.',
    `Deltagere:\n${list}`,
    'Ud fra den seneste besked vælger du de 1-3 mest relevante deltagere, i den rækkefølge de bør tale.',
    'Svar KUN med deres id\'er adskilt af komma. Ingen forklaring, ingen anden tekst.',
  ].join('\n\n');
}

/** Systemprompt til opsamlingen efter en diskussion. */
export function summarySystemPrompt(agent, channel, topic) {
  return [
    personaBlock(agent),
    `Diskussionen i #${channel.name} om "${topic}" er slut. Du samler op på holdets vegne.`,
    'Skriv en kort opsamling i dette format:\n'
      + '**Enige om:** 2-4 punkter\n'
      + '**Uenige om:** de reelle uenigheder, med hvem der mener hvad\n'
      + '**Næste skridt:** konkrete handlinger med ansvarlig på hver',
    'Find ikke på pointer der ikke blev sagt. Højst 200 ord.',
  ].join('\n\n');
}

/** Laver et laesbart transskript som én brugerbesked (virker ens hos alle udbydere). */
export function transcriptBlock(messages, agents, userName) {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const lines = messages
    .filter((m) => m.text?.trim() && !m.error)
    .map((m) => {
      if (m.role === 'user') return `${userName || 'Chefen'}: ${m.text.trim()}`;
      if (m.role === 'system') return `[system] ${m.text.trim()}`;
      const agent = byId.get(m.agentId);
      return `${agent ? `${agent.name} (${agent.role})` : 'Medarbejder'}: ${m.text.trim()}`;
    });
  return lines.join('\n\n');
}
