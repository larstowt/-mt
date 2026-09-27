// Tegning (Neon): kamera, trampolin fra siden, 3D-projiceret springer som glødende omrids, partikler og tekster.
(function (G) {
  'use strict';
  const TR = G.TR;
  const B = TR.Body;
  const BED = TR.BED;
  const I = B.IDX;
  const WORLD_BOTTOM = -1.75;

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 1) { r *= f; g *= f; b *= f; } else { const k = f - 1; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  // Neon-farver (samme på begge baner)
  const PAL = { bg: '#05030d', haze: 'rgba(120,20,160,', grid: '#ff2bd6', frame: '#29f0ff', bed: '#ff5ce1', body: '#aefcff' };
  const STARS = [];
  for (let i = 0; i < 200; i++) {
    const r = (k) => { const x = Math.sin((i + k) * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    STARS.push({ x: -14 + 28 * r(1), y: -0.5 + 24 * r(2), s: 0.6 + 1.3 * r(3), a: 0.25 + 0.6 * r(4), p: r(5) * 6 });
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.viewH = 6.5;
      this.t = 0;
      this.shake = 0;
      this.particles = [];
      this.popups = [];
      this.floaters = [];
      this.safeBottom = 0;
      this.record = 0;
      this.boardText = '';
      this.rings = [];
      this.prevDepth = 0;
      this.off = null;
      this.resize();
      addEventListener('resize', () => this.resize());
    }

    resize() {
      const dpr = Math.min(G.devicePixelRatio || 1, 2.5);
      const r = this.canvas.getBoundingClientRect();
      this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
      this.canvas.width = Math.round(this.W * dpr);
      this.canvas.height = Math.round(this.H * dpr);
      this.dpr = dpr;
    }

    camera(athlete, dt) {
      // Zoom ud op til ca. 10 m synsfelt; hopper man højere, følger kameraet med op.
      const top = Math.max(athlete.y, 1) + 1.4;
      const need = TR.clamp(top - WORLD_BOTTOM + 0.4, 6.3, 10);
      const k = need > this.viewH ? 4 : 1.2;
      this.viewH += (need - this.viewH) * Math.min(1, k * dt);
      const W = this.W, H = this.H;
      const ppm = Math.min(H / this.viewH, W / 7.2);
      const extra = H - this.viewH * ppm;
      const bottomPad = Math.max(this.safeBottom * 0.55, extra * 0.45);
      const visible = (H - bottomPad) / ppm;
      const wantBottom = Math.max(WORLD_BOTTOM, athlete.y + 1.9 - visible);
      if (this.camBottom == null) this.camBottom = WORLD_BOTTOM;
      this.camBottom += (wantBottom - this.camBottom) * Math.min(1, (wantBottom > this.camBottom ? 8 : 5) * dt);
      const bottom = this.camBottom;
      const sx = (x) => W / 2 + x * ppm;
      const sy = (y) => H - bottomPad - (y - bottom) * ppm;
      return { W, H, ppm, sx, sy, bottom, floorY: sy(BED.floor), boardText: this.boardText };
    }

    bedProfile(x, athlete) {
      let d = athlete.bedDepth;
      let x0 = athlete.x;
      if (athlete.state === 'crash' && athlete.crashOnBed) { d = Math.max(0, 0.19 - athlete.y) * 2 + 0.05; }
      if (d <= 0) return 0;
      const u = Math.abs(x - x0) / 1.6;
      if (u >= 1) return 0;
      const edge = TR.clamp(1 - Math.pow(Math.abs(x) / BED.half, 6), 0, 1);
      return d * (0.5 + 0.5 * Math.cos(Math.PI * u)) * edge;
    }

    render(game, dt) {
      const ctx = this.ctx, a = game.athlete;
      this.t += dt;
      const cam = this.camera(a, dt);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 2.5);
        const s = this.shake * 10;
        ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }
      this.renderNeon(game, ctx, cam, a, dt);
    }

    // Timing-ring: skrumper ind mod målet og rammer det i dugens bund – dér skal man trykke SATS.
    satsRing(ctx, cam, a) {
      if (a.state === 'crash' || Math.abs(a.x) > BED.half) return;
      const t = a.satsTiming();
      if (t == null || t > 0.6 || t < -0.25) return;
      const S = a.sats;
      const cx = cam.sx(a.x), cy = cam.sy(-this.bedProfile(a.x, a) * 0.85);
      const base = 0.32 * cam.ppm;
      const ry = 0.3;
      ctx.save();
      ctx.lineWidth = Math.max(2, 0.03 * cam.ppm);
      // Målet
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(cx, cy, base, base * ry, 0, 0, Math.PI * 2); ctx.stroke();
      if (t >= 0) {
        const near = t < 0.35;
        const r = base * (1 + 3.2 * (t / 0.6));
        ctx.strokeStyle = near ? '#ffd166' : 'rgba(76,201,240,0.9)';
        ctx.globalAlpha = TR.clamp(1.3 - t / 0.6, 0.25, 1);
        ctx.lineWidth = Math.max(2, (near ? 0.05 : 0.035) * cam.ppm);
        ctx.beginPath(); ctx.ellipse(cx, cy, r, r * ry, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (S && S.q == null) {
        // Bunden er passeret uden tryk: nu er det for sent
        ctx.globalAlpha = 1 + t * 3;
        ctx.fillStyle = 'rgba(255,209,102,0.45)';
        ctx.beginPath(); ctx.ellipse(cx, cy, base, base * ry, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    floater(text, color, sub) {
      this.floaters.push({ text, color, sub: sub || '', t: 0, max: 1.1 });
      if (this.floaters.length > 2) this.floaters.shift();
    }
    drawFloaters(ctx, cam, dt) {
      if (!this.floaters.length) return;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const x = cam.W / 2 + (this.lastAthleteX || 0) * cam.ppm;
      for (const f of this.floaters) {
        f.t += dt;
        const k = f.t / f.max;
        const y = cam.sy(-0.35) + 18 + f.t * 18;
        ctx.globalAlpha = k > 0.6 ? Math.max(0, (1 - k) / 0.4) : 1;
        const fs = Math.round(Math.min(26, Math.max(15, cam.W / 45)));
        ctx.font = `900 ${fs}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,30,0.85)';
        const text = f.sub ? `${f.text} ${f.sub}` : f.text;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(text, x, y);
      }
      this.floaters = this.floaters.filter((f) => f.t < f.max);
      ctx.restore();
    }

    heightMeter(ctx, cam) {
      ctx.save();
      ctx.font = `600 ${Math.max(10, Math.min(13, 0.16 * cam.ppm))}px system-ui, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const x = Math.max(8, cam.sx(-3.4));
      for (let m = 1; m <= 16; m++) {
        const y = cam.sy(m + 1.08);
        if (y < 10) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x, y, m % 2 ? 10 : 16, 2);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,14,40,0.35)';
        ctx.strokeText(`${m} m`, x + 20, y + 1);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(`${m} m`, x + 20, y + 1);
      }
      if (this.record > 0.5) {
        const y = cam.sy(this.record + 1.08);
        ctx.strokeStyle = 'rgba(255,209,102,0.6)';
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 70, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,209,102,0.85)';
        ctx.fillText(`★ ${TR.fmt(this.record)} m`, x + 76, y);
      }
      ctx.restore();
    }

    // ================= Neon-spor =================
    // Trampolinen set lige fra siden, springeren som ét glødende omrids (uden spor).
    renderNeon(game, ctx, cam, a, dt) {
      const pal = PAL;
      if (a.bedDepth > 0.02 && this.prevDepth <= 0.02) this.rings.push({ x: a.x, t: 0, k: 1 });
      if (a.bedDepth <= 0.02 && this.prevDepth > 0.02) this.rings.push({ x: a.x, t: 0, k: 0.6 });
      this.prevDepth = a.bedDepth;
      for (const r of this.rings) r.t += dt;
      this.rings = this.rings.filter((r) => r.t < 0.6);
      if (game.arena === 'hall') return this.renderHall(game, ctx, cam, a, dt);
      this.neonBg(ctx, cam, pal);
      this.heightMeter(ctx, cam);
      this.neonTramp(ctx, cam, a, pal);
      if (!game.demo) this.satsRing(ctx, cam, a);
      this.lastAthleteX = a.x;
      this.neonAthlete(ctx, cam, a, pal);
      this.updateParticles(dt);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawParticles(ctx, cam); ctx.restore();
      this.drawFloaters(ctx, cam, dt);
      this.drawPopups(ctx, cam, dt);
    }

    neonBg(ctx, cam, pal) {
      const { W, H, ppm } = cam;
      ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
      const fy = cam.floorY, cx = cam.sx(0);
      const g = ctx.createRadialGradient(W / 2, fy, 10, W / 2, fy, W * 0.7);
      g.addColorStop(0, pal.haze + '0.35)'); g.addColorStop(1, pal.haze + '0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const par = cam.bottom * 0.6;
      for (const st of STARS) {
        const x = cam.sx(st.x * 0.8), y = cam.sy(st.y + par);
        if (y < -2 || y > fy || x < -2 || x > W + 2) continue;
        ctx.fillStyle = `rgba(200,230,255,${(st.a * (0.6 + 0.4 * Math.sin(this.t * 2 + st.x * 3))).toFixed(3)})`;
        ctx.fillRect(x, y, st.s, st.s);
      }
      if (fy < H) {
        ctx.save();
        ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.globalAlpha = 0.45;
        ctx.beginPath();
        for (let i = -14; i <= 14; i++) { ctx.moveTo(cx + i * 0.5 * ppm, fy); ctx.lineTo(cx + i * 1.6 * ppm, H); }
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const y = fy + (H - fy) * Math.pow(i / 7, 1.8);
          ctx.globalAlpha = 0.3 + 0.5 * (i / 7);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.globalAlpha = 0.9; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke();
        ctx.restore();
      }
    }

    neonTramp(ctx, cam, a, pal) {
      const ppm = cam.ppm, F = BED.floor, P = (x, y) => [cam.sx(x), cam.sy(y)];
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = pal.frame; ctx.shadowBlur = 10;
      ctx.strokeStyle = pal.frame; ctx.globalAlpha = 0.8; ctx.lineWidth = Math.max(1.5, 0.02 * ppm);
      // ben og tværstivere (samme mål som i stilforslaget)
      ctx.beginPath();
      for (const sd of [-1, 1]) {
        for (const [xa, ya, xb, yb] of [[2.42, -0.1, 2.28, F], [1.72, -0.1, 1.9, F], [2.36, F + 0.42, 1.83, F + 0.42]]) {
          const [x0, y0] = P(sd * xa, ya), [x1, y1] = P(sd * xb, yb);
          ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        }
      }
      ctx.stroke();
      // endepuder og fjedre
      for (const sd of [-1, 1]) {
        const [x0, y0] = P(sd * 2.02, 0.1), [x1, y1] = P(sd * 2.62, -0.05);
        ctx.beginPath(); ctx.roundRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0, 4); ctx.stroke();
        ctx.beginPath();
        const n = 12;
        for (let i = 0; i <= n; i++) {
          const x = sd * (BED.half + (BED.frameHalf - BED.half) * (i / n));
          const y = -0.01 + (i === 0 || i === n ? 0 : i % 2 ? 0.025 : -0.025);
          const [sx, sy] = P(x, y);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      // dugen: én glødende linje, der trykkes ned
      ctx.globalAlpha = 1; ctx.shadowColor = pal.bed; ctx.shadowBlur = 16;
      ctx.strokeStyle = pal.bed; ctx.lineWidth = Math.max(2, 0.035 * ppm);
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const x = -BED.half + (2 * BED.half * i) / 48, [sx, sy] = P(x, -this.bedProfile(x, a));
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      // ring ved landing og afsæt
      ctx.lineWidth = 2;
      for (const r of this.rings) {
        const k = r.t / 0.6, [cx, cy] = P(r.x, -0.05);
        ctx.globalAlpha = (1 - k) * r.k;
        ctx.beginPath(); ctx.ellipse(cx, cy, (0.4 + k * 2.2) * ppm, (0.08 + k * 0.25) * ppm, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    // Springeren som ét glødende omrids.
    neonAthlete(ctx, cam, a, pal) {
      const frames = [a.world];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const W of frames) for (let i = 0; i < W.length; i += 3) {
        const x = cam.sx(W[i]), y = cam.sy(W[i + 1]);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const m = 0.3 * cam.ppm + 16;
      x0 = Math.floor(x0 - m); y0 = Math.floor(y0 - m); x1 = Math.ceil(x1 + m); y1 = Math.ceil(y1 + m);
      const dpr = this.dpr, pw = Math.ceil((x1 - x0) * dpr), ph = Math.ceil((y1 - y0) * dpr);
      if (!this.off) this.off = document.createElement('canvas');
      const oc = this.off;
      if (oc.width < pw || oc.height < ph) { oc.width = Math.max(oc.width, pw); oc.height = Math.max(oc.height, ph); }
      const lw = Math.max(1.2, 0.016 * cam.ppm);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      // selve springeren med glød
      const o = this.offBegin(oc, pw, ph, x0, y0, dpr);
      this.neonSil(o, cam, a.world, pal.body, lw, true);
      ctx.globalAlpha = 1;
      if (typeof ctx.filter === 'string') {
        ctx.filter = `blur(${Math.max(2, 0.03 * cam.ppm).toFixed(1)}px)`;
        ctx.drawImage(oc, 0, 0, pw, ph, x0, y0, pw / dpr, ph / dpr);
        ctx.filter = 'none';
      }
      ctx.drawImage(oc, 0, 0, pw, ph, x0, y0, pw / dpr, ph / dpr);
      ctx.restore();
    }

    offBegin(oc, pw, ph, x0, y0, dpr) {
      const o = oc.getContext('2d');
      o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, pw, ph);
      o.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
      return o;
    }

    // Tilspidset lem (kapsel) mellem to punkter med halve bredder wa og wb (pixels)
    capPath(o, ax, ay, bx, by, wa, wb) {
      const ang = Math.atan2(by - ay, bx - ax);
      o.beginPath();
      o.arc(bx, by, wb, ang - Math.PI / 2, ang + Math.PI / 2);
      o.arc(ax, ay, wa, ang + Math.PI / 2, ang + (3 * Math.PI) / 2);
      o.closePath();
    }

    // Kroppens former (fælles for Neon og Klubhallen): tilspidsede lemmer, afrundet overkrop og hoved.
    bodyGeo(o, cam, W) {
      const ppm = cam.ppm;
      const X = (i) => cam.sx(W[i * 3]), Y = (i) => cam.sy(W[i * 3 + 1]), Z = (i) => W[i * 3 + 2];
      const cap = (p, q, wa, wb) => ({ a: [X(p), Y(p)], b: [X(q), Y(q)], w: Math.max(wa, wb) * ppm, path: () => this.capPath(o, X(p), Y(p), X(q), Y(q), wa * ppm, wb * ppm) });
      const leg = (h, k, an, t) => [cap(h, k, 0.085, 0.056), cap(k, an, 0.056, 0.036), cap(an, t, 0.034, 0.022)];
      const arm = (s, e, h) => [cap(s, e, 0.047, 0.036), cap(e, h, 0.036, 0.028)];
      // Overkroppen: afrundet form. Fra siden er den smal, forfra bred (følger skruen).
      const hx = X(I.hip), hy = Y(I.hip), sx = X(I.sh), sy = Y(I.sh);
      const dx = sx - hx, dy = sy - hy, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      const full = Math.hypot(W[I.shL * 3] - W[I.shR * 3], W[I.shL * 3 + 1] - W[I.shR * 3 + 1], W[I.shL * 3 + 2] - W[I.shR * 3 + 2]) || 1;
      const fr = Math.min(1, Math.max(0, Math.hypot(X(I.shL) - X(I.shR), Y(I.shL) - Y(I.shR)) / ppm / full));
      // stationer langs kroppen (andel af hofte→skulder) med halv bredde fra siden og forfra (m)
      const ST = [[-0.1, 0.07, 0.1], [0.0, 0.095, 0.16], [0.38, 0.085, 0.135], [0.7, 0.108, 0.17], [0.95, 0.088, 0.19], [1.08, 0.045, 0.12]];
      const L = [], R = [];
      for (const [u, side, front] of ST) {
        const w = (side + (front - side) * fr) * ppm, cx = hx + ux * u * len, cy = hy + uy * u * len;
        L.push([cx + nx * w, cy + ny * w]); R.push([cx - nx * w, cy - ny * w]);
      }
      const pts = L.concat(R.reverse());
      const torso = { a: [hx, hy], b: [sx, sy], w: 0.11 * ppm, path: () => {
        const n = pts.length;
        o.beginPath(); o.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
        for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; o.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
        o.closePath();
      } };
      const r = B.LEN.head * ppm, hd = [X(I.head), Y(I.head)];
      const head = { a: hd, b: hd, w: r, r, path: () => { o.beginPath(); o.arc(hd[0], hd[1], r, 0, Math.PI * 2); } };
      return {
        legL: leg(I.hipL, I.kneeL, I.ankleL, I.toeL), legR: leg(I.hipR, I.kneeR, I.ankleR, I.toeR),
        armL: arm(I.shL, I.elbowL, I.handL), armR: arm(I.shR, I.elbowR, I.handR),
        torso, neck: cap(I.sh, I.head, 0.045, 0.045), head,
        leftNear: Z(I.hipL) > Z(I.hipR), nearLegL: Z(I.kneeL) >= Z(I.kneeR),
        nose: [X(I.nose), Y(I.nose)], nz: W[I.nose * 3 + 2] - W[I.head * 3 + 2], u: [ux, uy],
      };
    }

    neonSil(o, cam, W, color, lw) {
      const g = this.bodyGeo(o, cam, W);
      const parts = [...g.armL, ...g.armR, ...g.legL, ...g.legR, g.torso, g.neck, g.head];
      o.lineJoin = 'round'; o.lineCap = 'round';
      // 1) alle dele med tyk streg, 2) alle dele udfyldt i sort ovenpå → kun det ydre omrids bliver tilbage
      o.strokeStyle = color; o.lineWidth = lw * 2;
      for (const p of parts) { p.path(); o.stroke(); }
      o.fillStyle = '#000';
      for (const p of parts) { p.path(); o.fill(); }
      // 3) svage indre linjer på den nære side, så man kan se ben og arme i positionerne
      o.strokeStyle = color; o.globalAlpha = 0.35; o.lineWidth = lw * 0.7;
      const nearLeg = g.nearLegL ? g.legL : g.legR;
      for (const p of [nearLeg[0], nearLeg[1]]) { p.path(); o.stroke(); }
      // armene tydeligere, så man kan se dem foran kroppen (fx i lukket skrue)
      o.globalAlpha = 0.8; o.lineWidth = lw * 0.9;
      for (const p of [...g.armL, ...g.armR]) { p.path(); o.stroke(); }
      o.globalAlpha = 1;
    }

    // ================= Klubhallen =================
    // Samme trampolin og springer som på Neon-banen, men i rigtige farver med lys og skygge.
    renderHall(game, ctx, cam, a, dt) {
      TR.Arenas.draw('hall', ctx, cam, this.t, a);
      this.heightMeter(ctx, cam);
      // skygge på gulvet
      const k = 1 / (1 + Math.max(0, a.y) * 0.4);
      ctx.fillStyle = `rgba(0,0,0,${(0.3 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(cam.sx(a.x), cam.floorY, 0.8 * cam.ppm * (0.6 + 0.4 * k), 0.07 * cam.ppm, 0, 0, Math.PI * 2); ctx.fill();
      this.hallTramp(ctx, cam, a);
      if (!game.demo) this.satsRing(ctx, cam, a);
      this.lastAthleteX = a.x;
      this.hallAthlete(ctx, cam, a.world);
      this.updateParticles(dt);
      this.drawParticles(ctx, cam);
      this.drawFloaters(ctx, cam, dt);
      this.drawPopups(ctx, cam, dt);
    }

    hallTramp(ctx, cam, a) {
      const ppm = cam.ppm, F = BED.floor, P = (x, y) => [cam.sx(x), cam.sy(y)];
      ctx.save(); ctx.lineCap = 'round';
      // stålben og tværstivere
      for (const sd of [-1, 1]) for (const [xa, ya, xb, yb] of [[2.42, -0.1, 2.28, F], [1.72, -0.1, 1.9, F], [2.36, F + 0.42, 1.83, F + 0.42]]) {
        const [x0, y0] = P(sd * xa, ya), [x1, y1] = P(sd * xb, yb);
        ctx.strokeStyle = '#5a626e'; ctx.lineWidth = 0.06 * ppm; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = 'rgba(230,238,250,.45)'; ctx.lineWidth = 0.015 * ppm; ctx.beginPath(); ctx.moveTo(x0 - 0.015 * ppm, y0); ctx.lineTo(x1 - 0.015 * ppm, y1); ctx.stroke();
      }
      // sølvfjedre
      ctx.strokeStyle = '#c3cad4'; ctx.lineWidth = Math.max(1, 0.014 * ppm); ctx.lineJoin = 'round';
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const x = sd * (BED.half + (BED.frameHalf - BED.half) * (i / 12)), y = -0.01 + (i === 0 || i === 12 ? 0 : i % 2 ? 0.025 : -0.025);
          const [sx, sy] = P(x, y); if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      // sort dug
      const n = 48, top = [];
      for (let i = 0; i <= n; i++) { const x = -BED.half + (2 * BED.half * i) / n; top.push(P(x, -this.bedProfile(x, a))); }
      ctx.beginPath(); top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let i = n; i >= 0; i--) ctx.lineTo(top[i][0], top[i][1] + 0.04 * ppm);
      ctx.closePath(); ctx.fillStyle = '#101216'; ctx.fill();
      ctx.beginPath(); top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + 1) : ctx.moveTo(x, y + 1)));
      ctx.strokeStyle = 'rgba(150,175,215,.5)'; ctx.lineWidth = Math.max(1, 0.01 * ppm); ctx.stroke();
      // blå endepuder
      for (const sd of [-1, 1]) {
        const [x0, y0] = P(sd * 2.02, 0.1), [x1, y1] = P(sd * 2.62, -0.05), x = Math.min(x0, x1), w = Math.abs(x1 - x0), h = y1 - y0;
        const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#5b9bff'); g.addColorStop(0.35, '#1f6fd1'); g.addColorStop(1, '#123f7a');
        ctx.beginPath(); ctx.roundRect(x, y0, w, h, h * 0.4); ctx.fillStyle = g; ctx.fill();
      }
      ctx.restore();
    }

    // Lem/krop med blød rund skygge (lys fra oven til venstre)
    cylFill(o, p, c, lo = 0.6, hi = 1.35) {
      const [ax, ay] = p.a, [bx, by] = p.b, mx = (ax + bx) / 2, my = (ay + by) / 2;
      let nx = -(by - ay), ny = bx - ax; const l = Math.hypot(nx, ny);
      if (l < 0.5) { nx = -0.6; ny = -0.8; } else { nx /= l; ny /= l; }
      if (nx * -0.55 + ny * -0.83 < 0) { nx = -nx; ny = -ny; }
      const g = o.createLinearGradient(mx + nx * p.w, my + ny * p.w, mx - nx * p.w, my - ny * p.w);
      g.addColorStop(0, shade(c, hi)); g.addColorStop(0.45, c); g.addColorStop(1, shade(c, lo));
      p.path(); o.fillStyle = g; o.fill();
    }

    // Herrespringer: blå trøje med guldstribe, lange hvide bukser, kort hår
    hallAthlete(o, cam, W) {
      const g = this.bodyGeo(o, cam, W);
      const SKIN = '#d99a70', SUIT = '#1b4fb3';
      const fl = g.leftNear ? g.legR : g.legL, nl = g.leftNear ? g.legL : g.legR;
      const fa = g.leftNear ? g.armR : g.armL, na = g.leftNear ? g.armL : g.armR;
      const legs = (ps, near) => { for (const p of ps) this.cylFill(o, p, near ? '#eef1f6' : '#d9dee8', 0.84, 1.08); };
      o.save();
      for (const p of fa) this.cylFill(o, p, shade(SKIN, 0.8));
      legs(fl, false);
      this.cylFill(o, g.torso, SUIT);
      // guldstribe på trøjen
      o.save(); g.torso.path(); o.clip();
      const [hx, hy] = g.torso.a, [sx, sy] = g.torso.b;
      o.strokeStyle = '#ffd166'; o.lineWidth = 0.03 * cam.ppm;
      o.beginPath(); o.moveTo(hx + (sx - hx) * 0.1 + 0.2 * cam.ppm, hy + (sy - hy) * 0.1); o.lineTo(sx - 0.2 * cam.ppm, sy); o.stroke();
      o.restore();
      this.cylFill(o, g.neck, SKIN);
      const [cx, cy] = g.head.a, r = g.head.r;
      const hg = o.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05);
      hg.addColorStop(0, shade(SKIN, 1.3)); hg.addColorStop(1, shade(SKIN, 0.7));
      g.head.path(); o.fillStyle = hg; o.fill();
      this.shortHair(o, g, SKIN);
      legs(nl, true);
      for (const p of na) this.cylFill(o, p, SKIN);
      o.restore();
    }

    // Frisure 1: kortklippet. Tegnes i hovedets eget system (x frem mod næsen, y op), enhed = hovedets radius.
    shortHair(o, g, skin) {
      const [cx, cy] = g.head.a, r = g.head.r, [ux, uy] = g.u;
      let fx = g.nose[0] - cx, fy = g.nose[1] - cy; const fl = Math.hypot(fx, fy);
      const view = fl / (r * 1.1) > 0.45 ? 'side' : g.nz > 0 ? 'front' : 'back';
      if (view === 'side') { fx /= fl; fy /= fl; } else { fx = -uy; fy = ux; }
      const P = (x, y) => [cx + (fx * x + ux * y) * r, cy + (fy * x + uy * y) * r];
      const d = Math.PI / 180;
      const [a0, a1] = view === 'side' ? [58 * d, 205 * d] : view === 'front' ? [18 * d, 162 * d] : [-25 * d, 205 * d];
      // hårgrænse fra panden, hen over øret, til nakken – håret dækker hele issen
      const ctrl = view === 'side' ? [-0.2, 0.3] : view === 'front' ? [0, 0.5] : [0, -0.75];
      const pts = [];
      for (let i = 0; i <= 24; i++) { const a = a0 + ((a1 - a0) * i) / 24; pts.push(P(Math.cos(a) * 1.05, Math.sin(a) * 1.05)); }
      const e = [Math.cos(a1) * 0.97, Math.sin(a1) * 0.97], b = [Math.cos(a0) * 0.97, Math.sin(a0) * 0.97];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12, q = 1 - t;
        pts.push(P(q * q * e[0] + 2 * t * q * ctrl[0] + t * t * b[0], q * q * e[1] + 2 * t * q * ctrl[1] + t * t * b[1]));
      }
      o.beginPath(); pts.forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y))); o.closePath();
      o.fillStyle = '#3a2718'; o.fill();
      // øjne og øre
      o.fillStyle = '#1b1b1b';
      const eye = (x, y) => { const [ex, ey] = P(x, y); o.beginPath(); o.arc(ex, ey, Math.max(1, r * 0.1), 0, Math.PI * 2); o.fill(); };
      if (view === 'side' && g.nz > -0.09) eye(0.55, 0.12);
      if (view === 'front') { eye(0.35, 0.1); eye(-0.35, 0.1); }
      if (view === 'side') { const [qx, qy] = P(-0.12, 0.02); o.fillStyle = shade(skin, 0.8); o.beginPath(); o.ellipse(qx, qy, r * 0.12, r * 0.17, Math.atan2(uy, ux), 0, Math.PI * 2); o.fill(); }
    }

    // ---------- Effekter ----------
    burst(x, y, n, opts = {}) {
      for (let i = 0; i < n; i++) {
        const ang = opts.up ? Math.PI / 2 + (Math.random() - 0.5) * 2.4 : Math.random() * Math.PI * 2;
        const sp = (opts.speed || 2) * (0.4 + Math.random());
        this.particles.push({
          x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0,
          max: (opts.life || 0.8) * (0.6 + Math.random() * 0.8), size: (opts.size || 0.04) * (0.5 + Math.random()),
          color: opts.colors ? opts.colors[i % opts.colors.length] : opts.color || '#ffffff', g: opts.g == null ? 6 : opts.g, kind: opts.kind || 'dot', rot: Math.random() * 6,
        });
      }
    }
    updateParticles(dt) {
      for (const p of this.particles) { p.life += dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.5 * dt; p.rot += dt * 8; }
      this.particles = this.particles.filter((p) => p.life < p.max);
    }
    drawParticles(ctx, cam) {
      for (const p of this.particles) {
        const a = 1 - p.life / p.max;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        const x = cam.sx(p.x), y = cam.sy(p.y), s = Math.max(1, p.size * cam.ppm);
        if (p.kind === 'star') {
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
          ctx.beginPath();
          for (let k = 0; k < 10; k++) { const r = k % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos((k * Math.PI) / 5) * r, Math.sin((k * Math.PI) / 5) * r); }
          ctx.closePath(); ctx.fill(); ctx.restore();
        } else if (p.kind === 'confetti') {
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.fillRect(-s, -s * 0.4, s * 2, s * 0.8); ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    popup(text, opts = {}) {
      if (this.popups.length > 4) this.popups.shift();
      this.popups.push({ text, sub: opts.sub || '', color: opts.color || '#ffffff', size: opts.size || 1, t: 0, max: opts.max || 1.8, yy: null });
    }
    drawPopups(ctx, cam, dt) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let cursor = cam.H * 0.24;
      const base = Math.min(40, Math.max(20, cam.W / 24));
      for (const p of this.popups) {
        p.t += dt;
        const fs0 = Math.round(base * p.size);
        const target = cursor;
        cursor += fs0 * (p.sub ? 1.95 : 1.3);
        p.yy = p.yy == null ? target : p.yy + (target - p.yy) * Math.min(1, dt * 10);
        const k = p.t / p.max;
        const a = k < 0.1 ? k / 0.1 : k > 0.7 ? (1 - k) / 0.3 : 1;
        const pop = k < 0.12 ? 0.7 + 0.3 * (k / 0.12) + 0.1 * Math.sin(k * 26) : 1;
        const x = cam.W / 2, y = p.yy - p.t * 12;
        const fs = Math.round(fs0 * pop);
        ctx.globalAlpha = Math.max(0, a);
        ctx.font = `900 ${fs}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
        ctx.lineWidth = Math.max(3, fs / 7);
        ctx.strokeStyle = 'rgba(10,12,30,0.85)';
        ctx.strokeText(p.text, x, y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, x, y);
        if (p.sub) {
          ctx.font = `700 ${Math.round(fs * 0.5)}px system-ui, sans-serif`;
          ctx.lineWidth = 3;
          ctx.strokeText(p.sub, x, y + fs * 0.75);
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.fillText(p.sub, x, y + fs * 0.75);
        }
      }
      this.popups = this.popups.filter((p) => p.t < p.max);
      ctx.restore();
    }
  }

  TR.Renderer = Renderer;
})(globalThis);
