// Kør: node --test trampoline/test
import test from 'node:test';
import assert from 'node:assert/strict';

for (const f of ['core', 'body', 'tricks', 'athlete', 'scoring', 'challenges', 'share']) await import(`../js/${f}.js`);
const TR = globalThis.TR;

// Simpel autopilot der åbner, når resten af rotationen kan klares i strakt.
function jump(levels, { shape = 'tuck', som = 1, lean = 0.2, dir = 1, twist = 0, twistAt = 0.1 }) {
  const a = new TR.Athlete(levels);
  const dt = 1 / 240;
  let t = 0, n = 0, leanT = 0, result = null;
  a.on('land', (e) => { if (leanT > 0) result = e; n++; });
  a.on('crash', (e) => { result = { crash: e.reason }; });
  while (t < 30 && !result) {
    const inp = { lean: 0, push: true, tuck: false, pike: false, twist: false, kill: false };
    if (n >= 8 && a.state === 'bed' && a.vy > -2.5 && leanT < lean) { inp.lean = dir; leanT += dt; }
    if (a.state === 'air' && leanT > 0) {
      const rem = som * TR.TAU - Math.abs(a.tracker.raw + a.tracker.tilt0);
      const tl = (a.vy + Math.sqrt(Math.max(0, a.vy * a.vy + 2 * TR.GRAV * (a.y - 1.1)))) / TR.GRAV;
      const w = Math.abs(a.L) / 11;
      if (shape !== 'straight' && rem > w * tl + 0.35) inp[shape] = true;
      if (rem < w * tl - 0.25) inp.lean = -dir; else if (rem > w * tl + 0.25 && !inp.tuck && !inp.pike) inp.lean = dir;
      if (twist && a.airT > twistAt && a.tracker.dpsi < twist * Math.PI - 0.4) inp.twist = true;
    }
    a.step(dt, inp); t += dt;
  }
  return result;
}

test('pumper op i højde og holder sig under maks', () => {
  const a = new TR.Athlete({});
  let maxH = 0;
  a.on('apex', (e) => (maxH = Math.max(maxH, e.height)));
  for (let i = 0; i < 240 * 15; i++) a.step(1 / 240, { lean: 0, push: true });
  assert.ok(maxH > 2.4, `maxH ${maxH}`);
  assert.ok(maxH < TR.effects({}).maxApex + 0.2);
});

test('salto baglæns lukket genkendes med FIG-kode og DD', () => {
  const [r] = sequence({}, [{ q: 4, dir: 1, tilt: 0.2, shape: 'tuck', to: 'feet' }]);
  assert.ok(r && r.skill, JSON.stringify(r));
  assert.equal(r.skill.code, '4 0 o');
  assert.equal(r.skill.dir, 'B');
  assert.equal(r.skill.dd, 0.5);
});

test('barani (forlæns med ½ skrue) strakt', () => {
  const [r] = sequence({}, [{ q: 4, dir: -1, tilt: 0.25, twist: 1, to: 'feet' }]);
  assert.ok(r && r.skill, JSON.stringify(r));
  assert.equal(r.skill.name, 'Barani');
  assert.equal(r.skill.code, '4 1 /');
});

test('skrue virker ikke i hoftebøjet (kun strakt og lukket)', () => {
  for (const [shape, twists] of [['pike', false], ['tuck', true], [null, true]]) {
    const a = new TR.Athlete({}, 'arcade');
    for (let i = 0; i < 240 * 10; i++) a.step(1 / 240, { push: true });
    while (a.state !== 'air') a.step(1 / 240, { push: true });
    for (let i = 0; i < 120; i++) a.step(1 / 240, { twist: true, ...(shape ? { [shape]: true } : {}) });
    assert.equal(a.tracker.dpsi > 0.5, twists, `${shape || 'strakt'}: skrue ${a.tracker.dpsi.toFixed(2)}`);
  }
});

test('skrue i lukket position er mulig', () => {
  const [r] = sequence({}, [{ q: 4, dir: 1, tilt: 0.2, shape: 'tuck', twist: 2, to: 'feet' }]);
  assert.ok(r && r.skill, JSON.stringify(r));
  assert.equal(r.skill.totalHalves, 2);
  assert.equal(r.skill.shape, 'o');
});

test('dobbelt salto kræver træning', () => {
  const [r] = sequence({ power: 3, rotation: 3, flex: 3, air: 2 }, [{ q: 8, dir: 1, tilt: 0.3, shape: 'tuck', to: 'feet' }]);
  assert.ok(r && r.skill, JSON.stringify(r));
  assert.equal(r.skill.quarters, 8);
});

test('manglende åbning giver styrt', () => {
  const a = new TR.Athlete({});
  let crash = null;
  a.on('crash', (e) => (crash = e.reason));
  for (let i = 0; i < 240 * 20 && !crash; i++) a.step(1 / 240, { lean: 0, push: true, tuck: a.state === 'air' && a.airT > 0.05 });
  assert.ok(crash);
});

test('skruer fordeles pr. salto (hel-ind)', () => {
  const d = TR.Tricks.describe(8, 'B', [2, 0], 'o');
  assert.equal(d.name, 'Hel-ind');
  assert.equal(d.code, '8 2 0 o');
  assert.deepEqual(TR.Tricks.distribute([2 * Math.PI, 0.1], 2, 2), [2, 0]);
});

test('sværhedsgrad følger FIG-lignende regler', () => {
  const dd = TR.Tricks.difficulty;
  assert.equal(dd(4, [0], '<'), 0.6);
  assert.equal(dd(4, [2], '/'), 0.7);
  assert.equal(dd(8, [0, 0], 'o'), 1.0);
});

test('udførelse trækker for skæv landing og vandring', () => {
  const skill = { quarters: 4, usedClosed: true, openTime: 0.3, x0: 0 };
  const perfect = TR.Scoring.execution(skill, { legAngle: 0, tol: 0.36, twistRes: 0, hip: 0, knee: 0, x: 0 });
  assert.equal(perfect.E, 2);
  const bad = TR.Scoring.execution(skill, { legAngle: 0.3, tol: 0.36, twistRes: 0, hip: 0, knee: 0, x: 0.8 });
  assert.ok(bad.E < 1.6);
  assert.ok(bad.H > 0);
});

test('rutine: gentagne spring tæller ikke i D', () => {
  const s = { dd: 0.5, tof: 1.5 };
  const t = TR.Scoring.routineTotals([{ skill: s, ev: { E: 2, H: 0 } }, { skill: s, ev: { E: 2, H: 0 }, repeat: true }]);
  assert.equal(t.D, 0.5);
});

test('udfordringslink kan kodes og afkodes', () => {
  const tok = TR.Share.encode({ kind: 'skill', name: 'Æble Øster', arena: 'aurora', title: 'Rudi strakt', E: 1.8, match: { dir: 'F', q: 4, halves: 3, shape: '/' } });
  const ch = TR.Share.decode(tok);
  assert.equal(ch.name, 'Æble Øster');
  assert.equal(ch.match.halves, 3);
  assert.equal(TR.Share.decode('ødelagt!!'), null);
});

test('alle udfordringer har gyldige data og baner låses op i rækkefølge', () => {
  let prev = -1;
  for (const a of TR.ARENAS) {
    assert.ok(a.need > prev); prev = a.need;
    assert.ok(a.challenges.length >= 5);
    for (const c of a.challenges) assert.ok(['height', 'skill', 'sequence', 'score', 'routine'].includes(c.type), c.id);
  }
  assert.ok(TR.Challenges.matches({ dir: 'B', quarters: 8, totalHalves: 2, halves: [2, 0], shape: 'o' }, TR.Challenges.byId.a3.match));
  // Ball-out matcher kun fra ryg til fødder, og en salto til ryggen er ikke en salto baglæns.
  const ballOut = { from: 'back', to: 'feet', dir: 'F', quarters: 5, totalHalves: 0, halves: [0], shape: 'o' };
  assert.ok(TR.Challenges.matches(ballOut, TR.Challenges.byId.a6.match));
  assert.ok(!TR.Challenges.matches({ ...ballOut, from: 'feet' }, TR.Challenges.byId.a6.match));
  assert.ok(!TR.Challenges.matches({ from: 'feet', to: 'back', dir: 'B', quarters: 4, totalHalves: 0, halves: [0] }, TR.Challenges.byId.h2.match));
});

test('færdighedspoint fra niveau og stjerner', () => {
  const s = TR.defaultSave();
  assert.equal(TR.freePoints(s), 0);
  s.xp = TR.xpForLevel(3); s.stars = { h1: 3, h2: 1 };
  assert.equal(TR.freePoints(s), 4);
});

// Autopilot til spring med start/slut på ryg og mave: holder et vip-mål på dugen og retter op i luften.
function sequence(levels, steps, pump = 6) {
  const a = new TR.Athlete(levels);
  const dt = 1 / 240;
  const Istr = TR.Body.solve({ hip: 0, knee: 0, hand: TR.Body.HAND.side }).Isom;
  let t = 0, n = 0, idx = -1, cur = null;
  const out = [];
  a.on('land', (e) => { n++; if (cur) { out.push({ skill: e.skill, contact: a.contact }); idx++; cur = null; } });
  a.on('crash', (e) => { out.push({ crash: e.reason }); t = 99; });
  a.on('takeoff', () => { if (idx >= 0 && steps[idx]) cur = steps[idx]; });
  while (t < 40 && (idx < 0 || idx < steps.length)) {
    const inp = { lean: 0, push: true };
    if (n >= pump && idx < 0) idx = 0;
    const p = steps[idx];
    if (p && a.state === 'bed' && a.tilt() * p.dir < p.tilt) inp.lean = p.dir;
    if (cur && a.state === 'air') {
      const tr = a.tracker;
      const rem = (cur.q * Math.PI) / 2 - Math.abs((tr.from === 'feet' ? tr.raw : tr.dphi) + tr.tilt0);
      const hLand = cur.to === 'feet' ? 1.05 : 0.25;
      const tl = (a.vy + Math.sqrt(Math.max(0, a.vy * a.vy + 2 * TR.GRAV * (a.y - hLand)))) / TR.GRAV;
      const w = Math.abs(a.L) / Istr;
      if (cur.shape && rem > w * tl + 0.4) inp[cur.shape] = true;
      if (!inp[cur.shape || 'x']) { if (rem < w * tl - 0.1) inp.lean = -cur.dir; else if (rem > w * tl + 0.1) inp.lean = cur.dir; }
      if (cur.twist && a.tracker.dpsi < cur.twist * Math.PI - 0.4 && a.airT > 0.15) inp.twist = true;
    }
    a.step(dt, inp); t += dt;
  }
  return out;
}

const RYG = { q: 1, dir: 1, tilt: 0.06, to: 'back' };
const MAVE = { q: 1, dir: -1, tilt: 0.06, to: 'front' };

test('rygfald og tilbage op på fødderne', () => {
  const r = sequence({}, [RYG, { q: 1, dir: -1, tilt: 0.06, to: 'feet' }]);
  assert.equal(r[0].skill && r[0].skill.name, 'Rygfald', JSON.stringify(r));
  assert.equal(r[0].contact, 'back');
  assert.equal(r[1].skill && r[1].skill.name, 'Fra ryg til fødder', JSON.stringify(r));
  assert.equal(r[1].contact, 'feet');
});

test('mavefald videre til cody', () => {
  const r = sequence({ power: 3, rotation: 3, flex: 3, air: 2 }, [MAVE, { q: 5, dir: 1, tilt: 0.3, shape: 'tuck', to: 'feet' }]);
  assert.equal(r[0].skill && r[0].skill.name, 'Mavefald', JSON.stringify(r));
  assert.equal(r[1].skill && r[1].skill.name, 'Cody', JSON.stringify(r));
  assert.equal(r[1].skill.dir, 'B');
  assert.equal(r[1].skill.quarters, 5);
});

test('rygfald videre til ball-out', () => {
  const r = sequence({ power: 3, rotation: 3, flex: 3, air: 2 }, [RYG, { q: 5, dir: -1, tilt: 0.3, shape: 'tuck', to: 'feet' }]);
  assert.equal(r[1].skill && r[1].skill.name, 'Ball-out', JSON.stringify(r));
  assert.ok(r[1].skill.dd >= 0.6);
});

test('landing på hovedet er stadig et styrt', () => {
  const r = sequence({ power: 3, rotation: 3 }, [{ q: 2, dir: 1, tilt: 0.12, to: 'back' }]);
  assert.ok(r[0].crash, JSON.stringify(r));
});

test('rotationsmåleren viser vip og retning på dugen', () => {
  const a = new TR.Athlete({});
  for (let i = 0; i < 240 * 6; i++) a.step(1 / 240, { lean: 0, push: true });
  let info = null;
  for (let i = 0; i < 240 * 3 && !(info && info.phase === 'bed' && info.frac > 0.3); i++) {
    a.step(1 / 240, { lean: a.state === 'bed' ? 1 : 0, push: true });
    info = a.rotInfo();
  }
  assert.equal(info.phase, 'bed');
  assert.ok(info.frac > 0.3);
  assert.equal(info.dir, 'baglæns');
  assert.ok(info.straight > 0 && info.tuck > info.straight);
});

test('Drop-serien (rygfald, ball-out, mavefald, cody) kan gennemføres', () => {
  const lv = { power: 3, rotation: 3, flex: 3, air: 2 };
  const r = sequence(lv, [RYG, { q: 5, dir: -1, tilt: 0.3, shape: 'tuck', to: 'feet' }, MAVE, { q: 5, dir: 1, tilt: 0.3, shape: 'tuck', to: 'feet' }]);
  const list = TR.Challenges.byId.f6.list;
  assert.equal(r.length, 4, JSON.stringify(r.map((x) => x.crash || x.skill.fullName)));
  r.forEach((x, i) => assert.ok(x.skill && TR.Challenges.matches(x.skill, list[i]), `${i}: ${x.crash || x.skill.fullName}`));
});

test('Ryg til mave-serien kan gennemføres', () => {
  const r = sequence({}, [RYG, { q: 2, dir: -1, tilt: 0.12, to: 'front' }, { q: 1, dir: 1, tilt: 0.06, to: 'feet' }]);
  const list = TR.Challenges.byId.s6.list;
  assert.equal(r.length, 3, JSON.stringify(r.map((x) => x.crash || x.skill.fullName)));
  r.forEach((x, i) => assert.ok(x.skill && TR.Challenges.matches(x.skill, list[i]), `${i}: ${x.crash || x.skill.fullName}`));
});

// Arkade-styring: rotationen kommer fra afsættet; hold en position for at rotere, slip for at bremse.
function arcade(levels, { q = 4, dir = 1, shape = 'straight', tilt = 0.3 }) {
  const a = new TR.Athlete(levels, 'arcade');
  const dt = 1 / 240;
  const amt = Math.min(1, tilt / 0.45); // ladning (0-1) svarende til det gamle vip
  let t = 0, n = 0, res = null, act = false, charged = false;
  a.on('land', (e) => { n++; if (act) res = e; });
  a.on('crash', (e) => { res = { crash: e.reason }; });
  a.on('takeoff', () => { if (charged) act = true; });
  while (t < 30 && !res) {
    const inp = { lean: 0, push: true };
    // Lad op på vej ned mod dugen, og slip før landing
    if (n >= 8 && !charged && a.state === 'air') {
      if (a.charge < amt) inp.lean = dir; else charged = true;
    }
    if (act && a.state === 'air') {
      const rem = (q * Math.PI) / 2 - Math.abs(a.tracker.raw + a.tracker.tilt0);
      const tl = (a.vy + Math.sqrt(Math.max(0, a.vy * a.vy + 2 * TR.GRAV * (a.y - 1.05)))) / TR.GRAV;
      const fx = a.fx, s0 = Math.abs(a.spin0);
      const w = Math.abs(a.omega), b = fx.arcadeBrake;
      const ws = Math.min(s0 * (fx.arcadeSlow + fx.arcadeGlide) / 2, (fx.arcadeSlowMax + fx.arcadeGlideMax) / 2);
      const tb = Math.max(0, (w - ws) / b);
      const coast = ((w + ws) / 2) * Math.min(tb, tl) + ws * Math.max(0, tl - tb);
      if (rem > coast) inp[shape] = true;
    }
    a.step(dt, inp); t += dt;
  }
  return res;
}
const landsWithSome = (lv, o, tilts) => tilts.map((tilt) => arcade(lv, { ...o, tilt })).find((r) => r && r.skill);

test('arkade: strakt salto uden skrue (vip på dugen, hold STRAKT, slip)', () => {
  const r = landsWithSome({}, { shape: 'straight' }, [0.4, 0.43, 0.45]);
  assert.ok(r, 'ingen strakt salto');
  assert.equal(r.skill.code, '4 0 /');
  assert.equal(r.skill.name, 'Salto baglæns');
});

test('arkade: hoftebøjet og lukket salto på første niveau', () => {
  assert.equal(landsWithSome({}, { shape: 'pike' }, [0.3, 0.35, 0.4, 0.45]).skill.code, '4 0 <');
  assert.equal(landsWithSome({}, { shape: 'tuck' }, [0.3, 0.35, 0.4, 0.45]).skill.code, '4 0 o');
});

test('arkade: pilene lader op uden at rotere; slippes de i luften, bruges ladningen i næste afsæt', () => {
  const a = new TR.Athlete({}, 'arcade');
  for (let i = 0; i < 240 * 10; i++) a.step(1 / 240, { push: true });
  while (a.state !== 'air') a.step(1 / 240, { push: true });
  while (a.vy > 0) a.step(1 / 240, {});
  for (let i = 0; i < 120; i++) a.step(1 / 240, { lean: 1 });
  assert.ok(a.charge > 0.4, `ladning ${a.charge}`);
  assert.ok(Math.abs(a.omega) < 0.05, 'ingen rotation mens der lades op');
  a.step(1 / 240, { lean: 0 });
  assert.ok(a.armed && a.armed.dir === 1, 'ladningen er gemt');
  while (a.state !== 'bed') a.step(1 / 240, {});
  while (a.state === 'bed') a.step(1 / 240, { push: true });
  assert.ok(a.spin0 > 1.5, `rotation fra afsættet ${a.spin0}`);
  for (let i = 0; i < 60; i++) a.step(1 / 240, { straight: true });
  const w = a.omega;
  // Som i Walaber: brat opbremsning (~0,1 s) til ca. en tredjedel, derefter langsom glidning
  for (let i = 0; i < 24; i++) a.step(1 / 240, {});
  assert.ok(a.omega < a.fx.arcadeSlowMax * 1.1, `brat opbremsning (${a.omega})`);
  assert.ok(a.omega > 0.3, `men stadig en synlig rotation (${a.omega})`);
  for (let i = 0; i < 48; i++) a.step(1 / 240, {});
  assert.ok(a.omega < w - 1, `uden knapper bremses der ned (${a.omega} < ${w})`);
  assert.ok(a.omega >= Math.min(a.fx.arcadeGlide * a.spin0, a.fx.arcadeGlideMax) - 0.01);
  for (let i = 0; i < 60; i++) a.step(1 / 240, { tuck: true });
  assert.ok(a.omega > w * 1.25, 'lukket roterer hurtigere end strakt');
});

test('arkade: holdes pilen gennem afsættet, starter rotationen først når man slipper', () => {
  const a = new TR.Athlete({}, 'arcade');
  for (let i = 0; i < 240 * 10; i++) a.step(1 / 240, { push: true });
  while (a.state !== 'air') a.step(1 / 240, { push: true });
  while (a.state === 'air') a.step(1 / 240, { lean: -1 });
  while (a.state === 'bed') a.step(1 / 240, { lean: -1, push: true });
  for (let i = 0; i < 48; i++) a.step(1 / 240, { lean: -1, straight: true });
  assert.ok(Math.abs(a.omega) < 0.05, 'ingen rotation før slip');
  a.step(1 / 240, { lean: 0 });
  for (let i = 0; i < 48; i++) a.step(1 / 240, { straight: true });
  assert.ok(a.omega < -2, `roterer efter slip (${a.omega})`);
});

test('arkade: dobbelt salto kræver træning', () => {
  const base = arcade({}, { q: 8, shape: 'tuck', tilt: 0.3 });
  assert.ok(base.crash || base.skill.quarters < 8, 'dobbelt burde ikke lykkes uden træning');
  const lvl = arcade({ power: 3, rotation: 3, flex: 3 }, { q: 8, shape: 'tuck', tilt: 0.3 });
  assert.ok(lvl.skill && lvl.skill.quarters === 8, JSON.stringify(lvl.crash || lvl.skill.fullName));
});

// Realistisk model: ~3,6 m / ~1,7 s uden træning, ~5,3 m / ~2,1 s med fuld Kraft (perfekte satser)
function perfectPump(levels, secs = 40) {
  const a = new TR.Athlete(levels);
  const ap = [], tof = [];
  a.on('apex', (e) => ap.push(e.height));
  a.on('land', (e) => tof.push(e.skill.tof));
  for (let i = 0; i < 240 * secs; i++) {
    let push;
    if (a.state === 'bed' && a.sats.speed < 3) push = true;
    else { const t = a.satsTiming(); push = (t != null && t <= 0.03) || (a.state === 'bed' && a.sats.pressT != null); }
    a.step(1 / 240, { push });
  }
  return { h: Math.max(...ap), tof: Math.max(...tof) };
}

test('realistiske højder og flyvetider', () => {
  const base = perfectPump({});
  assert.ok(base.h > 3.3 && base.h < 3.9, `højde ${base.h}`);
  assert.ok(base.tof > 1.6 && base.tof < 1.8, `flyvetid ${base.tof}`);
  const max = perfectPump({ power: 5 });
  assert.ok(max.h > 4.9 && max.h < 5.6, `højde ${max.h}`);
  assert.ok(max.tof > 1.95 && max.tof < 2.2, `flyvetid ${max.tof}`);
});

test('landing væk fra midten koster højde', () => {
  const a = new TR.Athlete({});
  let loss = null;
  a.on('land', (e) => { if (loss == null && Math.abs(e.landing.x) > 1) loss = e.landing.heightLoss; });
  for (let i = 0; i < 240 * 8; i++) a.step(1 / 240, { push: true });
  a.x = 1.6; // flyt springeren ud mod kanten i luften
  for (let i = 0; i < 240 * 3 && loss == null; i++) a.step(1 / 240, { push: true });
  assert.ok(loss > 0.15 && loss <= 0.25, `højdetab ${loss}`);
});
