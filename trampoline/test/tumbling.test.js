// Kør: node --test trampoline/test
import test from 'node:test';
import assert from 'node:assert/strict';

for (const f of ['core', 'body', 'tricks', 'athlete', 'scoring', 'challenges', 'share', 'game', 'tumbling']) await import(`../js/${f}.js`);
const TR = globalThis.TR, T = TR.Tumbling;

// Bot: mellemspringene kører af sig selv. Ved takterne i 'mid' (og afslutningen, hvis finalOff er sat) trykkes
// mellemrum med en given forskydning, så springeren laver et højt spring. I luften holdes positionen,
// til der er rotation nok til det ønskede antal saltoer.
function run({ finalOff = 0, shape = 'tuck', saltos = 2, twists = 0, mid = {} } = {}) {
  const sim = new T.TumbleSim(), dt = 1 / 240;
  let end = null, pressed = new Set(), twistsDone = 0, held = true, plan = null, lastFly = null;
  const lands = [];
  sim.on('end', (r) => { end = r; });
  sim.on('land', (l) => lands.push(l));
  sim.step(dt, { push: true }); sim.step(dt, { push: false });
  for (let i = 0; i < 240 * 25 && !end; i++) {
    const inp = { push: false, tuck: false, pike: false, straight: false, twist: false };
    const next = sim.upcoming(1).find((b) => !b.done);
    const off = next ? (mid[next.idx] ? mid[next.idx].off || 0 : next.idx === 7 ? finalOff : null) : null;
    if (next && off != null && !pressed.has(next.idx) && sim.time + dt >= next.t + Math.min(0, off)) {
      if (off <= 0) { pressed.add(next.idx); inp.push = true; }
    }
    // sent tryk (efter takten)
    for (const b of sim.beats) {
      const o = mid[b.idx] ? mid[b.idx].off || 0 : b.idx === 7 ? finalOff : null;
      if (o != null && o > 0 && !pressed.has(b.idx) && sim.time + dt >= b.t + o) { pressed.add(b.idx); inp.push = true; }
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

test('tumbling: mellemspringene kører af sig selv – 8 elementer, whips og en stående dobbelt salto', () => {
  const { end } = run({ finalOff: 0 });
  assert.ok(end, 'serien sluttede');
  assert.equal(end.elements.length, 8);
  assert.equal(end.elements[0].name, 'Araber');
  assert.ok(end.elements.some((e) => e.name === 'Whip'), 'med fart bliver det whips');
  assert.equal(end.landing.landing, 'stand', JSON.stringify(end.landing).slice(0, 120));
  assert.equal(end.elements[7].name, 'Dobbelt salto baglæns lukket');
  assert.ok(end.E > 9.5, `E ${end.E}`);
});

test('tumbling: mellemrum på stregen giver et højt spring midt i serien, og serien fortsætter', () => {
  const { end, lands } = run({ finalOff: 0, mid: { 4: { shape: 'straight', saltos: 2 } } });
  assert.equal(lands[0].landing, 'stand', JSON.stringify(lands[0]).slice(0, 160));
  assert.equal(end.elements[4].name, 'Dobbelt salto baglæns strakt');
  assert.ok(lands[0].height > 3, `højde ${lands[0].height}`);
  assert.equal(end.elements.length, 8);
  assert.ok(['flik', 'whip'].includes(end.elements[5].kind), 'videre med flikflak/whip');
});

test('tumbling: lidt for sent tryk laver stadig flikflakken om til et højt spring', () => {
  const { end } = run({ finalOff: 0, mid: { 3: { shape: 'tuck', saltos: 2, off: 0.07 } } });
  assert.equal(end.elements[3].kind, 'salto');
  assert.equal(end.elements[3].name, 'Dobbelt salto baglæns lukket');
});

test('tumbling: et godt timet tryk giver mere kraft end slet intet tryk i afslutningen', () => {
  const pressed = run({ finalOff: 0 }).end.landing.height;
  const none = run({ finalOff: null, saltos: 1 }).end.landing.height;
  assert.ok(pressed > none + 0.3, `${pressed} mod ${none}`);
});

test('tumbling: midt i serien hjælper springeren med landingen og beholder farten', () => {
  for (const sloppy of [-1.2, 1.2]) {
    const { end, lands } = run({ finalOff: 0, mid: { 3: { shape: 'straight', saltos: 2, sloppy } } });
    assert.ok(['stand', 'step'].includes(lands[0].landing), `åbnet ${sloppy}: ${lands[0].landing}`);
    assert.equal(end.elements.length, 8);
  }
});

test('tumbling: for mange saltoer i forhold til højden giver fald', () => {
  const { end } = run({ finalOff: null, saltos: 4 });
  assert.equal(end.landing.landing, 'fall');
});

test('tumbling: hænderne står stille på banen i flikflakken', () => {
  const sim = new T.TumbleSim(), dt = 1 / 240, I = TR.Body.IDX;
  sim.step(dt, { push: true }); sim.step(dt, { push: false });
  const hx = [];
  let first = null;
  for (let i = 0; i < 240 * 4; i++) {
    sim.step(dt, { push: false });
    if (sim.phase === 'elem' && sim.seg.kind === 'flik' && (first = first || sim.seg) === sim.seg) {
      const u = sim.t / sim.seg.T, W = sim.W;
      if (u > 0.48 && u < 0.62) hx.push([(W[I.handL * 3] + W[I.handR * 3]) / 2, Math.min(W[I.handL * 3 + 1], W[I.handR * 3 + 1])]);
    }
  }
  assert.ok(hx.length > 5);
  const xs = hx.map((h) => h[0]), ys = hx.map((h) => h[1]);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 0.02, 'hænderne glider ikke');
  assert.ok(Math.max(...ys) < 0.06, 'hænderne er i banen');
});

test('tumbling: med en perfekt afslutning når man højt nok til en tredobbelt salto', () => {
  const { end } = run({ finalOff: 0, saltos: 3 });
  assert.equal(end.landing.landing, 'stand', JSON.stringify(end.landing).slice(0, 120));
  assert.equal(end.elements[7].name, 'Tredobbelt salto baglæns lukket');
  assert.ok(end.landing.height > 3, `højde ${end.landing.height}`);
});

test('tumbling: navn og sværhed for afslutningen', () => {
  assert.equal(T.finalSkill(2, 2, 'tuck').name, 'Dobbelt salto baglæns lukket med hel skrue');
  assert.equal(T.finalSkill(1, 0, 'straight').name, 'Salto baglæns strakt');
  assert.ok(T.finalSkill(2, 0, 'straight').dd > T.finalSkill(2, 0, 'tuck').dd);
});
