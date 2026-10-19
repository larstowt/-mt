// Menneskelig springerfigur til 3D: én sammenhængende, skulptureret krop (afstandsfelt af muskler,
// knogler og ansigt), som laves om til trekanter én gang ved start og derefter bøjes af spillets
// eget skelet (Body-leddene). Filen bruger ikke three.js, så den kan også testes i node.
(function (G) {
  'use strict';
  const TR = G.TR, B = TR.Body, I = B.IDX;

  // ---------- Lille vektor- og matrixmatematik (3x3 som søjler [x, y, z]) ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  const dist = (a, b) => { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); };
  const norm = (a) => { const l = len(a) || 1e-9; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mv = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];
  const mm = (A, Bm) => { const c0 = mv(A, [Bm[0], Bm[1], Bm[2]]), c1 = mv(A, [Bm[3], Bm[4], Bm[5]]), c2 = mv(A, [Bm[6], Bm[7], Bm[8]]); return [...c0, ...c1, ...c2]; };
  const cols = (x, y, z) => [...x, ...y, ...z];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // Korteste drejning, der fører retning a over i retning d (Rodrigues).
  function swing(a, d) {
    const ax = cross(a, d), s = len(ax), c = dot(a, d);
    if (s < 1e-9) {
      if (c > 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const p = norm(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
      return [2 * p[0] * p[0] - 1, 2 * p[0] * p[1], 2 * p[0] * p[2], 2 * p[1] * p[0], 2 * p[1] * p[1] - 1, 2 * p[1] * p[2], 2 * p[2] * p[0], 2 * p[2] * p[1], 2 * p[2] * p[2] - 1];
    }
    const k = [ax[0] / s, ax[1] / s, ax[2] / s], th = Math.atan2(s, c), sn = Math.sin(th), cs = 1 - Math.cos(th);
    const K = [0, k[2], -k[1], -k[2], 0, k[0], k[1], -k[0], 0];
    const K2 = mm(K, K), R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let i = 0; i < 9; i++) R[i] += sn * K[i] + cs * K2[i];
    return R;
  }

  // ---------- Knogler ----------
  const BONES = ['torso', 'neck', 'head', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'upperL', 'upperR', 'foreL', 'foreR'];
  const BI = {}; BONES.forEach((n, i) => (BI[n] = i));
  const SQ3 = Math.sqrt(3) / 2;

  // Knoglerammer (drejning R + origo o) ud fra verdensled W. Samme funktion bruges til hvilestillingen
  // og i hvert billede, så bindingen er konsistent. Lemmerne arver drejningen fra forælderen og drejes
  // kun den korteste vej, så der ikke opstår vrid.
  function frames(W, out) {
    const P = (i) => [W[i * 3], W[i * 3 + 1], W[i * 3 + 2]];
    const F = out || BONES.map(() => ({ R: null, o: null }));
    const set = (n, R, o) => { const f = F[BI[n]]; f.R = R; f.o = o; };
    const hip = P(I.hip), sh = P(I.sh);
    const up = norm(sub(sh, hip));
    let side = sub(P(I.shR), P(I.shL)); side = norm(sub(side, mul(up, dot(side, up))));
    const Rt = cols(cross(up, side), up, side);
    set('torso', Rt, hip);
    set('neck', mm(swing(up, norm(sub(P(I.neck), sh))), Rt), sh);
    const hu = norm(sub(P(I.head), P(I.neck)));
    let hf = sub(P(I.nose), P(I.head)); hf = norm(sub(hf, mul(hu, dot(hf, hu))));
    set('head', cols(hf, hu, cross(hf, hu)), P(I.head));
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? -1 : 1;
      const h = P(I['hip' + s]), k = P(I['knee' + s]), an = P(I['ankle' + s]), to = P(I['toe' + s]);
      const td = norm(sub(k, h)), sd = norm(sub(an, k)), fd = norm(sub(to, an));
      const Rth = mm(swing(mv(Rt, [0.5, -SQ3, 0]), td), Rt);
      const Rsh = mm(swing(td, sd), Rth);
      set('thigh' + s, Rth, h); set('shin' + s, Rsh, k); set('foot' + s, mm(swing(sd, fd), Rsh), an);
      const S = P(I['sh' + s]), e = P(I['elbow' + s]), hd = P(I['hand' + s]);
      const ud = norm(sub(e, S)), fo = norm(sub(hd, e));
      const Ru = mm(swing(mv(Rt, norm([0.3, -0.5, 0.81 * sg])), ud), Rt);
      set('upper' + s, Ru, S); set('fore' + s, mm(swing(ud, fo), Ru), e);
    }
    return F;
  }

  // ---------- Afstandsfelt ----------
  // Primitiver: ellipsoide (centrum, akser, radier) og afrundet kegle (A, B, rA, rB).
  // Hver har en knogle, et "stof" (hud/trøje/bukser/...) og en blødhed k for sammensmeltning.
  function sdEll(p, q) {
    const dx = p[0] - q.c[0], dy = p[1] - q.c[1], dz = p[2] - q.c[2], u = q.u, v = q.v, w = q.w;
    const x = (dx * u[0] + dy * u[1] + dz * u[2]) * q.ir[0], y = (dx * v[0] + dy * v[1] + dz * v[2]) * q.ir[1], z = (dx * w[0] + dy * w[1] + dz * w[2]) * q.ir[2];
    const k0 = Math.sqrt(x * x + y * y + z * z);
    const x1 = x * q.ir[0], y1 = y * q.ir[1], z1 = z * q.ir[2];
    const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
    return k1 < 1e-9 ? -q.rmin : (k0 * (k0 - 1)) / k1;
  }
  function sdCone(p, q) { // afrundet kegle (Inigo Quilez)
    const ba = q.ba, l2 = q.l2, rr = q.r1 - q.r2, a2 = q.a2, il2 = 1 / l2;
    const px = p[0] - q.a[0], py = p[1] - q.a[1], pz = p[2] - q.a[2];
    const y = px * ba[0] + py * ba[1] + pz * ba[2], z = y - l2;
    const xx = px * l2 - ba[0] * y, xy = py * l2 - ba[1] * y, xz = pz * l2 - ba[2] * y;
    const x2 = xx * xx + xy * xy + xz * xz, y2 = y * y * l2, z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - q.r2;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - q.r1;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - q.r1;
  }
  const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const smax = (a, b, k) => -smin(-a, -b, k);

  function prim(o) {
    if (o.type === 'cone') {
      o.ba = sub(o.b, o.a); o.l2 = dot(o.ba, o.ba); o.a2 = o.l2 - (o.r1 - o.r2) * (o.r1 - o.r2);
      o.bc = mul(add(o.a, o.b), 0.5); o.br = Math.sqrt(o.l2) / 2 + Math.max(o.r1, o.r2);
      o.f = sdCone;
    } else {
      o.u = o.u || [1, 0, 0]; o.v = o.v || [0, 1, 0]; o.w = o.w || [0, 0, 1];
      o.bc = o.c; o.br = Math.max(o.r[0], o.r[1], o.r[2]); o.rmin = Math.min(o.r[0], o.r[1], o.r[2]); o.ir = o.r.map((r) => 1 / r);
      o.f = sdEll;
    }
    o.k = o.k == null ? 0.02 : o.k;
    return o;
  }

  // Ellipsoide i et leds lokale ramme: t langs segmentet a→b, forskudt fremad (f) og udad (s).
  function segFrame(a, b, sideRef) {
    const u = norm(sub(b, a));
    let s = sub(sideRef, mul(u, dot(sideRef, u))); s = norm(s);
    return { a, b, u, s, f: cross(s, u) };
  }
  const segPt = (S, t, f, s) => add(add(add(S.a, mul(sub(S.b, S.a), t)), mul(S.f, f)), mul(S.s, s));

  // Kroppens skulptur i hvilestillingen (koordinater som i spillets verden ved hvile).
  // Hoved og hænder får deres eget, finere net ("område"); her skæres de ud af kroppens net.
  function sculpt(J) {
    const at = (x, y, z) => [J.hip[0] + x, J.hip[1] + y, J.hip[2] + z];
    const prims = [], carves = [], regions = [];
    const P = (o) => prims.push(prim(o));
    const E = (bone, tag, c, r, k, extra) => P(Object.assign({ type: 'ell', bone, tag, c, r, k }, extra));
    const C = (bone, tag, a, b, r1, r2, k) => P({ type: 'cone', bone, tag, a, b, r1, r2, k });
    const SE = (bone, tag, S, t, f, s, r, k) => P({ type: 'ell', bone, tag, c: segPt(S, t, f, s), u: S.f, v: S.u, w: S.s, r: [r[1], r[0], r[2]], k });

    // Overkrop
    E('torso', 'suit', at(-0.005, 0.045, 0), [0.1, 0.13, 0.152], 0.04);
    E('torso', 'suit', at(0.004, 0.2, 0), [0.09, 0.13, 0.128], 0.06);
    E('torso', 'suit', at(-0.008, 0.345, 0), [0.1, 0.155, 0.135], 0.06);
    E('torso', 'suit', at(-0.004, 0.465, 0), [0.078, 0.07, 0.16], 0.05);
    for (const s of [-1, 1]) {
      E('torso', 'suit', at(-0.058, -0.012, s * 0.072), [0.068, 0.092, 0.074], 0.03); // balder
      E('torso', 'suit', at(0.052, 0.405, s * 0.068), [0.042, 0.062, 0.078], 0.035); // brystmuskler
      E('torso', 'suit', at(-0.035, 0.34, s * 0.092), [0.058, 0.13, 0.062], 0.04); // lats
      E('torso', 'suit', at(-0.055, 0.43, s * 0.068), [0.036, 0.09, 0.07], 0.04); // skulderblade
      C('torso', 'suit', at(-0.03, 0.585, s * 0.01), at(-0.008, 0.52, s * 0.14), 0.042, 0.032, 0.035); // kappemuskel
    }

    // Arme og ben
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? -1 : 1, side = [0, 0, 1];
      const S = J['sh' + s], e = J['elbow' + s], h = J['hand' + s];
      const Su = segFrame(S, e, side), Sf = segFrame(e, h, side);
      const ub = 'upper' + s, fb = 'fore' + s;
      E(ub, 'skin', add(S, [0.0, -0.02, sg * 0.022]), [0.056, 0.07, 0.05], 0.03); // deltoid
      C(ub, 'skin', S, e, 0.046, 0.036, 0.02);
      SE(ub, 'skin', Su, 0.5, 0.02, 0, [0.1, 0.034, 0.033], 0.02); // biceps
      SE(ub, 'skin', Su, 0.42, -0.018, 0.004, [0.12, 0.034, 0.036], 0.02); // triceps
      E(fb, 'skin', e, [0.033, 0.033, 0.033], 0.02);
      SE(fb, 'skin', Sf, 0.22, 0.008, 0.01, [0.085, 0.03, 0.033], 0.025); // underarmsmuskler
      // hånden (eget fint net)
      regions.push({ c: segPt(Sf, 1.06, 0, 0), r: 0.088, h: 0.0048 });
      C(fb, 'skin', e, segPt(Sf, 0.8, 0, 0), 0.04, 0.025, 0.02);
      SE(fb, 'skin', Sf, 0.99, 0.002, -sg * 0.002, [0.05, 0.04, 0.015], 0.014); // håndflade
      SE(fb, 'skin', Sf, 0.93, -0.004, -sg * 0.004, [0.03, 0.035, 0.012], 0.014); // håndrod
      for (let f = 0; f < 4; f++) { // fingre, let bøjede ind mod håndfladen
        const fo = 0.026 - f * 0.017, ln = [0.07, 0.078, 0.074, 0.062][f], b0 = segPt(Sf, 1.12, fo, -sg * 0.003);
        const tip = add(segPt(Sf, 1.12 + ln / 0.33, fo * 1.05, -sg * 0.012), [0, 0, 0]);
        C(fb, 'skin', b0, tip, 0.0085, 0.007, 0.006);
      }
      C(fb, 'skin', segPt(Sf, 0.88, 0.024, -sg * 0.006), segPt(Sf, 1.12, 0.044, -sg * 0.018), 0.012, 0.0075, 0.012); // tommel

      const H = J['hip' + s], K = J['knee' + s], A = J['ankle' + s], T = J['toe' + s];
      const St = segFrame(H, K, side), Ss = segFrame(K, A, side);
      const tb = 'thigh' + s, sb = 'shin' + s, ftb = 'foot' + s;
      C(tb, 'pants', H, K, 0.088, 0.05, 0.035);
      SE(tb, 'pants', St, 0.45, 0.022, 0, [0.18, 0.05, 0.058], 0.03); // forlår
      SE(tb, 'pants', St, 0.3, 0, sg * 0.02, [0.16, 0.058, 0.05], 0.03); // yderlår
      SE(tb, 'pants', St, 0.5, -0.02, 0, [0.16, 0.05, 0.055], 0.03); // baglår
      E(sb, 'pants', add(K, [0.002, 0, 0]), [0.043, 0.05, 0.044], 0.045);
      C(sb, 'pants', K, A, 0.046, 0.033, 0.035);
      SE(sb, 'pants', Ss, 0.3, -0.028, 0, [0.13, 0.042, 0.045], 0.03); // læg
      E(sb, 'sock', A, [0.032, 0.032, 0.032], 0.02);
      // Strakt fod (spidsen peger langs skinnebenet): vrist foran, hæl bagved
      const Sp = segFrame(A, T, side);
      SE(ftb, 'sock', Sp, 0.55, 0.004, 0, [0.07, 0.03, 0.04], 0.025);
      SE(ftb, 'sock', Sp, 0.02, -0.03, 0, [0.032, 0.028, 0.029], 0.02); // hæl
      SE(ftb, 'sock', Sp, 1.05, -0.004, 0, [0.036, 0.021, 0.042], 0.02); // tæer
    }

    // Hoved og hals (eget fint net). Koordinater i forhold til hovedleddet Hd.
    const Hd = J.head, hp = (x, y, z) => [Hd[0] + x, Hd[1] + y, Hd[2] + z];
    regions.push({ c: hp(0.005, -0.02, 0), r: 0.15, h: 0.0042 });
    C('neck', 'skin', at(0.006, 0.5, 0), at(0.0, 0.7, 0), 0.056, 0.051, 0.03);
    for (const s of [-1, 1]) C('neck', 'skin', at(-0.01, 0.69, s * 0.042), at(0.035, 0.535, s * 0.017), 0.013, 0.015, 0.016); // kopnikker
    E('head', 'skin', hp(-0.02, 0.026, 0), [0.098, 0.095, 0.077], 0.02); // kranie
    E('head', 'skin', hp(0.03, -0.04, 0), [0.058, 0.06, 0.059], 0.03); // mellemansigt
    E('head', 'skin', hp(0.025, -0.084, 0), [0.052, 0.04, 0.046], 0.03); // underansigt
    E('head', 'skin', hp(0.068, -0.107, 0), [0.018, 0.02, 0.027], 0.02); // hage
    for (const s of [-1, 1]) {
      C('head', 'skin', hp(-0.02, -0.072, s * 0.049), hp(0.06, -0.106, s * 0.021), 0.015, 0.014, 0.02); // kæbe
      E('head', 'skin', hp(0.055, -0.02, s * 0.043), [0.016, 0.011, 0.017], 0.02); // kindben
      E('head', 'eye', hp(0.066, -0.002, s * 0.032), [0.012, 0.012, 0.012], 0.002); // øjeæble
      E('head', 'skin', hp(0.072, 0.007, s * 0.033), [0.01, 0.0075, 0.016], 0.004); // øjenlåg
      E('head', 'skin', hp(0.072, -0.011, s * 0.034), [0.008, 0.005, 0.014], 0.004); // nedre øjenlåg
      E('head', 'skin', hp(-0.02, -0.01, s * 0.077), [0.02, 0.03, 0.009], 0.006, { u: norm([1, -0.25, 0]), v: norm([0.25, 1, 0]), w: [0, 0, 1] }); // øre
      C('head', 'hair', hp(0.08, 0.019, s * 0.014), hp(0.072, 0.022, s * 0.045), 0.0042, 0.0032, 0.004); // øjenbryn
      E('head', 'skin', hp(0.087, -0.042, s * 0.012), [0.009, 0.008, 0.008], 0.006); // næsefløje
      carves.push({ c: hp(0.085, -0.002, s * 0.033), r: 0.017, k: 0.012 }); // øjenhule
      carves.push({ c: hp(-0.012, -0.01, s * 0.086), r: 0.012, k: 0.006, sq: [1.1, 1.6, 0.5] }); // øregang
    }
    C('head', 'skin', hp(0.072, 0.017, 0), hp(0.077, 0.017, 0), 0.012, 0.012, 0.02); // pandeben
    C('head', 'skin', hp(0.08, 0.004, 0), hp(0.102, -0.042, 0), 0.007, 0.011, 0.01); // næse
    E('head', 'lip', hp(0.081, -0.062, 0), [0.007, 0.0045, 0.019], 0.008); // overlæbe
    E('head', 'lip', hp(0.078, -0.071, 0), [0.0075, 0.0055, 0.017], 0.008); // underlæbe
    // kort hår: en tynd skal uden på kraniet, skåret af ved hårgrænsen
    E('head', 'hair', hp(-0.021, 0.029, 0), [0.1025, 0.0985, 0.0815], 0.006, {
      cut: (p) => {
        const fx = clamp((p[0] - (Hd[0] - 0.02)) / 0.1, -1, 1), ay = Math.abs(p[2] - Hd[2]);
        // hårgrænse: høj i panden, lav i nakken, over ørerne ved siden
        const hl = fx > 0 ? 0.03 + 0.02 * sstep(0.3, 0.9, fx) - 0.01 * sstep(0.04, 0.07, ay) * sstep(0.2, 0.8, fx) : 0.03 - 0.1 * sstep(-0.05, -0.85, fx);
        return Hd[1] + hl - p[1];
      },
    });
    return { prims, carves, regions };
  }

  const SEAM = 0.008;
  // Afstandsfelt over en liste af primitiver. region: null = kroppen (områderne skåret fra), ellers kun området.
  function makeSDF(prims, carves, regions, region) {
    const n = prims.length, ds = new Float64Array(n), act = new Int32Array(n), all = new Int32Array(n).map((_, i) => i);
    let list = all, na = n;
    function f(p) {
      let d = 1e9;
      for (let j = 0; j < na; j++) {
        const i = list[j], q = prims[i];
        let di = q.f(p, q);
        if (q.cut) di = Math.max(di, q.cut(p));
        ds[i] = di;
        d = smin(d, di, q.k);
      }
      for (const c of carves) {
        const sq = c.sq || [1, 1, 1];
        const dx = (p[0] - c.c[0]) / sq[0], dy = (p[1] - c.c[1]) / sq[1], dz = (p[2] - c.c[2]) / sq[2];
        const dc = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dc > c.r * 2.5) continue;
        d = smax(d, c.r - dc, c.k);
      }
      if (f.raw) return d;
      // kroppens net og de fine net overlapper lidt ved områdets kugleflade, så der ikke opstår revner
      if (region) d = Math.max(d, dist(p, region.c) - region.r - SEAM);
      else for (const R of regions) d = Math.max(d, R.r - SEAM - dist(p, R.c));
      return d;
    }
    // Begræns beregningen til primitiver, der kan påvirke punkter inden for 'rad' af c.
    f.focus = (c, rad) => {
      list = all; na = n;
      const dc = f(c);
      let m = 0;
      for (let i = 0; i < n; i++) {
        const q = prims[i], lb = dist(c, q.bc) - q.br;
        if (lb - rad <= Math.max(dc, 0) + rad + q.k + 0.004) act[m++] = i;
      }
      list = act; na = m;
      for (let i = 0; i < n; i++) ds[i] = 1e9;
      return dc;
    };
    f.reset = () => { list = all; na = n; };
    f.ds = ds;
    return f;
  }

  // ---------- Overflade: "surface nets" på et gitter ----------
  function* polygonize(sdf, lo, hi, h) {
    const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
    const val = new Float32Array(nx * ny * nz), id = (i, j, k) => (k * ny + j) * nx + i;
    const p = [0, 0, 0], BS = 4, safe = 1.6 * BS * h * 0.87;
    // grove blokke langt fra overfladen udfyldes med én værdi
    for (let k0 = 0; k0 < nz; k0 += BS) for (let j0 = 0; j0 < ny; j0 += BS) for (let i0 = 0; i0 < nx; i0 += BS) {
      const i1 = Math.min(nx, i0 + BS), j1 = Math.min(ny, j0 + BS), k1 = Math.min(nz, k0 + BS);
      p[0] = lo[0] + (i0 + (i1 - i0 - 1) / 2) * h; p[1] = lo[1] + (j0 + (j1 - j0 - 1) / 2) * h; p[2] = lo[2] + (k0 + (k1 - k0 - 1) / 2) * h;
      sdf.reset();
      const dc = sdf(p), far = Math.abs(dc) > safe;
      if (!far) yield;
      if (!far) sdf.focus(p.slice(), BS * h * 0.87);
      for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        if (far) { val[id(i, j, k)] = dc; continue; }
        p[0] = lo[0] + i * h; p[1] = lo[1] + j * h; p[2] = lo[2] + k * h;
        val[id(i, j, k)] = sdf(p);
      }
    }
    sdf.reset();
    const cx = nx - 1, cy = ny - 1, cz = nz - 1, cid = (i, j, k) => (k * cy + j) * cx + i;
    const vmap = new Int32Array(cx * cy * cz).fill(-1), pos = [];
    const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float64Array(8);
    for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) { const v = val[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; cv[c] = v; if (v < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of EDGES) {
        if ((cv[a] < 0) === (cv[b] < 0)) continue;
        const t = cv[a] / (cv[a] - cv[b]);
        sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; n++;
      }
      vmap[cid(i, j, k)] = pos.length / 3;
      pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
    }
    const idx = [];
    const dims = [nx, ny, nz];
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v0 = val[id(i, j, k)], g = [i, j, k];
      for (let a = 0; a < 3; a++) {
        if (g[a] + 1 >= dims[a]) continue;
        const e = [0, 0, 0]; e[a] = 1;
        const v1 = val[id(i + e[0], j + e[1], k + e[2])];
        if ((v0 < 0) === (v1 < 0)) continue;
        const b = (a + 1) % 3, c = (a + 2) % 3;
        if (g[b] < 1 || g[c] < 1 || g[b] >= dims[b] - 1 || g[c] >= dims[c] - 1) continue;
        const q = (db, dc) => { const t = [i, j, k]; t[b] -= db; t[c] -= dc; return vmap[cid(t[0], t[1], t[2])]; };
        const q00 = q(1, 1), q10 = q(0, 1), q11 = q(0, 0), q01 = q(1, 0);
        if (q00 < 0 || q10 < 0 || q11 < 0 || q01 < 0) continue;
        if (v0 < 0) idx.push(q00, q10, q11, q00, q11, q01);
        else idx.push(q00, q11, q10, q00, q01, q11);
      }
    }
    return { pos, idx };
  }

  // ---------- Byg figuren ----------
  const REST_HAND = [0.0, -0.6, 0.1];
  function restWorld() { return B.toWorld(B.solve({ hip: 0, knee: 0, hand: REST_HAND }), 0, 0, 0, 0); }
  // Farver for hud, hår og øjne. Trøje, bukser og sokker farves i shaderen ud fra hvilepositionen.
  const COLORS = { skin: 0xc98a66, hair: 0x2a1c12, eye: 0xbdb2a6, iris: 0x2b1d14, lip: 0xb97d6a, suit: 0x1b4fb3, pants: 0xeef0f4, sock: 0xffffff };
  const FABRIC = { suit: 1, pants: 1, sock: 1 };

  function* buildGen(opt) {
    const o = opt || {};
    const W = restWorld(), J = {};
    B.JOINTS.forEach((n, i) => (J[n] = [W[i * 3], W[i * 3 + 1], W[i * 3 + 2]]));
    const S = sculpt(J), R = S.regions;
    const bodyH = o.bodyStep || 0.011, detail = o.detail == null ? 1 : o.detail;
    const parts = [{
      prims: S.prims.filter((q) => R.every((r) => len(sub(q.bc, r.c)) + q.br + q.k > r.r - SEAM)),
      h: bodyH, lo: add(J.hip, [-0.17, -1.04, -0.36]), hi: add(J.hip, [0.2, 0.62, 0.36]),
    }];
    for (const r of R) {
      parts.push({
        region: r, prims: S.prims.filter((q) => len(sub(q.bc, r.c)) < q.br + r.r + SEAM + q.k), h: r.h / detail,
        lo: sub(r.c, [r.r + 0.02, r.r + 0.02, r.r + 0.02]), hi: add(r.c, [r.r + 0.02, r.r + 0.02, r.r + 0.02]),
      });
    }
    const pos = [], nrm = [], bones = [], weights = [], col = [], fab = [], idx = [];
    const SIG = o.sigma || 0.014;
    for (const part of parts) {
      const sdf = makeSDF(part.prims, S.carves, R, part.region);
      const m = yield* polygonize(sdf, part.lo, part.hi, part.h);
      const base = pos.length / 3, e = part.h * 0.25, p = [0, 0, 0], q1 = [0, 0, 0], g = [0, 0, 0];
      const TET = [[1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]];
      const grad = (q) => { // gradient med fire målinger (tetraeder)
        g[0] = g[1] = g[2] = 0;
        for (const t of TET) { q1[0] = q[0] + t[0] * e; q1[1] = q[1] + t[1] * e; q1[2] = q[2] + t[2] * e; const v1 = sdf(q1); g[0] += t[0] * v1; g[1] += t[1] * v1; g[2] += t[2] * v1; }
        return g;
      };
      for (let v = 0; v < m.pos.length / 3; v++) {
        if ((v & 63) === 0) yield;
        p[0] = m.pos[v * 3]; p[1] = m.pos[v * 3 + 1]; p[2] = m.pos[v * 3 + 2];
        // skub punktet helt ud på overfladen (ét Newton-skridt)
        const d0 = sdf.focus(p, 3 * part.h); grad(p);
        const gl = dot(g, g);
        if (gl > 1e-14) { const s = (Math.max(-part.h, Math.min(part.h, d0)) * 4 * e) / gl; p[0] -= g[0] * s; p[1] -= g[1] * s; p[2] -= g[2] * s; }
        sdf.raw = true; const n = norm(grad(p)); sdf.raw = false; // normal fra selve kroppen, også på snitfladen
        pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]);
        // vægte: blød fordeling efter afstand til hver primitivs overflade, samlet pr. knogle
        sdf.focus(p, 0.06); sdf(p);
        const ds = sdf.ds, wb = new Float64Array(BONES.length);
        let dmin = 1e9, best = 0;
        for (let i = 0; i < ds.length; i++) if (ds[i] < dmin) { dmin = ds[i]; best = i; }
        for (let i = 0; i < ds.length; i++) if (ds[i] < dmin + 8 * SIG) wb[BI[part.prims[i].bone]] += Math.exp(-(ds[i] - dmin) / SIG);
        const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].sort((a, b) => wb[b] - wb[a]).slice(0, 4);
        const tot = order[0] >= 0 ? order.reduce((s, i) => s + wb[i], 0) : 1;
        for (const i of order) { bones.push(i); weights.push(wb[i] / tot); }
        const tg = tagOf(part.prims[best], p), c = COLORS[FABRIC[tg] ? 'skin' : tg]; // stof farves i shaderen
        col.push(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
        fab.push(FABRIC[tg] ? 1 : 0);
      }
      for (const i of m.idx) idx.push(base + i);
    }
    return {
      pos: new Float32Array(pos), nrm: new Float32Array(nrm), bones: new Uint16Array(bones), weights: new Float32Array(weights),
      col: new Float32Array(col), fab: new Float32Array(fab),
      idx: (pos.length / 3 > 65535 ? Uint32Array : Uint16Array).from(idx), rest: frames(W), J,
    };
  }

  // Byg figuren på én gang (node/test) ...
  function build(opt) { const g = buildGen(opt); let r; while (!(r = g.next()).done); return r.value; }
  // ... eller lidt ad gangen i baggrunden, så spillet ikke hakker, mens figuren bygges.
  let pending = null;
  function buildAsync(opt) {
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      const g = buildGen(opt);
      const step = () => {
        try {
          const t0 = Date.now();
          let r;
          while (!(r = g.next()).done) if (Date.now() - t0 > 8) return setTimeout(step, 0);
          resolve(r.value);
        } catch (e) { reject(e); }
      };
      setTimeout(step, 0);
    });
    return pending;
  }

  // Iris: forreste del af øjeæblet
  function tagOf(q, p) {
    if (q.tag === 'eye') {
      const d = sub(p, q.c);
      if (d[0] > 0.0075 && Math.hypot(d[1], d[2]) < 0.0082) return 'iris';
    }
    return q.tag;
  }

  // Shaderdel: trøjens hals- og ærmegab, bukselinning og sokker, beregnet pr. pixel ud fra
  // hvilepositionen (relativt til hoften), så kanterne bliver skarpe og glatte.
  const FABRIC_GLSL = `
    vec3 hmFabric(vec3 p, out float rough) {
      float y = p.y, x = p.x, z = abs(p.z);
      float az = (z - 0.17) / 0.072, ay = (y - 0.475) / 0.115;
      float skin = 1.0 - smoothstep(0.96, 1.04, az * az + ay * ay);
      skin = max(skin, step(0.0, x) * smoothstep(-0.003, 0.003, y - 0.455 - 5.0 * z * z));
      skin = max(skin, step(x, 0.0) * smoothstep(-0.003, 0.003, y - 0.525 - 4.0 * z * z));
      float pants = 1.0 - smoothstep(0.162, 0.168, y);
      float sock = 1.0 - smoothstep(hmAnkle - 0.003, hmAnkle + 0.003, y);
      vec3 c = mix(hmSuit, hmSkin, skin);
      rough = mix(0.38, 0.62, skin);
      c = mix(c, hmPants, pants); rough = mix(rough, 0.75, pants);
      c = mix(c, hmSock, sock); rough = mix(rough, 0.85, sock);
      return c;
    }`;

  // three.js-figur: ét bøjeligt net (SkinnedMesh) med knogler, der følger spillets led.
  // Returnerer update(W), som stiller knoglerne efter verdensleddene W.
  function makeMesh(THREE, root, opt) {
    const o = opt || {};
    const m = o.data || build(o.build);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.bones, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(m.weights, 4));
    geo.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
    geo.setAttribute('hmFab', new THREE.BufferAttribute(m.fab, 1));
    geo.setIndex(new THREE.BufferAttribute(m.idx, 1));
    const colors = Object.assign({}, COLORS, o.colors || {});
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0, skinning: true, vertexColors: true });
    const hip = m.J.hip, ank = m.J.ankleL[1] - hip[1] + 0.03;
    mat.onBeforeCompile = (sh) => {
      const U = { hmSuit: colors.suit, hmPants: colors.pants, hmSock: colors.sock, hmSkin: colors.skin };
      for (const k in U) sh.uniforms[k] = { value: new THREE.Color(U[k]) };
      sh.uniforms.hmHip = { value: new THREE.Vector3(hip[0], hip[1], hip[2]) };
      sh.uniforms.hmAnkle = { value: ank };
      sh.vertexShader = 'attribute float hmFab;\nuniform vec3 hmHip;\nvarying vec3 vHmRest;\nvarying float vHmFab;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvHmRest = position - hmHip;\nvHmFab = hmFab;');
      sh.fragmentShader = 'uniform vec3 hmSuit;\nuniform vec3 hmPants;\nuniform vec3 hmSock;\nuniform vec3 hmSkin;\nuniform float hmAnkle;\nvarying vec3 vHmRest;\nvarying float vHmFab;\n' + FABRIC_GLSL + '\n' +
        sh.fragmentShader
          .replace('#include <color_fragment>', 'float hmR = roughness;\nvec3 hmC = hmFabric(vHmRest, hmR);\nfloat hmF = step(0.5, vHmFab);\ndiffuseColor.rgb = mix(vColor, hmC, hmF);')
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, hmR, hmF);');
    };
    const toM4 = (f, out) => out.set(f.R[0], f.R[3], f.R[6], f.o[0], f.R[1], f.R[4], f.R[7], f.o[1], f.R[2], f.R[5], f.R[8], f.o[2], 0, 0, 0, 1);
    const bones = BONES.map(() => new THREE.Bone()), inv = m.rest.map((f) => toM4(f, new THREE.Matrix4()).invert());
    bones.forEach((b) => root.add(b));
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4());
    const F = frames(restWorld()), m4 = new THREE.Matrix4();
    function update(W) {
      frames(W, F);
      for (let i = 0; i < bones.length; i++) {
        toM4(F[i], m4); m4.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);
      }
    }
    update(restWorld());
    update.mesh = mesh;
    return update;
  }

  TR.Human = { BONES, frames, build, buildAsync, restWorld, REST_HAND, makeMesh, COLORS };
})(globalThis);
