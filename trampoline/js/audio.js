// Syntetiske lydeffekter med WebAudio (ingen lydfiler).
(function (G) {
  'use strict';
  const TR = G.TR;

  class Sfx {
    constructor() { this.ctx = null; this.enabled = true; this.noiseBuf = null; }
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = G.AudioContext || G.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

    tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
      if (!this.ok()) return;
      const c = this.ctx, t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    }
    noise(dur, { freq = 800, vol = 0.3, q = 0.8, delay = 0, type = 'lowpass' } = {}) {
      if (!this.ok()) return;
      const c = this.ctx, t = c.currentTime + delay;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t); s.stop(t + dur + 0.05);
    }

    bounce(speed) {
      const v = TR.clamp(speed / 9, 0.15, 1);
      this.tone(70 + 30 * v, 0.22, { vol: 0.35 * v, slide: 0.6 });
      this.tone(180 + 90 * v, 0.18, { type: 'triangle', vol: 0.07 * v, slide: 1.6 });
      this.noise(0.08, { freq: 500, vol: 0.08 * v });
    }
    land(E) {
      if (E >= 1.9) { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.35, { vol: 0.12, delay: i * 0.07 })); }
      else if (E >= 1.6) { [660, 990].forEach((f, i) => this.tone(f, 0.25, { vol: 0.1, delay: i * 0.06 })); }
      else this.tone(520, 0.15, { vol: 0.08 });
    }
    whoosh(v) { this.noise(0.25, { freq: 900 + 600 * v, vol: 0.05 + 0.05 * v, type: 'bandpass', q: 1.2 }); }
    crash() {
      this.noise(0.4, { freq: 300, vol: 0.5 });
      this.tone(90, 0.3, { vol: 0.3, slide: 0.5 });
      [400, 330, 260].forEach((f, i) => this.tone(f, 0.18, { type: 'square', vol: 0.04, delay: 0.15 + i * 0.12 }));
    }
    sats(q) {
      if (q >= 1) { this.tone(990, 0.12, { type: 'triangle', vol: 0.09 }); this.tone(1480, 0.14, { type: 'sine', vol: 0.06, delay: 0.04 }); }
      else if (q >= 0.85) this.tone(740, 0.1, { type: 'triangle', vol: 0.07 });
      else this.tone(260, 0.12, { type: 'square', vol: 0.03 });
    }
    combo(n) { this.tone(440 * Math.pow(1.12, Math.min(n, 12)), 0.12, { type: 'triangle', vol: 0.08 }); }
    click() { this.tone(900, 0.05, { type: 'triangle', vol: 0.05 }); }
    cheer() { this.noise(1.6, { freq: 1600, vol: 0.12, type: 'bandpass', q: 0.4 }); }
    win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', vol: 0.12, delay: i * 0.1 })); }
  }

  TR.Sfx = Sfx;
})(globalThis);
