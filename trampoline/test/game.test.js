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
      const rem = som * TR.TAU - Math.abs(a.tracker.dphi);
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
  const r = jump({}, { shape: 'tuck' });
  assert.ok(r && r.skill, JSON.stringify(r));
  assert.equal(r.skill.code, '4 0 o');
  assert.equal(r.skill.dir, 'B');
  assert.equal(r.skill.dd, 0.5);
});

test('barani (forlæns med ½ skrue) i hoftebøjet', () => {
  const r = jump({}, { shape: 'pike', dir: -1, twist: 1 });
  assert.ok(r && r.skill, JSON.stringify(r));
  assert.equal(r.skill.name, 'Barani');
  assert.equal(r.skill.code, '4 1 <');
});

test('skrue i lukket position er mulig', () => {
  const r = jump({}, { shape: 'tuck', twist: 2, twistAt: 0.3 });
  assert.ok(r && r.skill, JSON.stringify(r));
  assert.equal(r.skill.totalHalves, 2);
  assert.equal(r.skill.shape, 'o');
});

test('dobbelt salto kræver træning', () => {
  const r = jump({ power: 3, rotation: 3, flex: 3, air: 2 }, { som: 2, lean: 0.35 });
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
    assert.equal(a.challenges.length, 5);
    for (const c of a.challenges) assert.ok(['height', 'skill', 'sequence', 'score', 'routine'].includes(c.type), c.id);
  }
  assert.ok(TR.Challenges.matches({ dir: 'B', quarters: 8, totalHalves: 2, halves: [2, 0], shape: 'o' }, TR.Challenges.byId.a3.match));
});

test('færdighedspoint fra niveau og stjerner', () => {
  const s = TR.defaultSave();
  assert.equal(TR.freePoints(s), 0);
  s.xp = TR.xpForLevel(3); s.stars = { h1: 3, h2: 1 };
  assert.equal(TR.freePoints(s), 4);
});
