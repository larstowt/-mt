// Menuer, HUD og resultatskærme (DOM oven på lærredet).
(function (G) {
  'use strict';
  const TR = G.TR;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SWATCH = {
    suit: ['#e63946', '#1d3557', '#2a9d8f', '#7b2cbf', '#ff7b00', '#111827', '#f72585', '#0077b6'],
    accent: ['#ffd166', '#ffffff', '#4cc9f0', '#e63946', '#80ffdb', '#c0c0c0'],
    legs: ['#f3f4f8', '#1f2937', '#1d3557', '#e63946', '#f1c27d'],
    skin: ['#f6d7b8', '#f1c27d', '#d19a66', '#a8703f', '#7a4a26', '#4b2c17'],
    hair: ['#3b2a20', '#111111', '#a0522d', '#e8c872', '#d9d9d9', '#b22222'],
  };

  class UI {
    constructor(game) {
      this.game = game;
      this.save = game.save;
      this.screen = 'menu';
      this.hudT = 0;
      this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in G;
      game.ui = this;
      this.bind();
      this.show('menu');
    }

    bind() {
      const g = this.game;
      document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { g.sfx.unlock(); g.sfx.click(); this.go(b.dataset.go); }));
      $('pauseBtn').addEventListener('click', () => this.pause());
      $('resumeBtn').addEventListener('click', () => this.resume());
      $('restartBtn').addEventListener('click', () => { if (this.lastStart) this.lastStart(); });
      $('quitBtn').addEventListener('click', () => this.toMenu());
      $('pauseHelpBtn').addEventListener('click', () => { this.helpFromPause = true; this.show('help'); });
      $('resMenuBtn').addEventListener('click', () => this.toMenu());
      $('retryBtn').addEventListener('click', () => { if (this.result && this.result.retry) this.result.retry(); });
      $('freeMaxBtn').addEventListener('click', () => {
        this.save.freeMax = !this.save.freeMax;
        TR.persist(this.save); this.renderMenu();
        this.toast(this.save.freeMax ? 'Fri leg: fuldt trænet – alle færdigheder på max (ingen XP eller rekord).' : 'Fri leg: din egen springer med dine færdigheder.');
      });
      $('soundBtn').addEventListener('click', () => {
        this.save.sound = !(this.save.sound !== false);
        g.sfx.enabled = this.save.sound; g.sfx.unlock();
        TR.persist(this.save); this.renderMenu();
      });
      if (document.fullscreenEnabled) {
        $('fullBtn').hidden = false;
        $('fullBtn').addEventListener('click', () => {
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen().then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } }).catch(() => {});
        });
      }
      $('respecBtn').addEventListener('click', () => { Object.keys(this.save.skills).forEach((k) => (this.save.skills[k] = 0)); TR.persist(this.save); this.renderSkills(); });
      $('nameInput').addEventListener('input', (e) => { this.save.name = e.target.value.trim().slice(0, 20) || 'Spiller'; TR.persist(this.save); });
      $('shareBtn').addEventListener('click', () => this.share());
      $('copyBtn').addEventListener('click', () => this.copyLink());
      g.input.onPause = () => { if (this.screen === 'play') this.pause(); else if (this.screen === 'pause') this.resume(); };
      g.input.bindTouch($('touch'));
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.screen === 'play') this.pause(); });
      // Første berøring låser lyd op (kræves af iOS)
      const unlock = () => g.sfx.unlock();
      addEventListener('pointerdown', unlock, { passive: true });
      addEventListener('keydown', unlock);
    }

    // ---------- Navigation ----------
    show(name) {
      this.screen = name;
      document.querySelectorAll('.screen').forEach((s) => (s.hidden = s.id !== name));
      const playing = name === 'play' || name === 'pause' || name === 'result';
      $('hud').hidden = !playing;
      $('touch').hidden = !(this.touch && name === 'play');
      this.game.renderer.safeBottom = this.touch && playing ? 150 : 0;
      document.body.classList.toggle('playing', name === 'play');
      document.body.classList.toggle('touch', this.touch);
      if (name === 'menu') this.renderMenu();
      if (name === 'challenges') this.renderChallenges();
      if (name === 'skills') this.renderSkills();
      if (name === 'player') this.renderPlayer();
    }

    go(where) {
      const g = this.game, M = TR.Modes;
      if (where === 'help') this.helpFromPause = false;
      switch (where) {
        case 'free': return this.start(() => g.startMode(new M.FreeMode(g, this.save.freeMax ? { skills: TR.MAX_SKILLS } : {})));
        case 'time': return this.start(() => g.startMode(new M.FreeMode(g, { time: 60 })));
        case 'routine': return this.start(() => g.startMode(new M.RoutineMode(g, {})));
        case 'menu':
          if (this.screen === 'help' && this.helpFromPause) { this.helpFromPause = false; return this.show('pause'); }
          return this.toMenu();
        default: return this.show(where);
      }
    }

    start(fn) {
      this.lastStart = fn;
      if (!this.save.seenHelp) {
        this.save.seenHelp = true; TR.persist(this.save);
        this.toast(this.touch ? 'Tryk SATS når ringen bliver gul. Hold ◀ eller ▶ for at lade rotation op, og slip for at bruge den. I luften: hold STRAKT, HOFTE, LUKKET eller SKRUE – slip for at bremse.' : 'Tryk MELLEMRUM når ringen bliver gul. Hold ← eller → for at lade rotation op, og slip for at bruge den. I luften: hold F strakt, D hoftebøjet, S lukket eller Shift skrue – slip for at bremse.', 8000);
      }
      fn();
    }

    startChallenge(def) {
      const g = this.game, M = TR.Modes;
      g.setArena(def.arena);
      if (def.type === 'score') return this.start(() => g.startMode(new M.FreeMode(g, { time: def.time, challenge: def })));
      if (def.type === 'routine') return this.start(() => g.startMode(new M.RoutineMode(g, { challenge: def })));
      return this.start(() => g.startMode(new M.ChallengeMode(g, { challenge: def })));
    }

    startVersus(ch) {
      const g = this.game, M = TR.Modes;
      if (TR.arenaUnlocked(this.save, ch.arena)) g.setArena(ch.arena);
      if (ch.kind === 'time') return this.start(() => g.startMode(new M.FreeMode(g, { time: 60, versus: ch, title: `Udfordring fra ${ch.name}` })));
      if (ch.kind === 'routine') return this.start(() => g.startMode(new M.RoutineMode(g, { versus: ch })));
      const def = { id: 'versus', title: ch.title, desc: `Land ${ch.title} med bedre E end ${ch.name} (${TR.fmt(ch.E)}).`, type: 'skill', match: ch.match };
      return this.start(() => g.startMode(new M.ChallengeMode(g, { challenge: def, versus: ch })));
    }

    onModeStart() {
      this.show('play');
      $('routineList').hidden = true;
    }

    pause() {
      if (this.screen !== 'play') return;
      this.game.paused = true;
      this.show('pause');
    }
    resume() {
      this.game.paused = false;
      this.game.last = 0;
      this.show('play');
    }
    toMenu() {
      this.helpFromPause = false;
      TR.persist(this.save);
      this.game.paused = false;
      this.game.setDemo();
      this.show('menu');
    }

    // ---------- Menu ----------
    renderMenu() {
      const s = this.save;
      const li = TR.levelInfo(s.xp);
      const stars = TR.totalStars(s);
      $('profileCard').innerHTML = `
        <div class="lvl"><b>${li.level}</b><small>niveau</small></div>
        <div class="grow">
          <div class="pname">${esc(s.name)}</div>
          <div class="xpbar"><i style="width:${Math.round(li.frac * 100)}%"></i></div>
          <div class="muted small">${s.xp - li.cur} / ${li.next - li.cur} XP · ⭐ ${stars}/${TR.Challenges.MAX_STARS} · Rekorder: fri ${s.best.free || 0}, 60 s ${s.best.time || 0}, rutine ${TR.fmt(s.best.routine || 0, 2)}</div>
        </div>`;
      const pts = TR.freePoints(s);
      $('pointsBadge').hidden = !pts;
      $('pointsBadge').textContent = pts;
      $('soundBtn').textContent = `Lyd: ${s.sound !== false ? 'til' : 'fra'}`;
      $('freeMaxBtn').textContent = `Fri leg: ${s.freeMax ? 'fuldt trænet' : 'min springer'}`;
      $('freeMaxBtn').classList.toggle('on', !!s.freeMax);
      $('freeMaxBtn').setAttribute('aria-pressed', s.freeMax ? 'true' : 'false');
      $('arenaList').innerHTML = TR.ARENAS.map((a) => {
        const ok = TR.arenaUnlocked(s, a.id);
        return `<button class="arena ${a.id} ${this.game.arena === a.id ? 'sel' : ''}" data-arena="${a.id}" ${ok ? '' : 'disabled'}>
          <b>${esc(a.name)}</b><small>${ok ? esc(a.tagline) : `🔒 Kræver ${a.need} ⭐`}</small></button>`;
      }).join('');
      $('arenaList').querySelectorAll('[data-arena]').forEach((b) => b.addEventListener('click', () => { this.game.setArena(b.dataset.arena); TR.persist(this.save); this.renderMenu(); }));
    }

    renderChallenges() {
      const s = this.save;
      $('challengeList').innerHTML = TR.ARENAS.map((a) => {
        const ok = TR.arenaUnlocked(s, a.id);
        const got = a.challenges.reduce((n, c) => n + (s.stars[c.id] | 0), 0);
        return `<div class="ch-arena ${a.id} ${ok ? '' : 'locked'}">
          <div class="ch-head"><h3>${esc(a.name)}</h3><span>${ok ? `⭐ ${got}/${a.challenges.length * 3}` : `🔒 ${a.need} ⭐ kræves (du har ${TR.totalStars(s)})`}</span></div>
          <div class="ch-grid">${a.challenges.map((c) => {
            const st = s.stars[c.id] | 0;
            const txt = TR.Challenges.starsText(c);
            return `<button class="ch-card" data-ch="${c.id}" ${ok ? '' : 'disabled'}>
              <div class="ch-stars">${[0, 1, 2].map((i) => `<span class="${i < st ? 'on' : ''}" title="${esc(txt[i])}">★</span>`).join('')}</div>
              <b>${esc(c.title)}</b><small>${esc(c.desc)}</small></button>`;
          }).join('')}</div></div>`;
      }).join('');
      $('challengeList').querySelectorAll('[data-ch]').forEach((b) => b.addEventListener('click', () => this.startChallenge(TR.Challenges.byId[b.dataset.ch])));
    }

    renderSkills() {
      const s = this.save;
      const pts = TR.freePoints(s);
      $('skillPoints').innerHTML = `Ledige point: <b>${pts}</b> · Du får 1 point pr. nyt niveau og 1 point pr. 2 stjerner.`;
      $('skillList').innerHTML = TR.SKILLS.map((k) => {
        const lv = s.skills[k.id] | 0;
        return `<div class="skill">
          <div class="sk-icon">${k.icon}</div>
          <div class="grow"><b>${esc(k.name)}</b><small>${esc(k.desc)}</small>
            <div class="pips">${Array.from({ length: TR.SKILL_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
          <button class="plus" data-sk="${k.id}" ${pts > 0 && lv < TR.SKILL_MAX ? '' : 'disabled'} aria-label="Opgradér ${esc(k.name)}">+</button>
        </div>`;
      }).join('');
      $('skillList').querySelectorAll('[data-sk]').forEach((b) => b.addEventListener('click', () => {
        if (TR.freePoints(s) <= 0) return;
        s.skills[b.dataset.sk] = Math.min(TR.SKILL_MAX, (s.skills[b.dataset.sk] | 0) + 1);
        TR.persist(s); this.game.sfx.combo(3); this.renderSkills();
      }));
    }

    renderPlayer() {
      const s = this.save;
      $('nameInput').value = s.name;
      const ctl = s.control === 'physics' ? 'physics' : 'arcade';
      document.querySelectorAll('[data-control]').forEach((b) => {
        const on = b.dataset.control === ctl;
        b.classList.toggle('sel', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.onclick = () => { s.control = b.dataset.control; TR.persist(s); this.renderPlayer(); };
      });
      for (const key of Object.keys(SWATCH)) {
        const box = $(key + 'Sw');
        const cur = key === 'legs' ? s.look.legs || '#f3f4f8' : s.look[key];
        box.innerHTML = SWATCH[key].map((c) => `<button class="sw ${c === cur ? 'sel' : ''}" style="background:${c}" data-c="${c}" aria-label="${c}"></button>`).join('');
        box.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { s.look[key] = b.dataset.c; TR.persist(s); this.renderPlayer(); }));
      }
      $('statsBox').innerHTML = `<div><b>${TR.levelInfo(s.xp).level}</b><small>Niveau</small></div><div><b>${TR.totalStars(s)}</b><small>Stjerner</small></div>
        <div><b>${s.best.time || 0}</b><small>60 s rekord</small></div><div><b>${TR.fmt(s.best.routine || 0, 2)}</b><small>Bedste rutine</small></div>`;
    }

    // ---------- Resultat ----------
    showResult(res) {
      this.result = res;
      $('resTitle').textContent = res.win === true ? 'Du vandt! 🎉' : res.win === false ? 'Ikke denne gang' : res.title;
      $('resStars').innerHTML = res.stars != null ? [0, 1, 2].map((i) => `<span class="${i < res.stars ? 'on' : ''}" style="animation-delay:${0.2 + i * 0.25}s">★</span>`).join('') : '';
      $('resBig').textContent = res.big || '';
      $('resBigLabel').textContent = res.bigLabel || '';
      let note = res.note || '';
      if (res.record) note = '🏅 Ny rekord! ' + note;
      if (res.newStars) note += ` +${res.newStars} ⭐`;
      if (res.unlocked) note += ` · Ny bane låst op: ${res.unlocked.join(', ')}!`;
      if (res.stars === 0) note = (note + ' Målet blev ikke nået.').trim();
      $('resNote').textContent = note;
      $('resLines').innerHTML = (res.lines || []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
      $('resList').innerHTML = (res.list || []).map((t) => `<li>${esc(t)}</li>`).join('');
      $('resShare').hidden = true;
      $('shareBtn').hidden = !res.share;
      this.show('result');
    }

    shareLink() {
      const r = this.result;
      if (!r || !r.share) return '';
      return TR.Share.linkFor({ ...r.share, name: this.save.name, arena: this.game.arena });
    }

    async share() {
      const link = this.shareLink();
      if (!link) return;
      const r = this.result.share;
      const text = r.kind === 'time' ? `Jeg fik ${r.score} point på 60 sek. i Trampolin – kan du slå mig?`
        : r.kind === 'routine' ? `Jeg fik ${TR.fmt(r.score, 2)} point i en trampolinrutine – kan du slå mig?`
          : `Kan du lande ${r.title} bedre end mig (E ${TR.fmt(r.E)})?`;
      if (navigator.share) {
        try { await navigator.share({ title: 'Trampolin-udfordring', text, url: link }); return; } catch (e) { /* bruger annullerede – vis link */ }
      }
      $('resShare').hidden = false;
      $('shareInput').value = link;
      this.copyLink();
    }

    copyLink() {
      const inp = $('shareInput');
      if (!inp.value) inp.value = this.shareLink();
      inp.select();
      const done = () => this.toast('Link kopieret – send det til en ven!');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done, () => { try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ } });
      else { try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ } }
    }

    incoming(ch) {
      $('incomingText').textContent = TR.Share.describe(ch);
      this.show('incoming');
      $('acceptBtn').onclick = () => { history.replaceState(null, '', location.pathname + location.search); this.startVersus(ch); };
      $('declineBtn').onclick = () => { history.replaceState(null, '', location.pathname + location.search); this.show('menu'); };
    }

    toast(msg, ms = 2500) {
      const t = $('toast');
      t.textContent = msg; t.hidden = false;
      clearTimeout(this.toastT);
      this.toastT = setTimeout(() => (t.hidden = true), ms);
    }

    // ---------- Rotationsmåler ----------
    rotMeter() {
      const info = this.game.athlete.rotInfo();
      const fill = $('rmFill');
      if (!info) { fill.style.width = '0'; $('rmPct').textContent = '–'; $('rmDir').textContent = 'Rotation'; return; }
      const f = info.frac;
      const w = Math.abs(f) * 50;
      fill.style.width = `${w}%`;
      fill.style.left = f < 0 ? '50%' : `${50 - w}%`;
      fill.style.background = f < 0 ? 'linear-gradient(90deg, #4cc9f0, #ffd166, #ff6b81)' : 'linear-gradient(270deg, #4cc9f0, #ffd166, #ff6b81)';
      $('rmPct').textContent = `${Math.round(Math.abs(f) * 100)} %`;
      const head = info.phase === 'charge' ? 'Lader op' : info.phase === 'armed' ? 'Klar – rotation' : 'Rotation';
      $('rmDir').textContent = info.dir ? `${head} ${info.dir}` : head;
      let est;
      const k = this.touch ? '◀ eller ▶' : '← eller →';
      if (info.phase === 'charge') {
        est = `≈ ${TR.fmt(info.straight, 1)} salto strakt · ${TR.fmt(info.tuck, 1)} lukket · slip`;
      } else if (info.phase === 'armed') {
        est = `≈ ${TR.fmt(info.straight, 1)} salto strakt · ${TR.fmt(info.tuck, 1)} lukket`;
      } else if (info.phase === 'bed' && this.game.athlete.control === 'arcade') {
        est = `Hold ${k} for at lade rotation op`;
      } else if (info.phase === 'bed') {
        est = Math.abs(f) < 0.02 ? `Hold ${this.touch ? '◀ eller ▶' : '← eller →'} på dugen for at vippe`
          : `≈ ${TR.fmt(info.straight, 1)} salto strakt · ${TR.fmt(info.tuck, 1)} lukket`;
      } else {
        est = this.game.athlete.control === 'arcade'
          ? 'Hold en position for at rotere · slip for at bremse'
          : `I luften – ${this.touch ? '◀ ▶' : '← →'} justerer`;
      }
      if (est !== this.lastEst) { $('rmEst').textContent = est; this.lastEst = est; }
    }

    // ---------- HUD ----------
    frame(dt) {
      const g = this.game;
      if (this.screen !== 'play' || !g.mode) return;
      this.rotMeter();
      const live = g.athlete.live();
      const lt = live ? TR.liveText(live) : '';
      if (lt !== this.lastLive) { $('live').textContent = lt; this.lastLive = lt; }
      this.hudT -= dt;
      if (this.hudT > 0) return;
      this.hudT = 0.1;
      const h = g.mode.hud();
      $('hudTitle').textContent = h.title || '';
      $('hudMain').textContent = h.main || '';
      $('hudSub').textContent = h.sub || '';
      $('hudGoal').textContent = h.goal || '';
      $('hudTimer').textContent = h.timer != null ? `⏱ ${Math.ceil(h.timer)} s · ` : '';
      $('hudHeight').textContent = `${TR.fmt(g.athlete.height)} m`;
      const rl = $('routineList');
      if (h.list) {
        rl.hidden = h.list.length === 0;
        const html = h.list.map((it) => `<li><span>${esc(it.code)}</span> ${esc(it.name)} <em>${TR.fmt(it.dd)} · ${TR.fmt(it.E)}</em></li>`).join('');
        if (html !== this.lastList) { rl.innerHTML = html; this.lastList = html; }
      } else rl.hidden = true;
    }
  }

  TR.UI = UI;
})(globalThis);
