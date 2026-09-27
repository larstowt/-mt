// Spilløkke og spiltyper: fri leg, tidsløb, rutine (konkurrence) og udfordringer.
(function (G) {
  'use strict';
  const TR = G.TR;
  const S = TR.Scoring;
  const STEP = 1 / 240;

  // ---------- Spiltyper ----------
  class Mode {
    constructor(game, opts) { this.game = game; this.opts = opts || {}; this.finished = false; }
    begin() {}
    onSkill() {}
    onCrash() {}
    onApex() {}
    update() {}
    hud() { return {}; }
    finish(result) {
      if (this.finished) return;
      this.finished = true;
      this.game.finish(result);
    }
  }

  // Fri leg og tidsløb (60 s). Point ganges med kombination.
  class FreeMode extends Mode {
    begin() {
      this.score = 0; this.combo = 0; this.lastKey = null; this.straight = 0; this.best = 0;
      this.timeLeft = this.opts.time || 0;
      this.count = 0;
    }
    get title() { return this.opts.title || (this.opts.time ? `${this.opts.time} sek. tidsløb` : this.opts.skills ? 'Fri leg · fuldt trænet' : 'Fri leg'); }
    onSkill(skill, ev) {
      const g = this.game;
      if (skill.dd <= 0) {
        this.straight++;
        if (this.straight >= 3 && this.combo > 0) { this.combo = 0; g.renderer.popup('Kombination tabt', { color: '#9aa4bf', size: 0.6 }); }
        return;
      }
      this.straight = 0;
      this.combo++;
      const repeat = skill.key === this.lastKey;
      this.lastKey = skill.key;
      const pts = S.freePoints(skill, ev, this.combo, repeat);
      this.score += pts;
      this.count++;
      if (this.combo > 1) g.sfx.combo(this.combo);
      g.renderer.popup(`+${pts}`, { color: '#ffd166', size: 0.8, sub: this.combo > 1 ? `Kombination x${TR.fmt(S.comboMult(this.combo), 2)}${repeat ? ' · gentaget' : ''}` : repeat ? 'Gentaget spring' : '' });
      if (!this.opts.time && !this.opts.skills) {
        g.addXp(Math.round(pts / 6));
        if (this.score > (g.save.best.free || 0)) { g.save.best.free = this.score; }
        g.dirty = true;
      }
    }
    onCrash() { if (this.combo > 0) this.game.renderer.popup('Kombination tabt', { color: '#9aa4bf', size: 0.6 }); this.combo = 0; this.lastKey = null; }
    update(dt) {
      if (!this.opts.time) return;
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) this.end();
    }
    end() {
      const g = this.game;
      const o = this.opts;
      const res = { title: o.challenge ? o.challenge.title : this.title, big: `${this.score}`, bigLabel: 'point', lines: [['Spring', this.count]], retry: () => g.startMode(new FreeMode(g, o)) };
      if (o.time && !o.challenge && !o.versus) {
        const prev = g.save.best.time || 0;
        if (this.score > prev) { g.save.best.time = this.score; res.record = true; }
        res.lines.push(['Rekord', Math.max(prev, this.score)]);
        res.share = { kind: 'time', score: this.score };
      }
      if (o.versus) {
        res.win = this.score > o.versus.score;
        res.lines.push([`${o.versus.name}`, o.versus.score]);
        res.share = { kind: 'time', score: this.score };
      }
      if (o.challenge) g.awardChallenge(o.challenge, TR.Challenges.starsFor(o.challenge, this.score), res);
      g.addXp(Math.round(this.score / 5));
      this.finish(res);
    }
    hud() {
      const h = { title: this.title, main: `${this.score}`, sub: this.combo > 1 ? `Kombination x${TR.fmt(S.comboMult(this.combo), 2)}` : '' };
      if (this.opts.time) h.timer = Math.max(0, this.timeLeft);
      if (this.opts.challenge) h.goal = `Mål: ${this.opts.challenge.target} point`;
      if (this.opts.versus) h.goal = `Slå ${this.opts.versus.name}: ${this.opts.versus.score}`;
      return h;
    }
  }

  // Konkurrence: 10 elementer uden strakte hop imellem.
  class RoutineMode extends Mode {
    begin() { this.items = []; this.keys = new Set(); this.started = false; }
    get title() { return this.opts.challenge ? this.opts.challenge.title : 'Konkurrence'; }
    onSkill(skill, ev) {
      if (!this.started) {
        if (skill.dd <= 0) return;
        this.started = true;
        this.game.renderer.popup('Rutinen er i gang!', { color: '#4cc9f0', size: 0.6 });
      } else if (skill.dd <= 0) {
        return this.end('Afbrudt: strakt hop i rutinen');
      }
      const repeat = this.keys.has(skill.key);
      this.keys.add(skill.key);
      this.items.push({ skill, ev, repeat });
      if (repeat) this.game.renderer.popup('Gentaget – tæller ikke i D', { color: '#ff8fa3', size: 0.55 });
      if (this.items.length >= 10) this.end(null);
    }
    onCrash(info) { if (this.started) this.end(`Afbrudt: ${info.reason}`); }
    end(reason) {
      const g = this.game, o = this.opts;
      const tot = S.routineTotals(this.items);
      const res = {
        title: reason ? 'Rutinen blev afbrudt' : 'Rutinen er færdig',
        big: TR.fmt(tot.total, 2), bigLabel: 'point', note: reason || `${this.items.length} elementer`,
        lines: [['D · sværhed', TR.fmt(tot.D)], ['E · udførelse', TR.fmt(tot.E)], ['T · flyvetid', TR.fmt(tot.T, 2)], ['H · placering', TR.fmt(tot.H)]],
        list: this.items.map((it, i) => `${i + 1}. ${it.skill.fullName} (${it.skill.code})${it.repeat ? ' – gentaget' : ''} · E ${TR.fmt(it.ev.E)}`),
        retry: () => g.startMode(new RoutineMode(g, o)),
      };
      if (!reason && !o.challenge) {
        const prev = g.save.best.routine || 0;
        if (tot.total > prev) { g.save.best.routine = tot.total; res.record = true; }
        res.share = { kind: 'routine', score: tot.total, list: this.items.map((it) => it.skill.fullName) };
      }
      if (o.versus) { res.win = !reason && tot.total > o.versus.score; res.lines.push([o.versus.name, TR.fmt(o.versus.score, 2)]); res.share = { kind: 'routine', score: tot.total }; }
      if (o.challenge) g.awardChallenge(o.challenge, reason ? 0 : TR.Challenges.starsFor(o.challenge, tot.total), res);
      g.addXp(Math.round(tot.total * 8));
      this.finish(res);
    }
    hud() {
      const tot = S.routineTotals(this.items);
      return {
        title: this.title,
        main: this.started ? `${this.items.length}/10` : 'Klar',
        sub: this.started ? `D ${TR.fmt(tot.D)} · E ${TR.fmt(tot.E)}` : 'Første salto starter rutinen',
        goal: this.opts.versus ? `Slå ${this.opts.versus.name}: ${TR.fmt(this.opts.versus.score, 2)}` : this.opts.challenge ? `Mål: ${this.opts.challenge.target} point` : '',
        list: this.items.map((it) => ({ name: it.skill.fullName, code: it.skill.code, dd: it.repeat ? 0 : it.skill.dd, E: it.ev.E })),
      };
    }
  }

  // Udfordringer: højde, bestemt spring eller serie af spring.
  class ChallengeMode extends Mode {
    begin() {
      this.def = this.opts.challenge;
      this.attempts = 0; this.bestH = 0; this.idx = 0; this.Es = []; this.reached = -1;
    }
    get title() { return this.def.title; }
    onApex(h) {
      if (this.def.type !== 'height') return;
      if (h > this.bestH) this.bestH = h;
      if (this.reached < 0 && h >= this.def.target) {
        this.reached = 12;
        this.game.renderer.popup('Mål nået! ★', { color: '#ffd166', sub: 'Bliv ved i 12 sek. for flere stjerner' });
        this.game.sfx.win();
      }
    }
    update(dt) {
      if (this.reached > 0) {
        this.reached -= dt;
        if (this.reached <= 0 || this.bestH >= this.def.target + 0.8) this.done(TR.Challenges.starsFor(this.def, this.bestH), [['Bedste højde', `${TR.fmt(this.bestH)} m`]]);
      }
    }
    onSkill(skill, ev) {
      const d = this.def, M = TR.Challenges.matches;
      if (d.type === 'skill') {
        if (skill.dd > 0 || skill.totalHalves > 0) this.attempts++;
        if (M(skill, d.match) && (!this.opts.versus || ev.E >= 0)) {
          this.done(TR.Challenges.starsFromE(ev.E), [['Spring', skill.fullName], ['Kode', skill.code], ['E · udførelse', TR.fmt(ev.E)]], { skill, ev });
        }
      } else if (d.type === 'sequence') {
        if (skill.dd <= 0) return;
        if (M(skill, d.list[this.idx])) {
          this.idx++; this.Es.push(ev.E);
          this.game.renderer.popup(`${this.idx}/${d.list.length}`, { color: '#4cc9f0', size: 0.7 });
          if (this.idx >= d.list.length) {
            const avg = this.Es.reduce((a, b) => a + b, 0) / this.Es.length;
            this.done(TR.Challenges.starsFromE(avg), [['Gennemsnitlig E', TR.fmt(avg, 2)]]);
          }
        } else {
          this.idx = M(skill, d.list[0]) ? 1 : 0;
          this.Es = this.idx ? [ev.E] : [];
          this.game.renderer.popup('Forkert rækkefølge', { color: '#ff8fa3', size: 0.6 });
        }
      }
    }
    onCrash() { if (this.def.type === 'sequence' && this.idx > 0) { this.idx = 0; this.Es = []; } }
    done(stars, lines, extra) {
      const g = this.game, o = this.opts;
      const res = { title: this.def.title, lines, retry: () => g.startMode(new ChallengeMode(g, o)) };
      if (o.versus) {
        const E = extra ? extra.ev.E : 0;
        res.win = E > o.versus.E;
        res.lines.push([`${o.versus.name}s E`, TR.fmt(o.versus.E)]);
      } else {
        g.awardChallenge(this.def, stars, res);
      }
      if (extra && extra.skill) {
        const s = extra.skill;
        res.share = { kind: 'skill', score: 0, title: s.fullName, E: extra.ev.E, match: { dir: s.dir, q: s.quarters, halves: s.totalHalves, shape: s.shape, split: s.halves } };
      }
      g.addXp(40 * Math.max(1, stars));
      this.finish(res);
    }
    hud() {
      const d = this.def;
      const h = { title: d.title, main: '', sub: d.desc, goal: d.hint ? `Tip: ${d.hint}` : '' };
      if (d.type === 'height') { h.main = `${TR.fmt(this.bestH)} m`; if (this.reached > 0) h.timer = this.reached; }
      else if (d.type === 'sequence') h.main = `${this.idx}/${d.list.length}`;
      else h.main = this.attempts ? `Forsøg ${this.attempts}` : '';
      return h;
    }
  }

  // ---------- Demo-bot til menuen ----------
  class DemoBot {
    constructor() { this.plan = null; this.n = 0; this.lastApex = 0; }
    onLand(a) { this.n++; this.next(a); }
    onCrash() { this.n = 0; this.plan = null; }
    onApex(h) { this.lastApex = h; }
    next(a) {
      // Ligger springeren, rejser den sig igen; ellers vælges et tilfældigt spring.
      if (a && a.contact !== 'feet') {
        this.plan = { shape: 'straight', q: Math.random() < 0.3 ? 5 : 1, tilt: 0.08, lean: -Math.sign(a.lieA), to: 'feet' };
        if (this.plan.q === 5) { this.plan.shape = 'tuck'; this.plan.tilt = 0.3; }
        return;
      }
      const plans = [
        { shape: 'tuck', q: 4, tilt: 0.2, dir: 1 },
        { shape: 'pike', q: 4, tilt: 0.2, dir: 1 },
        { shape: 'straight', q: 4, tilt: 0.35, dir: 1, twist: 2 },
        { shape: 'tuck', q: 4, tilt: 0.2, dir: -1, twist: 1, twistAt: 0.35 },
        { shape: 'straight', q: 4, tilt: 0.35, dir: -1, twist: 3 },
        { shape: 'tuck', q: 8, tilt: 0.35, dir: 1 },
        { shape: 'tuck', q: 4, tilt: 0.2, dir: 1, twist: 2, twistAt: 0.3 },
        { shape: 'straight', q: 1, tilt: 0.06, dir: 1, to: 'back' },
        { shape: 'straight', q: 1, tilt: 0.06, dir: -1, to: 'front' },
      ];
      const p = this.lastApex > 2.6 && this.n % 2 === 0 ? plans[Math.floor(Math.random() * plans.length)] : null;
      if (p) p.lean = p.dir * (a ? a.facing : 1);
      this.plan = p;
    }
    input(a) {
      const inp = { lean: 0, push: true, tuck: false, pike: false, twist: false, kill: false };
      const p = this.plan;
      if (!p) return inp;
      if (a.state === 'bed') { if (a.tilt() * p.lean < p.tilt) inp.lean = p.lean; return inp; }
      if (a.state !== 'air') return inp;
      const t = a.tracker;
      const done = Math.abs((t.from === 'feet' ? t.raw : t.dphi) + t.tilt0);
      const rem = (p.q * Math.PI) / 2 - done;
      const hLand = (p.to || 'feet') === 'feet' ? 1.05 : 0.25;
      const tl = (a.vy + Math.sqrt(Math.max(0, a.vy * a.vy + 2 * TR.GRAV * (a.y - hLand)))) / TR.GRAV;
      const wS = Math.abs(a.L) / 11;
      if (p.shape !== 'straight' && rem > wS * tl + 0.4) inp[p.shape] = true;
      const sgn = Math.sign(a.L) || p.lean;
      if (!inp.tuck && !inp.pike) { if (rem < wS * tl - 0.1) inp.lean = -sgn; else if (rem > wS * tl + 0.1) inp.lean = sgn; }
      if (p.twist && a.airT > (p.twistAt || 0.1) && !a.twistPrev && a.twistQueued() < p.twist * Math.PI - 0.5) inp.twist = true;
      return inp;
    }
  }

  // ---------- Spillet ----------
  class Game {
    constructor(canvas, save) {
      this.save = save;
      this.athlete = new TR.Athlete(save.skills);
      this.renderer = new TR.Renderer(canvas);
      this.input = new TR.Input();
      this.sfx = new TR.Sfx();
      this.sfx.enabled = save.sound !== false;
      this.arena = TR.arenaUnlocked(save, save.arena) ? save.arena : 'hall';
      this.mode = null;
      this.demo = true;
      this.bot = new DemoBot();
      this.paused = false;
      this.timeScale = 0.7; // spillet kører langsommere end virkeligheden
      this.acc = 0; this.last = 0;
      this.dirty = false;
      this.ui = null;
      this.renderer.record = 0;
      this.hookEvents();
      this.setDemo();
    }
    get look() { return this.save.look; }

    hookEvents() {
      const a = this.athlete, R = this.renderer;
      a.on('land', ({ skill, landing, speed }) => {
        const ev = S.execution(skill, landing);
        this.sfx.bounce(speed);
        R.burst(a.x, 0.02, 10, { up: true, speed: 1.6, color: 'rgba(255,255,255,0.7)', size: 0.03, life: 0.5 });
        if (this.demo) { this.bot.onLand(a); return; }
        if (landing.skew) R.floater(`Skæv landing −${Math.round(landing.heightLoss * 100)} % højde`, '#ffb4c1');
        else if (landing.heightLoss > 0.04) R.floater(`Væk fra midten −${Math.round(landing.heightLoss * 100)} % højde`, '#ffb4c1');
        if (skill.dd > 0 || skill.totalHalves > 0) {
          this.sfx.land(ev.E);
          const grade = S.grade(ev.E);
          R.popup(skill.fullName, { sub: `${skill.code} · DD ${TR.fmt(skill.dd)} · E ${TR.fmt(ev.E)} · ${grade}`, color: ev.E >= 1.9 ? '#ffd166' : '#ffffff' });
          if (ev.E >= 1.9) {
            R.burst(a.x, a.y + 0.6, 22, { kind: 'star', colors: ['#ffd166', '#ffffff', '#4cc9f0'], speed: 3.2, size: 0.07, life: 1.1, g: 2 });
            if (this.arena === 'final') this.sfx.cheer();
          }
          if (ev.ded.length && ev.E < 1.9) R.popup(ev.ded.map((d) => `${d.label} −${TR.fmt(d.v)}`).join(' · '), { color: '#ffb4c1', size: 0.45, max: 2.2 });
        }
        if (this.mode) this.mode.onSkill(skill, ev);
      });
      a.on('crash', (info) => {
        this.sfx.crash();
        R.shake = 0.6;
        R.burst(a.x, a.y, 16, { speed: 2.5, color: 'rgba(255,255,255,0.8)', size: 0.035, life: 0.7 });
        if (this.demo) { this.bot.onCrash(); return; }
        R.popup(info.reason, { color: '#ff6b81', size: 0.8 });
        if (this.mode) this.mode.onCrash(info);
      });
      // Tilbagemelding på satsens timing
      this.satsStreak = 0;
      a.on('sats', ({ q, label, quiet }) => {
        if (this.demo || quiet) return;
        if (q >= 1) this.satsStreak++; else this.satsStreak = 0;
        const color = q >= 1 ? '#ffd166' : q >= 0.9 ? '#80ffdb' : q > 0 ? '#ffb4c1' : '#9aa4bf';
        R.floater(label, color, q >= 1 && this.satsStreak > 1 ? `x${this.satsStreak}` : '');
        if (q > 0) this.sfx.sats(q);
      });
      a.on('takeoff', ({ vy }) => { if (vy > 6) this.sfx.whoosh(Math.min(1, vy / 10)); });
      a.on('apex', ({ height }) => {
        if (this.demo) { this.bot.onApex(height); return; }
        if (height > this.renderer.record) this.renderer.record = height;
        if (this.mode) this.mode.onApex(height);
      });
    }

    setDemo() {
      this.demo = true;
      this.mode = null;
      this.input.enabled = false;
      this.athlete.setSkills({ power: 3, rotation: 3, twist: 3, flex: 3, air: 2 });
      this.athlete.control = 'physics'; // demo-botten er skrevet til fysik-styringen
      this.athlete.reset();
      this.bot = new DemoBot();
      this.renderer.popups = [];
      this.renderer.record = 0;
    }

    startMode(mode) {
      this.demo = false;
      this.input.enabled = true;
      this.athlete.setSkills(mode.opts && mode.opts.skills ? mode.opts.skills : this.save.skills);
      this.athlete.control = this.save.control === 'physics' ? 'physics' : 'arcade';
      this.athlete.reset();
      this.renderer.popups = [];
      this.renderer.record = 0;
      this.mode = mode;
      mode.begin();
      this.paused = false;
      if (this.ui) this.ui.onModeStart(mode);
    }

    setArena(id) {
      if (!TR.arenaUnlocked(this.save, id)) return;
      this.arena = id;
      this.save.arena = id;
      this.dirty = true;
    }

    addXp(n) {
      if (!n || n < 0) return;
      const before = TR.levelInfo(this.save.xp).level;
      this.save.xp += n;
      const after = TR.levelInfo(this.save.xp).level;
      if (after > before) {
        this.renderer.popup(`Niveau ${after}!`, { color: '#4cc9f0', sub: '+1 færdighedspoint', size: 0.9 });
        this.sfx.win();
      }
      this.dirty = true;
    }

    awardChallenge(def, stars, res) {
      const prev = this.save.stars[def.id] | 0;
      res.stars = stars;
      res.prevStars = prev;
      if (stars > prev) {
        this.save.stars[def.id] = stars;
        res.newStars = stars - prev;
        const unlocked = TR.ARENAS.filter((a) => a.need > 0 && TR.totalStars(this.save) >= a.need && TR.totalStars(this.save) - res.newStars < a.need);
        if (unlocked.length) res.unlocked = unlocked.map((a) => a.name);
      }
      this.dirty = true;
    }

    finish(res) {
      TR.persist(this.save);
      this.dirty = false;
      if (res.stars > 0 || res.win) {
        this.sfx.win();
        this.renderer.burst(this.athlete.x, this.athlete.y + 1, 50, { kind: 'confetti', colors: ['#ffd166', '#e63946', '#4cc9f0', '#2a9d8f', '#ffffff'], speed: 5, size: 0.05, life: 2, g: 3 });
      }
      this.paused = true;
      if (this.ui) this.ui.showResult(res);
    }

    stepInput(dt) {
      if (this.demo) return this.bot.input(this.athlete, dt);
      return this.input.state();
    }

    frame(ts) {
      const dt = Math.min(0.05, this.last ? (ts - this.last) / 1000 : 0.016);
      this.last = ts;
      if (!this.paused) {
        this.acc += dt * this.timeScale;
        let n = 0;
        while (this.acc >= STEP && n < 40) {
          this.athlete.step(STEP, this.stepInput(STEP));
          this.acc -= STEP; n++;
        }
        if (this.mode) this.mode.update(dt * this.timeScale);
      }
      this.renderer.render(this, this.paused ? 0 : dt);
      if (this.ui) this.ui.frame(dt);
      if (this.dirty && !this.persistTimer) {
        this.persistTimer = setTimeout(() => { TR.persist(this.save); this.dirty = false; this.persistTimer = null; }, 1500);
      }
    }

    run() {
      const loop = (ts) => { this.frame(ts); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }

  TR.Game = Game;
  TR.Modes = { FreeMode, RoutineMode, ChallengeMode };
  TR.DemoBot = DemoBot;
})(globalThis);
