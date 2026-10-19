// Kør: node --test trampoline/test
import test from 'node:test';
import assert from 'node:assert/strict';

for (const f of ['core', 'body', 'human']) await import(`../js/${f}.js`);
const TR = globalThis.TR, H = TR.Human, B = TR.Body;

test('3D-springeren bygges som ét lukket net med gyldige vægte', () => {
  const m = H.build();
  const nv = m.pos.length / 3;
  assert.ok(nv > 15000 && nv < 60000, `antal punkter ${nv}`);
  assert.ok(m.idx.length / 3 < 110000, `antal trekanter ${m.idx.length / 3}`);
  for (const i of m.idx) assert.ok(i < nv);
  for (let v = 0; v < nv; v++) {
    const w = m.weights[v * 4] + m.weights[v * 4 + 1] + m.weights[v * 4 + 2] + m.weights[v * 4 + 3];
    assert.ok(Math.abs(w - 1) < 1e-4);
  }
  // figuren dækker kroppen fra fødderne til issen og er ca. 1,8 m høj
  let lo = Infinity, hi = -Infinity;
  for (let v = 0; v < nv; v++) { lo = Math.min(lo, m.pos[v * 3 + 1]); hi = Math.max(hi, m.pos[v * 3 + 1]); }
  assert.ok(hi - lo > 1.7 && hi - lo < 1.95, `højde ${(hi - lo).toFixed(2)}`);
});

test('knoglerne følger leddene: hænderne sidder ved håndleddene i en lukket salto', () => {
  const m = H.build();
  const W = B.toWorld(B.solve({ hip: 2.2, knee: 2.3, hand: B.legGripTarget({ hip: 2.2, knee: 2.3 }, 0.3) }), 0.7, 1.9, 0.4, 3);
  const F = H.frames(W), R = m.rest;
  const inv = (f, p) => { const d = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]]; return [0, 1, 2].map((c) => f.R[c * 3] * d[0] + f.R[c * 3 + 1] * d[1] + f.R[c * 3 + 2] * d[2]); };
  const fwd = (f, l) => [0, 1, 2].map((r) => f.o[r] + f.R[r] * l[0] + f.R[3 + r] * l[1] + f.R[6 + r] * l[2]);
  const hand = [W[B.IDX.handR * 3], W[B.IDX.handR * 3 + 1], W[B.IDX.handR * 3 + 2]];
  const restHand = m.J.handR;
  let best = Infinity;
  for (let v = 0; v < m.pos.length / 3; v++) {
    const p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
    if (Math.hypot(p[0] - restHand[0], p[1] - restHand[1], p[2] - restHand[2]) > 0.03) continue;
    const q = [0, 0, 0];
    for (let k = 0; k < 4; k++) { const b = m.bones[v * 4 + k], w = m.weights[v * 4 + k]; const t = fwd(F[b], inv(R[b], p)); for (let c = 0; c < 3; c++) q[c] += w * t[c]; }
    best = Math.min(best, Math.hypot(q[0] - hand[0], q[1] - hand[1], q[2] - hand[2]));
  }
  assert.ok(best < 0.03, `afstand ${best.toFixed(3)}`);
});
