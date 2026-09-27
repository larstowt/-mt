// Springerens fysik: dug (fjeder), flugt med bevaret impulsmoment, skruer og styrt.
(function (G) {
  'use strict';
  const TR = G.TR;
  const B = TR.Body;
  const GRAV = 9.81;
  // FIG-mål: dug 4,28 × 2,14 m, ramme 5,05 × 2,91 m, 1,15 m over gulvet
  const BED = (TR.BED = { half: 2.14, width: 1.07, frameHalf: 2.525, frameWidth: 1.455, K: 85, C: 0.35, floor: -1.15 });

  const STRAIGHT = B.solve({ hip: 0, knee: 0, hand: B.HAND.side });
  const I_REF = STRAIGHT.Isom;
  const TW_REF = B.solve({ hip: 0, knee: 0, hand: B.HAND.twist }).Itw;

  function shapeCat(pose) {
    if (pose.knee > 1.3) return 'o';
    if (pose.hip > 1.3) return '<';
    return '/';
  }

  class Athlete {
    constructor(levels, control) {
      this.listeners = {};
      this.control = control || 'physics'; // 'arcade' eller 'physics'
      this.world = new Float64Array(B.N * 3);
      this.body = null;
      this.setSkills(levels || {});
      this.reset();
    }
    on(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); }
    emit(ev, data) { (this.listeners[ev] || []).forEach((f) => f(data)); }
    // Skrue lavet i dette spring plus det, der ligger i kø (radianer).
    twistQueued() { return this.tracker.dpsi + (this.twistGoal != null ? this.twistGoal - this.psi : 0); }
    setSkills(levels) { this.levels = { ...levels }; this.fx = TR.effects(levels); }

    reset() {
      this.state = 'bed';
      this.contact = 'feet'; // fødder, ryg (back) eller mave (front)
      this.lieA = 0;
      this.x = 0; this.vx = 0;
      this.feetY = -GRAV / BED.K; this.vy = 0;
      this.phi = 0; this.psi = 0; this.psiTarget = 0;
      this.twistRate = 0; this.twistGoal = null; this.L = 0; this.omega = 0;
      this.pose = { hip: 0.1, knee: 0.15, hand: B.HAND.side.slice() };
      this.yCorr = 0; this.crashT = 0; this.airT = 0;
      this.tracker = new TR.TrickTracker();
      this.lastLanding = null;
      this.crashReason = null;
      this.pushPrev = false;
      this.newContact(0, false);
      // Arkade: rotation lades op med pilene og udløses, når man slipper
      this.charge = 0; this.chargeDir = 0; this.armed = null;
      this.flightNo = 0; this.chargeFlight = -1; this.leanPrev = 0;
      this.spin0 = 0; this.lastTakeoffV = 7;
      this.body = B.solve(this.pose, this.body);
      this.y = this.feetY + this.standOffset();
      this.updateWorld();
    }

    get facing() { return Math.cos(this.psi) >= 0 ? 1 : -1; }
    get height() { return Math.max(0, this.y - 1.08); }
    get bedDepth() { return this.state === 'bed' ? Math.max(0, -this.feetY) : 0; }

    standOffset() {
      const W = B.toWorld(this.body, this.psi, this.phi, 0, 0, TMPW);
      const a = Math.min(W[B.IDX.ankleL * 3 + 1], W[B.IDX.ankleR * 3 + 1]);
      return -a + 0.06;
    }

    // Kontaktpunktets højde under massemidtpunktet i den nuværende stilling.
    contactOffset() {
      if (this.contact === 'feet') return this.standOffset();
      const W = B.toWorld(this.body, this.psi, this.phi, 0, 0, TMPW);
      return -B.lowest(W).y;
    }

    // Overkroppens vinkel mod uret fra lodret (0 = står, ±π/2 = ligger).
    torsoAngle(W) {
      W = W || this.world;
      const I = B.IDX;
      return Math.atan2(-(W[I.sh * 3] - W[I.hip * 3]), W[I.sh * 3 + 1] - W[I.hip * 3 + 1]);
    }

    // Hvor meget springeren vipper væk fra sin grundstilling (mod uret positiv).
    tilt() {
      if (this.contact === 'feet') return TR.wrapPi(this.phi);
      return TR.wrapPi(this.torsoAngle() - this.lieA);
    }

    // Til rotationsmåleren: hvor meget rotation lægges der i, og hvad rækker det til?
    rotInfo() {
      const fx = this.fx;
      const maxW = fx.rotGain * 0.45;
      if (this.control === 'arcade' && this.state !== 'crash' && (this.charge > 0 || this.armed)) {
        const amt = this.charge > 0 ? this.charge : this.armed.amt;
        const dir = this.charge > 0 ? this.chargeDir : this.armed.dir;
        let v = this.lastTakeoffV;
        if (this.state === 'bed') {
          const d = Math.max(0, -this.feetY);
          const E = 0.5 * this.vy * this.vy + 0.5 * BED.K * d * d - GRAV * d;
          v = Math.max(v * 0.5, Math.sqrt(2 * Math.max(0, E)));
        }
        v = Math.min(Math.sqrt(2 * GRAV * fx.maxApex), v);
        const T = (2 * v) / GRAV;
        const w = amt * fx.arcadeGain * 0.45 * TR.clamp(v / 7, 0.25, 1);
        const tuckI = B.solve({ ...B.shapeTarget('tuck', fx.tight), hand: B.HAND.side }).Isom;
        const f = Math.cos(Math.round(this.psi / Math.PI) * Math.PI) >= 0 ? 1 : -1;
        return {
          phase: this.charge > 0 ? 'charge' : 'armed', frac: dir * amt,
          dir: dir * f > 0 ? 'baglæns' : 'forlæns',
          straight: (w * T) / TR.TAU, tuck: (w * Math.pow(I_REF / tuckI, 0.32) * T) / TR.TAU,
        };
      }
      if (this.state === 'bed') {
        const tilt = this.tilt();
        const d = Math.max(0, -this.feetY);
        const E = 0.5 * this.vy * this.vy + 0.5 * BED.K * d * d - GRAV * d;
        const v = Math.min(Math.sqrt(2 * GRAV * fx.maxApex), Math.sqrt(2 * Math.max(0, E)));
        const T = (2 * v) / GRAV;
        const arcade = this.control === 'arcade';
        const w = Math.abs((arcade ? fx.arcadeGain : fx.rotGain) * tilt * TR.clamp(v / 7, 0.25, 1));
        const tuckI = B.solve({ ...B.shapeTarget('tuck', fx.tight), hand: B.HAND.side }).Isom;
        const tuckMult = arcade ? Math.pow(I_REF / tuckI, 0.32) : (I_REF / tuckI) * 0.7;
        const f = Math.cos(this.psiTarget) >= 0 ? 1 : -1;
        return {
          phase: 'bed', frac: TR.clamp(tilt / 0.45, -1, 1),
          dir: Math.abs(tilt) < 0.02 ? '' : Math.sign(tilt) * f > 0 ? 'baglæns' : 'forlæns',
          straight: (w * T) / TR.TAU, tuck: (w * tuckMult * T) / TR.TAU,
        };
      }
      if (this.state === 'air') {
        const f = this.tracker.facing0 || 1;
        const fr = this.control === 'arcade' ? (this.spin0 || 0) / (fx.arcadeGain * 0.45) : this.L / (I_REF * maxW);
        return { phase: 'air', frac: TR.clamp(fr, -1, 1), dir: Math.abs(this.L) < 0.5 ? '' : Math.sign(this.L) * f > 0 ? 'baglæns' : 'forlæns' };
      }
      return null;
    }

    // Arkade: hold en pil for at lade rotation op (også i luften). Når pilen slippes:
    // - på dugen eller i luften før landing: bruges ladningen i næste afsæt
    // - holdt gennem afsættet: rotationen starter nu, i luften
    updateCharge(dt, inp) {
      const lean = inp.lean;
      if (this.state === 'crash') { this.charge = 0; this.armed = null; this.leanPrev = lean; return; }
      if (lean) {
        if (this.chargeDir !== lean || this.charge === 0) { this.chargeDir = lean; this.charge = 0; this.chargeFlight = this.flightNo; }
        this.charge = Math.min(1, this.charge + dt / 0.5); // fuld ladning på 0,5 s spiltid
        this.armed = null;
      } else if (this.leanPrev && this.charge > 0) {
        const amt = this.charge, dir = this.chargeDir;
        this.charge = 0;
        if (this.state === 'air' && this.chargeFlight < this.flightNo) {
          const sz = TR.clamp(this.lastTakeoffV / 7, 0.25, 1);
          this.spin0 = dir * amt * this.fx.arcadeGain * 0.45 * sz;
          this.emit('spin', { amt, dir });
        } else {
          this.armed = { amt, dir };
        }
      }
      this.leanPrev = lean;
    }

    // Vip på dugen: realistisk styring bruger pilen direkte; arkade viser den udløste ladning.
    bedLean(inp) {
      if (this.control !== 'arcade') return inp.lean * 0.45;
      return this.armed ? this.armed.dir * this.armed.amt * 0.45 : 0;
    }

    // Ny kontakt med dugen: nulstil timingen af satsen.
    newContact(speed, held) {
      this.sats = { t: 0, speed, held, pressT: null, bottomT: null, q: null };
    }

    // Timing af satsen: bedst at trykke lige omkring bunden af dugen.
    judgeSats() {
      const S = this.sats;
      if (S.q != null || S.bottomT == null) return;
      let q = null, label = '';
      if (S.held) { q = 0.8; label = 'For tidligt'; }
      else if (S.pressT != null) {
        const diff = S.pressT - S.bottomT; // negativ = før bunden
        if (diff >= -0.35 && diff <= 0.15) { q = 1; label = 'Perfekt sats!'; }
        else if (diff >= -0.5 && diff <= 0.25) { q = 0.9; label = 'God sats'; }
        else if (diff < 0) { q = 0.7; label = 'For tidligt'; }
        else { q = 0.55; label = 'For sent'; }
      }
      if (q == null) return;
      S.q = q;
      // Et lidt sent tryk (efter bunden) får kraften komprimeret ind i resten af afsættet.
      const late = S.pressT != null && !S.held ? Math.max(0, S.pressT - S.bottomT) : 0;
      S.comp = TR.clamp(0.17 / Math.max(0.04, 0.17 - late), 1, 2.5);
      this.emit('sats', { q, label, quiet: S.speed < 3 });
    }

    // Sekunder til dugens bund (negativ efter bunden); null når det ikke er relevant.
    satsTiming() {
      const w = Math.sqrt(BED.K), e = GRAV / BED.K;
      const toBottom = (x, u) => (Math.PI / 2 - Math.atan2(x * w, u)) / w;
      if (this.state === 'bed') {
        const S = this.sats;
        if (S.bottomT != null) return -(S.t - S.bottomT);
        return toBottom(Math.max(0, -this.feetY) - e, Math.max(0.01, -this.vy));
      }
      if (this.state === 'air' && this.vy < 0) {
        const h = Math.max(0, B.lowest(this.world).y);
        const tl = (this.vy + Math.sqrt(this.vy * this.vy + 2 * GRAV * h)) / GRAV;
        const u = -(this.vy - GRAV * tl);
        return tl + toBottom(-e, u);
      }
      return null;
    }

    updateWorld() { B.toWorld(this.body, this.psi, this.phi, this.x, this.y + this.yCorr, this.world); }

    approachPose(dt, hip, knee, hand, rate) {
      const p = this.pose;
      p.hip = TR.approach(p.hip, hip, rate * dt);
      p.knee = TR.approach(p.knee, knee, rate * 1.1 * dt);
      const hr = 6 * dt;
      for (let i = 0; i < 3; i++) p.hand[i] = TR.approach(p.hand[i], hand[i], hr);
    }

    step(dt, input) {
      input = input || {};
      if (!input.lean) input = { ...input, lean: 0 };
      if (this.control === 'arcade') this.updateCharge(dt, input);
      if (this.state === 'bed') this.stepBed(dt, input);
      else if (this.state === 'air') this.stepAir(dt, input);
      else this.stepCrash(dt);
      this.pushPrev = !!input.push;
      this.yCorr = TR.approach(this.yCorr, 0, Math.max(0.6, Math.abs(this.yCorr) * 10) * dt);
      this.updateWorld();
    }

    stepBed(dt, inp) {
      const fx = this.fx;
      const d = Math.max(0, -this.feetY);
      const comp = TR.clamp(d / 0.9, 0, 1);
      const rising = this.vy > 0 ? TR.clamp(this.vy / 7, 0, 1) : 0;
      if (this.contact === 'feet') {
        // Armsving op i afsættet – men ikke når strakt (V) holdes: så bliver armene nede langs siden.
        const hand = inp.straight && this.control === 'arcade' ? B.HAND.straight
          : [0, 1, 2].map((i) => TR.lerp(B.HAND.bed[i], B.HAND.up[i], rising));
        this.approachPose(dt, 0.12 + 0.35 * comp, 0.18 + 0.55 * comp, hand, 10);
      } else if (this.contact === 'back') {
        this.approachPose(dt, 0.75 - 0.2 * comp, 0.35, B.HAND.lieBack, 6);
      } else {
        this.approachPose(dt, 0.1, 0.55, B.HAND.lieFront, 6);
      }
      this.body = B.solve(this.pose, this.body);

      // Vip: holdes pilen længe nok på dugen, tages mere rotation med.
      if (this.contact === 'feet') {
        this.phi = TR.approach(this.phi, this.bedLean(inp), (this.control === 'arcade' ? 2.5 : 1.1) * dt);
      } else {
        B.toWorld(this.body, this.psi, this.phi, 0, 0, TMPW);
        const err = this.lieA + this.bedLean(inp) - this.torsoAngle(TMPW);
        const rate = this.control === 'arcade' ? 2.5 : 1.1;
        this.phi += TR.clamp(err, -rate * dt, rate * dt);
      }
      this.psi = TR.approach(this.psi, this.psiTarget, 6 * dt);

      // Satsens timing: et nyt tryk registreres; holdes knappen fra luften, er det for tidligt.
      const S = this.sats;
      S.t += dt;
      if (S.held && !inp.push) S.held = false;
      if (inp.push && !this.pushPrev && !S.held && S.pressT == null) S.pressT = S.t;
      // Står man stille (fx efter et styrt) og holder SATS, tæller det som et tryk.
      if (inp.push && S.speed < 3 && S.pressT == null) { S.held = false; S.pressT = S.t; }
      if (S.pressT != null && S.bottomT == null && this.vy >= 0) S.bottomT = S.pressT; // fra stilstand
      this.judgeSats();

      let a = -GRAV + BED.K * d - (inp.kill ? 9 : BED.C) * this.vy;
      // Et tryk er nok: når satsen er bedømt, virker den gennem hele afsættet.
      if (!inp.kill && d > 0 && this.vy >= 0 && S.q) {
        const E = 0.5 * this.vy * this.vy + 0.5 * BED.K * d * d - GRAV * d;
        const apex = Math.max(0, E) / GRAV;
        // Fra ryg eller mave kan man ikke sætte af med benene, så satsen er svagere.
        a += fx.pushAcc * S.q * (S.comp || 1) * (this.contact === 'feet' ? 1 : 0.6) * TR.clamp(1 - apex / fx.maxApex, 0, 1);
      }
      const vyPrev = this.vy;
      this.vy += a * dt;
      this.feetY += this.vy * dt;
      if (vyPrev < 0 && this.vy >= 0 && S.bottomT == null) { S.bottomT = S.t; this.judgeSats(); }
      if (this.feetY >= 0) {
        if (this.vy > 0.8) { this.y = this.feetY + this.contactOffset(); this.takeoff(); return; }
        this.feetY = 0;
        if (this.vy > 0) this.vy = 0;
      }
      this.y = this.feetY + this.contactOffset();
    }

    takeoff() {
      const fx = this.fx;
      if (this.sats.q == null && this.sats.speed >= 3) this.emit('sats', { q: 0, label: 'Ingen sats', quiet: false });
      const vmax = Math.sqrt(2 * GRAV * fx.maxApex);
      this.vy = Math.min(this.vy, vmax);
      const tilt = this.tilt();
      if (this.contact === 'feet') this.phi = tilt;
      else this.phi = TR.wrapPi(this.phi);
      this.psi = this.psiTarget;
      const sz = TR.clamp(this.vy / 7, 0.25, 1);
      this.omega = fx.rotGain * tilt * sz;
      this.L = this.body.Isom * this.omega;
      // Arkade: afsættets rotationsfart i strakt (rad/s)
      this.flightNo++;
      this.lastTakeoffV = this.vy;
      if (this.control === 'arcade') {
        // Rotationen kommer fra den udløste ladning; holdes pilen stadig, venter den til man slipper.
        this.spin0 = this.armed ? this.armed.dir * this.armed.amt * fx.arcadeGain * 0.45 * sz : 0;
        this.armed = null;
        this.omega = this.spin0 * 0.5; this.L = this.body.Isom * this.omega;
        this.glide = 0;
      } else this.spin0 = 0;
      this.vx = -Math.sin(tilt) * this.vy * fx.travel + (this.skewVx || 0);
      this.skewVx = 0;
      this.state = 'air';
      this.airT = 0;
      this.airPressAt = null;
      this.twistGoal = null; this.twistPrev = false; // holdes ↓ gennem afsættet, tæller det som et tryk
      this.apexSent = false;
      this.tracker.start(this.phi, this.psi, this.x, this.contact, tilt);
      this.prevTorso = this.torsoAngle(B.toWorld(this.body, this.psi, this.phi, 0, 0, TMPW));
      this.emit('takeoff', { vy: this.vy });
    }

    stepAir(dt, inp) {
      const fx = this.fx;
      // Skrue kan kun laves strakt eller lukket – ikke hoftebøjet: et tryk i hoftebøjet ignoreres,
      // og mens en skrue er i gang, kan man ikke gå i hoftebøjet (man forbliver strakt).
      const piked = inp.pike && !inp.tuck;
      const press = inp.twist && !this.twistPrev;
      this.twistPrev = !!inp.twist;
      if (piked && (inp.twist || this.twistGoal != null)) {
        if (this.twistGoal != null) inp = { ...inp, pike: false };
        else inp = { ...inp, twist: false };
      }
      this.airT += dt;
      if (inp.push && !this.pushPrev) this.airPressAt = this.airT;
      const shape = inp.tuck ? 'tuck' : inp.pike ? 'pike' : 'straight';
      // Hvert tryk på skrue-knappen giver en halv skrue (lægges i kø).
      if (press && !piked) {
        const base = this.twistGoal != null ? this.twistGoal : Math.round(this.psi / Math.PI) * Math.PI;
        this.twistGoal = base + Math.PI;
      }
      const twisting = this.twistGoal != null;
      const holding = !!(inp.tuck || inp.pike || inp.straight || inp.twist || twisting);
      const tg = B.shapeTarget(shape, fx.tight);
      let hand;
      if (shape === 'tuck') hand = B.legGripTarget(this.pose, 0.3);
      else if (shape === 'pike') hand = B.legGripTarget(this.pose, 0.8);
      else if (inp.twist || this.twistRate > 0.5) hand = B.HAND.twist;
      else if (this.control === 'arcade') hand = inp.straight ? B.HAND.straight : B.HAND.side;
      else hand = this.airT < 0.25 ? B.HAND.up : B.HAND.straight;
      this.approachPose(dt, tg.hip, tg.knee, hand, fx.shapeRate);
      this.body = B.solve(this.pose, this.body);

      // Salto: impulsmomentet er bevaret, så vinkelhastigheden følger positionen.
      if (this.control !== 'arcade') this.omega = this.L / this.body.Isom;
      if (this.control === 'arcade') {
        // Rotationen er givet ved afsættet. Holdes en position (strakt, hoftebøjet, lukket
        // eller skrue), roteres der med den; slippes alt, bremses der ned til en langsom rotation.
        // glide går fra 0 (lige åbnet) til 1 (glidefart) på ca. 0,4 s
        this.glide = holding ? 0 : TR.approach(this.glide || 0, 1, 2.5 * dt);
        const s0 = this.spin0 || 0;
        const target = holding
          ? s0 * Math.max(1, Math.pow(I_REF / this.body.Isom, 0.32))
          : Math.sign(s0) * Math.min(Math.abs(s0) * TR.lerp(fx.arcadeSlow, fx.arcadeGlide, this.glide),
            TR.lerp(fx.arcadeSlowMax, fx.arcadeGlideMax, this.glide));
        const faster = Math.abs(target) > Math.abs(this.omega);
        this.omega = TR.approach(this.omega, target, (faster ? 30 : fx.arcadeBrake) * dt);
        this.L = this.omega * this.body.Isom;
      } else if (inp.lean) {
        this.L += inp.lean * fx.air * I_REF * dt;
        this.omega = this.L / this.body.Isom;
      }
      const dphi = this.omega * dt;
      this.phi += dphi;

      // Skrue: kan startes i alle positioner, men går langsommere jo mere samlet kroppen er.
      const tmax = fx.twistRate * Math.pow(TW_REF / this.body.Itw, 0.6);
      if (twisting) {
        const rem = this.twistGoal - this.psi;
        this.twistRate = Math.min(TR.approach(this.twistRate, tmax, 45 * dt), Math.sqrt(2 * fx.twistStop * Math.max(0, rem)) + 0.3);
        if (rem < 0.02 || this.twistRate * dt > rem) { this.psi = this.twistGoal; this.twistRate = 0; this.twistGoal = null; }
      } else if (this.twistRate > 0) {
        const next = Math.ceil(this.psi / Math.PI - 1e-6) * Math.PI;
        const rem = next - this.psi;
        this.twistRate = Math.min(this.twistRate, tmax, Math.sqrt(2 * fx.twistStop * Math.max(0, rem)) + 0.3);
        if (rem < 0.02 || this.twistRate * dt > rem) { this.psi = next; this.twistRate = 0; }
      }
      const dpsi = this.twistRate * dt;
      this.psi += dpsi;

      const vyPrev = this.vy;
      this.vy -= GRAV * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (vyPrev > 0 && this.vy <= 0) this.emit('apex', { height: this.height });
      // Tæl rotationen efter overkroppens faktiske vinkel (også når positionen ændres).
      const ta = this.torsoAngle(B.toWorld(this.body, this.psi, this.phi, 0, 0, TMPW));
      const dTorso = TR.wrapPi(ta - this.prevTorso);
      this.prevTorso = ta;
      this.tracker.update(dTorso, dpsi, shapeCat(this.pose), dt, dphi);

      if (this.vy < 0) {
        B.toWorld(this.body, this.psi, this.phi, this.x, this.y, this.world);
        const lo = B.lowest(this.world);
        const lx = this.world[lo.idx * 3];
        const surface = Math.abs(lx) <= BED.frameHalf ? 0 : BED.floor;
        if (lo.y <= surface) this.touchdown(lo, surface);
      }
    }

    touchdown(lo, surface) {
      const W = this.world, I = B.IDX;
      const onBed = surface === 0 && Math.abs(this.x) <= BED.half - 0.05;
      const ax = (W[I.ankleL * 3] + W[I.ankleR * 3]) / 2, ay = (W[I.ankleL * 3 + 1] + W[I.ankleR * 3 + 1]) / 2;
      const legAngle = Math.atan2(W[I.hip * 3] - ax, W[I.hip * 3 + 1] - ay);
      const twistRes = Math.abs(this.psi - Math.round(this.psi / Math.PI) * Math.PI);
      const bodyAngle = -legAngle; // mod uret positiv, som phi
      // Ligger kroppen vandret? Så er det en landing på ryg eller mave.
      const ta = this.torsoAngle(W);
      const lieA = ta >= 0 ? Math.PI / 2 : -Math.PI / 2;
      const lieDev = ta - lieA;
      const faceUp = W[I.nose * 3 + 1] - W[I.head * 3 + 1] > 0;
      const headFirst = (lo.idx === I.head || lo.idx === I.neck) && W[I.head * 3 + 1] < W[I.hip * 3 + 1] - 0.2;
      const lying = !headFirst && Math.abs(lieDev) < this.fx.dropTol * 1.6;
      const kind = lying ? (faceUp ? 'back' : 'front') : 'feet';
      const tol = kind === 'feet' ? this.fx.landTol : this.fx.dropTol;
      const dev = kind === 'feet' ? bodyAngle : lieDev;
      let reason = null;
      if (!onBed) reason = surface === 0 ? 'Landede på rammen!' : 'Landede ved siden af trampolinen!';
      else if (headFirst) reason = 'Landede på hovedet';
      else if (kind !== 'feet') {
        if (Math.abs(lieDev) > tol) reason = Math.sign(lieDev) === Math.sign(this.omega) ? 'Over-roteret' : 'Under-roteret';
        else if (this.pose.knee > 1.5 || this.pose.hip > 1.9) reason = 'Landede sammenkrøllet';
        else if (twistRes > 0.7) reason = 'Skruen var ikke færdig';
      }
      else if (!lo.feet) reason = this.pose.hip > 1.2 || this.pose.knee > 1.3 ? 'Åbnede ikke i tide' : 'Landede skævt';
      else if (Math.abs(legAngle) > this.fx.skewMax) reason = Math.sign(bodyAngle) === Math.sign(this.omega) ? 'Over-roteret' : 'Under-roteret';
      else if (this.pose.hip > 1.2 || this.pose.knee > 1.3) reason = 'Åbnede ikke i tide';
      else if (twistRes > 0.7) reason = 'Skruen var ikke færdig';
      if (reason) { this.crash(reason, onBed, surface); return; }

      const skill = this.tracker.finish(kind, kind === 'feet' ? TR.wrapPi(ta) : lieDev);
      const landing = { kind, legAngle: dev, twistRes, x: this.x, hip: this.pose.hip, knee: this.pose.knee, tol, vy: this.vy };
      this.contact = kind;
      this.lieA = kind === 'feet' ? 0 : lieA;
      this.lastLanding = landing;
      const oldY = this.y;
      this.state = 'bed';
      this.feetY = Math.min(0, lo.y - surface);
      this.phi = TR.wrapPi(this.phi);
      const halfTurns = Math.round(this.psi / Math.PI);
      this.psiTarget = (((halfTurns % 2) + 2) % 2) * Math.PI;
      this.psi = this.psiTarget + (this.psi - halfTurns * Math.PI);
      this.twistRate = 0; this.twistGoal = null; this.omega = 0; this.L = 0; this.vx = 0;
      this.body = B.solve(this.pose, this.body);
      this.y = this.feetY + this.contactOffset();
      this.yCorr += oldY - this.y;
      // Et tryk lige før landingen tæller som et rigtigt tryk (med negativ tid), ikke som at holde knappen nede.
      const since = this.airT - (this.airPressAt == null ? -99 : this.airPressAt);
      const fresh = this.airPressAt != null && since <= 0.35; // også et kort tryk, der allerede er sluppet
      // Landing væk fra midten koster højde (energi): intet inden for 35 cm, op til 25 % ved kanten.
      const off = TR.clamp((Math.abs(this.x) - 0.35) / (BED.half - 0.35), 0, 1);
      if (off > 0) this.vy *= Math.sqrt(1 - 0.25 * off);
      landing.heightLoss = 0.25 * off;
      // Skæv landing (mellem tolerancen og ca. 60°): man mister højde og bliver kastet til siden.
      this.skewVx = 0;
      if (kind === 'feet' && Math.abs(legAngle) > tol) {
        const s = TR.clamp((Math.abs(legAngle) - tol) / (this.fx.skewMax - tol), 0, 1);
        const loss = 0.25 + 0.45 * s;
        this.vy *= Math.sqrt(1 - loss);
        this.skewVx = Math.sign(legAngle) * (0.8 + 2.4 * s);
        landing.skew = true;
        landing.heightLoss = 1 - (1 - landing.heightLoss) * (1 - loss);
      }
      this.newContact(-this.vy, !!this.pushPrev && !fresh);
      if (fresh) this.sats.pressT = -since;
      this.emit('land', { skill, landing, speed: -this.vy });
    }

    crash(reason, onBed, surface) {
      this.state = 'crash';
      this.crashT = 0;
      this.crashReason = reason;
      this.crashSurface = onBed || surface === 0 ? 0 : BED.floor;
      this.crashOnBed = onBed;
      this.phi = TR.wrapPi(this.phi);
      this.crashPhi = this.phi >= 0 ? Math.PI / 2 : -Math.PI / 2;
      this.twistRate = 0; this.twistGoal = null;
      this.vx *= 0.5;
      this.tracker.abort();
      this.emit('crash', { reason, onBed, x: this.x, speed: -this.vy });
    }

    stepCrash(dt) {
      this.crashT += dt;
      this.approachPose(dt, 0.4, 0.7, B.HAND.crash, 6);
      this.body = B.solve(this.pose, this.body);
      this.phi = TR.approach(this.phi, this.crashPhi, 4 * dt);
      this.psi = TR.approach(this.psi, Math.round(this.psi / Math.PI) * Math.PI, 3 * dt);
      const rest = this.crashSurface + 0.17;
      this.vy -= GRAV * dt;
      this.y += this.vy * dt;
      this.x += this.vx * dt;
      this.vx *= 1 - 2 * dt;
      if (this.y < rest) {
        this.y = rest;
        if (this.vy < 0) this.vy = this.crashOnBed && this.vy < -1.5 ? -this.vy * 0.45 : 0;
      }
      if (this.crashT > 2.0) { this.reset(); this.emit('reset', {}); }
    }

    live() { return this.state === 'air' ? this.tracker.live() : null; }
  }

  const TMPW = new Float64Array(B.N * 3);
  Athlete.shapeCat = shapeCat;
  TR.Athlete = Athlete;
  TR.GRAV = GRAV;
})(globalThis);
