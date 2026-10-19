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
  const EL = {
    ro: { name: 'Araber', T: 0.55, len: (v) => Math.max(1.6, 0.32 * v), dd: 0.1, dv: 0 },
    flik: { name: 'Flikflak', T: 0.42, len: (v) => 0.6 + 0.26 * v, dd: 0.1, dv: -0.05 },
    whip: { name: 'Whip', T: 0.46, len: (v) => 0.9 + 0.3 * v, dd: 0.2, dv: -0.15 },
  };
  const WHIP_V = 6.0, V_MIN = 3.9, V_MAX = 8.2;
  // Timing af afsættene (sekunder fra takten)
  const TIMING = [
    { max: 0.06, label: 'Perfekt', dv: 0.35, ded: 0, fin: 1, color: '#ffd166' },
    { max: 0.13, label: 'God', dv: 0.15, ded: 0.1, fin: 0.5, color: '#80ffdb' },
    { max: 0.25, label: null, dv: -0.3, ded: 0.3, fin: -0.3, color: '#ffb4c1' },
  ];
  const MISS = { label: 'Glemt', dv: -0.9, ded: 0.5, fin: -0.8, color: '#9aa4bf' };
  const WINDOW = 0.25;

  const UP = B.HAND.up, SIDE = B.HAND.side;
  const CROUCH = { hip: 0.35, knee: 0.5, hand: UP };
  const Yc = -B.lowest(B.toWorld(B.solve(CROUCH), 0, 0, 0, 0)).y; // kropsmidtpunktets højde i afsættet

  // Kropsposition i et mellemspring (u = 0..1)
  function elemPose(kind, u) {
    const P = (hip, knee, hand) => ({ hip, knee, hand });
    if (kind === 'ro') {
      if (u < 0.25) return P(lerp(0.2, 1.15, ease(u / 0.25)), 0.1 * (1 - u / 0.25), UP);
      if (u < 0.6) return P(lerp(1.15, -0.25, ease((u - 0.25) / 0.35)), 0, UP);
      if (u < 0.85) return P(lerp(-0.25, 0.25, ease((u - 0.6) / 0.25)), 0, UP);
      const k = ease((u - 0.85) / 0.15);
      return P(lerp(0.25, CROUCH.hip, k), lerp(0, CROUCH.knee, k), UP);
    }
    const arch = kind === 'flik' ? -0.45 : -0.3, whip = kind === 'whip';
    if (u < 0.15) return P(lerp(CROUCH.hip, 0.1, ease(u / 0.15)), lerp(CROUCH.knee, 0, ease(u / 0.15)), UP);
    if (u < 0.5) return P(lerp(0.1, arch, ease((u - 0.15) / 0.35)), 0, whip ? lh(UP, SIDE, ss(0.2, 0.5, u)) : UP);
    if (u < 0.82) return P(lerp(arch, 0.3, ease((u - 0.5) / 0.32)), 0, whip ? lh(SIDE, UP, ss(0.6, 0.82, u)) : UP);
    const k = ease((u - 0.82) / 0.18);
    return P(lerp(0.3, CROUCH.hip, k), lerp(0, CROUCH.knee, k), UP);
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
      this.x = RUN0; this.v = 0; this.vTop = 0;
      this.elements = []; // { kind, name, dd, q }
      this.beats = []; // { t, judged, q }
      this.ded = []; this.E = 10;
      this.seg = null; this.phi = 0; this.psi = 0;
      this.prev = {}; this.early = null;
      this.final = null; this.result = null; this.abort = null;
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

    // Næste elements art ud fra farten
    nextKind(v, n) { return n === 0 ? 'ro' : n >= N_ELEM - 1 ? 'final' : v >= WHIP_V ? 'whip' : 'flik'; }

    // Forventede kommende takter (til rytmebanen): [{ t, label }]
    upcoming(n = 4) {
      const out = [];
      for (const b of this.beats) if (this.time - b.t < 0.6) out.push({ t: b.t, label: b.label, q: b.q, done: true, idx: b.idx });
      if (this.phase === 'ready') return out;
      let t = this.seg ? this.seg.t0 + this.seg.T : this.time, k = this.elements.length, v = this.v;
      if (this.phase === 'run') t = this.runT0 + NSTEP * STEP_T;
      if (this.phase === 'final' || this.phase === 'land' || this.phase === 'done' || this.abort) return out;
      for (let i = 0; i < n && k < N_ELEM; i++, k++) {
        const kind = this.nextKind(v, k);
        out.push({ t, label: kind === 'final' ? 'Afslutning' : EL[kind].name, idx: k });
        if (kind === 'final') break;
        t += EL[kind].T;
      }
      return out;
    }

    // Ét tidsskridt. inp: { push, tuck, pike, straight, twist }
    step(dt, inp) {
      const press = inp.push && !this.prev.push, twistPress = inp.twist && !this.prev.twist;
      this.prev = { push: inp.push, twist: inp.twist };
      this.time += dt; this.t += dt;
      if (this.phase === 'ready') {
        if (press) { this.phase = 'run'; this.runT0 = this.time; this.t = 0; this.emit('start'); }
        return this.standWorld();
      }
      // tryk: tidligt (før takten) gemmes, sent (efter takten) bedømmer den seneste takt
      if (press) {
        const open = this.beats.find((b) => !b.judged && this.time - b.t <= WINDOW);
        if (open) this.judge(open, this.time - open.t);
        else this.early = this.time;
      }
      for (const b of this.beats) if (!b.judged && this.time - b.t > WINDOW) this.judge(b, null);
      if (this.phase === 'run') return this.stepRun();
      if (this.phase === 'elem') return this.stepElem();
      if (this.phase === 'final') return this.stepFinal(dt, inp, twistPress);
      if (this.phase === 'land' || this.phase === 'stop') return this.stepLand(dt);
      return this.standWorld();
    }

    stepRun() {
      const u = clamp(this.t / (NSTEP * STEP_T), 0, 1);
      this.v = 2.5 + 2.9 * ss(0, 0.7, u);
      this.x = RUN0 + (NSTEP * 1.45) * (u * u * 0.35 + u * 0.65);
      runWorld(u, this.x, this.W);
      this.y = this.W[I.hip * 3 + 1];
      if (u >= 1) this.beat();
    }

    // En takt: fødderne rammer banen, og næste element starter
    beat() {
      const n = this.elements.length;
      const kind = this.abort ? 'stop' : this.nextKind(this.v, n);
      const b = { t: this.time, judged: false, q: null, idx: n, label: kind === 'final' ? 'Afslutning' : kind === 'stop' ? '' : EL[kind].name };
      if (kind !== 'stop') this.beats.push(b);
      if (this.early != null && this.time - this.early <= WINDOW) { this.judge(b, this.early - this.time); }
      this.early = null;
      this.emit('beat', { x: this.x });
      if (kind === 'stop') return this.startStop();
      if (kind === 'final') return this.startFinal(b);
      const e = EL[kind];
      this.elements.push({ kind, name: e.name, dd: e.dd, beat: b });
      this.seg = { kind, t0: this.time, T: e.T, x0: this.x, L: e.len(this.v), phi0: this.phi, psi0: kind === 'ro' ? 0 : Math.PI };
      this.v = clamp(this.v + e.dv, 0, V_MAX);
      this.phase = 'elem'; this.t = 0;
    }

    judge(b, off) {
      b.judged = true;
      let r = MISS;
      if (off != null) for (const tm of TIMING) if (Math.abs(off) <= tm.max) { r = tm; break; }
      const label = r.label || (off < 0 ? 'For tidligt' : 'For sent');
      b.q = label;
      this.v = clamp(this.v + r.dv, 0, V_MAX);
      this.vTop = Math.max(this.vTop, this.v);
      if (r.ded) { this.E -= r.ded; this.ded.push({ label: `${label} (${b.label})`, v: r.ded }); }
      if (this.final && this.final.beat === b && this.final.vy > 0) this.final.vy += 0.5 * r.fin;
      if (!this.final && this.v < V_MIN && !this.abort) this.abort = 'Farten forsvandt';
      this.emit('timing', { label, color: r.color, q: r === MISS ? 0 : r.fin > 0 ? r.fin : 0.2, beat: b });
    }

    stepElem() {
      const s = this.seg, u = clamp(this.t / s.T, 0, 1);
      this.x = s.x0 + s.L * u;
      this.phi = s.phi0 - TAU * u;
      this.psi = s.psi0 + Math.PI * (s.kind === 'ro' ? ss(0.25, 0.7, u) : 0);
      const W = B.toWorld(B.solve(elemPose(s.kind, u)), this.psi, this.phi, this.x, 0, this.W);
      const low = -B.lowest(W).y;
      let y;
      if (s.kind === 'whip') { const h = (GRAV * s.T * s.T) / 8; y = Math.max(low, Yc + 4 * h * u * (1 - u)); }
      else y = low + 0.24 * Math.pow(Math.sin(TAU * u), 2); // fødder → hænder → fødder
      for (let i = 0; i < B.N; i++) W[i * 3 + 1] += y;
      this.y = y;
      if (u >= 1) { this.phi = s.phi0 - TAU; this.psi = Math.PI; this.beat(); }
    }

    startFinal(b) {
      const v = this.v;
      this.final = {
        beat: b, vy: 2.2 + 0.55 * v, vx: 0.3 * v, omega: 6, phi0: this.phi, shapeT: { tuck: 0, pike: 0, straight: 0 },
        twistGoal: 0, twistRate: 0, maxY: 0,
      };
      if (b.judged) { const r = TIMING.find((tm) => tm.label === b.q); this.final.vy += 0.5 * (r ? r.fin : b.q === 'Glemt' ? MISS.fin : -0.3); }
      this.pose = { hip: CROUCH.hip, knee: CROUCH.knee, hand: UP.slice() };
      this.psi = Math.PI; this.y = Yc;
      this.phase = 'final'; this.t = 0;
      this.emit('takeoff', { v });
    }

    stepFinal(dt, inp, twistPress) {
      const f = this.final;
      // skrue: ½ pr. tryk, ikke i hoftebøjet
      const twisting = Math.abs(f.twistGoal - (this.psi - Math.PI)) > 0.02;
      const shape = inp.tuck ? 'tuck' : twisting ? 'straight' : inp.pike ? 'pike' : inp.straight ? 'straight' : null;
      if (twistPress && shape !== 'pike') f.twistGoal += Math.PI;
      const tuckTwist = shape === 'tuck' && twisting;
      // rotation: positionen bestemmer farten, åben bremser brat (som på trampolinen)
      const boost = 1 + 0.06 * (this.v - 6);
      const target = shape === 'tuck' ? (tuckTwist ? 8.5 : 11.5) * boost : shape === 'pike' ? 9.5 * boost : shape === 'straight' ? 6.2 * (twisting ? 0.8 : 1) : 2.0;
      if (f.omega < target) f.omega = Math.min(target, f.omega + 30 * dt); else f.omega = Math.max(target, f.omega - 60 * dt);
      this.phi -= f.omega * dt;
      if (shape) f.shapeT[shape] += dt * f.omega;
      // skrue mod målet
      const rem = f.twistGoal - (this.psi - Math.PI);
      if (Math.abs(rem) > 1e-4) {
        const vmax = Math.min(12.5, Math.sqrt(2 * 160 * Math.abs(rem)));
        f.twistRate = Math.min(vmax, f.twistRate + 160 * dt);
        this.psi += Math.sign(rem) * Math.min(Math.abs(rem), f.twistRate * dt);
      } else f.twistRate = 0;
      // krop
      let tg;
      if (tuckTwist) tg = { ...B.shapeTarget('tucktwist', 3), hand: B.HAND.tuckTwist };
      else if (shape === 'tuck') { tg = B.shapeTarget('tuck', 3); tg.hand = B.legGripTarget(tg, 0.3); }
      else if (shape === 'pike') { tg = B.shapeTarget('pike', 3); tg.hand = B.pikeHandTarget(tg); }
      else if (shape === 'straight') tg = { hip: 0, knee: 0, hand: twisting ? B.HAND.twist : B.HAND.straight };
      else tg = { hip: 0.1, knee: 0.05, hand: this.t < 0.15 ? UP : SIDE };
      const k = 1 - Math.exp(-12 * dt), p = this.pose;
      p.hip = lerp(p.hip, tg.hip, k); p.knee = lerp(p.knee, tg.knee, k); p.hand = lh(p.hand, tg.hand, k);
      // flugt
      this.x += f.vx * dt; f.vy -= GRAV * dt; this.y += f.vy * dt;
      const W = B.toWorld(B.solve(p), this.psi, this.phi, this.x, this.y, this.W);
      f.maxY = Math.max(f.maxY, this.y);
      const low = B.lowest(W);
      if (this.t < 0.1 && low.y < 0) { for (let i = 0; i < B.N; i++) W[i * 3 + 1] -= low.y; this.y -= low.y; return; }
      if (f.vy < 0 && low.y <= 0) this.landFinal(low);
    }

    landFinal(low) {
      const f = this.final, W = this.W;
      for (let i = 0; i < B.N; i++) W[i * 3 + 1] -= low.y;
      this.y -= low.y;
      // hvor lodret står kroppen (fødder → skuldre)?
      const ax = (W[I.ankleL * 3] + W[I.ankleR * 3]) / 2, ay = (W[I.ankleL * 3 + 1] + W[I.ankleR * 3 + 1]) / 2;
      const dev = Math.abs(Math.atan2(W[I.sh * 3] - ax, W[I.sh * 3 + 1] - ay));
      const turned = f.phi0 - this.phi, saltos = Math.max(0, Math.round(turned / TAU));
      const halves = Math.round(f.twistGoal / Math.PI);
      const twistLeft = Math.abs(f.twistGoal - (this.psi - Math.PI));
      const shape = ['tuck', 'pike', 'straight'].reduce((a, b) => (f.shapeT[b] > f.shapeT[a] ? b : a), 'tuck');
      const sk = finalSkill(saltos, halves, shape);
      let landing, ded = 0, reason = '';
      if (!low.feet || dev > 0.85 || this.pose.hip > 1.3) { landing = 'fall'; reason = !low.feet || dev > 0.85 ? (turned < TAU * saltos ? 'Under-roteret' : 'Over-roteret') : 'Landede lukket'; }
      else if (twistLeft > Math.PI / 4) { landing = 'fall'; reason = 'Skruen blev ikke færdig'; }
      else if (dev > 0.42) { landing = 'step'; ded = 0.3; }
      else { landing = 'stand'; ded = Math.min(0.3, Math.round(dev / 0.12) * 0.1); }
      if (landing === 'fall') ded = 1.0;
      if (ded) { this.E -= ded; this.ded.push({ label: landing === 'fall' ? `Fald: ${reason}` : landing === 'step' ? 'Skridt i landingen' : 'Urolig landing', v: ded }); }
      if (this.x < MAT0) { this.E -= 0.3; this.ded.push({ label: 'Landede før måtten', v: 0.3 }); }
      this.elements.push({ kind: 'final', name: sk.name, dd: landing === 'fall' ? 0 : sk.dd, beat: f.beat, code: sk.code });
      this.landing = { landing, dev, reason, skill: sk, height: f.maxY - Yc };
      this.phase = 'land'; this.t = 0; this.landPose = { ...this.pose, hand: this.pose.hand.slice() };
      this.landPhi = this.phi; this.landY = this.y;
      this.emit('land', this.landing);
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
        // falder om på måtten
        const up = Math.round(this.landPhi / TAU) * TAU; // under-roteret: falder bagover, over-roteret: forover
        this.phi = lerp(this.landPhi, up + (this.landPhi > up ? 1.45 : -1.45), ease(Math.min(1, u * 1.6)));
        const p = { hip: lerp(lp.hip, 0.6, u), knee: lerp(lp.knee, 0.5, u), hand: lh(lp.hand, B.HAND.crash, u) };
        this.x += dt * 0.6 * (1 - u);
        const W = B.toWorld(B.solve(p), this.psi, this.phi, this.x, 0, this.W);
        const low = -B.lowest(W).y; for (let i = 0; i < B.N; i++) W[i * 3 + 1] += low;
      } else {
        // fra landing til stand med armene op
        const k = ease(u), step = this.landing.landing === 'step' ? 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.5)) : 0;
        this.phi = lerp(this.landPhi, Math.round(this.landPhi / TAU) * TAU, k);
        this.x += dt * (this.landing.landing === 'stop' ? 0.8 : 0.4) * (1 - u);
        const p = { hip: lerp(Math.max(lp.hip, 0.45), 0.02, k), knee: lerp(Math.max(lp.knee, 0.7), 0.02, k), hand: lh(lp.hand, UP, ss(0.3, 1, u)) };
        const W = B.toWorld(B.solve(p), this.psi, this.phi + step * 0.3, this.x, 0, this.W);
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
    const msg = sim.phase === 'land' || sim.phase === 'stop' || sim.phase === 'done' ? '' : sim.phase === 'ready' ? `Tryk ${key} for at løbe` : sim.phase === 'final' ? (touch ? 'Hold LUKKET, HOFTE eller STRAKT – slip for at åbne' : 'Hold S, D eller F – slip for at åbne · ↓ skrue') : `Tryk ${key}, når prikken rammer den gule streg`;
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
      sim.on('takeoff', ({ v }) => g.sfx.whoosh(Math.min(1, v / 8)));
      sim.on('land', (l) => {
        if (l.landing === 'fall') { g.sfx.crash(); R.shake = 0.5; R.popup(l.reason, { color: '#ff6b81', size: 0.8 }); }
        else if (l.landing !== 'stop') {
          g.sfx.land(l.landing === 'stand' ? 1.9 : 1.4);
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
        title: r.landing.landing === 'fall' ? 'Faldt i afslutningen' : r.landing.landing === 'stop' ? 'Serien stoppede' : 'Serien er færdig',
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
        sub: s.phase === 'ready' ? 'Tryk SATS for at løbe' : `D ${TR.fmt(r.D, 1)} · E ${TR.fmt(r.E, 1)}`,
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
        ctx.globalAlpha = Math.max(0, 1 - f.t / 0.7);
        ctx.font = `900 ${Math.round(24 * scale)}px system-ui, sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,30,.85)';
        const y = top ? lane.y + laneH + 60 * scale + f.t * 30 : lane.y - 52 * scale - f.t * 40;
        ctx.strokeText(f.label + '!', hitX, y); ctx.fillStyle = f.color; ctx.fillText(f.label + '!', hitX, y);
      }
      ctx.restore();
      this.flash = this.flash.filter((f) => f.t < 0.7);
      R.drawPopups(ctx, cam, dt);
    }
  }

  TR.Tumbling = { TumbleSim, TumblingMode, finalSkill, N_ELEM, TRACK, MAT0, MAT1 };
  TR.Modes.TumblingMode = TumblingMode;
})(globalThis);
