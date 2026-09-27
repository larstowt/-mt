// Leddelt krop: positioner (strakt/hoftebøjet/lukket), massemidtpunkt og inertimomenter.
// Kroppen beregnes i 3D, så skruer kan ses ordentligt, men tegnes fra siden.
(function (G) {
  'use strict';
  const TR = G.TR;

  const LEN = {
    thigh: 0.44, shank: 0.44, foot: 0.1, torso: 0.54, neck: 0.08, head: 0.115,
    upper: 0.3, fore: 0.33, hipW: 0.085, shW: 0.17,
  };
  const MASS = { head: 5.5, torso: 31, thigh: 7.5, shank: 4.3, upper: 2.0, fore: 1.5 };

  const JOINTS = [
    'hip', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'toeL', 'toeR',
    'sh', 'shL', 'shR', 'elbowL', 'elbowR', 'handL', 'handR', 'neck', 'head', 'nose',
  ];
  const IDX = {};
  JOINTS.forEach((n, i) => (IDX[n] = i));
  const N = JOINTS.length;

  // Radius per led til kontakt med dugen.
  const RADIUS = new Float64Array(N);
  const R = { hip: 0.1, hipL: 0.08, hipR: 0.08, kneeL: 0.06, kneeR: 0.06, ankleL: 0.05, ankleR: 0.05,
    toeL: 0.03, toeR: 0.03, sh: 0.1, shL: 0.07, shR: 0.07, elbowL: 0.045, elbowR: 0.045,
    handL: 0.04, handR: 0.04, neck: 0.05, head: 0.115, nose: 0 };
  JOINTS.forEach((n, i) => (RADIUS[i] = R[n]));
  const FEET = new Set([IDX.ankleL, IDX.ankleR, IDX.toeL, IDX.toeR]);

  // Positioner. "tight" (smidighed 0-5) gør positionerne dybere.
  function shapeTarget(shape, tight) {
    const f = tight || 0;
    if (shape === 'tuck') return { hip: 2.2 + 0.05 * f, knee: 2.3 + 0.04 * f };
    // Lukket skrue: lårene ca. 90° på overkroppen, knæene bøjet ca. 110°
    if (shape === 'tucktwist') return { hip: 1.6, knee: 1.9 };
    if (shape === 'pike') return { hip: 1.95 + 0.04 * f, knee: 0 }; // åben hoftebøjet (ca. 70° mellem krop og ben)
    return { hip: 0, knee: 0 };
  }

  // Håndmål relativt til skulderen: [frem, op, udad]
  const HAND = {
    side: [0.05, -0.6, 0.1],
    // Strakt: helt strakte arme ned langs siden, tæt ind til kroppen
    straight: [0.0, -0.64, 0.015],
    up: [0.03, 0.61, 0.03],
    twist: [0.17, -0.2, -0.13],
    // Lukket skrue: knytnæverne samlet foran brystet under hagen, albuerne ind mod siderne
    tuckTwist: [0.2, 0.0, -0.155],
    crash: [0.35, 0.25, 0.35],
    bed: [0.1, -0.55, 0.08],
    lieBack: [0.25, 0.3, 0.35],
    lieFront: [0.4, 0.25, 0.2],
  };

  // Håndmål hvor hænderne griber om skinnebenet (lukket) eller anklerne (hoftebøjet).
  function legGripTarget(pose, along) {
    const ht = pose.hip, kt = pose.hip - pose.knee;
    const kx = Math.sin(ht) * LEN.thigh, ky = -Math.cos(ht) * LEN.thigh;
    const ax = kx + Math.sin(kt) * LEN.shank, ay = ky - Math.cos(kt) * LEN.shank;
    const px = kx + (ax - kx) * along, py = ky + (ay - ky) * along;
    return [px + 0.02, py - LEN.torso, -0.07];
  }

  // Hoftebøjet: næsten strakte arme, hænderne hviler oven på benene lige ved knæene.
  function pikeHandTarget(pose) {
    const ht = pose.hip, reach = LEN.thigh + LEN.shank * 0.06, off = 0.05;
    const px = Math.sin(ht) * reach + Math.cos(ht) * off, py = -Math.cos(ht) * reach + Math.sin(ht) * off;
    return [px, py - LEN.torso, 0.03];
  }

  function armIK(sx, sy, tx, ty, out) {
    const a = LEN.upper, b = LEN.fore;
    let dx = tx - sx, dy = ty - sy;
    let d = Math.hypot(dx, dy);
    const maxD = a + b - 1e-4;
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
    if (d < 0.1) { const s = 0.1 / Math.max(d, 1e-6); dx *= s; dy *= s; d = 0.1; }
    const hx = sx + dx, hy = sy + dy;
    const base = Math.atan2(dy, dx);
    const al = Math.acos(TR.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
    let ex = sx + a * Math.cos(base + al), ey = sy + a * Math.sin(base + al);
    // Albuen bøjer, så underarmen drejer mod uret i forhold til overarmen.
    const cross = (ex - sx) * (hy - ey) - (ey - sy) * (hx - ex);
    if (cross < 0) { ex = sx + a * Math.cos(base - al); ey = sy + a * Math.sin(base - al); }
    out[0] = ex; out[1] = ey; out[2] = hx; out[3] = hy;
  }

  const tmp4 = [0, 0, 0, 0];

  // Beregner ledpositioner omkring massemidtpunktet i "positionsrammen".
  function solve(pose, out) {
    const res = out || { pts: new Float64Array(N * 3), Isom: 1, Itw: 1, offset: 0, comH: 0 };
    const P = res.pts;
    const set = (i, x, y, z) => { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; };
    const T = LEN.torso;
    const ht = pose.hip, kt = pose.hip - pose.knee;
    const tdx = Math.sin(ht), tdy = -Math.cos(ht);
    const sdx = Math.sin(kt), sdy = -Math.cos(kt);
    set(IDX.hip, 0, 0, 0);
    const kx = tdx * LEN.thigh, ky = tdy * LEN.thigh;
    const ax = kx + sdx * LEN.shank, ay = ky + sdy * LEN.shank;
    const tx = ax + sdx * LEN.foot, ty = ay + sdy * LEN.foot;
    for (const s of [-1, 1]) {
      const z = s * LEN.hipW;
      const L = s < 0;
      set(L ? IDX.hipL : IDX.hipR, 0, 0, z);
      set(L ? IDX.kneeL : IDX.kneeR, kx, ky, z * 0.95);
      set(L ? IDX.ankleL : IDX.ankleR, ax, ay, z * 0.8);
      set(L ? IDX.toeL : IDX.toeR, tx, ty, z * 0.75);
    }
    set(IDX.sh, 0, T, 0);
    set(IDX.neck, 0.01, T + LEN.neck, 0);
    const hy = T + LEN.neck + LEN.head * 0.95;
    // Hovedet bøjes let frem mod benene i hoftebøjet (ikke i lukket og strakt)
    const nod = 0.15 * TR.clamp((pose.hip - 1.2) / 0.75, 0, 1) * TR.clamp(1 - pose.knee / 0.8, 0, 1);
    const nc = Math.cos(-nod), ns = Math.sin(-nod), nkx = 0.01, nky = T + LEN.neck;
    const rot = (x, y) => [nkx + (x - nkx) * nc - (y - nky) * ns, nky + (x - nkx) * ns + (y - nky) * nc];
    const hp = rot(0.015, hy), np = rot(0.015 + 0.14, hy - 0.01);
    set(IDX.head, hp[0], hp[1], 0);
    set(IDX.nose, np[0], np[1], 0);
    const hand = pose.hand;
    armIK(0, T, hand[0], T + hand[1], tmp4);
    for (const s of [-1, 1]) {
      const L = s < 0;
      const sz = s * LEN.shW;
      const hz = sz + s * hand[2];
      set(L ? IDX.shL : IDX.shR, 0, T - 0.03, sz);
      set(L ? IDX.elbowL : IDX.elbowR, tmp4[0], tmp4[1], (sz + hz) / 2 + s * 0.05);
      set(L ? IDX.handL : IDX.handR, tmp4[2], tmp4[3], hz);
    }

    // Massepunkter: [ledA, ledB, masse, længde]
    const segs = SEGMASS;
    let m = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const x = (P[s[0] * 3] + P[s[1] * 3]) / 2, y = (P[s[0] * 3 + 1] + P[s[1] * 3 + 1]) / 2, z = (P[s[0] * 3 + 2] + P[s[1] * 3 + 2]) / 2;
      m += s[2]; cx += x * s[2]; cy += y * s[2]; cz += z * s[2];
    }
    cx /= m; cy /= m; cz /= m;

    // Positionsrammen: drej halvdelen af hoftebøjningen tilbage, så lukket/hoftebøjet
    // ligger symmetrisk om rotationsaksen (overkrop og ben mødes).
    // pose.ax (0-1): 1 = skrueaksen midt mellem krop og lår, 0 = skrueaksen langs rygsøjlen (lukket skrue).
    const axW = pose.ax == null ? 1 : pose.ax;
    const off = -axW * (0.5 * pose.hip + 0.12 * pose.knee);
    const co = Math.cos(off), so = Math.sin(off);
    for (let i = 0; i < N; i++) {
      const x = P[i * 3] - cx, y = P[i * 3 + 1] - cy;
      P[i * 3] = x * co - y * so;
      P[i * 3 + 1] = x * so + y * co;
      P[i * 3 + 2] -= cz;
    }
    let Is = 0, It = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const x = (P[s[0] * 3] + P[s[1] * 3]) / 2, y = (P[s[0] * 3 + 1] + P[s[1] * 3 + 1]) / 2, z = (P[s[0] * 3 + 2] + P[s[1] * 3 + 2]) / 2;
      Is += s[2] * (x * x + y * y + (s[3] * s[3]) / 12);
      It += s[2] * (x * x + z * z) + s[4];
    }
    res.Isom = Is;
    res.Itw = It;
    res.offset = off;
    return res;
  }

  const SEGMASS = [
    // [a, b, masse, længde, egen twist-inerti]
    [IDX.hip, IDX.sh, MASS.torso, LEN.torso, 0.5 * MASS.torso * 0.13 * 0.13],
    [IDX.head, IDX.head, MASS.head, 0, 0.4 * MASS.head * LEN.head * LEN.head],
    [IDX.hipL, IDX.kneeL, MASS.thigh, LEN.thigh, 0.004],
    [IDX.hipR, IDX.kneeR, MASS.thigh, LEN.thigh, 0.004],
    [IDX.kneeL, IDX.ankleL, MASS.shank, LEN.shank, 0.002],
    [IDX.kneeR, IDX.ankleR, MASS.shank, LEN.shank, 0.002],
    [IDX.shL, IDX.elbowL, MASS.upper, LEN.upper, 0.001],
    [IDX.shR, IDX.elbowR, MASS.upper, LEN.upper, 0.001],
    [IDX.elbowL, IDX.handL, MASS.fore, LEN.fore, 0.001],
    [IDX.elbowR, IDX.handR, MASS.fore, LEN.fore, 0.001],
  ];

  // Positionsramme -> verden: skrue (om længdeaksen), så salto (om tværaksen), så flyt.
  function toWorld(body, psi, phi, x, y, out) {
    const P = body.pts;
    const W = out || new Float64Array(N * 3);
    const cp = Math.cos(psi), sp = Math.sin(psi), cf = Math.cos(phi), sf = Math.sin(phi);
    for (let i = 0; i < N; i++) {
      const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
      const x1 = px * cp + pz * sp, z1 = -px * sp + pz * cp;
      W[i * 3] = x + x1 * cf - py * sf;
      W[i * 3 + 1] = y + x1 * sf + py * cf;
      W[i * 3 + 2] = z1;
    }
    return W;
  }

  function lowest(W) {
    let best = Infinity, idx = -1;
    for (let i = 0; i < N; i++) {
      const y = W[i * 3 + 1] - RADIUS[i];
      if (y < best) { best = y; idx = i; }
    }
    return { y: best, idx, feet: FEET.has(idx) };
  }

  TR.Body = { LEN, MASS, JOINTS, IDX, N, RADIUS, HAND, shapeTarget, legGripTarget, pikeHandTarget, solve, toWorld, lowest };
})(globalThis);
