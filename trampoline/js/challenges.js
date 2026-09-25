// Baner (arenaer) og udfordringer.
(function (G) {
  'use strict';
  const TR = G.TR;

  // m: {dir, q, halves, shape, split, minQ, minHalves}
  function matches(skill, m) {
    if (!skill || !m) return false;
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
        { id: 'h1', title: 'Første hop', desc: 'Pump dig op til 2 meters højde.', type: 'height', target: 2.0, hint: 'Hold MELLEMRUM (SATS) nede, mens du er på dugen.' },
        { id: 'h2', title: 'Salto baglæns', desc: 'Land en salto baglæns – valgfri position.', type: 'skill', match: { dir: 'B', q: 4, halves: 0 }, hint: 'Vip med piletasten på dugen, luk (Z) i luften og åbn før landing.' },
        { id: 'h3', title: 'Salto forlæns', desc: 'Land en salto forlæns.', type: 'skill', match: { dir: 'F', q: 4, halves: 0 }, hint: 'Vip den anden vej – forlæns afhænger af hvilken vej du vender.' },
        { id: 'h4', title: 'Hoftebøjet', desc: 'Land en salto baglæns i hoftebøjet position.', type: 'skill', match: { dir: 'B', q: 4, halves: 0, shape: '<' }, hint: 'Hold X for hoftebøjet.' },
        { id: 'h5', title: 'Barani', desc: 'Salto forlæns med ½ skrue.', type: 'skill', match: { dir: 'F', q: 4, halves: 1 }, hint: 'Tryk kort på C for en halv skrue.' },
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
      ],
    },
    {
      id: 'aurora', name: 'Nordlys', need: 16, tagline: 'Dobbelte saltoer under polarhimlen.',
      challenges: [
        { id: 'a1', title: 'Dobbelt salto', desc: 'Land en dobbelt salto baglæns.', type: 'skill', match: { dir: 'B', q: 8, halves: 0 }, hint: 'Kræver højde og rotation. Opgradér dine færdigheder.' },
        { id: 'a2', title: 'Hoftebøjet dobbelt', desc: 'Dobbelt salto baglæns hoftebøjet.', type: 'skill', match: { dir: 'B', q: 8, halves: 0, shape: '<' }, hint: 'Smidighed gør hoftebøjet tættere og hurtigere.' },
        { id: 'a3', title: 'Hel-ind', desc: 'Dobbelt salto baglæns med hel skrue i første salto.', type: 'skill', match: { dir: 'B', q: 8, split: [2, 0] }, hint: 'Skru tidligt, luk bagefter.' },
        { id: 'a4', title: 'Barani-ud', desc: 'Dobbelt salto forlæns med ½ skrue i sidste salto.', type: 'skill', match: { dir: 'F', q: 8, split: [0, 1] }, hint: 'Skru sent, når du åbner.' },
        { id: 'a5', title: 'Pointjagt', desc: 'Scor 2500 point på 60 sekunder.', type: 'score', target: 2500, time: 60, hint: 'Kombinationer ganger dine point op.' },
      ],
    },
    {
      id: 'final', name: 'VM-finalen', need: 27, tagline: 'Lysene er tændt. Det gælder.',
      challenges: [
        { id: 'f1', title: 'Første rutine', desc: 'Gennemfør en rutine med 10 elementer.', type: 'routine', target: 30, hint: 'Ingen strakte hop undervejs – hvert spring skal være et element.' },
        { id: 'f2', title: 'Dobbelt skrue', desc: 'Salto baglæns med dobbelt skrue.', type: 'skill', match: { dir: 'B', q: 4, halves: 4 }, hint: 'Skrue-færdigheden hjælper.' },
        { id: 'f3', title: 'Miller', desc: 'Dobbelt salto baglæns med hel skrue ind og hel skrue ud.', type: 'skill', match: { dir: 'B', q: 8, split: [2, 2] }, hint: 'Et af de sværeste spring. Strakt skruer hurtigst.' },
        { id: 'f4', title: 'Tripel', desc: 'Land en tripel salto.', type: 'skill', match: { q: 12 }, hint: 'Maks kraft og rotation – og luk tæt.' },
        { id: 'f5', title: 'VM-guld', desc: 'Få 45 point i en rutine.', type: 'routine', target: 45, hint: 'Sværhed + udførelse + flyvetid + placering.' },
      ],
    },
  ];

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
  TR.Challenges = { matches, starsFor, starsText, byId, starsFromE };
  TR.arenaById = (id) => ARENAS.find((a) => a.id === id) || ARENAS[0];
  TR.arenaUnlocked = (save, id) => TR.totalStars(save) >= TR.arenaById(id).need;
})(globalThis);
