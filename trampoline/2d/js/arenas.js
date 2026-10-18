// Procedurelt tegnede baggrunde for de fire baner.
(function (G) {
  'use strict';
  const TR = G.TR;

  // Deterministisk tilfældighed, så baggrunde ikke flimrer.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  const cache = {};
  function stars(n, seed) {
    const k = 'stars' + n + seed;
    if (cache[k]) return cache[k];
    const r = rng(seed);
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({ x: r(), y: r(), s: r() * 1.4 + 0.3, p: r() * 6.28 });
    return (cache[k] = arr);
  }

  function vgrad(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }

  function glow(ctx, x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('A', alpha));
    g.addColorStop(1, color.replace('A', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Parallax: lag med faktor f skaleres mindre og ligger "længere væk".
  function layerMap(cam, f) {
    const ppm = cam.ppm * f;
    const fy = TR.lerp(cam.H * 0.62, cam.floorY, f);
    return { ppm, sx: (x) => cam.W / 2 + x * ppm, sy: (y) => fy - y * ppm, fy };
  }

  // ---------- Klubhallen ----------
  function hall(ctx, cam, t) {
    const { W, H, floorY } = cam;
    ctx.fillStyle = vgrad(ctx, 0, floorY, [[0, '#4a5878'], [0.5, '#7d8aa6'], [1, '#a89a86']]);
    ctx.fillRect(0, 0, W, floorY);
    const L = layerMap(cam, 0.55);
    // Vinduer højt oppe
    for (let i = -6; i <= 6; i++) {
      const x = L.sx(i * 3.2), y = L.sy(7.6), w = 2.2 * L.ppm, h = 2.2 * L.ppm;
      ctx.fillStyle = vgrad(ctx, y, y + h, [[0, '#9fd3ff'], [1, '#e8f6ff']]);
      ctx.fillRect(x - w / 2, y, w, h);
      ctx.strokeStyle = 'rgba(80,90,110,0.6)';
      ctx.lineWidth = Math.max(1, 0.06 * L.ppm);
      ctx.strokeRect(x - w / 2, y, w, h);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.moveTo(x - w / 2, y + h / 2); ctx.lineTo(x + w / 2, y + h / 2); ctx.stroke();
    }
    // Lysstråler
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = -6; i <= 6; i++) {
      const x = L.sx(i * 3.2), y = L.sy(6.5);
      const a = 0.035 + 0.015 * Math.sin(t * 0.3 + i);
      const g = ctx.createLinearGradient(x, y, x + 3 * L.ppm, floorY);
      g.addColorStop(0, `rgba(255,248,220,${a})`); g.addColorStop(1, 'rgba(255,248,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 1.1 * L.ppm, y); ctx.lineTo(x + 1.1 * L.ppm, y);
      ctx.lineTo(x + 4.2 * L.ppm, floorY); ctx.lineTo(x + 1.2 * L.ppm, floorY); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // Ribbe (wall bars)
    const R = layerMap(cam, 0.7);
    for (const side of [-1, 1]) {
      for (let j = 0; j < 4; j++) {
        const cx = R.sx(side * (7.5 + j * 1.0));
        const top = R.sy(3.2), bot = R.fy;
        ctx.fillStyle = '#b07a45';
        ctx.fillRect(cx - 0.05 * R.ppm, top, 0.1 * R.ppm, bot - top);
        ctx.fillRect(cx + 0.85 * R.ppm, top, 0.1 * R.ppm, bot - top);
        ctx.strokeStyle = '#c9965e';
        ctx.lineWidth = Math.max(1, 0.05 * R.ppm);
        for (let k = 0; k < 14; k++) {
          const yy = top + (k + 0.5) * (bot - top) / 14;
          ctx.beginPath(); ctx.moveTo(cx, yy); ctx.lineTo(cx + 0.9 * R.ppm, yy); ctx.stroke();
        }
      }
    }
    // Vimpler
    ctx.lineWidth = 1;
    const cols = ['#e63946', '#f1faee', '#457b9d', '#ffd166', '#2a9d8f'];
    ctx.strokeStyle = 'rgba(60,60,60,0.5)';
    const y0 = L.sy(6.4);
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.quadraticCurveTo(W / 2, y0 + 0.8 * L.ppm, W, y0); ctx.stroke();
    for (let i = 0; i < 30; i++) {
      const u = i / 29, x = u * W;
      const y = y0 + 4 * u * (1 - u) * 0.4 * L.ppm * 2 * 0.5 + 0.0;
      const sw = Math.sin(t * 2 + i) * 0.04 * L.ppm;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.moveTo(x - 0.18 * L.ppm, y); ctx.lineTo(x + 0.18 * L.ppm, y); ctx.lineTo(x + sw, y + 0.45 * L.ppm); ctx.closePath(); ctx.fill();
    }
    // Loftslamper
    for (let i = -5; i <= 5; i++) {
      const x = L.sx(i * 3.6), y = L.sy(9.8);
      glow(ctx, x, y, 1.6 * L.ppm, 'rgba(255,255,230,A)', 0.55);
      ctx.fillStyle = '#fffbe6';
      ctx.fillRect(x - 0.5 * L.ppm, y - 0.06 * L.ppm, L.ppm, 0.12 * L.ppm);
    }
    // Trampolin i baggrunden
    const Bk = layerMap(cam, 0.45);
    ctx.fillStyle = 'rgba(40,70,120,0.35)';
    const bx = Bk.sx(-9), by = Bk.sy(1.15);
    ctx.fillRect(bx, by, 5.2 * Bk.ppm, 0.12 * Bk.ppm);
    ctx.fillRect(bx + 0.2 * Bk.ppm, by, 0.1 * Bk.ppm, 1.15 * Bk.ppm);
    ctx.fillRect(bx + 4.9 * Bk.ppm, by, 0.1 * Bk.ppm, 1.15 * Bk.ppm);
    woodFloor(ctx, cam);
  }

  function woodFloor(ctx, cam) {
    const { W, H, floorY } = cam;
    ctx.fillStyle = vgrad(ctx, floorY, H, [[0, '#c98f55'], [1, '#8a5a2e']]);
    ctx.fillRect(0, floorY, W, H - floorY);
    ctx.strokeStyle = 'rgba(80,45,15,0.25)';
    ctx.lineWidth = 1;
    const vx = W / 2, vy = floorY - 0.6 * cam.ppm * 6;
    for (let i = -30; i <= 30; i++) {
      const x = W / 2 + i * 0.5 * cam.ppm;
      ctx.beginPath();
      const t0 = 0;
      ctx.moveTo(TR.lerp(vx, x, (floorY - vy) / (H - vy)), floorY + t0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let k = 1; k < 6; k++) {
      const y = floorY + (H - floorY) * Math.pow(k / 6, 1.6);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // Blå sikkerhedsmåtter
    const mat = (x0, x1) => {
      const y = cam.sy(TR.BED.floor);
      ctx.fillStyle = '#2b5fa8';
      ctx.fillRect(cam.sx(x0), y - 0.1 * cam.ppm, (x1 - x0) * cam.ppm, 0.2 * cam.ppm);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(cam.sx(x0), y - 0.1 * cam.ppm, (x1 - x0) * cam.ppm, 0.04 * cam.ppm);
    };
    mat(-5.2, -2.8); mat(2.8, 5.2);
  }

  // ---------- Solnedgang ----------
  function sunset(ctx, cam, t) {
    const { W, H, floorY } = cam;
    ctx.fillStyle = vgrad(ctx, 0, floorY, [[0, '#1d1b4f'], [0.35, '#6a3d8f'], [0.65, '#e0607e'], [0.85, '#ffa25c'], [1, '#ffd08a']]);
    ctx.fillRect(0, 0, W, floorY);
    const L = layerMap(cam, 0.35);
    const sx = L.sx(3.5), sy = L.sy(1.6);
    glow(ctx, sx, sy, 6 * L.ppm, 'rgba(255,200,120,A)', 0.55);
    ctx.fillStyle = '#ffe3a3';
    ctx.beginPath(); ctx.arc(sx, sy, 1.1 * L.ppm, 0, Math.PI * 2); ctx.fill();
    // Skyer
    const r = rng(7);
    for (let i = 0; i < 9; i++) {
      const x = ((r() * 1.4 - 0.2) * W + t * (4 + r() * 6)) % (W * 1.3) - W * 0.15;
      const y = r() * floorY * 0.45 + 20;
      const w = (0.12 + r() * 0.15) * W;
      ctx.fillStyle = `rgba(255,${150 + r() * 60},${160 + r() * 40},${0.18 + r() * 0.15})`;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x + k * w * 0.22, y + Math.sin(k) * 6, w * 0.25, w * 0.07, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    // Fugle
    ctx.strokeStyle = 'rgba(40,20,50,0.6)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const bx = ((t * 25 + i * 90) % (W + 200)) - 100, by = floorY * 0.25 + i * 14 + Math.sin(t + i) * 8;
      const f = Math.sin(t * 8 + i) * 4;
      ctx.beginPath(); ctx.moveTo(bx - 7, by - f); ctx.quadraticCurveTo(bx - 3, by - 4, bx, by); ctx.quadraticCurveTo(bx + 3, by - 4, bx + 7, by - f); ctx.stroke();
    }
    hills(ctx, cam, 0.3, '#5a2f63', 3.2, 11);
    hills(ctx, cam, 0.5, '#3f2350', 2.2, 23);
    trees(ctx, cam, 0.75, '#24142e', 31);
    // Græs
    ctx.fillStyle = vgrad(ctx, floorY, H, [[0, '#3d5a2a'], [1, '#1f3317']]);
    ctx.fillRect(0, floorY, W, H - floorY);
    // Ildfluer
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const fr = rng(99);
    for (let i = 0; i < 18; i++) {
      const x = fr() * W + Math.sin(t * 0.5 + i) * 30, y = floorY - fr() * 3 * cam.ppm + Math.cos(t * 0.7 + i * 2) * 20;
      const a = 0.4 + 0.4 * Math.sin(t * 3 + i * 1.7);
      glow(ctx, x, y, 8, 'rgba(255,240,150,A)', Math.max(0, a));
    }
    ctx.restore();
  }

  function hills(ctx, cam, f, color, amp, seed) {
    const L = layerMap(cam, f);
    const r = rng(seed);
    const ph = [r() * 6, r() * 6, r() * 6];
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, cam.H);
    for (let x = 0; x <= cam.W + 10; x += 10) {
      const wx = (x - cam.W / 2) / L.ppm;
      const h = amp * (0.6 + 0.25 * Math.sin(wx * 0.18 + ph[0]) + 0.15 * Math.sin(wx * 0.43 + ph[1]) + 0.08 * Math.sin(wx * 1.1 + ph[2]));
      ctx.lineTo(x, L.sy(h));
    }
    ctx.lineTo(cam.W, cam.H); ctx.closePath(); ctx.fill();
  }

  function trees(ctx, cam, f, color, seed) {
    const L = layerMap(cam, f);
    const r = rng(seed);
    ctx.fillStyle = color;
    for (let i = 0; i < 26; i++) {
      const wx = (r() - 0.5) * 60;
      if (Math.abs(wx) < 5) continue;
      const h = 2.5 + r() * 3.5, x = L.sx(wx), base = L.fy;
      ctx.fillRect(x - 0.12 * L.ppm, base - h * 0.4 * L.ppm, 0.24 * L.ppm, h * 0.4 * L.ppm);
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(x + (r() - 0.5) * 0.8 * L.ppm, base - (h * 0.55 + k * h * 0.13) * L.ppm, (1.0 - k * 0.15) * h * 0.25 * L.ppm, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---------- Nordlys ----------
  function aurora(ctx, cam, t) {
    const { W, H, floorY } = cam;
    ctx.fillStyle = vgrad(ctx, 0, floorY, [[0, '#020614'], [0.6, '#08183a'], [1, '#133a5c']]);
    ctx.fillRect(0, 0, W, floorY);
    for (const s of stars(220, 5)) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + s.p));
      ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
      ctx.fillRect(s.x * W, s.y * floorY * 0.9, s.s, s.s);
    }
    // Månen
    const L = layerMap(cam, 0.3);
    const mx = L.sx(-6), my = L.sy(8.5);
    glow(ctx, mx, my, 3 * L.ppm, 'rgba(200,220,255,A)', 0.35);
    ctx.fillStyle = '#eef3ff'; ctx.beginPath(); ctx.arc(mx, my, 0.7 * L.ppm, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(180,190,210,0.5)';
    ctx.beginPath(); ctx.arc(mx - 0.2 * L.ppm, my - 0.15 * L.ppm, 0.15 * L.ppm, 0, Math.PI * 2); ctx.fill();
    // Nordlysbånd
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const bands = [[0.18, '80,255,170', 0.9], [0.3, '120,140,255', 0.6], [0.24, '60,255,200', 0.7]];
    bands.forEach(([yy, col, sp], bi) => {
      const step = 6;
      for (let x = 0; x < W; x += step) {
        const u = x / W;
        const base = floorY * (yy + 0.08 * Math.sin(u * 5 + t * 0.25 * sp + bi) + 0.04 * Math.sin(u * 13 - t * 0.4 + bi * 2));
        const hgt = floorY * (0.18 + 0.08 * Math.sin(u * 7 + t * 0.6 + bi));
        const a = 0.05 + 0.05 * Math.sin(u * 20 + t * 1.3 + bi * 3) ** 2;
        const g = ctx.createLinearGradient(0, base, 0, base + hgt);
        g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.7, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x, base, step + 1, hgt);
      }
    });
    ctx.restore();
    mountains(ctx, cam);
    pines(ctx, cam, 0.7, 41);
    ctx.fillStyle = vgrad(ctx, floorY, H, [[0, '#dce8f5'], [1, '#9fb6cf']]);
    ctx.fillRect(0, floorY, W, H - floorY);
    // Snefnug
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const s of stars(90, 12)) {
      const x = ((s.x * W + Math.sin(t * 0.8 + s.p) * 20) % W + W) % W;
      const y = ((s.y * H + t * (20 + s.s * 25)) % H);
      ctx.beginPath(); ctx.arc(x, y, s.s * 1.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function mountains(ctx, cam) {
    const L = layerMap(cam, 0.4);
    const r = rng(3);
    const peaks = [];
    for (let i = 0; i < 12; i++) peaks.push([(i - 6) * 5 + r() * 3, 3 + r() * 4]);
    ctx.fillStyle = '#1b2d4a';
    ctx.beginPath(); ctx.moveTo(0, cam.H);
    ctx.lineTo(L.sx(-40), L.fy);
    peaks.forEach(([x, h]) => { ctx.lineTo(L.sx(x - 2.5), L.fy - 0.5 * L.ppm); ctx.lineTo(L.sx(x), L.sy(h)); });
    ctx.lineTo(L.sx(40), L.fy); ctx.lineTo(cam.W, cam.H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(230,240,255,0.85)';
    peaks.forEach(([x, h]) => {
      ctx.beginPath(); ctx.moveTo(L.sx(x), L.sy(h));
      ctx.lineTo(L.sx(x - 0.9), L.sy(h - 1.1)); ctx.lineTo(L.sx(x - 0.3), L.sy(h - 0.8));
      ctx.lineTo(L.sx(x + 0.2), L.sy(h - 1.2)); ctx.lineTo(L.sx(x + 0.8), L.sy(h - 0.9)); ctx.closePath(); ctx.fill();
    });
  }

  function pines(ctx, cam, f, seed) {
    const L = layerMap(cam, f);
    const r = rng(seed);
    for (let i = 0; i < 30; i++) {
      const wx = (r() - 0.5) * 50;
      if (Math.abs(wx) < 5) continue;
      const h = 2 + r() * 3, x = L.sx(wx), b = L.fy;
      ctx.fillStyle = '#0d2233';
      for (let k = 0; k < 3; k++) {
        const w = (0.9 - k * 0.22) * h * 0.35 * L.ppm, y0 = b - (0.2 + k * 0.28) * h * L.ppm;
        ctx.beginPath(); ctx.moveTo(x - w, y0); ctx.lineTo(x + w, y0); ctx.lineTo(x, y0 - h * 0.45 * L.ppm); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(235,245,255,0.7)';
      ctx.beginPath(); ctx.moveTo(x - 0.1 * h * L.ppm, b - 0.85 * h * L.ppm); ctx.lineTo(x, b - 1.05 * h * L.ppm); ctx.lineTo(x + 0.1 * h * L.ppm, b - 0.85 * h * L.ppm); ctx.fill();
    }
  }

  // ---------- VM-finalen ----------
  let crowdCanvas = null, crowdKey = '';
  function crowd(W, h) {
    const key = W + 'x' + h;
    if (crowdCanvas && crowdKey === key) return crowdCanvas;
    const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(W, h) : Object.assign(document.createElement('canvas'), { width: W, height: h });
    const x = c.getContext('2d');
    const r = rng(77);
    const cols = ['#e63946', '#f1faee', '#457b9d', '#ffd166', '#2a9d8f', '#f4a261', '#8d99ae', '#ffffff', '#c1121f'];
    const rows = 9;
    for (let i = 0; i < rows; i++) {
      const y = h * (i + 0.5) / rows;
      x.fillStyle = `rgba(20,24,48,${0.9 - i * 0.05})`;
      x.fillRect(0, y - h / rows / 2, W, h / rows);
      const n = Math.floor(W / 9);
      for (let k = 0; k < n; k++) {
        const px = k * 9 + r() * 4, py = y + (r() - 0.5) * 4;
        x.fillStyle = cols[Math.floor(r() * cols.length)];
        x.globalAlpha = 0.35 + 0.3 * (i / rows);
        x.beginPath(); x.arc(px, py, 3 + (i / rows) * 1.2, 0, Math.PI * 2); x.fill();
      }
    }
    x.globalAlpha = 1;
    crowdCanvas = c; crowdKey = key;
    return c;
  }

  function final(ctx, cam, t, athlete) {
    const { W, H, floorY } = cam;
    ctx.fillStyle = vgrad(ctx, 0, floorY, [[0, '#05060f'], [1, '#141a36']]);
    ctx.fillRect(0, 0, W, floorY);
    const L = layerMap(cam, 0.5);
    const top = L.sy(7), bot = L.sy(0.9);
    if (bot > top) {
      const img = crowd(Math.max(2, Math.floor(W)), Math.max(2, Math.floor(bot - top)));
      ctx.drawImage(img, 0, top, W, bot - top);
      // Blitzlys
      const r = rng(Math.floor(t * 6));
      for (let i = 0; i < 3; i++) {
        if (r() < 0.5) glow(ctx, r() * W, top + r() * (bot - top), 12, 'rgba(255,255,255,A)', 0.9);
      }
    }
    // Storskærm
    const sw = 5 * L.ppm, sh = 2.4 * L.ppm, sxc = L.sx(0), syc = L.sy(9.3);
    ctx.fillStyle = '#0b0f1f';
    ctx.fillRect(sxc - sw / 2 - 6, syc - sh / 2 - 6, sw + 12, sh + 12);
    ctx.fillStyle = vgrad(ctx, syc - sh / 2, syc + sh / 2, [[0, '#12306b'], [1, '#0a1838']]);
    ctx.fillRect(sxc - sw / 2, syc - sh / 2, sw, sh);
    ctx.fillStyle = '#ffd166';
    ctx.font = `800 ${Math.max(10, 0.45 * L.ppm)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('VM I TRAMPOLIN', sxc, syc - 0.45 * L.ppm);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(9, 0.35 * L.ppm)}px system-ui, sans-serif`;
    ctx.fillText(cam.boardText || 'FINALE', sxc, syc + 0.35 * L.ppm);
    // Flag
    const flags = [['#c8102e', '#ffffff', 'dk'], ['#006aa7', '#fecc00', 'se'], ['#ba0c2f', '#00205b', 'no'], ['#000', '#dd0000', 'de'], ['#002395', '#ed2939', 'fr'], ['#de2910', '#ffde00', 'cn']];
    flags.forEach((f, i) => {
      const fx = L.sx((i - 2.5) * 3.1), fy = L.sy(7.6), fw = 1.4 * L.ppm, fh = 0.9 * L.ppm;
      const wave = Math.sin(t * 2 + i) * 0.05 * L.ppm;
      ctx.fillStyle = f[0];
      ctx.fillRect(fx - fw / 2, fy + wave, fw, fh);
      ctx.fillStyle = f[1];
      if (f[2] === 'dk' || f[2] === 'se' || f[2] === 'no') {
        ctx.fillRect(fx - fw / 2 + fw * 0.3, fy + wave, fw * 0.12, fh);
        ctx.fillRect(fx - fw / 2, fy + wave + fh * 0.44, fw, fh * 0.12);
      } else if (f[2] === 'fr') {
        ctx.fillStyle = '#fff'; ctx.fillRect(fx - fw / 6, fy + wave, fw / 3, fh);
        ctx.fillStyle = f[1]; ctx.fillRect(fx + fw / 6, fy + wave, fw / 3, fh);
      } else if (f[2] === 'de') {
        ctx.fillStyle = '#dd0000'; ctx.fillRect(fx - fw / 2, fy + wave + fh / 3, fw, fh / 3);
        ctx.fillStyle = '#ffce00'; ctx.fillRect(fx - fw / 2, fy + wave + 2 * fh / 3, fw, fh / 3);
      } else {
        ctx.beginPath(); ctx.arc(fx - fw * 0.3, fy + wave + fh * 0.3, fh * 0.12, 0, Math.PI * 2); ctx.fill();
      }
    });
    // Blank gulv med reklamebander
    ctx.fillStyle = vgrad(ctx, floorY, H, [[0, '#1b2750'], [1, '#070b1c']]);
    ctx.fillRect(0, floorY, W, H - floorY);
    const by = cam.sy(TR.BED.floor + 0.55);
    const bh = cam.sy(TR.BED.floor) - by;
    ctx.fillStyle = '#0e1430';
    ctx.fillRect(0, by - bh * 0.1, W, bh * 0.35);
    const scroll = (t * 40) % 200;
    ctx.font = `800 ${Math.max(8, bh * 0.22)}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    for (let x = -scroll; x < W; x += 200) {
      ctx.fillStyle = ['#ffd166', '#4cc9f0', '#f72585'][Math.floor((x + scroll) / 200) % 3 | 0] || '#ffd166';
      ctx.fillText('TRAMPOLIN ★', x, by + bh * 0.07);
    }
    // Spotlys der følger springeren
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const ax = cam.sx(athlete.x), ay = cam.sy(athlete.y);
    for (const [ox, col] of [[-0.35, '255,230,180'], [0.35, '180,210,255'], [0, '255,255,255']]) {
      const lx = W * (0.5 + ox + 0.05 * Math.sin(t * 0.7 + ox * 5)), ly = -20;
      const g = ctx.createLinearGradient(lx, ly, ax, ay);
      g.addColorStop(0, `rgba(${col},0.22)`); g.addColorStop(1, `rgba(${col},0.02)`);
      ctx.fillStyle = g;
      const spread = 1.3 * cam.ppm;
      ctx.beginPath(); ctx.moveTo(lx - 8, ly); ctx.lineTo(lx + 8, ly); ctx.lineTo(ax + spread, cam.sy(TR.BED.floor)); ctx.lineTo(ax - spread, cam.sy(TR.BED.floor)); ctx.closePath(); ctx.fill();
    }
    glow(ctx, ax, cam.sy(0), 2.2 * cam.ppm, 'rgba(255,255,255,A)', 0.12);
    ctx.restore();
  }

  TR.Arenas = {
    draw(id, ctx, cam, t, athlete) {
      if (id === 'sunset') return sunset(ctx, cam, t);
      if (id === 'aurora') return aurora(ctx, cam, t);
      if (id === 'final') return final(ctx, cam, t, athlete);
      return hall(ctx, cam, t);
    },
    // Farver på trampolinens rammepuder pr. bane
    pad(id) { return { hall: '#1f6fd1', sunset: '#1f8a70', aurora: '#3a4f9b', final: '#d62839' }[id] || '#1f6fd1'; },
  };
})(globalThis);
