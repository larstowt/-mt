// Tegning: kamera, trampolin i let perspektiv, 3D-projiceret springer, partikler og tekster.
(function (G) {
  'use strict';
  const TR = G.TR;
  const B = TR.Body;
  const BED = TR.BED;
  const I = B.IDX;
  const DY = 0.17; // hvor meget dybde (ind i skærmen) løfter tingene på skærmen
  const WORLD_BOTTOM = -1.75;

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 1) { r *= f; g *= f; b *= f; } else { const k = f - 1; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  // Neon-spor: farver pr. bane
  const NEON = {
    hall: { bg: '#05030d', haze: 'rgba(120,20,160,', grid: '#ff2bd6', frame: '#29f0ff', bed: '#ff5ce1', body: '#aefcff', sign: 'TRAMPOLIN' },
    sunset: { bg: '#0d0408', haze: 'rgba(210,70,40,', grid: '#ff7a2b', frame: '#ffd166', bed: '#ff4f7a', body: '#ffe9c7', sign: 'SOLNEDGANG' },
    aurora: { bg: '#020a0c', haze: 'rgba(20,170,130,', grid: '#2bffb4', frame: '#4cc9f0', bed: '#7cff6b', body: '#d4fff0', sign: 'NORDLYS' },
    final: { bg: '#0a0508', haze: 'rgba(210,30,60,', grid: '#ff2b4a', frame: '#ffd166', bed: '#ff2b4a', body: '#fff4d6', sign: 'FINALE' },
  };
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
      this.trail = [];
      this.trailTimer = 0;
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
      if (!game.save || game.save.gfx !== 'classic') return this.renderNeon(game, ctx, cam, a, dt);
      TR.Arenas.draw(game.arena, ctx, cam, this.t, a);
      this.heightMeter(ctx, cam);
      this.trampolineBack(ctx, cam, a, game.arena);
      this.shadow(ctx, cam, a);
      if (!game.demo) this.satsRing(ctx, cam, a);
      this.lastAthleteX = a.x;
      this.updateTrail(a, dt);
      this.drawTrail(ctx, cam, game.look);
      this.drawAthlete(ctx, cam, a.world, game.look, 1);
      this.trampolineFront(ctx, cam, a, game.arena);
      this.updateParticles(dt);
      this.drawParticles(ctx, cam);
      this.drawFloaters(ctx, cam, dt);
      this.drawPopups(ctx, cam, dt);
      this.vignette(ctx, cam);
    }

    // ---------- Trampolin ----------
    edgeY(cam, a, x, side) {
      const f = this.bedProfile(x, a);
      return side > 0 ? cam.sy(BED.width * DY - 0.25 * f) : cam.sy(-BED.width * DY - 0.35 * f);
    }

    trampolineBack(ctx, cam, a, arena) {
      const pad = TR.Arenas.pad(arena);
      const fh = BED.frameHalf, fz = BED.frameWidth * DY;
      // Bageste ben
      ctx.fillStyle = '#5b6474';
      for (const x of [-2.3, 0, 2.3]) {
        ctx.fillRect(cam.sx(x) - 0.035 * cam.ppm, cam.sy(fz), 0.07 * cam.ppm, cam.sy(BED.floor + fz) - cam.sy(fz));
      }
      // Bageste rammepude
      ctx.fillStyle = shade(pad, 0.75);
      ctx.fillRect(cam.sx(-fh), cam.sy(fz + 0.07), cam.sx(fh) - cam.sx(-fh), 0.09 * cam.ppm);
      // Bageste fjedre
      ctx.strokeStyle = '#9aa3b2';
      ctx.lineWidth = Math.max(1, 0.018 * cam.ppm);
      for (let x = -BED.half + 0.1; x <= BED.half - 0.05; x += 0.19) {
        const y0 = cam.sy(fz), y1 = this.edgeY(cam, a, x, 1);
        this.spring(ctx, cam.sx(x), y0, cam.sx(x), y1, 3, 0.025 * cam.ppm);
      }
      // Dugen
      const n = 48;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const x = -BED.half + (2 * BED.half * i) / n;
        const y = this.edgeY(cam, a, x, 1);
        if (i === 0) ctx.moveTo(cam.sx(x), y); else ctx.lineTo(cam.sx(x), y);
      }
      for (let i = n; i >= 0; i--) {
        const x = -BED.half + (2 * BED.half * i) / n;
        ctx.lineTo(cam.sx(x), this.edgeY(cam, a, x, -1));
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, cam.sy(BED.width * DY), 0, cam.sy(-BED.width * DY));
      g.addColorStop(0, '#15171d'); g.addColorStop(0.5, '#262a33'); g.addColorStop(1, '#1b1e25');
      ctx.fillStyle = g;
      ctx.fill();
      // Skin og mærker (rødt kryds + zonestreger som på en konkurrencetrampolin)
      ctx.save();
      ctx.clip();
      const d = a.bedDepth;
      if (d > 0.02) {
        const cx = cam.sx(a.x), cy = cam.sy(-d * 0.8);
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1.5 * cam.ppm);
        rg.addColorStop(0, `rgba(0,0,0,${Math.min(0.45, d)})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(cx - 2 * cam.ppm, cy - 2 * cam.ppm, 4 * cam.ppm, 4 * cam.ppm);
      }
      ctx.strokeStyle = 'rgba(214,40,57,0.8)';
      ctx.lineWidth = Math.max(1, 0.03 * cam.ppm);
      const mid = (x) => (this.edgeY(cam, a, x, 1) + this.edgeY(cam, a, x, -1)) / 2;
      const cross = (x) => { const y = mid(x); ctx.beginPath(); ctx.moveTo(cam.sx(x - 0.3), y); ctx.lineTo(cam.sx(x + 0.3), y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cam.sx(x), this.edgeY(cam, a, x, 1) + 0.02 * cam.ppm); ctx.lineTo(cam.sx(x), this.edgeY(cam, a, x, -1) - 0.02 * cam.ppm); ctx.stroke(); };
      cross(0);
      ctx.strokeStyle = 'rgba(214,40,57,0.45)';
      for (const zx of [-1.1, 1.1]) {
        ctx.beginPath(); ctx.moveTo(cam.sx(zx), this.edgeY(cam, a, zx, 1)); ctx.lineTo(cam.sx(zx), this.edgeY(cam, a, zx, -1)); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(cam.sx(-BED.half), this.edgeY(cam, a, -BED.half, 1), 2 * BED.half * cam.ppm, 0.04 * cam.ppm);
      ctx.restore();
      // Endefjedre
      ctx.strokeStyle = '#aab3c2';
      for (const s of [-1, 1]) {
        for (let k = -2; k <= 2; k++) {
          const yy = cam.sy(k * 0.07);
          this.spring(ctx, cam.sx(s * BED.half), yy, cam.sx(s * (fh - 0.1)), yy, 4, 0.02 * cam.ppm);
        }
        // Endepude
        ctx.fillStyle = shade(pad, 0.85);
        ctx.beginPath();
        ctx.moveTo(cam.sx(s * (fh - 0.12)), cam.sy(fz + 0.07));
        ctx.lineTo(cam.sx(s * fh), cam.sy(fz + 0.07));
        ctx.lineTo(cam.sx(s * fh), cam.sy(-fz - 0.05));
        ctx.lineTo(cam.sx(s * (fh - 0.12)), cam.sy(-fz - 0.05));
        ctx.closePath(); ctx.fill();
      }
    }

    trampolineFront(ctx, cam, a, arena) {
      const pad = TR.Arenas.pad(arena);
      const fh = BED.frameHalf, fz = -BED.frameWidth * DY;
      // Dugens underside/skygge under forkanten (skjuler fødderne når dugen trykkes ned)
      ctx.beginPath();
      const n = 48;
      for (let i = 0; i <= n; i++) {
        const x = -BED.half + (2 * BED.half * i) / n;
        const y = this.edgeY(cam, a, x, -1);
        if (i === 0) ctx.moveTo(cam.sx(x), y); else ctx.lineTo(cam.sx(x), y);
      }
      ctx.lineTo(cam.sx(BED.half), cam.sy(fz) + 2);
      ctx.lineTo(cam.sx(-BED.half), cam.sy(fz) + 2);
      ctx.closePath();
      const sg = ctx.createLinearGradient(0, cam.sy(-BED.width * DY), 0, cam.sy(fz));
      sg.addColorStop(0, '#0c0e13'); sg.addColorStop(1, '#1d2029');
      ctx.fillStyle = sg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const x = -BED.half + (2 * BED.half * i) / n;
        const y = this.edgeY(cam, a, x, -1);
        if (i === 0) ctx.moveTo(cam.sx(x), y); else ctx.lineTo(cam.sx(x), y);
      }
      ctx.stroke();
      ctx.strokeStyle = '#b8c0cc';
      ctx.lineWidth = Math.max(1, 0.02 * cam.ppm);
      for (let x = -BED.half + 0.1; x <= BED.half - 0.05; x += 0.19) {
        this.spring(ctx, cam.sx(x), this.edgeY(cam, a, x, -1), cam.sx(x), cam.sy(fz), 3, 0.03 * cam.ppm);
      }
      // Forreste ben (A-ben)
      ctx.fillStyle = '#737d8f';
      for (const x of [-2.3, 2.3]) {
        ctx.beginPath();
        ctx.moveTo(cam.sx(x) - 0.04 * cam.ppm, cam.sy(fz));
        ctx.lineTo(cam.sx(x) + 0.04 * cam.ppm, cam.sy(fz));
        ctx.lineTo(cam.sx(x + Math.sign(x) * 0.25) + 0.04 * cam.ppm, cam.sy(BED.floor + fz * 0.3));
        ctx.lineTo(cam.sx(x + Math.sign(x) * 0.25) - 0.04 * cam.ppm, cam.sy(BED.floor + fz * 0.3));
        ctx.closePath(); ctx.fill();
      }
      ctx.fillRect(cam.sx(-2.3), cam.sy(BED.floor + 0.35), 4.6 * cam.ppm, 0.05 * cam.ppm);
      // Forreste rammepude
      const top = cam.sy(fz + 0.02), h = 0.16 * cam.ppm;
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, shade(pad, 1.35)); g.addColorStop(0.25, pad); g.addColorStop(1, shade(pad, 0.6));
      ctx.fillStyle = g;
      this.roundRect(ctx, cam.sx(-fh), top, cam.sx(fh) - cam.sx(-fh), h, 0.05 * cam.ppm);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `800 ${Math.max(7, 0.09 * cam.ppm)}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TRAMPOLIN', cam.sx(0), top + h * 0.55);
    }

    spring(ctx, x0, y0, x1, y1, coils, amp) {
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const segs = coils * 2;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      for (let i = 1; i < segs; i++) {
        const u = i / segs, s = i % 2 ? 1 : -1;
        ctx.lineTo(x0 + dx * u + nx * amp * s, y0 + dy * u + ny * amp * s);
      }
      ctx.lineTo(x1, y1); ctx.stroke();
    }

    roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    }

    shadow(ctx, cam, a) {
      if (Math.abs(a.x) > BED.half) return;
      const h = Math.max(0, a.y - 1);
      const k = 1 / (1 + h * 0.5);
      const y = cam.sy(-this.bedProfile(a.x, a) * 0.85);
      ctx.fillStyle = `rgba(0,0,0,${0.35 * k})`;
      ctx.beginPath();
      ctx.ellipse(cam.sx(a.x), y, 0.45 * cam.ppm * (0.6 + 0.4 * k), 0.08 * cam.ppm, 0, 0, Math.PI * 2);
      ctx.fill();
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

    vignette(ctx, cam) {
      const g = ctx.createRadialGradient(cam.W / 2, cam.H / 2, Math.min(cam.W, cam.H) * 0.35, cam.W / 2, cam.H / 2, Math.max(cam.W, cam.H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cam.W, cam.H);
    }

    // ---------- Springeren ----------
    drawAthlete(ctx, cam, W, look, alpha) {
      const px = (i) => cam.sx(W[i * 3]);
      const py = (i) => cam.sy(W[i * 3 + 1]);
      const pz = (i) => W[i * 3 + 2];
      const ppm = cam.ppm;
      const legs = look.legs || '#f3f4f8';
      const items = [];
      const seg = (a, b, w, color, outline) => items.push({ z: (pz(a) + pz(b)) / 2, draw: () => this.capsule(ctx, px(a), py(a), px(b), py(b), w * ppm, color, pz(a) + pz(b), outline) });
      seg(I.hipL, I.kneeL, 0.17, legs); seg(I.kneeL, I.ankleL, 0.12, legs); seg(I.ankleL, I.toeL, 0.075, '#ffffff');
      seg(I.hipR, I.kneeR, 0.17, legs); seg(I.kneeR, I.ankleR, 0.12, legs); seg(I.ankleR, I.toeR, 0.075, '#ffffff');
      seg(I.shL, I.elbowL, 0.095, look.skin); seg(I.elbowL, I.handL, 0.08, look.skin);
      seg(I.shR, I.elbowR, 0.095, look.skin); seg(I.elbowR, I.handR, 0.08, look.skin);
      items.push({ z: 0, draw: () => this.torso(ctx, cam, W, look) });
      items.push({ z: 0.01, draw: () => this.head(ctx, cam, W, look) });
      items.sort((p, q) => p.z - q.z);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const it of items) it.draw();
      ctx.restore();
    }

    capsule(ctx, x0, y0, x1, y1, w, color, z) {
      const f = 0.82 + 0.3 * TR.clamp(z / 0.5 + 0.5, 0, 1);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = w + 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = shade(color, Math.min(1.1, f));
      ctx.lineWidth = w;
      ctx.stroke();
      // Højlys (lys fra oven til venstre)
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = w * 0.35;
      ctx.beginPath(); ctx.moveTo(x0 - w * 0.15, y0 - w * 0.18); ctx.lineTo(x1 - w * 0.15, y1 - w * 0.18); ctx.stroke();
    }

    torso(ctx, cam, W, look) {
      const ppm = cam.ppm;
      const hx = cam.sx(W[I.hip * 3]), hy = cam.sy(W[I.hip * 3 + 1]);
      const sx = cam.sx(W[I.sh * 3]), sy = cam.sy(W[I.sh * 3 + 1]);
      const sep = Math.abs(cam.sx(W[I.shL * 3]) - cam.sx(W[I.shR * 3])) + Math.abs(cam.sy(W[I.shL * 3 + 1]) - cam.sy(W[I.shR * 3 + 1]));
      const hsep = Math.abs(cam.sx(W[I.hipL * 3]) - cam.sx(W[I.hipR * 3])) + Math.abs(cam.sy(W[I.hipL * 3 + 1]) - cam.sy(W[I.hipR * 3 + 1]));
      const wS = Math.max(0.26 * ppm, sep + 0.1 * ppm) / 2, wH = Math.max(0.24 * ppm, hsep + 0.12 * ppm) / 2;
      const dx = sx - hx, dy = sy - hy, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(hx + nx * wH, hy + ny * wH);
        ctx.lineTo(sx + nx * wS, sy + ny * wS);
        ctx.lineTo(sx - nx * wS, sy - ny * wS);
        ctx.lineTo(hx - nx * wH, hy - ny * wH);
        ctx.closePath();
      };
      path();
      ctx.lineWidth = 0.1 * ppm + 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
      const g = ctx.createLinearGradient(hx + nx * wH, hy + ny * wH, hx - nx * wH, hy - ny * wH);
      g.addColorStop(0, shade(look.suit, 1.25)); g.addColorStop(0.5, look.suit); g.addColorStop(1, shade(look.suit, 0.65));
      ctx.fillStyle = g;
      ctx.strokeStyle = g;
      ctx.lineWidth = 0.1 * ppm;
      path(); ctx.fill(); ctx.stroke();
      // Stribe på dragten
      ctx.strokeStyle = look.accent;
      ctx.lineWidth = Math.max(1.5, 0.035 * ppm);
      ctx.beginPath();
      ctx.moveTo(hx + dx * 0.55 + nx * wS * 0.9, hy + dy * 0.55 + ny * wS * 0.9);
      ctx.lineTo(hx + dx * 0.75 - nx * wS * 0.9, hy + dy * 0.75 - ny * wS * 0.9);
      ctx.stroke();
      // Hofte/bukselinning
      ctx.strokeStyle = shade(look.legs || '#f3f4f8', 0.8);
      ctx.lineWidth = Math.max(1.5, 0.05 * ppm);
      ctx.beginPath(); ctx.moveTo(hx + nx * wH, hy + ny * wH); ctx.lineTo(hx - nx * wH, hy - ny * wH); ctx.stroke();
      // Hals
      const nkx = cam.sx(W[I.neck * 3]), nky = cam.sy(W[I.neck * 3 + 1]);
      ctx.strokeStyle = look.skin; ctx.lineWidth = 0.08 * ppm;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(nkx, nky); ctx.stroke();
    }

    head(ctx, cam, W, look) {
      const ppm = cam.ppm;
      const x = cam.sx(W[I.head * 3]), y = cam.sy(W[I.head * 3 + 1]);
      const nx = cam.sx(W[I.nose * 3]) - x, ny = cam.sy(W[I.nose * 3 + 1]) - y, nz = W[I.nose * 3 + 2] - W[I.head * 3 + 2];
      const r = B.LEN.head * ppm;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, shade(look.skin, 1.2)); g.addColorStop(1, shade(look.skin, 0.8));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      // Hår på baghovedet
      const nl = Math.hypot(nx, ny) || 1;
      const ux = nx / nl, uy = ny / nl;
      const away = nz < -0.09;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = look.hair;
      if (away) { ctx.fillRect(x - r, y - r, 2 * r, 2 * r); }
      else {
        const side = nz > 0.09 ? 0.2 : 0.55;
        ctx.beginPath(); ctx.arc(x - ux * r * side * 1.4, y - uy * r * side * 1.4 - r * 0.25, r * 1.05, 0, Math.PI * 2); ctx.fill();
        // Øje
        ctx.fillStyle = '#1b1b1b';
        const ex = x + ux * r * 0.55, ey = y + uy * r * 0.55 - r * 0.12;
        ctx.beginPath(); ctx.arc(ex, ey, Math.max(1, r * 0.1), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ================= Neon-spor =================
    renderNeon(game, ctx, cam, a, dt) {
      const pal = NEON[game.arena] || NEON.hall;
      // Ringe i dugen ved landing og afsæt
      if (a.bedDepth > 0.02 && this.prevDepth <= 0.02) this.rings.push({ x: a.x, t: 0, k: 1 });
      if (a.bedDepth <= 0.02 && this.prevDepth > 0.02) this.rings.push({ x: a.x, t: 0, k: 0.6 });
      this.prevDepth = a.bedDepth;
      for (const r of this.rings) r.t += dt;
      this.rings = this.rings.filter((r) => r.t < 0.6);

      this.neonBg(ctx, cam, pal, game.arena === 'final' ? cam.boardText || pal.sign : pal.sign);
      this.heightMeter(ctx, cam);
      this.neonTrampBack(ctx, cam, a, pal);
      this.neonShadow(ctx, cam, a, pal);
      if (!game.demo) this.satsRing(ctx, cam, a);
      this.lastAthleteX = a.x;
      this.updateTrail(a, dt);
      this.neonAthlete(ctx, cam, a, pal);
      this.neonTrampFront(ctx, cam, a, pal);
      this.updateParticles(dt);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawParticles(ctx, cam); ctx.restore();
      this.drawFloaters(ctx, cam, dt);
      this.drawPopups(ctx, cam, dt);
      this.vignette(ctx, cam);
    }

    neonBg(ctx, cam, pal, sign) {
      const { W, H, ppm } = cam;
      ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
      const fy = cam.floorY, cx = cam.sx(0);
      const g = ctx.createRadialGradient(cx, fy, 10, cx, fy, Math.max(W, H) * 0.75);
      g.addColorStop(0, pal.haze + '0.38)'); g.addColorStop(1, pal.haze + '0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // Stjerner med parallakse
      const par = cam.bottom * 0.55;
      for (const st of STARS) {
        const x = cam.sx(st.x * 0.8), y = cam.sy(st.y + 1.5 + par);
        if (y < -2 || y > fy || x < -2 || x > W + 2) continue;
        ctx.globalAlpha = st.a * (0.65 + 0.35 * Math.sin(this.t * 1.7 + st.p));
        ctx.fillStyle = '#dbeaff'; ctx.fillRect(x, y, st.s, st.s);
      }
      ctx.globalAlpha = 1;
      // Neonskilt i baggrunden
      const sy = cam.sy(8.2 + cam.bottom * 0.4);
      if (sy > -40 && sy < fy) {
        ctx.save();
        const fs = Math.max(18, 0.62 * ppm);
        ctx.font = `800 ${fs}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(1.5, fs / 22); ctx.strokeStyle = pal.grid;
        ctx.shadowColor = pal.grid; ctx.shadowBlur = fs / 2.5; ctx.globalAlpha = 0.55;
        ctx.strokeText(sign, cx, sy);
        ctx.restore();
      }
      // Perspektivgulv
      if (fy < H) {
        ctx.save();
        ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
        ctx.beginPath();
        for (let i = -18; i <= 18; i++) { ctx.moveTo(cx + i * 0.55 * ppm, fy); ctx.lineTo(cx + i * 1.9 * ppm, H + 2 * ppm); }
        ctx.stroke();
        for (let i = 1; i <= 8; i++) {
          const y = fy + (H - fy + ppm) * Math.pow(i / 8, 1.8);
          ctx.globalAlpha = 0.2 + 0.4 * (i / 8);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.globalAlpha = 0.9; ctx.lineWidth = 2; ctx.shadowColor = pal.grid; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke();
        ctx.restore();
      }
    }

    glowLine(ctx, color, width, blur, fn) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.shadowColor = color; ctx.shadowBlur = blur;
      ctx.beginPath(); fn(); ctx.stroke();
    }

    bedEdgePath(ctx, cam, a, side) {
      const n = 48;
      for (let i = 0; i <= n; i++) {
        const x = -BED.half + (2 * BED.half * i) / n, y = this.edgeY(cam, a, x, side);
        if (i === 0) ctx.moveTo(cam.sx(x), y); else ctx.lineTo(cam.sx(x), y);
      }
    }

    neonTrampBack(ctx, cam, a, pal) {
      const ppm = cam.ppm, fh = BED.frameHalf, fz = BED.frameWidth * DY;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.5;
      this.glowLine(ctx, pal.frame, Math.max(1, 0.02 * ppm), 6, () => {
        for (const x of [-2.3, 0, 2.3]) { ctx.moveTo(cam.sx(x), cam.sy(fz)); ctx.lineTo(cam.sx(x), cam.sy(BED.floor + fz)); }
      });
      this.glowLine(ctx, pal.frame, Math.max(1.5, 0.03 * ppm), 8, () => { ctx.moveTo(cam.sx(-fh), cam.sy(fz + 0.03)); ctx.lineTo(cam.sx(fh), cam.sy(fz + 0.03)); });
      // bageste fjedre (hver anden)
      ctx.globalAlpha = 0.35; ctx.shadowBlur = 0; ctx.strokeStyle = pal.frame; ctx.lineWidth = 1;
      for (let x = -BED.half + 0.1; x <= BED.half - 0.05; x += 0.38) this.spring(ctx, cam.sx(x), cam.sy(fz), cam.sx(x), this.edgeY(cam, a, x, 1), 3, 0.025 * ppm);
      ctx.globalAlpha = 1;
      // dugen: mørk flade med glødende bagkant
      ctx.beginPath();
      this.bedEdgePath(ctx, cam, a, 1);
      for (let i = 48; i >= 0; i--) { const x = -BED.half + (2 * BED.half * i) / 48; ctx.lineTo(cam.sx(x), this.edgeY(cam, a, x, -1)); }
      ctx.closePath();
      ctx.fillStyle = pal.bg; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.save(); ctx.clip();
      ctx.strokeStyle = pal.bed; ctx.globalAlpha = 0.12; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -BED.half + 0.27; x < BED.half; x += 0.27) { ctx.moveTo(cam.sx(x), this.edgeY(cam, a, x, 1)); ctx.lineTo(cam.sx(x), this.edgeY(cam, a, x, -1)); }
      ctx.stroke();
      ctx.globalAlpha = 0.6; ctx.lineWidth = Math.max(1, 0.025 * ppm);
      const my = (this.edgeY(cam, a, 0, 1) + this.edgeY(cam, a, 0, -1)) / 2;
      ctx.beginPath(); ctx.moveTo(cam.sx(-0.3), my); ctx.lineTo(cam.sx(0.3), my); ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 0.8;
      this.glowLine(ctx, pal.bed, Math.max(1.5, 0.022 * ppm), 10, () => this.bedEdgePath(ctx, cam, a, 1));
      // endefjedre og endepuder
      ctx.globalAlpha = 0.5; ctx.shadowBlur = 0; ctx.strokeStyle = pal.frame; ctx.lineWidth = 1;
      for (const sd of [-1, 1]) for (let k = -2; k <= 2; k += 2) { const yy = cam.sy(k * 0.07); this.spring(ctx, cam.sx(sd * BED.half), yy, cam.sx(sd * (fh - 0.1)), yy, 4, 0.02 * ppm); }
      ctx.globalAlpha = 0.9;
      for (const sd of [-1, 1]) {
        this.glowLine(ctx, pal.frame, Math.max(1.5, 0.025 * ppm), 8, () => {
          const x0 = cam.sx(sd * (fh - 0.12)), x1 = cam.sx(sd * fh);
          ctx.rect(Math.min(x0, x1), cam.sy(fz + 0.07), Math.abs(x1 - x0), cam.sy(-fz - 0.05) - cam.sy(fz + 0.07));
        });
      }
      ctx.restore();
    }

    neonTrampFront(ctx, cam, a, pal) {
      const ppm = cam.ppm, fh = BED.frameHalf, fz = -BED.frameWidth * DY;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // dugens underside skjuler fødderne, når dugen trykkes ned
      ctx.beginPath();
      this.bedEdgePath(ctx, cam, a, -1);
      ctx.lineTo(cam.sx(BED.half), cam.sy(fz) + 2); ctx.lineTo(cam.sx(-BED.half), cam.sy(fz) + 2);
      ctx.closePath(); ctx.fillStyle = pal.bg; ctx.fill();
      this.glowLine(ctx, pal.bed, Math.max(2, 0.035 * ppm), 16, () => this.bedEdgePath(ctx, cam, a, -1));
      ctx.globalAlpha = 0.45; ctx.shadowBlur = 0; ctx.strokeStyle = pal.frame; ctx.lineWidth = 1;
      for (let x = -BED.half + 0.1; x <= BED.half - 0.05; x += 0.38) this.spring(ctx, cam.sx(x), this.edgeY(cam, a, x, -1), cam.sx(x), cam.sy(fz), 3, 0.03 * ppm);
      ctx.globalAlpha = 0.85;
      this.glowLine(ctx, pal.frame, Math.max(1.5, 0.025 * ppm), 8, () => {
        for (const x of [-2.3, 2.3]) { ctx.moveTo(cam.sx(x), cam.sy(fz)); ctx.lineTo(cam.sx(x + Math.sign(x) * 0.25), cam.sy(BED.floor + fz * 0.3)); }
        ctx.moveTo(cam.sx(-2.3), cam.sy(BED.floor + 0.37)); ctx.lineTo(cam.sx(2.3), cam.sy(BED.floor + 0.37));
      });
      ctx.globalAlpha = 1;
      const top = cam.sy(fz + 0.02), h = 0.16 * ppm;
      this.roundRect(ctx, cam.sx(-fh), top, cam.sx(fh) - cam.sx(-fh), h, 0.05 * ppm);
      ctx.fillStyle = pal.bg; ctx.fill();
      ctx.strokeStyle = pal.frame; ctx.lineWidth = Math.max(1.5, 0.028 * ppm); ctx.shadowColor = pal.frame; ctx.shadowBlur = 12; ctx.stroke();
      // ringe
      ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = pal.bed; ctx.shadowBlur = 10; ctx.strokeStyle = pal.bed; ctx.lineWidth = 2;
      for (const r of this.rings) {
        const k = r.t / 0.6, rx = (0.35 + k * 2.2) * ppm;
        ctx.globalAlpha = (1 - k) * r.k;
        ctx.beginPath(); ctx.ellipse(cam.sx(r.x), cam.sy(-0.05), rx, rx * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    neonShadow(ctx, cam, a, pal) {
      if (Math.abs(a.x) > BED.half) return;
      const h = Math.max(0, a.y - 1), k = 1 / (1 + h * 0.4);
      const x = cam.sx(a.x), y = cam.sy(-this.bedProfile(a.x, a) * 0.85), r = 0.6 * cam.ppm * (0.6 + 0.4 * k);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, pal.haze + (0.55 * k).toFixed(3) + ')'); g.addColorStop(1, pal.haze + '0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.25, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    // Springeren som ét glødende omrids. Spor fra tidligere billeder tegnes først og dækkes af de nyere.
    neonAthlete(ctx, cam, a, pal) {
      const frames = this.trail.concat([a.world]);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const W of frames) for (let i = 0; i < W.length; i += 3) {
        const x = cam.sx(W[i]), y = cam.sy(W[i + 1]);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const m = 0.4 * cam.ppm + 12;
      x0 = Math.floor(x0 - m); y0 = Math.floor(y0 - m); x1 = Math.ceil(x1 + m); y1 = Math.ceil(y1 + m);
      const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0), dpr = this.dpr;
      if (!this.off) this.off = document.createElement('canvas');
      const oc = this.off, pw = Math.ceil(bw * dpr), ph = Math.ceil(bh * dpr);
      if (oc.width < pw || oc.height < ph) { oc.width = Math.max(oc.width, pw); oc.height = Math.max(oc.height, ph); }
      const o = oc.getContext('2d');
      o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, pw, ph);
      o.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
      const lw = Math.max(1.2, 0.02 * cam.ppm), n = frames.length;
      frames.forEach((W, k) => {
        const main = k === n - 1;
        const q = (k + 1) / n;
        this.neonSil(o, cam, W, main ? pal.body : pal.bed, lw, main ? 1 : 0.18 + 0.35 * q, main);
      });
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (typeof ctx.filter === 'string') {
        ctx.filter = `blur(${Math.max(2, 0.035 * cam.ppm).toFixed(1)}px)`;
        ctx.drawImage(oc, 0, 0, pw, ph, x0, y0, pw / dpr, ph / dpr);
        ctx.filter = 'none';
      }
      ctx.drawImage(oc, 0, 0, pw, ph, x0, y0, pw / dpr, ph / dpr);
      ctx.restore();
    }

    neonSil(o, cam, W, color, lw, alpha, main) {
      const ppm = cam.ppm;
      const X = (i) => cam.sx(W[i * 3]), Y = (i) => cam.sy(W[i * 3 + 1]);
      const segs = [
        [I.hipL, I.kneeL, 0.17], [I.kneeL, I.ankleL, 0.12], [I.ankleL, I.toeL, 0.075],
        [I.hipR, I.kneeR, 0.17], [I.kneeR, I.ankleR, 0.12], [I.ankleR, I.toeR, 0.075],
        [I.shL, I.elbowL, 0.095], [I.elbowL, I.handL, 0.08], [I.shR, I.elbowR, 0.095], [I.elbowR, I.handR, 0.08],
        [I.sh, I.neck, 0.08],
      ];
      // torso som i den klassiske tegning
      const hx = X(I.hip), hy = Y(I.hip), sx = X(I.sh), sy = Y(I.sh);
      const sep = Math.abs(X(I.shL) - X(I.shR)) + Math.abs(Y(I.shL) - Y(I.shR));
      const hsep = Math.abs(X(I.hipL) - X(I.hipR)) + Math.abs(Y(I.hipL) - Y(I.hipR));
      const wS = Math.max(0.26 * ppm, sep + 0.1 * ppm) / 2, wH = Math.max(0.24 * ppm, hsep + 0.12 * ppm) / 2;
      const dx = sx - hx, dy = sy - hy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      const torso = () => { o.beginPath(); o.moveTo(hx + nx * wH, hy + ny * wH); o.lineTo(sx + nx * wS, sy + ny * wS); o.lineTo(sx - nx * wS, sy - ny * wS); o.lineTo(hx - nx * wH, hy - ny * wH); o.closePath(); };
      const r = B.LEN.head * ppm, hdx = X(I.head), hdy = Y(I.head);
      o.lineCap = 'round'; o.lineJoin = 'round';
      // 1) tykt omrids i farven
      o.globalAlpha = alpha; o.strokeStyle = color; o.fillStyle = color;
      for (const [p, q, w] of segs) { o.lineWidth = w * ppm + 2 * lw; o.beginPath(); o.moveTo(X(p), Y(p)); o.lineTo(X(q), Y(q)); o.stroke(); }
      o.lineWidth = 0.1 * ppm + 2 * lw; torso(); o.stroke(); o.fill();
      o.beginPath(); o.arc(hdx, hdy, r + lw, 0, Math.PI * 2); o.fill();
      // 2) udfyld i sort, så kun den ydre kant bliver tilbage
      o.globalAlpha = 1; o.strokeStyle = '#000'; o.fillStyle = '#000';
      for (const [p, q, w] of segs) { o.lineWidth = w * ppm; o.beginPath(); o.moveTo(X(p), Y(p)); o.lineTo(X(q), Y(q)); o.stroke(); }
      o.lineWidth = 0.1 * ppm; torso(); o.stroke(); o.fill();
      o.beginPath(); o.arc(hdx, hdy, r, 0, Math.PI * 2); o.fill();
      if (!main) return;
      // 3) svage indre linjer og ansigtet, så man kan se skruen
      o.globalAlpha = 0.35; o.strokeStyle = color; o.lineWidth = Math.max(1, lw * 0.6);
      for (const [p, q] of [[I.hipL, I.kneeL], [I.kneeL, I.ankleL], [I.hipR, I.kneeR], [I.kneeR, I.ankleR], [I.shL, I.handL], [I.shR, I.handR], [I.hip, I.sh]]) {
        o.beginPath(); o.moveTo(X(p), Y(p)); o.lineTo(X(q), Y(q)); o.stroke();
      }
      const nz = W[I.nose * 3 + 2] - W[I.head * 3 + 2];
      if (nz > -0.09) {
        o.globalAlpha = 0.9; o.fillStyle = color;
        const ex = hdx + (X(I.nose) - hdx) * 0.6, ey = hdy + (Y(I.nose) - hdy) * 0.6 - r * 0.1;
        o.beginPath(); o.arc(ex, ey, Math.max(1.2, r * 0.14), 0, Math.PI * 2); o.fill();
      }
      o.globalAlpha = 1;
    }

    updateTrail(a, dt) {
      this.trailTimer += dt;
      const fast = a.state === 'air' && (Math.abs(a.omega) > 5 || a.twistRate > 4);
      if (this.trailTimer > 1 / 45) {
        this.trailTimer = 0;
        if (fast) this.trail.push(Float64Array.from(a.world));
        else if (this.trail.length) this.trail.shift();
        if (this.trail.length > 6) this.trail.shift();
      }
    }

    drawTrail(ctx, cam, look) {
      const n = this.trail.length;
      if (!n) return;
      ctx.save();
      ctx.lineCap = 'round';
      const pairs = [[I.hip, I.sh], [I.hipL, I.kneeL], [I.kneeL, I.ankleL], [I.hipR, I.kneeR], [I.kneeR, I.ankleR], [I.shL, I.handL], [I.shR, I.handR]];
      this.trail.forEach((W, k) => {
        ctx.globalAlpha = 0.05 + 0.12 * (k / n);
        ctx.strokeStyle = look.accent;
        ctx.lineWidth = 0.14 * cam.ppm;
        ctx.beginPath();
        for (const [p, q] of pairs) { ctx.moveTo(cam.sx(W[p * 3]), cam.sy(W[p * 3 + 1])); ctx.lineTo(cam.sx(W[q * 3]), cam.sy(W[q * 3 + 1])); }
        ctx.stroke();
      });
      ctx.restore();
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
