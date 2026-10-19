// Kør: node --test trampoline/test
import test from 'node:test';
import assert from 'node:assert/strict';

for (const f of ['core', 'body', 'tricks', 'athlete', 'scoring', 'challenges', 'share', 'game', 'tumbling']) await import(`../js/${f}.js`);
const TR = globalThis.TR, T = TR.Tumbling;

// Bot: trykker med en given forskydning fra hver takt. Ved takterne i 'mid' laves en salto (mid[idx] = { shape, saltos }),
// ellers SATS. I luften holdes positionen, til der er rotation nok til det ønskede antal saltoer.
function run({ off = 0, miss = [], shape = 'tuck', saltos = 2, twists = 0, mid = {} } = {}) {
  const sim = new T.TumbleSim(), dt = 1 / 240;
  let end = null, pressed = new Set(), twistsDone = 0, held = true, plan = null, lastFly = null;
  const lands = [];
  sim.on('end', (r) => { end = r; });
  sim.on('land', (l) => lands.push(l));
  sim.step(dt, { push: true }); sim.step(dt, { push: false });
  for (let i = 0; i < 240 * 25 && !end; i++) {
    const inp = { push: false, tuck: false, pike: false, straight: false, twist: false };
    const next = off > 0 ? sim.beats.find((b) => !b.judged) : sim.upcoming(1).find((b) => !b.done);
    if (next && !pressed.has(next.idx) && sim.time + dt >= next.t + off && !miss.includes(next.idx)) {
      pressed.add(next.idx);
      if (mid[next.idx]) inp[mid[next.idx].shape] = true; else inp.push = true;
    }
    if (sim.phase === 'fly') {
      const f = sim.fly;
      if (f !== lastFly) { lastFly = f; held = true; twistsDone = 0; plan = f.final ? { shape, saltos, twists } : { twists: 0, ...mid[f.beat.idx] }; }
      const rem = plan.saltos * 2 * Math.PI - (f.phi0 - sim.phi);
      const tLand = sim.landETA();
      if (held && rem < 2.0 * tLand + (f.omega * f.omega - 4) / 120 + (plan.sloppy || 0)) held = false;
      if (held) inp[plan.shape] = true;
      if (twistsDone < plan.twists * 2 && sim.t > 0.15 && Math.floor(sim.t * 30) % 2 === 0 && !sim.prev.twist) { inp.twist = true; twistsDone++; }
    }
    sim.step(dt, inp);
  }
  return { sim, end, lands };
}

test('tumbling: perfekt timing giver 8 elementer, whips og en stående dobbelt salto lukket', () => {
  const { end } = run({ off: 0 });
  assert.ok(end, 'serien sluttede');
  assert.equal(end.elements.length, 8);
  assert.equal(end.elements[0].name, 'Araber');
  assert.ok(end.elements.some((e) => e.name === 'Whip'), 'med fart bliver det whips');
  assert.equal(end.landing.landing, 'stand', JSON.stringify(end.landing).slice(0, 120));
  assert.equal(end.elements[7].name, 'Dobbelt salto baglæns lukket');
  assert.ok(end.E > 9.5 && end.D > 2.5, `D ${end.D} E ${end.E}`);
});

test('tumbling: dobbelt salto strakt midt i serien, og serien fortsætter bagefter', () => {
  const { end, lands } = run({ off: 0, mid: { 4: { shape: 'straight', saltos: 2 } } });
  assert.equal(lands[0].landing, 'stand', JSON.stringify(lands[0]).slice(0, 160));
  assert.equal(end.elements[4].name, 'Dobbelt salto baglæns strakt');
  assert.equal(end.elements.length, 8);
  assert.ok(['flik', 'whip'].includes(end.elements[5].kind), 'videre med flikflak/whip');
  assert.equal(end.landing.landing, 'stand');
});

test('tumbling: midt i serien hjælper springeren med landingen og beholder farten', () => {
  for (const sloppy of [-1.2, 1.2]) {
    const { end, lands } = run({ off: 0, mid: { 3: { shape: 'straight', saltos: 2, sloppy } } });
    assert.ok(['stand', 'step'].includes(lands[0].landing), `åbnet ${sloppy}: ${lands[0].landing}`);
    assert.equal(end.elements.length, 8);
    assert.ok(end.vTop > 6.3, `fart ${end.vTop}`);
  }
});

test('tumbling: sen timing taber fart, og glemte afsæt stopper serien', () => {
  const late = run({ off: 0.2 }).end;
  assert.ok(late.vTop < run({ off: 0 }).end.vTop);
  assert.ok(late.E < 8.5);
  const stop = run({ miss: [1, 2, 3, 4, 5, 6, 7] }).end;
  assert.equal(stop.landing.landing, 'stop');
  assert.ok(stop.elements.length < 8);
});

test('tumbling: for mange saltoer i forhold til farten giver fald', () => {
  const { end } = run({ off: 0.1, saltos: 5 });
  assert.equal(end.landing.landing, 'fall');
});

test('tumbling: hænderne står stille på banen i flikflakken', () => {
  const sim = new T.TumbleSim(), dt = 1 / 240, I = TR.Body.IDX;
  const pressed = new Set();
  sim.step(dt, { push: true }); sim.step(dt, { push: false });
  const hx = [];
  for (let i = 0; i < 240 * 4; i++) {
    const next = sim.upcoming(1).find((b) => !b.done), inp = { push: false };
    if (next && !pressed.has(next.idx) && sim.time + dt >= next.t) { pressed.add(next.idx); inp.push = true; }
    sim.step(dt, inp);
    if (sim.phase === 'elem' && sim.seg.kind === 'flik') {
      const u = sim.t / sim.seg.T, W = sim.W;
      if (u > 0.48 && u < 0.62) hx.push([(W[I.handL * 3] + W[I.handR * 3]) / 2, Math.min(W[I.handL * 3 + 1], W[I.handR * 3 + 1])]);
    }
  }
  assert.ok(hx.length > 5);
  const xs = hx.map((h) => h[0]), ys = hx.map((h) => h[1]);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 0.02, 'hænderne glider ikke');
  assert.ok(Math.max(...ys) < 0.06, 'hænderne er i banen');
});

test('tumbling: med topfart og perfekt timing når man højt nok til en firdobbelt salto', () => {
  const { end } = run({ off: 0, saltos: 4 });
  assert.equal(end.landing.landing, 'stand', JSON.stringify(end.landing).slice(0, 120));
  assert.equal(end.elements[7].name, 'Firdobbelt salto baglæns lukket');
  assert.ok(end.landing.height > 3.5, `højde ${end.landing.height}`);
  assert.ok(end.elements.length === 8);
});

test('tumbling: navn og sværhed for afslutningen', () => {
  assert.equal(T.finalSkill(2, 2, 'tuck').name, 'Dobbelt salto baglæns lukket med hel skrue');
  assert.equal(T.finalSkill(1, 0, 'straight').name, 'Salto baglæns strakt');
  assert.ok(T.finalSkill(2, 0, 'straight').dd > T.finalSkill(2, 0, 'tuck').dd);
});
