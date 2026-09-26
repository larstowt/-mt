// Tastatur, touch-knapper (multitouch) og gamepad samlet til én input-tilstand.
(function (G) {
  'use strict';
  const TR = G.TR;

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'push', KeyW: 'push',
    ArrowUp: 'straight', KeyV: 'straight',
    ArrowDown: 'kill', KeyS: 'kill',
    KeyZ: 'tuck', KeyJ: 'tuck',
    KeyX: 'pike', KeyK: 'pike',
    KeyC: 'twist', KeyL: 'twist', ShiftLeft: 'twist', ShiftRight: 'twist',
  };

  class Input {
    constructor() {
      this.keys = {};
      this.touch = {};
      this.pointers = new Map();
      this.onPause = null;
      this.enabled = true;
      addEventListener('keydown', (e) => {
        if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
        if (e.code === 'Escape' || e.code === 'KeyP') { if (this.onPause) this.onPause(); return; }
        const a = KEYMAP[e.code];
        if (a) { this.keys[a] = true; e.preventDefault(); }
      });
      addEventListener('keyup', (e) => {
        const a = KEYMAP[e.code];
        if (a) { this.keys[a] = false; e.preventDefault(); }
      });
      addEventListener('blur', () => { this.keys = {}; this.touch = {}; this.pointers.clear(); });
    }

    // Touch-knapper: hver knap har data-act. Glid mellem knapper understøttes.
    bindTouch(root) {
      const update = () => {
        const t = {};
        this.pointers.forEach((act) => { if (act) t[act] = true; });
        this.touch = t;
        root.querySelectorAll('[data-act]').forEach((b) => b.classList.toggle('on', !!t[b.dataset.act]));
      };
      const actAt = (x, y) => {
        const el = document.elementFromPoint(x, y);
        const b = el && el.closest && el.closest('[data-act]');
        return b && root.contains(b) ? b.dataset.act : null;
      };
      root.addEventListener('pointerdown', (e) => {
        const act = actAt(e.clientX, e.clientY);
        if (!act) return;
        e.preventDefault();
        try { root.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        this.pointers.set(e.pointerId, act);
        if (navigator.vibrate) try { navigator.vibrate(8); } catch (err) { /* ignore */ }
        update();
      });
      root.addEventListener('pointermove', (e) => {
        if (!this.pointers.has(e.pointerId)) return;
        const act = actAt(e.clientX, e.clientY);
        if (act !== this.pointers.get(e.pointerId)) { this.pointers.set(e.pointerId, act); update(); }
      });
      const end = (e) => { if (this.pointers.delete(e.pointerId)) update(); };
      root.addEventListener('pointerup', end);
      root.addEventListener('pointercancel', end);
      root.addEventListener('lostpointercapture', end);
      root.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    pad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const p = pads && Array.from(pads).find((x) => x && x.connected);
      if (!p) return {};
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = p.axes[0] || 0;
      return {
        left: ax < -0.4 || b(14), right: ax > 0.4 || b(15),
        push: b(0), kill: b(13) || b(1), tuck: b(2) || b(6), pike: b(3) || b(7), twist: b(5), straight: b(4) || b(12),
      };
    }

    state() {
      if (!this.enabled) return { lean: 0, push: false, kill: false, tuck: false, pike: false, twist: false, straight: false };
      const k = this.keys, t = this.touch, g = this.pad();
      const any = (a) => !!(k[a] || t[a] || g[a]);
      const left = any('left'), right = any('right');
      return {
        lean: left && !right ? 1 : right && !left ? -1 : 0,
        push: any('push'), kill: any('kill'), tuck: any('tuck'), pike: any('pike'), twist: any('twist'), straight: any('straight'),
      };
    }
  }

  TR.Input = Input;
})(globalThis);
