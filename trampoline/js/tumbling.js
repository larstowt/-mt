// Power Tumbling: tilløb og en serie på 8 elementer ned ad en 25 m lang bane med landing på måtten.
// Mellemspringene times med SATS i takt med afsættene; afslutningen styres med positionerne og skrue.
(function (G) {
  'use strict';
  const TR = G.TR;
  const B = TR.Body, I = B.IDX, L = B.LEN, TAU = Math.PI * 2, GRAV = 9.81;
  const clamp = TR.clamp, lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t), ss = (a, b, x) => ease(clamp((x - a) / (b - a), 0, 1));
  const lh = (a, b, t) => [0, 1, 2].map((i) => lerp(a[i], b[i], t));

  // ---------- Bane og elementer ----------
  const TRACK = 25, MAT0 = 24, MAT1 = 31.5, RUN0 = 1.5;
  const NSTEP = 4, STEP_T = 0.3;
  const N_ELEM = 8;
  const WHIP_V = 6.0, V_MIN = 3.9, V_MAX = 8.2;
  // Timing af afsættene (sekunder fra takten). fin = ekstra kraft i et saltoafsæt.
  const TIMING = [
    { max: 0.06, label: 'Perfekt', dv: 0.35, ded: 0, fin: 1, color: '#ffd166' },
    { max: 0.13, label: 'God', dv: 0.15, ded: 0.1, fin: 0.5, color: '#80ffdb' },
    { max: 0.25, label: null, dv: -0.3, ded: 0.3, fin: -0.3, color: '#ffb4c1' },
  ];
  const MISS = { label: 'Glemt', dv: -0.9, ded: 0.5, fin: -0.8, color: '#9aa4bf' };
  const WINDOW = 0.25;
  const vyOf = (v, fin) => 2.2 + 0.55 * v + 0.5 * fin; // lodret fart i et saltoafsæt
  const VY_MAX = vyOf(V_MAX, 1);

  const UP = B.HAND.up, SIDE = B.HAND.side;
  const FWD = [0.3, 0.35, 0.08], BACK = [-0.15, -0.55, 0.1], DOWN = [0.02, -0.62, 0.06];
  const CROUCH = { hip: 0.55, knee: 0.35, hand: FWD };

  // Nøglestillinger for mellemspringene. u = andel af elementet (fra fødderne rammer banen til næste gang),
  // tau = overkroppens hældning (0 = lodret, + mod kørselsretningen), a = hvad der står fast på banen
  // (F0: fødderne ved start, H: hænderne, F1: fødderne ved landing), psi = andel af en halv skrue.
  const K = (u, tau, hip, knee, hand, a, psi = 1) => ({ u, tau, hip, knee, hand, a, psi });
  const TD = 2 * Math.PI - 0.2; // landing: let foroverbøjet
  const ELEM = {
    // Araber: fra løbet ned på hænderne, ½ skrue over hovedet og snap ned med front mod tilløbet
    ro: {
      name: 'Araber', T: 0.6, dd: 0.1, dv: 0, len: (v) => Math.max(1.9, 0.36 * v), hand: 0.45,
      keys: [
        K(0, 0.15, 0.15, 0.45, FWD, 'F0', 0), K(0.12, 0.6, 0.6, 0.25, UP, 'F0', 0),
        K(0.3, 1.8, 0.7, 0.05, UP, 'H', 0), K(0.42, 2.75, 0.05, 0, UP, 'H', 0.45), K(0.52, 3.3, -0.25, 0, UP, 'H', 0.85),
        K(0.6, 3.8, -0.05, 0, UP, 'H', 1), K(0.69, 5.0, 0.85, 0.1, UP, null, 1), K(0.78, 5.75, 0.75, 0.3, FWD, null, 1), K(0.9, 6.0, 0.6, 0.3, FWD, null, 1),
        K(1, TD, CROUCH.hip, CROUCH.knee, FWD, 'F1', 1),
      ],
    },
    // Flikflak: sid tilbage, spring baglæns med svaj, hænderne i banen, gennem håndstand og snap ned
    flik: {
      name: 'Flikflak', T: 0.52, dd: 0.1, dv: -0.05, len: (v) => 0.75 + 0.24 * v, hand: 0.6,
      keys: [
        K(0, -0.2, CROUCH.hip, CROUCH.knee, FWD, 'F0'), K(0.1, 0.25, 0.95, 1.35, BACK, 'F0'), K(0.22, 0.65, 0.1, 0.3, UP, 'F0'),
        K(0.34, 1.6, -0.6, 0.05, UP, null), K(0.46, 2.6, -0.55, 0, UP, 'H'), K(0.55, 3.15, -0.35, 0, UP, 'H'),
        K(0.62, 3.75, 0.05, 0, UP, 'H'), K(0.7, 5.0, 0.85, 0.1, UP, null), K(0.79, 5.75, 0.75, 0.3, FWD, null), K(0.9, 6.0, 0.6, 0.3, FWD, null),
        K(1, TD, CROUCH.hip, CROUCH.knee, FWD, 'F1'),
      ],
    },
    // Whip (tempo-salto): lav, lang og hurtig salto uden hænder med svaj og armene ned langs siden
    whip: {
      name: 'Whip', T: 0.56, dd: 0.2, dv: -0.15, len: (v) => 1.0 + 0.3 * v, hand: 0.5,
      keys: [
        K(0, -0.2, CROUCH.hip, CROUCH.knee, FWD, 'F0'), K(0.1, 0.15, 0.7, 1.05, BACK, 'F0'), K(0.22, 0.7, 0, 0.2, [0.25, 0.4, 0.1], 'F0'),
        K(0.4, 2.2, -0.6, 0.05, DOWN, null), K(0.6, 3.75, -0.5, 0, DOWN, null),
        K(0.8, 5.4, 0.45, 0.2, FWD, null), K(1, TD, CROUCH.hip, CROUCH.knee, FWD, 'F1'),
      ],
    },
  };
  const EL = ELEM;

  const torsoTilt = (W) => Math.atan2(W[I.sh * 3] - W[I.hip * 3], W[I.sh * 3 + 1] - W[I.hip * 3 + 1]);
  const wrapPi = (a) => a - TAU * Math.round(a / TAU);
  const footX = (W) => (W[I.ankleL * 3] + W[I.ankleR * 3]) / 2;
  // Hvor langt over banen ligger fødderne / hænderne (lavest punkt minus radius)?
  const footLow = (W) => Math.min(W[I.toeL * 3 + 1] - 0.03, W[I.toeR * 3 + 1] - 0.03, W[I.ankleL * 3 + 1] - 0.05, W[I.ankleR * 3 + 1] - 0.05);
  const handLow = (W) => Math.min(W[I.handL * 3 + 1], W[I.handR * 3 + 1]) - 0.04;
  const handX = (W) => (W[I.handL * 3] + W[I.handR * 3]) / 2;

  // Interpolation mellem nøglestillingerne (Catmull-Rom for hældningen, så rotationen er jævn)
  function keyAt(keys, u) {
    let i = 0;
    while (i < keys.length - 2 && u > keys[i + 1].u) i++;
    const k0 = keys[i], k1 = keys[i + 1], s = clamp((u - k0.u) / (k1.u - k0.u), 0, 1), e = ease(s);
    const km = keys[Math.max(0, i - 1)], kp = keys[Math.min(keys.length - 1, i + 2)];
    const m0 = (k1.tau - km.tau) / Math.max(1e-6, k1.u - km.u) * (k1.u - k0.u), m1 = (kp.tau - k0.tau) / Math.max(1e-6, kp.u - k0.u) * (k1.u - k0.u);
    const s2 = s * s, s3 = s2 * s;
    const tau = (2 * s3 - 3 * s2 + 1) * k0.tau + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * k1.tau + (s3 - s2) * m1;
    return {
      tau, hip: lerp(k0.hip, k1.hip, e), knee: lerp(k0.knee, k1.knee, e), hand: lh(k0.hand, k1.hand, e), psi: lerp(k0.psi, k1.psi, e),
      a: k0.a && k0.a === k1.a ? k0.a : s <= 0 && k0.a ? k0.a : s >= 1 && k1.a ? k1.a : null,
    };
  }

  // Løb: benene og armene sættes i hånden (kropsmodellen har ellers samlede ben)
  function runWorld(u, x, out) {
    const p = u * NSTEP * Math.PI;
    const W = B.toWorld(B.solve({ hip: 0, knee: 0, hand: B.HAND.straight }), 0, -0.12 - 0.08 * u, 0, 0, out);
    const y = -B.lowest(W).y - 0.06 + 0.07 * Math.abs(Math.sin(p));
    for (let i = 0; i < B.N; i++) { W[i * 3] += x; W[i * 3 + 1] += y; }
    const set = (i, px, py) => { W[i * 3] = px; W[i * 3 + 1] = py; };
    const amp = Math.min(1, u * 3);
    for (const [s, ph] of [['L', 0], ['R', Math.PI]]) {
      const q = p + ph, th = 0.75 * amp * Math.sin(q), kb = 0.25 + amp * (0.9 * Math.max(0, Math.sin(q + 0.6)) + 0.3 * Math.max(0, -Math.sin(q)));
      const hx = W[I['hip' + s] * 3], hy = W[I['hip' + s] * 3 + 1];
      const kx = hx + L.thigh * Math.sin(th), ky = hy - L.thigh * Math.cos(th);
      const a2 = th - kb, ax = kx + L.shank * Math.sin(a2), ay = ky - L.shank * Math.cos(a2);
      set(I['knee' + s], kx, ky); set(I['ankle' + s], ax, ay);
      set(I['toe' + s], ax + L.foot * Math.sin(a2 + 1.2), ay - L.foot * Math.cos(a2 + 1.2));
      const al = -0.8 * amp * Math.sin(q), sx = W[I['sh' + s] * 3], sy = W[I['sh' + s] * 3 + 1];
      const ex = sx + L.upper * Math.sin(al), ey = sy - L.upper * Math.cos(al);
      set(I['elbow' + s], ex, ey); set(I['hand' + s], ex + L.fore * Math.sin(al + 1.5), ey - L.fore * Math.cos(al + 1.5));
    }
    return W;
  }

  // ---------- Afslutningens navn og sværhed ----------
  const POS = { tuck: 'lukket', pike: 'hoftebøjet', straight: 'strakt' };
  const POS_SIGN = { tuck: 'o', pike: '<', straight: '/' };
  function finalSkill(saltos, halves, shape) {
    const s = Math.max(0, saltos);
    if (s === 0) return { name: halves ? `Strakt hop med ${halves / 2} skrue` : 'Strakt hop', dd: 0, short: 'Hop' };
    const head = s === 1 ? 'Salto baglæns' : s === 2 ? 'Dobbelt salto baglæns' : s === 3 ? 'Tredobbelt salto baglæns' : `${s}-dobbelt salto baglæns`;
    const tw = halves === 0 ? '' : halves === 1 ? ' med ½ skrue' : halves === 2 ? ' med hel skrue' : halves % 2 === 0 ? ` med ${halves / 2} skruer` : ` med ${TR.fmt(halves / 2, 1)} skrue`;
    const base = [0, 0.5, 2.0, 4.5, 7.5][Math.min(4, s)];
    const pos = shape === 'tuck' ? 0 : shape === 'pike' ? 0.1 * s : 0.2 * s;
    const dd = base + pos + 0.2 * halves * s;
    const short = s === 1 ? 'Salto' : s === 2 ? 'Dobbelt' : 'Tredobbelt';
    return { name: `${head} ${POS[shape]}${tw}`, dd, short, code: `${s * 4}${halves ? ' ' + halves : ''} ${POS_SIGN[shape]}` };
  }

  // ---------- Simulering ----------
  class TumbleSim {
    constructor() { this.handlers = {}; this.reset(); }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); }
    emit(ev, data) { (this.handlers[ev] || []).forEach((f) => f(data)); }

    reset() {
      this.phase = 'ready'; this.t = 0; this.time = 0;
      this.x = RUN0; this.y = 1; this.v = 0; this.vTop = 0; this.foot = RUN0;
      this.elements = []; // { kind, name, dd, beat }
      this.beats = []; // { t, judged, q }
      this.ded = []; this.E = 10;
      this.seg = null; this.phi = 0; this.psi = 0;
      this.prev = {}; this.early = null; this.inp = {};
      this.fly = null; this.result = null; this.abort = null;
      this.W = new Float64Array(B.N * 3);
      this.pose = { hip: 0.05, knee: 0.05, hand: B.HAND.straight.slice() };
      this.standWorld();
    }

    standWorld() {
      const W = B.toWorld(B.solve(this.pose), this.psi, this.phi, this.x, 0, this.W);
      const low = -B.lowest(W).y;
      for (let i = 0; i < B.N; i++) W[i * 3 + 1] += low;
      this.y = low;
    }

    // Næste element ud fra farten (salto vælges af springeren i takten)
    nextKind(v, n) { return n === 0 ? 'ro' : n >= N_ELEM - 1 ? 'final' : v >= WHIP_V ? 'whip' : 'flik'; }

    // Hvornår lander springeren (kropsmidtpunktet tilbage i afsætshøjde)?
    landETA() {
      const f = this.fly, h = Math.max(0, this.y - 0.95);
      return (f.vy + Math.sqrt(Math.max(0, f.vy * f.vy + 2 * GRAV * h))) / GRAV;
    }

    // Forventede kommende takter (til rytmebanen)
    upcoming(n = 4) {
      const out = [];
      for (const b of this.beats) if (this.time - b.t < 0.6) out.push({ t: b.t, label: b.label, q: b.q, done: true, idx: b.idx });
      if (this.phase === 'ready' || this.phase === 'land' || this.phase === 'stop' || this.phase === 'done' || this.abort) return out;
      let t, k = this.elements.length;
      if (this.phase === 'run') t = this.runT0 + NSTEP * STEP_T;
      else if (this.phase === 'elem') t = this.seg.t0 + this.seg.T;
      else if (this.phase === 'fly') { if (this.fly.final) return out; t = this.time + this.landETA(); }
      for (let i = 0; i < n && k < N_ELEM; i++, k++) {
        const kind = this.nextKind(this.v, k);
        out.push({ t, label: kind === 'final' ? 'Afslutning' : ELEM[kind].name, idx: k, salto: kind !== 'ro' && kind !== 'final' });
        if (kind === 'final') break;
        t += ELEM[kind].T;
      }
      return out;
    }

    // Ét tidsskridt. inp: { push, tuck, pike, straight, twist }
    step(dt, inp) {
      const shapeHeld = !!(inp.tuck || inp.pike || inp.straight);
      const shapePress = (inp.tuck && !this.prev.tuck) || (inp.pike && !this.prev.pike) || (inp.straight && !this.prev.straight);
      const press = (inp.push && !this.prev.push) || shapePress, twistPress = inp.twist && !this.prev.twist;
      this.prev = { push: inp.push, twist: inp.twist, tuck: inp.tuck, pike: inp.pike, straight: inp.straight };
      this.inp = inp; this.shapeHeld = shapeHeld;
      this.time += dt; this.t += dt;
      if (this.phase === 'ready') {
        if (inp.push && press) { this.phase = 'run'; this.runT0 = this.time; this.t = 0; this.emit('start'); }
        return this.standWorld();
      }
      // tryk: tidligt (før takten) gemmes, sent (efter takten) bedømmer den seneste takt
      if (press && this.phase !== 'land' && this.phase !== 'stop' && this.phase !== 'done') {
        const open = this.beats.find((b) => !b.judged && this.time - b.t <= WINDOW);
        if (open) this.judge(open, this.time - open.t);
        else this.early = { t: this.time, salto: shapePress };
      }
      for (const b of this.beats) if (!b.judged && this.time - b.t > WINDOW) this.judge(b, null);
      if (this.phase === 'run') return this.stepRun();
      if (this.phase === 'elem') return this.stepElem();
      if (this.phase === 'fly') return this.stepFly(dt, inp, twistPress);
      if (this.phase === 'land' || this.phase === 'stop') return this.stepLand(dt);
      return this.standWorld();
    }

    stepRun() {
      const u = clamp(this.t / (NSTEP * STEP_T), 0, 1);
      this.v = 2.5 + 2.9 * ss(0, 0.7, u);
      this.x = RUN0 + (NSTEP * 1.45) * (u * u * 0.35 + u * 0.65);
      runWorld(u, this.x, this.W);
      this.y = this.W[I.hip * 3 + 1];
      if (u >= 1) { this.foot = footX(this.W) + 0.15; this.beat(); }
    }

    // En takt: fødderne rammer banen, og næste element starter
    beat() {
      const n = this.elements.length;
      const early = this.early && this.time - this.early.t <= WINDOW ? this.early : null;
      const wantSalto = (early && early.salto) || this.shapeHeld;
      let kind = this.abort ? 'stop' : this.nextKind(this.v, n);
      if (kind === 'flik' || kind === 'whip') if (wantSalto) kind = 'salto';
      const b = { t: this.time, judged: false, q: null, idx: n, label: kind === 'final' ? 'Afslutning' : kind === 'salto' ? 'Salto' : kind === 'stop' ? '' : ELEM[kind].name };
      if (kind !== 'stop') this.beats.push(b);
      if (early) this.judge(b, early.t - this.time);
      this.early = null;
      this.emit('beat', { x: this.foot });
      if (kind === 'stop') return this.startStop();
      if (kind === 'final' || kind === 'salto') return this.startFly(b, kind === 'final');
      const e = ELEM[kind];
      // overgang fra forrige stilling (fx efter en salto) glides ind over den første del af elementet
      const k0 = e.keys[0], W = this.W;
      const corr = this.phase === 'elem' ? null : { tau: wrapPi(torsoTilt(W) - k0.tau), pose: this.phase === 'fly' ? { hip: this.pose.hip, knee: this.pose.knee, hand: this.pose.hand.slice() } : null };
      const L2 = e.len(this.v);
      this.elements.push({ kind, name: e.name, dd: e.dd, beat: b });
      this.seg = { kind, e, t0: this.time, T: e.T, x0: this.foot, xh: this.foot + e.hand * L2, x1: this.foot + L2, psi0: kind === 'ro' ? this.psi : this.psi - Math.PI, corr };
      this.v = clamp(this.v + e.dv, 0, V_MAX);
      this.phase = 'elem'; this.t = 0;
    }

    judge(b, off) {
      b.judged = true;
      let r = MISS;
      if (off != null) for (const tm of TIMING) if (Math.abs(off) <= tm.max) { r = tm; break; }
      const label = r.label || (off < 0 ? 'For tidligt' : 'For sent');
      b.q = label; b.fin = r.fin;
      this.v = clamp(this.v + r.dv, 0, V_MAX);
      this.vTop = Math.max(this.vTop, this.v);
      if (r.ded) { this.E -= r.ded; this.ded.push({ label: `${label} (${b.label})`, v: r.ded }); }
      // sent tryk i et saltoafsæt giver stadig (lidt) kraft, mens springeren er på vej op
      if (this.fly && this.fly.beat === b && this.fly.vy > 0) { this.fly.vy += 0.5 * r.fin; this.fly.vyT += 0.5 * r.fin; this.emit('power', { pct: this.power() }); }
      if (this.phase !== 'fly' && this.v < V_MIN && !this.abort) this.abort = 'Farten forsvandt';
      this.emit('timing', { label, color: r.color, q: r === MISS ? 0 : r.fin > 0 ? r.fin : 0.2, beat: b });
    }

    // afsættets kraft i procent af det størst mulige (topfart og perfekt timing)
    power() { return Math.round(100 * clamp(this.fly.vyT / VY_MAX, 0, 1)); }

    // Kroppen i et mellemspring: stilling fra nøglerne, placering så hænder/fødder står fast
    elemWorld(s, u, out) {
      const k = keyAt(s.e.keys, u), c = s.corr, w = c ? 1 - ss(0, 0.3, u) : 0;
      const pose = { hip: k.hip, knee: k.knee, hand: k.hand };
      if (c && c.pose && w > 0) { pose.hip = lerp(pose.hip, c.pose.hip, w); pose.knee = lerp(pose.knee, c.pose.knee, w); pose.hand = lh(pose.hand, c.pose.hand, w); }
      const tau = k.tau + (c ? c.tau * w : 0), psi = s.psi0 + Math.PI * k.psi;
      const body = B.solve(pose);
      const W0 = B.toWorld(body, psi, 0, 0, 0, out);
      const phi = torsoTilt(W0) - tau;
      const W = B.toWorld(body, psi, phi, 0, 0, out);
      return { W, k, phi, psi, pose };
    }
    // Kropsmidtpunkt, når nøglens kontakt (fødder eller hænder) står på sin plads
    anchorCOM(W, a, s) {
      if (a === 'H') return [s.xh - handX(W), -handLow(W)];
      return [(a === 'F0' ? s.x0 : s.x1) - footX(W), -footLow(W)];
    }

    stepElem() {
      const s = this.seg, u = clamp(this.t / s.T, 0, 1), keys = s.e.keys;
      const r = this.elemWorld(s, u, this.W);
      let cx, cy;
      if (r.k.a) [cx, cy] = this.anchorCOM(r.W, r.k.a, s);
      else {
        // svæv: fra sidste kontakt til næste, langs en kastebane
        let ip = 0, inx = keys.length - 1;
        for (let i = 0; i < keys.length; i++) { if (keys[i].a && keys[i].u <= u) ip = i; }
        for (let i = keys.length - 1; i >= 0; i--) { if (keys[i].a && keys[i].u >= u) inx = i; }
        const up = keys[ip].u, un = keys[inx].u, tmp = new Float64Array(B.N * 3);
        const pA = this.anchorCOM(this.elemWorld(s, up, tmp).W, keys[ip].a, s);
        const pB = this.anchorCOM(this.elemWorld(s, un, tmp).W, keys[inx].a, s);
        const q = clamp((u - up) / Math.max(1e-6, un - up), 0, 1), dur = (un - up) * s.T;
        cx = lerp(pA[0], pB[0], q); cy = lerp(pA[1], pB[1], q) + (GRAV * dur * dur / 8) * 4 * q * (1 - q);
      }
      const W = r.W;
      for (let i = 0; i < B.N; i++) { W[i * 3] += cx; W[i * 3 + 1] += cy; }
      const low = B.lowest(W).y;
      if (low < 0) { for (let i = 0; i < B.N; i++) W[i * 3 + 1] -= low; cy -= low; }
      this.x = cx; this.y = cy; this.phi = r.phi; this.psi = r.psi; this.pose = r.pose;
      if (u >= 1) { this.foot = s.x1; this.beat(); }
    }

    // Salto (midt i serien eller som afslutning): kraften kommer fra farten og timingen i afsættet
    startFly(b, final) {
      const v = this.v, fin = b.judged ? b.fin : 0;
      const vy = vyOf(v, fin);
      this.fly = {
        beat: b, final, vy, vyT: vy, vx: 0.3 * v, omega: 8, phi0: this.phi, shapeT: { tuck: 0, pike: 0, straight: 0 },
        twistGoal: 0, twistRate: 0, maxY: this.y, y0: this.y, psi0: this.psi,
      };
      this.phase = 'fly'; this.t = 0;
      this.emit('takeoff', { v, pct: this.power(), final });
    }

    stepFly(dt, inp, twistPress) {
      const f = this.fly;
      // skrue: ½ pr. tryk, ikke i hoftebøjet
      const twisting = Math.abs(f.twistGoal - (this.psi - f.psi0)) > 0.02;
      const shape = inp.tuck ? 'tuck' : twisting ? 'straight' : inp.pike ? 'pike' : inp.straight ? 'straight' : null;
      if (twistPress && shape !== 'pike') f.twistGoal += Math.PI;
      const tuckTwist = shape === 'tuck' && twisting;
      // rotation: positionen bestemmer farten, åben bremser brat (som på trampolinen)
      const boost = 1 + 0.06 * (this.v - 6);
      const target = shape === 'tuck' ? (tuckTwist ? 9.5 : 13) * boost : shape === 'pike' ? 11 * boost : shape === 'straight' ? 9.6 * boost * (twisting ? 0.85 : 1) : 2.0;
      if (f.omega < target) f.omega = Math.min(target, f.omega + 30 * dt); else f.omega = Math.max(target, f.omega - 60 * dt);
      this.phi -= f.omega * dt;
      if (shape) f.shapeT[shape] += dt * f.omega;
      const rem = f.twistGoal - (this.psi - f.psi0);
      if (Math.abs(rem) > 1e-4) {
        const vmax = Math.min(12.5, Math.sqrt(2 * 160 * Math.abs(rem)));
        f.twistRate = Math.min(vmax, f.twistRate + 160 * dt);
        this.psi += Math.sign(rem) * Math.min(Math.abs(rem), f.twistRate * dt);
      } else f.twistRate = 0;
      let tg;
      if (tuckTwist) tg = { ...B.shapeTarget('tucktwist', 3), hand: B.HAND.tuckTwist };
      else if (shape === 'tuck') { tg = B.shapeTarget('tuck', 3); tg.hand = B.legGripTarget(tg, 0.3); }
      else if (shape === 'pike') { tg = B.shapeTarget('pike', 3); tg.hand = B.pikeHandTarget(tg); }
      else if (shape === 'straight') tg = { hip: 0, knee: 0, hand: twisting ? B.HAND.twist : B.HAND.straight };
      else tg = { hip: 0.1, knee: 0.05, hand: this.t < 0.15 ? UP : SIDE };
      const k = 1 - Math.exp(-12 * dt), p = this.pose;
      p.hip = lerp(p.hip, tg.hip, k); p.knee = lerp(p.knee, tg.knee, k); p.hand = lh(p.hand, tg.hand, k);
      this.x += f.vx * dt; f.vy -= GRAV * dt; this.y += f.vy * dt;
      const W = B.toWorld(B.solve(p), this.psi, this.phi, this.x, this.y, this.W);
      f.maxY = Math.max(f.maxY, this.y);
      const low = B.lowest(W);
      if (this.t < 0.12 && low.y < 0) { for (let i = 0; i < B.N; i++) W[i * 3 + 1] -= low.y; this.y -= low.y; return; }
      if (f.vy < 0 && low.y <= 0) this.landFly(low);
    }

    landFly(low) {
      const f = this.fly, W = this.W;
      for (let i = 0; i < B.N; i++) W[i * 3 + 1] -= low.y;
      this.y -= low.y;
      // hvor lodret står kroppen (fødder → skuldre)?
      const ax = footX(W), ay = (W[I.ankleL * 3 + 1] + W[I.ankleR * 3 + 1]) / 2;
      const dev = Math.abs(Math.atan2(W[I.sh * 3] - ax, W[I.sh * 3 + 1] - ay));
      const turned = f.phi0 - this.phi, saltos = Math.max(0, Math.round(turned / TAU));
      const halves = Math.round(f.twistGoal / Math.PI);
      const twistLeft = Math.abs(f.twistGoal - (this.psi - f.psi0));
      const shape = ['tuck', 'pike', 'straight'].reduce((a, b) => (f.shapeT[b] > f.shapeT[a] ? b : a), 'tuck');
      const sk = finalSkill(saltos, halves, shape);
      let landing, ded = 0, reason = '';
      if (!low.feet || dev > 0.85 || this.pose.hip > 1.3) { landing = 'fall'; reason = !low.feet || dev > 0.85 ? (turned < TAU * saltos ? 'Under-roteret' : 'Over-roteret') : 'Landede lukket'; }
      else if (twistLeft > Math.PI / 4) { landing = 'fall'; reason = 'Skruen blev ikke færdig'; }
      else if (dev > 0.42) { landing = 'step'; ded = 0.3; }
      else { landing = 'stand'; ded = Math.min(0.3, Math.round(dev / 0.12) * 0.1); }
      if (landing === 'fall') ded = 1.0;
      if (ded) { this.E -= ded; this.ded.push({ label: landing === 'fall' ? `Fald: ${reason}` : landing === 'step' ? 'Skridt i landingen' : 'Urolig landing', v: ded }); }
      this.elements.push({ kind: 'salto', name: sk.name, dd: landing === 'fall' ? 0 : sk.dd, beat: f.beat, code: sk.code });
      const land = { landing, dev, reason, skill: sk, height: f.maxY - f.y0, final: f.final };
      // midt i serien: står han, fortsætter serien med næste element
      if (!f.final && landing === 'stand') {
        if (halves % 2) { land.landing = 'stop'; land.reason = 'Landede med front mod banen'; }
        else if (saltos === 0) { land.landing = 'stop'; land.reason = 'Ingen salto'; }
        else {
          this.emit('land', land);
          this.fly = null; this.foot = footX(W); this.v = clamp(this.v * 0.85, 0, V_MAX);
          this.psi = Math.PI + Math.round((this.psi - Math.PI) / TAU) * TAU;
          if (this.v < V_MIN) this.abort = 'Farten forsvandt';
          return this.beat();
        }
      }
      if (f.final && this.x < MAT0) { this.E -= 0.3; this.ded.push({ label: 'Landede før måtten', v: 0.3 }); }
      if (!f.final && land.landing !== 'fall') { if (land.landing === 'step') land.reason = 'Skridt midt i serien'; land.landing = land.landing === 'step' ? 'step' : 'stop'; this.E -= 1.0; this.ded.push({ label: `Serien stoppede: ${land.reason}`, v: 1.0 }); }
      this.landing = land;
      this.phase = 'land'; this.t = 0; this.landPose = { ...this.pose, hand: this.pose.hand.slice() };
      this.landPhi = this.phi; this.landY = this.y;
      this.emit('land', land);
    }

    startStop() {
      this.phase = 'stop'; this.t = 0; this.landing = { landing: 'stop', reason: this.abort };
      this.landPose = { ...CROUCH, hand: UP.slice() }; this.landPhi = this.phi; this.landY = this.y;
      this.E -= 1.0; this.ded.push({ label: `Serien stoppede: ${this.abort}`, v: 1.0 });
      this.emit('land', this.landing);
    }

    stepLand(dt) {
      const u = clamp(this.t / 0.9, 0, 1), lp = this.landPose;
      const fall = this.landing.landing === 'fall';
      if (fall) {
        // falder om til den side, han hælder til
        const p = { hip: lerp(lp.hip, 0.6, u), knee: lerp(lp.knee, 0.5, u), hand: lh(lp.hand, B.HAND.crash, u) };
        const body = B.solve(p), tilt0 = torsoTilt(B.toWorld(body, this.psi, 0, 0, 0, this.W));
        const cur = wrapPi(torsoTilt(B.toWorld(B.solve(lp), this.psi, this.landPhi, 0, 0, this.W)));
        this.phi = tilt0 - lerp(cur, cur < 0 ? -1.45 : 1.45, ease(Math.min(1, u * 1.6)));
        this.x += dt * 0.6 * (1 - u);
        const W = B.toWorld(body, this.psi, this.phi, this.x, 0, this.W);
        const low = -B.lowest(W).y; for (let i = 0; i < B.N; i++) W[i * 3 + 1] += low;
      } else {
        // fra landing til stand med armene op (rejser sig op i stedet for at fortsætte)
        const k = ease(u), step = this.landing.landing === 'step' ? 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.5)) : 0;
        const p = { hip: lerp(Math.max(lp.hip, 0.45), 0.02, k), knee: lerp(Math.max(lp.knee, 0.7), 0.02, k), hand: lh(lp.hand, UP, ss(0.3, 1, u)) };
        this.x += dt * (this.landing.landing === 'stop' ? 0.8 : 0.4) * (1 - u);
        const body = B.solve(p);
        // stå lodret: drej kroppen, så overkroppen går mod lodret
        const tilt0 = torsoTilt(B.toWorld(body, this.psi, 0, 0, 0, this.W));
        const cur = wrapPi(torsoTilt(B.toWorld(B.solve(lp), this.psi, this.landPhi, 0, 0, this.W)));
        this.phi = tilt0 - lerp(cur, 0, k) - step * 0.3;
        const W = B.toWorld(body, this.psi, this.phi, this.x, 0, this.W);
        const low = -B.lowest(W).y; for (let i = 0; i < B.N; i++) W[i * 3 + 1] += low;
      }
      this.y = this.W[I.hip * 3 + 1];
      if (this.t > 1.4 && !this.result) {
        for (const b of this.beats) if (!b.judged) this.judge(b, null);
        this.phase = 'done';
        this.result = this.totals();
        this.emit('end', this.result);
      }
    }

    totals() {
      const D = this.elements.reduce((s, e) => s + e.dd, 0);
      const E = Math.max(0, this.E);
      return { D, E, total: D + E, elements: this.elements, landing: this.landing, ded: this.ded, vTop: this.vTop };
    }
  }

  // ---------- Tegning: tumblingbane i hallen med rytmebane ----------
  function drawHall(c, cam, camX) {
    const { W, H, ppm } = cam;
    const fy = cam.sy(-0.3);
    const wall = c.createLinearGradient(0, 0, 0, fy);
    wall.addColorStop(0, '#46557a'); wall.addColorStop(0.6, '#7d8aa6'); wall.addColorStop(1, '#a3a0a0');
    c.fillStyle = wall; c.fillRect(0, 0, W, fy);
    const px = (wx, k) => W / 2 + (wx - camX * k) * ppm;
    for (let i = -6; i < 40; i++) {
      const x = px(i * 3.2, 0.6), y = cam.sy(4.6);
      if (x < -3 * ppm || x > W + 3 * ppm) continue;
      const gw = c.createLinearGradient(0, y, 0, y + 1.2 * ppm); gw.addColorStop(0, '#dfeaf7'); gw.addColorStop(1, '#9fb4d4');
      c.fillStyle = gw; c.fillRect(x, y, 2.2 * ppm, 1.2 * ppm);
      c.strokeStyle = 'rgba(60,70,90,.6)'; c.lineWidth = Math.max(1, 0.03 * ppm); c.strokeRect(x, y, 2.2 * ppm, 1.2 * ppm);
      c.beginPath(); c.moveTo(x + 1.1 * ppm, y); c.lineTo(x + 1.1 * ppm, y + 1.2 * ppm); c.stroke();
    }
    for (let i = -4; i < 30; i++) {
      const x = px(i * 4.6 + 1.5, 0.8); if (x < -ppm || x > W + ppm) continue;
      c.fillStyle = '#b7895a';
      for (let r = 0; r < 9; r++) c.fillRect(x, cam.sy(-0.3 + 0.28 * (r + 1)), 0.9 * ppm, Math.max(1, 0.035 * ppm));
      c.fillRect(x, cam.sy(2.6), Math.max(1, 0.05 * ppm), 2.9 * ppm); c.fillRect(x + 0.9 * ppm, cam.sy(2.6), Math.max(1, 0.05 * ppm), 2.9 * ppm);
    }
    const fl = c.createLinearGradient(0, fy, 0, H); fl.addColorStop(0, '#c98f55'); fl.addColorStop(1, '#8a5a2e');
    c.fillStyle = fl; c.fillRect(0, fy, W, H - fy);
    c.strokeStyle = 'rgba(90,55,25,.35)'; c.lineWidth = 1; c.beginPath();
    for (let i = Math.floor(camX - 30); i < camX + 30; i += 1) { const x0 = cam.sx(i); c.moveTo(x0, fy); c.lineTo(W / 2 + (x0 - W / 2) * 2.6, H); }
    c.stroke();
    // tumblingbanen: blå med hvid kant og stave
    const y0 = cam.sy(0), y1 = cam.sy(-0.3), xa = cam.sx(-1), xb = cam.sx(TRACK);
    c.fillStyle = '#1b5fc2'; c.fillRect(xa, y0, xb - xa, y1 - y0);
    c.fillStyle = '#2f7be6'; c.fillRect(xa, y0, xb - xa, Math.max(2, 0.06 * ppm));
    c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(xa, y0, xb - xa, Math.max(1, 0.015 * ppm));
    c.strokeStyle = 'rgba(10,40,90,.35)'; c.lineWidth = 1; c.beginPath();
    const m0 = Math.max(0, Math.floor((camX - W / 2 / ppm) * 4) / 4), m1 = Math.min(TRACK, camX + W / 2 / ppm);
    for (let xm = m0; xm <= m1; xm += 0.25) { c.moveTo(cam.sx(xm), y0 + 0.07 * ppm); c.lineTo(cam.sx(xm), y1); }
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `600 ${Math.round(0.15 * ppm)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    for (let m = 5; m < TRACK; m += 5) c.fillText(`${m} m`, cam.sx(m), cam.sy(-0.2));
    // landingsmåtte
    const mg = c.createLinearGradient(0, cam.sy(0.05), 0, y1); mg.addColorStop(0, '#e5394f'); mg.addColorStop(1, '#9b1d2c');
    c.fillStyle = mg; c.beginPath(); c.roundRect(cam.sx(MAT0), cam.sy(0.05), (MAT1 - MAT0) * ppm, y1 - cam.sy(0.05), 0.08 * ppm); c.fill();
    c.fillStyle = 'rgba(255,255,255,.9)'; c.font = `800 ${Math.round(0.2 * ppm)}px system-ui, sans-serif`;
    c.fillText('LANDINGSMÅTTE', cam.sx((MAT0 + MAT1) / 2), cam.sy(-0.18));
  }

  // Rytmebanen: prikkerne er afsættene og glider mod den gule streg. top = banen ligger øverst (mobil).
  function rhythmLane(c, x0, x1, y, sim, scale, touch, top) {
    const lh2 = 46 * scale, w = x1 - x0, hitX = x0 + w * 0.2, pxs = Math.min(w * 0.3, 320);
    c.save();
    c.fillStyle = 'rgba(12,18,34,.72)'; c.beginPath(); c.roundRect(x0, y, w, lh2, 10 * scale); c.fill();
    c.strokeStyle = '#ffd166'; c.lineWidth = 3 * scale; c.beginPath(); c.moveTo(hitX, y + 6 * scale); c.lineTo(hitX, y + lh2 - 6 * scale); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const b of sim.upcoming(4)) {
      const x = hitX + (b.t - sim.time) * pxs; if (x < x0 + 12 * scale || x > x1 - 12 * scale) continue;
      const near = !b.done && Math.abs(b.t - sim.time) < 0.08;
      c.globalAlpha = b.done ? Math.max(0, 1 - (sim.time - b.t) / 0.6) : 1;
      c.fillStyle = near ? '#ffd166' : b.label === 'Afslutning' ? '#ff8fa3' : 'rgba(255,255,255,.92)';
      c.beginPath(); c.arc(x, y + lh2 / 2, (near ? 15 : 12) * scale, 0, TAU); c.fill();
      c.fillStyle = '#14233f'; c.font = `800 ${Math.round(12 * scale)}px system-ui, sans-serif`; c.fillText(String(b.idx + 1), x, y + lh2 / 2 + 1);
      c.fillStyle = 'rgba(255,255,255,.85)'; c.font = `700 ${Math.round(11 * scale)}px system-ui, sans-serif`;
      c.fillText(b.label, x, top ? y + lh2 + 10 * scale : y - 9 * scale);
    }
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(255,255,255,.85)'; c.textAlign = top ? 'center' : 'right'; c.font = `600 ${Math.round(12 * scale)}px system-ui, sans-serif`;
    const key = touch ? 'SATS' : 'mellemrum';
    const msg = sim.phase === 'land' || sim.phase === 'stop' || sim.phase === 'done' ? '' : sim.phase === 'ready' ? `Tryk ${key} for at løbe`
      : sim.phase === 'fly' ? (touch ? 'Hold LUKKET, HOFTE eller STRAKT – slip for at åbne · SKRUE' : 'Hold S, D eller F – slip for at åbne · ↓ skrue')
        : touch ? 'SATS på stregen = flikflak/whip · LUKKET/HOFTE/STRAKT = salto' : 'Mellemrum på stregen = flikflak/whip · S/D/F = salto';
    c.fillText(msg, top ? (x0 + x1) / 2 : x1 - 12, top ? y + lh2 + 28 * scale : y - 26 * scale);
    c.restore();
    return hitX;
  }

  // ---------- Spiltype ----------
  class TumblingMode extends TR.Modes.Mode {
    get custom() { return true; }
    get title() { return 'Power Tumbling'; }
    begin() {
      const g = this.game, R = g.renderer;
      this.sim = new TumbleSim();
      this.camX = this.sim.x + 2; this.viewH = 5.2; this.flash = [];
      this.timeScale = 0.75;
      const sim = this.sim;
      sim.on('start', () => g.sfx.whoosh(0.4));
      sim.on('beat', ({ x }) => { g.sfx.bounce(3); R.burst(x, 0.02, 6, { up: true, speed: 1.2, color: 'rgba(255,255,255,0.7)', size: 0.025, life: 0.4 }); });
      sim.on('timing', ({ label, color, q }) => { this.flash.push({ label, color, t: 0 }); if (q > 0) g.sfx.sats(q); });
      // afsættets kraft vises, når springeren letter til en salto
      const showPower = (pct) => { this.pct = pct; this.flash.push({ label: `Afsæt ${pct} %`, color: pct >= 85 ? '#ffd166' : pct >= 70 ? '#80ffdb' : '#ffb4c1', t: 0, big: true }); };
      sim.on('takeoff', ({ v, pct }) => { g.sfx.whoosh(Math.min(1, v / 8)); showPower(pct); });
      sim.on('power', ({ pct }) => { this.pct = pct; });
      sim.on('land', (l) => {
        if (l.landing === 'fall') { g.sfx.crash(); R.shake = 0.5; R.popup(l.reason, { color: '#ff6b81', size: 0.8 }); }
        else if (l.landing !== 'stop') {
          g.sfx.land(l.landing === 'stand' ? 1.9 : 1.4);
          if (!l.final && l.landing === 'stand') { R.popup(l.skill.name, { sub: 'Videre!', color: '#80ffdb', size: 0.7, max: 1.4 }); return; }
          R.popup(l.skill.name, { sub: l.landing === 'stand' ? 'Stand!' : 'Skridt i landingen', color: l.landing === 'stand' ? '#ffd166' : '#ffffff' });
          if (l.landing === 'stand') { g.sfx.cheer(); R.burst(sim.x, 1.4, 26, { kind: 'star', colors: ['#ffd166', '#ffffff', '#4cc9f0'], speed: 3.2, size: 0.07, life: 1.1, g: 2 }); }
        } else R.popup(l.reason, { color: '#9aa4bf', size: 0.7 });
      });
      sim.on('end', (r) => this.end(r));
    }
    step(dt, inp) {
      let left = dt;
      while (left > 1e-6) { const h = Math.min(1 / 240, left); this.sim.step(h, inp); left -= h; }
    }
    end(r) {
      const g = this.game;
      const res = {
        title: r.landing.landing === 'fall' ? (r.landing.final ? 'Faldt i afslutningen' : 'Faldt midt i serien') : r.landing.landing === 'stop' ? 'Serien stoppede' : 'Serien er færdig',
        big: TR.fmt(r.total, 2), bigLabel: 'point',
        note: `${r.elements.length} af ${N_ELEM} elementer`,
        lines: [['D · sværhed', TR.fmt(r.D, 1)], ['E · udførelse', TR.fmt(r.E, 1)], ['Topfart', `${Math.round(r.vTop * 3.6)} km/t`]],
        list: r.elements.map((e, i) => `${i + 1}. ${e.name}${e.beat && e.beat.q ? ` · ${e.beat.q}` : ''}`).concat(r.ded.map((d) => `−${TR.fmt(d.v, 1)} ${d.label}`)),
        retry: () => g.startMode(new TumblingMode(g, this.opts)),
      };
      const prev = g.save.best.tumble || 0;
      if (r.total > prev) { g.save.best.tumble = Math.round(r.total * 100) / 100; res.record = true; }
      res.lines.push(['Rekord', TR.fmt(Math.max(prev, r.total), 2)]);
      g.addXp(Math.round(r.total * 4));
      this.finish(res);
    }
    hud() {
      const s = this.sim, r = s.totals();
      return {
        title: this.title, main: s.phase === 'ready' ? 'Klar' : `${Math.min(N_ELEM, s.elements.length)}/${N_ELEM}`,
        sub: s.phase === 'ready' ? 'Tryk SATS for at løbe' : s.phase === 'fly' ? `Afsæt ${this.pct || 0} % · D ${TR.fmt(r.D, 1)}` : `D ${TR.fmt(r.D, 1)} · E ${TR.fmt(r.E, 1)}`,
        stat: `${Math.round(s.v * 3.6)} km/t`,
      };
    }
    render(R, dt) {
      const ctx = R.ctx, W = R.W, H = R.H, sim = this.sim, ui = this.game.ui;
      R.t += dt;
      const touch = ui && ui.touch;
      const scale = clamp(Math.min(W / 900, H / 600), 0.65, 1.25);
      // computer: rytmebanen i bunden. Mobil: øverst mellem HUD-kasserne, så touch-knapperne ikke dækker
      const top = !!touch && (R.safeBottom || 0) > 0;
      const laneH = 46 * scale;
      const lane = top ? { x0: W * 0.24, x1: W * 0.76, y: 12 } : { x0: 12, x1: W - 12, y: H - laneH - 14 };
      const floorY = top ? H - Math.max(40, (R.safeBottom || 0) * 0.5) : lane.y - 40 * scale;
      const skyTop = top ? lane.y + laneH + 40 * scale : 60 * scale;
      // kamera: følger springeren lidt foran, zoomer ud i afslutningen
      const want = clamp(sim.y + 2.4, 5.2, 8.5);
      this.viewH += (want - this.viewH) * Math.min(1, 2.5 * dt);
      const ppm = Math.min((floorY - skyTop) / (this.viewH - 0.3), W / 7);
      const ahead = sim.phase === 'final' || sim.phase === 'land' ? 0.3 : sim.phase === 'ready' ? 2 : 1.4;
      this.camX += (sim.x + ahead - this.camX) * Math.min(1, 4 * dt);
      let shx = 0;
      if (R.shake > 0) { R.shake = Math.max(0, R.shake - dt * 2.5); shx = (Math.random() - 0.5) * R.shake * 10; }
      const camX = this.camX;
      const cam = { W, H, ppm, dpr: R.dpr, sx: (x) => W / 2 + (x - camX) * ppm + shx, sy: (y) => floorY - (y + 0.3) * ppm, floorY };
      ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
      drawHall(ctx, cam, camX);
      const k = 1 / (1 + Math.max(0, sim.y - 1) * 0.4);
      ctx.fillStyle = `rgba(0,0,0,${(0.28 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(cam.sx(sim.x), cam.sy(0) + 2, 0.45 * ppm * k, 0.05 * ppm, 0, 0, TAU); ctx.fill();
      R.hallAthlete(ctx, cam, sim.W);
      R.updateParticles(dt); R.drawParticles(ctx, cam);
      const hitX = rhythmLane(ctx, lane.x0, lane.x1, lane.y, sim, scale, touch, top);
      // tilbagemelding på timingen over stregen
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const f of this.flash) {
        f.t += dt;
        const life = f.big ? 1.3 : 0.7;
        ctx.globalAlpha = Math.max(0, Math.min(1, (1 - f.t / life) * 2));
        ctx.font = `900 ${Math.round((f.big ? 30 : 24) * scale)}px system-ui, sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,30,.85)';
        // kraften i afsættet vises ved springeren, timingen ved den gule streg
        const x = f.big ? cam.sx(sim.x) : hitX, text = f.big ? f.label : f.label + '!';
        const y = f.big ? Math.max(skyTop + 20 * scale, cam.sy(sim.y) - 1.4 * ppm) - f.t * 20 : top ? lane.y + laneH + 60 * scale + f.t * 30 : lane.y - 52 * scale - f.t * 40;
        ctx.strokeText(text, x, y); ctx.fillStyle = f.color; ctx.fillText(text, x, y);
      }
      ctx.restore();
      this.flash = this.flash.filter((f) => f.t < (f.big ? 1.3 : 0.7));
      R.drawPopups(ctx, cam, dt);
    }
  }

  TR.Tumbling = { TumbleSim, TumblingMode, finalSkill, N_ELEM, TRACK, MAT0, MAT1 };
  TR.Modes.TumblingMode = TumblingMode;
})(globalThis);
