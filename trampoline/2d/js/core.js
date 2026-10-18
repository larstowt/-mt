// Fælles hjælpere, færdigheder og gemt spillerdata.
(function (G) {
  'use strict';
  const TR = (G.TR = G.TR || {});
  const TAU = Math.PI * 2;
  TR.TAU = TAU;

  TR.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  TR.lerp = (a, b, t) => a + (b - a) * t;
  TR.approach = (cur, target, maxDelta) =>
    cur < target ? Math.min(cur + maxDelta, target) : Math.max(cur - maxDelta, target);
  TR.wrapPi = (a) => {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  };
  TR.round1 = (v) => Math.round(v * 10) / 10;
  // Dansk decimalkomma.
  TR.fmt = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');

  TR.store = {
    get(key, fallback) {
      try {
        const s = G.localStorage && G.localStorage.getItem(key);
        return s ? JSON.parse(s) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        if (G.localStorage) G.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* privat vindue o.l. – spillet virker stadig */
      }
    },
  };

  // ---------- Færdigheder (skill-system) ----------
  TR.SKILL_MAX = 5;
  TR.MAX_SKILLS = { power: 5, rotation: 5, twist: 5, flex: 5, air: 5, landing: 5 };
  TR.SKILLS = [
    { id: 'power', name: 'Kraft', icon: '⬆', desc: 'Højere spring og mere tid i luften.' },
    { id: 'rotation', name: 'Rotation', icon: '↻', desc: 'Mere rotation med fra dugen.' },
    { id: 'twist', name: 'Skrue', icon: '🌀', desc: 'Hurtigere skruer – i strakt og lukket.' },
    { id: 'flex', name: 'Smidighed', icon: '🤸', desc: 'Hurtigere og tættere lukket/hoftebøjet position.' },
    { id: 'air', name: 'Luftkontrol', icon: '🪶', desc: 'Justér rotationen mere i luften.' },
    { id: 'landing', name: 'Landing', icon: '🎯', desc: 'Større tolerance og mere stabile landinger.' },
  ];

  TR.effects = function (levels) {
    const lv = levels || {};
    const g = (k) => TR.clamp(lv[k] | 0, 0, TR.SKILL_MAX);
    const p = g('power'), r = g('rotation'), t = g('twist'), f = g('flex'), a = g('air'), l = g('landing');
    return {
      // Realistisk: tyngdepunktet løftes ca. 3,6 m (flyvetid ~1,7 s) uden træning og ~5,3 m (~2,1 s) med fuld Kraft
      maxApex: 4.2 + 0.35 * p, // loft for satsen, meter over dugen
      pushAcc: 28 + 3 * p,
      rotGain: 8 * (1 + 0.05 * r),
      twistRate: 12.5 * (1 + 0.17 * t), // rad/s i strakt (~2 skruer/s uden træning, som i Walaber)
      twistStop: 70,
      shapeRate: 8 * (1 + 0.2 * f),
      tight: f,
      air: 2.2 + 0.5 * a,
      // Arkade-styring (som Walaber's Trampoline): rotationen kommer fra afsættet;
      // hold en position for at rotere, slip alle knapper for at bremse ned.
      arcadeGain: 9.5 * (1 + 0.28 * r),
      twistSpin: 0.8, // saltoen roterer langsommere, mens man skruer (strakt skrue)
      // Som i Walaber: når man åbner, falder farten brat (~0,1 s) og glider så langsomt ned
      // frem mod landing. Farten har et fast loft, så den ikke vokser med Rotation-færdigheden.
      arcadeSlow: 0.45, arcadeSlowMax: 2.2, // rad/s lige efter åbning (~125°/s)
      arcadeGlide: 0.2, arcadeGlideMax: 1.0, // rad/s frem mod landing (~55°/s)
      arcadeBrake: 60 + 4 * a,
      landTol: 0.36 + 0.05 * l,
      // Skæve landinger (op til ca. 60°) er ikke styrt – men giver lavt afsæt og vandring
      skewMax: 1.05 + 0.04 * l,
      dropTol: 0.45 + 0.04 * l,
      travel: 0.07 * (1 - 0.1 * l),
    };
  };

  // ---------- Gemt spil ----------
  const SAVE_KEY = 'trampolin-remake.v1';
  TR.defaultSave = () => ({
    name: 'Spiller',
    xp: 0,
    skills: { power: 0, rotation: 0, twist: 0, flex: 0, air: 0, landing: 0 },
    stars: {},
    best: { free: 0, time: 0, routine: 0 },
    look: { suit: '#e63946', accent: '#ffd166', skin: '#f1c27d', hair: '#3b2a20' },
    sound: true,
    control: 'arcade',
    arena: 'neon',
    seenHelp: false,
  });
  TR.loadSave = () => {
    const d = TR.defaultSave();
    const s = TR.store.get(SAVE_KEY, null);
    if (!s || typeof s !== 'object') return d;
    return {
      ...d,
      ...s,
      skills: { ...d.skills, ...(s.skills || {}) },
      best: { ...d.best, ...(s.best || {}) },
      look: { ...d.look, ...(s.look || {}) },
      stars: { ...(s.stars || {}) },
    };
  };
  TR.persist = (save) => TR.store.set(SAVE_KEY, save);

  TR.xpForLevel = (n) => 150 * (n - 1) * n; // niveau 2 = 300 XP, 3 = 900 ...
  TR.levelInfo = (xp) => {
    let level = 1;
    while (TR.xpForLevel(level + 1) <= xp && level < 99) level++;
    const cur = TR.xpForLevel(level), next = TR.xpForLevel(level + 1);
    return { level, cur, next, frac: (xp - cur) / (next - cur) };
  };
  TR.totalStars = (save) => Object.values(save.stars || {}).reduce((a, b) => a + (b | 0), 0);
  TR.spentPoints = (save) => Object.values(save.skills || {}).reduce((a, b) => a + (b | 0), 0);
  TR.earnedPoints = (save) => TR.levelInfo(save.xp).level - 1 + Math.floor(TR.totalStars(save) / 2);
  TR.freePoints = (save) => Math.max(0, TR.earnedPoints(save) - TR.spentPoints(save));
})(globalThis);
