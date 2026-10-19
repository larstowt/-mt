// Kør: node --test trampoline/test
import test from 'node:test';
import assert from 'node:assert/strict';

for (const f of ['core', 'body', 'tricks', 'athlete', 'scoring', 'challenges', 'share', 'game', 'tumbling']) await import(`../js/${f}.js`);
const TR = globalThis.TR, T = TR.Tumbling;

// Bot: trykker SATS med en given forskydning fra hver takt og holder en position i afslutningen,
// til der er nok rotation til det ønskede antal saltoer.
function run({ off = 0, miss = [], shape = 'tuck', saltos = 2, twists = 0 } = {}) {
  const sim = new T.TumbleSim(), dt = 1 / 240;
  let end = null, pressed = new Set(), twistsDone = 0, held = true;
  sim.on('end', (r) => { end = r; });
  sim.step(dt, { push: true }); sim.step(dt, { push: false });
  for (let i = 0; i < 240 * 20 && !end; i++) {
    const inp = { push: false, tuck: false, pike: false, straight: false, twist: false };
    // næste takt
    const next = off > 0 ? sim.beats.find((b) => !b.judged) : sim.upcoming(1).find((b) => !b.done);
    if (next && !pressed.has(next.idx) && sim.time + dt >= next.t + off && !miss.includes(next.idx)) { inp.push = true; pressed.add(next.idx); }
    if (sim.phase === 'final') {
      const f = sim.final, turned = f.phi0 - sim.phi, rem = saltos * 2 * Math.PI - turned;
      const tLand = (f.vy + Math.sqrt(Math.max(0, f.vy * f.vy + 2 * 9.81 * Math.max(0, sim.y - 0.95)))) / 9.81;
      if (held && rem < 2.0 * tLand + (f.omega * f.omega - 4) / 120) held = false;
      if (held) inp[shape] = true;
      if (twistsDone < twists * 2 && sim.t > 0.15 && Math.floor(sim.t * 30) % 2 === 0 && !sim.prev.twist) { inp.twist = true; twistsDone++; }
    }
    sim.step(dt, inp);
  }
  return { sim, end };
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

test('tumbling: sen timing taber fart, og glemte afsæt stopper serien', () => {
  const late = run({ off: 0.2 }).end;
  assert.ok(late.vTop < run({ off: 0 }).end.vTop);
  assert.ok(late.E < 8.5);
  const stop = run({ miss: [1, 2, 3, 4, 5, 6, 7] }).end;
  assert.equal(stop.landing.landing, 'stop');
  assert.ok(stop.elements.length < 8);
});

test('tumbling: for mange saltoer i forhold til farten giver fald', () => {
  const { end } = run({ off: 0.1, saltos: 3 });
  assert.equal(end.landing.landing, 'fall');
});

test('tumbling: navn og sværhed for afslutningen', () => {
  assert.equal(T.finalSkill(2, 2, 'tuck').name, 'Dobbelt salto baglæns lukket med hel skrue');
  assert.equal(T.finalSkill(1, 0, 'straight').name, 'Salto baglæns strakt');
  assert.ok(T.finalSkill(2, 0, 'straight').dd > T.finalSkill(2, 0, 'tuck').dd);
});
