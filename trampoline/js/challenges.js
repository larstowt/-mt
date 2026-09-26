// Baner (arenaer) og udfordringer.
(function (G) {
  'use strict';
  const TR = G.TR;

  // m: {dir, q, halves, shape, split, minQ, minHalves}
  // Uden from/to i mønstret skal springet starte og slutte på fødderne.
  function matches(skill, m) {
    if (!skill || !m) return false;
    if ((skill.from || 'feet') !== (m.from || 'feet')) return false;
    if ((skill.to || 'feet') !== (m.to || 'feet')) return false;
    if (m.dir && skill.dir !== m.dir) return false;
    if (m.q != null && skill.quarters !== m.q) return false;
    if (m.minQ != null && skill.quarters < m.minQ) return false;
    if (m.halves != null && skill.totalHalves !== m.halves) return false;
    if (m.minHalves != null && skill.totalHalves < m.minHalves) return false;
    if (m.shape && skill.shape !== m.shape) return false;
    if (m.split && skill.halves.join(',') !== m.split.join(',')) return false;
    return true;
  }

  const starsFromE = (E) => (E >= 1.8 ? 3 : E >= 1.5 ? 2 : 1);

  const ARENAS = [
    {
      id: 'hall', name: 'Klubhallen', need: 0, tagline: 'Hvor det hele starter.',
      challenges: [
        { id: 'h1', title: 'Første hop', desc: 'Pump dig op til 2 meters højde.', type: 'height', target: 2.0, hint: 'Tryk SATS (mellemrum), når ringen på dugen rammer målet og bliver gul.' },
        { id: 'h2', title: 'Salto baglæns', desc: 'Land en salto baglæns – valgfri position.', type: 'skill', match: { dir: 'B', q: 4, halves: 0 }, hint: 'Vip med ← på dugen (se rotationsmåleren), hold LUKKET (Z) i luften, og slip i god tid før landing.' },
        { id: 'h3', title: 'Salto forlæns', desc: 'Land en salto forlæns.', type: 'skill', match: { dir: 'F', q: 4, halves: 0 }, hint: 'Vip den anden vej på dugen – forlæns afhænger af, hvilken vej du vender.' },
        { id: 'h4', title: 'Hoftebøjet', desc: 'Land en salto baglæns i hoftebøjet position.', type: 'skill', match: { dir: 'B', q: 4, halves: 0, shape: '<' }, hint: 'Hold X for hoftebøjet.' },
        { id: 'h5', title: 'Barani', desc: 'Salto forlæns med ½ skrue.', type: 'skill', match: { dir: 'F', q: 4, halves: 1 }, hint: 'Tryk kort på C for en halv skrue.' },
        { id: 'h6', title: 'Rygfald', desc: 'Land på ryggen, og kom op på fødderne igen.', type: 'sequence',
          list: [{ to: 'back', q: 1, halves: 0 }, { from: 'back', q: 1, halves: 0 }], hint: 'Vip ganske lidt og slip alle knapper i luften – så lander du på ryggen.' },
      ],
    },
    {
      id: 'sunset', name: 'Solnedgang', need: 7, tagline: 'Spring ind i aftenrøden.',
      challenges: [
        { id: 's1', title: 'Højt oppe', desc: 'Nå 3,2 meters højde.', type: 'height', target: 3.2, hint: 'Kraft-færdigheden giver højere spring.' },
        { id: 's2', title: 'Hel skrue', desc: 'Salto baglæns med hel skrue.', type: 'skill', match: { dir: 'B', q: 4, halves: 2 }, hint: 'Hold C lidt længere for en hel skrue.' },
        { id: 's3', title: 'Skru i lukket', desc: 'Land en hel skrue i LUKKET position.', type: 'skill', match: { dir: 'B', q: 4, halves: 2, shape: 'o' }, hint: 'Hold Z og C samtidig. Lukket skruer langsommere.' },
        { id: 's4', title: 'Tre positioner', desc: 'Land salto baglæns lukket, hoftebøjet og strakt i træk.', type: 'sequence',
          list: [{ dir: 'B', q: 4, halves: 0, shape: 'o' }, { dir: 'B', q: 4, halves: 0, shape: '<' }, { dir: 'B', q: 4, halves: 0, shape: '/' }], hint: 'Strakte hop imellem er tilladt.' },
        { id: 's5', title: 'Rudi', desc: 'Salto forlæns med 1½ skrue.', type: 'skill', match: { dir: 'F', q: 4, halves: 3 }, hint: 'Strakt skruer hurtigst.' },
        { id: 's6', title: 'Ryg til mave', desc: 'Rygfald, så en halv salto forlæns ned på maven, og op på fødderne.', type: 'sequence',
          list: [{ to: 'back', q: 1, halves: 0 }, { from: 'back', to: 'front', q: 2 }, { from: 'front', q: 1, halves: 0 }], hint: 'Fra ryggen vipper du den anden vej for at rotere forlæns.' },
      ],
    },
    {
      id: 'aurora', name: 'Nordlys', need: 18, tagline: 'Dobbelte saltoer under polarhimlen.',
      challenges: [
        { id: 'a1', title: 'Dobbelt salto', desc: 'Land en dobbelt salto baglæns.', type: 'skill', match: { dir: 'B', q: 8, halves: 0 }, hint: 'Kræver højde og rotation. Opgradér dine færdigheder.' },
        { id: 'a2', title: 'Hoftebøjet dobbelt', desc: 'Dobbelt salto baglæns hoftebøjet.', type: 'skill', match: { dir: 'B', q: 8, halves: 0, shape: '<' }, hint: 'Smidighed gør hoftebøjet tættere og hurtigere.' },
        { id: 'a3', title: 'Hel-ind', desc: 'Dobbelt salto baglæns med hel skrue i første salto.', type: 'skill', match: { dir: 'B', q: 8, split: [2, 0] }, hint: 'Skru tidligt, luk bagefter.' },
        { id: 'a4', title: 'Barani-ud', desc: 'Dobbelt salto forlæns med ½ skrue i sidste salto.', type: 'skill', match: { dir: 'F', q: 8, split: [0, 1] }, hint: 'Skru sent, når du åbner.' },
        { id: 'a6', title: 'Ball-out', desc: 'Fra ryggen: 1¼ salto forlæns op på fødderne.', type: 'skill', match: { from: 'back', dir: 'F', q: 5 }, hint: 'Land et rygfald først. Vip godt forlæns fra ryggen, hold LUKKET (Z) og slip før landing.' },
        { id: 'a7', title: 'Cody', desc: 'Fra maven: 1¼ salto baglæns op på fødderne.', type: 'skill', match: { from: 'front', dir: 'B', q: 5 }, hint: 'Land et mavefald først. Vip godt baglæns fra maven, hold LUKKET (Z) og slip før landing.' },
        { id: 'a5', title: 'Pointjagt', desc: 'Scor 2500 point på 60 sekunder.', type: 'score', target: 2500, time: 60, hint: 'Kombinationer ganger dine point op.' },
      ],
    },
    {
      id: 'final', name: 'VM-finalen', need: 30, tagline: 'Lysene er tændt. Det gælder.',
      challenges: [
        { id: 'f1', title: 'Første rutine', desc: 'Gennemfør en rutine med 10 elementer.', type: 'routine', target: 30, hint: 'Ingen strakte hop undervejs – hvert spring skal være et element.' },
        { id: 'f2', title: 'Dobbelt skrue', desc: 'Salto baglæns med dobbelt skrue.', type: 'skill', match: { dir: 'B', q: 4, halves: 4 }, hint: 'Skrue-færdigheden hjælper.' },
        { id: 'f3', title: 'Miller', desc: 'Dobbelt salto baglæns med hel skrue ind og hel skrue ud.', type: 'skill', match: { dir: 'B', q: 8, split: [2, 2] }, hint: 'Et af de sværeste spring. Strakt skruer hurtigst.' },
        { id: 'f4', title: 'Tripel', desc: 'Land en tripel salto.', type: 'skill', match: { q: 12 }, hint: 'Maks kraft og rotation – og luk tæt.' },
        { id: 'f6', title: 'Drop-serien', desc: 'Rygfald, ball-out, mavefald og cody i træk.', type: 'sequence',
          list: [{ to: 'back', q: 1, halves: 0 }, { from: 'back', dir: 'F', q: 5 }, { to: 'front', q: 1, halves: 0 }, { from: 'front', dir: 'B', q: 5 }], hint: 'Strakte hop imellem er tilladt.' },
        { id: 'f5', title: 'VM-guld', desc: 'Få 45 point i en rutine.', type: 'routine', target: 45, hint: 'Sværhed + udførelse + flyvetid + placering.' },
      ],
    },
  ];

  const MAX_STARS = ARENAS.reduce((n, a) => n + a.challenges.length * 3, 0);
  const byId = {};
  ARENAS.forEach((a) => a.challenges.forEach((c) => (byId[c.id] = { ...c, arena: a.id })));

  function starsFor(def, value) {
    switch (def.type) {
      case 'height': return value >= def.target + 0.8 ? 3 : value >= def.target + 0.4 ? 2 : value >= def.target ? 1 : 0;
      case 'score': return value >= def.target * 1.8 ? 3 : value >= def.target * 1.4 ? 2 : value >= def.target ? 1 : 0;
      case 'routine': return value >= def.target + 10 ? 3 : value >= def.target + 5 ? 2 : value >= def.target ? 1 : 0;
      default: return starsFromE(value);
    }
  }

  function starsText(def) {
    switch (def.type) {
      case 'height': return [`${TR.fmt(def.target)} m`, `${TR.fmt(def.target + 0.4)} m`, `${TR.fmt(def.target + 0.8)} m`];
      case 'score': return [def.target, Math.round(def.target * 1.4), Math.round(def.target * 1.8)].map(String);
      case 'routine': return [def.target, def.target + 5, def.target + 10].map((v) => `${v} point`);
      default: return ['Landet', 'E ≥ 1,5', 'E ≥ 1,8'];
    }
  }

  TR.ARENAS = ARENAS;
  TR.Challenges = { matches, starsFor, starsText, byId, starsFromE, MAX_STARS };
  TR.arenaById = (id) => ARENAS.find((a) => a.id === id) || ARENAS[0];
  TR.arenaUnlocked = (save, id) => TR.totalStars(save) >= TR.arenaById(id).need;
})(globalThis);
