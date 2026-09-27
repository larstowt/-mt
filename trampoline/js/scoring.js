// Bedømmelse efter FIG-inspireret model: D (sværhed), E (udførelse), T (flyvetid), H (placering).
(function (G) {
  'use strict';
  const TR = G.TR;

  // Udførelse for ét spring: max 2,0 pr. element, minus fradrag.
  function execution(skill, land) {
    const ded = [];
    const add = (label, v) => { v = TR.round1(v); if (v > 0) ded.push({ label, v }); };
    const a = Math.abs(land.legAngle);
    add('Skæv landing', Math.min(1.2, 0.5 * (a / land.tol) - 0.05));
    if (land.twistRes > 0.12) add('Ufærdig skrue', 0.3 * (land.twistRes / 0.7));
    if (skill.quarters >= 4 && skill.usedClosed) {
      if (skill.openTime < 0.1) add('Åbnede sent', 0.2);
      else if (skill.openTime < 0.2) add('Åbnede sent', 0.1);
    }
    if ((land.kind || 'feet') === 'feet' && (land.hip > 0.5 || land.knee > 0.6)) add('Bøjet ved landing', 0.1);
    const travel = Math.abs(land.x - skill.x0);
    if (travel > 0.7) add('Vandring', 0.2);
    else if (travel > 0.35) add('Vandring', 0.1);
    const total = ded.reduce((s, d) => s + d.v, 0);
    const E = TR.round1(Math.max(0, 2.0 - total));
    const ax = Math.abs(land.x);
    const H = ax < 0.35 ? 0 : ax < 0.7 ? 0.1 : ax < 1.1 ? 0.2 : 0.3;
    return { E, ded, H };
  }

  function grade(E) {
    if (E >= 1.9) return 'Perfekt!';
    if (E >= 1.7) return 'Flot!';
    if (E >= 1.4) return 'Godt';
    return 'OK';
  }

  // Point i fri leg / tidsløb.
  function freePoints(skill, ev, combo, repeat) {
    if (skill.dd <= 0) return 0;
    const air = 0.55 + 0.45 * TR.clamp(skill.tof / 1.8, 0, 1.3);
    let p = 100 * (skill.dd + 0.2) * Math.pow(ev.E / 2, 1.5) * air;
    if (repeat) p *= 0.4;
    return Math.round(p * comboMult(combo));
  }
  const comboMult = (c) => Math.min(5, 1 + 0.25 * Math.max(0, c - 1));

  // Rutine: 10 elementer, gentagne spring giver 0 i D.
  function routineTotals(items) {
    let D = 0, E = 0, T = 0, Hd = 0;
    for (const it of items) {
      if (!it.repeat) D += it.skill.dd;
      E += it.ev.E;
      T += it.skill.tof;
      Hd += it.ev.H;
    }
    const H = items.length ? TR.round1(10 - Hd - (10 - items.length)) : 0;
    D = TR.round1(D); E = TR.round1(E); T = Math.round(T * 100) / 100;
    return { D, E, T, H: Math.max(0, H), total: Math.round((D + E + T + Math.max(0, H)) * 100) / 100 };
  }

  TR.Scoring = { execution, grade, freePoints, comboMult, routineTotals };
})(globalThis);
