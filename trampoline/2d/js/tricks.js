// Genkendelse af spring: salto-kvarte, skruer pr. salto, position, FIG-kode og sværhedsgrad.
(function (G) {
  'use strict';
  const TR = G.TR;
  const TAU = TR.TAU;

  const HALF_WORD = ['', '½', 'hel', '1½', 'dobbelt', '2½', 'tredobbelt', '3½', 'firdobbelt', '4½'];
  const SOM_WORD = ['', 'Salto', 'Dobbelt salto', 'Tripel salto', 'Firdobbelt salto'];
  const SHAPE_NAME = { o: 'lukket', '<': 'hoftebøjet', '/': 'strakt' };
  const SHAPE_LONG = { o: 'Lukket (tuck)', '<': 'Hoftebøjet (pike)', '/': 'Strakt (straight)' };

  // Kendte navne: retning|kvarte|skruer pr. salto
  const NAMED = {
    'F|4|1': 'Barani',
    'B|4|1': 'Salto baglæns m. ½ skrue',
    'B|4|2': 'Hel skrue',
    'F|4|2': 'Salto forlæns m. hel skrue',
    'F|4|3': 'Rudi',
    'B|4|3': 'Salto baglæns m. 1½ skrue',
    'B|4|4': 'Dobbelt skrue',
    'F|4|5': 'Randy',
    'B|4|6': 'Tripel skrue',
    'F|4|7': 'Adolph',
    'F|8|1,0': 'Barani-ind',
    'F|8|0,1': 'Barani-ud',
    'F|8|1,1': 'Barani-ind barani-ud',
    'B|8|2,0': 'Hel-ind',
    'B|8|0,2': 'Hel-ud',
    'B|8|1,1': 'Halv-ind halv-ud',
    'B|8|2,2': 'Miller',
    'F|8|1,2': 'Barani-ind hel-ud',
    'F|8|1,3': 'Halv-ind rudi-ud',
    'F|8|3,1': 'Rudi-ind barani-ud',
    'B|8|0,4': 'Dobbelt-ud',
    'F|12|0,0,1': 'Triffus',
    'F|12|1,0,1': 'Barani-ind triffus',
  };

  // Spring der starter eller slutter på ryg eller mave: fra>til|retning|kvarte|halve skruer
  const POS = { feet: 'fødder', back: 'ryg', front: 'mave' };
  const POS_CODE = { feet: 'F', back: 'R', front: 'M' };
  const NAMED_DROP = {
    'feet>back|B|1|0': 'Rygfald',
    'feet>front|F|1|0': 'Mavefald',
    'back>feet|F|1|0': 'Fra ryg til fødder',
    'front>feet|B|1|0': 'Fra mave til fødder',
    'back>feet|F|5|0': 'Ball-out',
    'back>feet|F|5|1': 'Ball-out barani',
    'back>feet|F|5|3': 'Ball-out rudi',
    'front>feet|B|5|0': 'Cody',
    'front>feet|B|5|2': 'Cody med hel skrue',
    'back>feet|B|3|0': 'Kaboom',
    'back>front|F|2|0': 'Fra ryg til mave',
    'front>back|B|2|0': 'Fra mave til ryg',
    'back>back||0|0': 'Ryg til ryg',
    'front>front||0|0': 'Mave til mave',
  };
  const quarterWord = (q) => `${Math.floor(q / 4) || ''}${['', '¼', '½', '¾'][q % 4]}`;

  function sumArr(a) { return a.reduce((s, v) => s + v, 0); }

  // Sværhedsgrad tilnærmet FIG-reglerne.
  function difficulty(q, halves, shape) {
    const nSom = Math.floor(q / 4);
    const H = sumArr(halves);
    let d = 0.1 * q + 0.1 * H;
    if (nSom >= 1) d += 0.1 * nSom;
    if (shape !== 'o' && nSom >= 1) {
      if (nSom === 1 && H === 0) d += 0.1;
      else if (nSom >= 2) d += 0.1 * nSom;
    }
    if (nSom >= 3) d += 0.1 * nSom;
    return TR.round1(d);
  }

  function describe(q, dir, halves, shape, from, to) {
    from = from || 'feet'; to = to || 'feet';
    if (from !== 'feet' || to !== 'feet') return describeDrop(q, dir, halves, shape, from, to);
    const nSom = Math.floor(q / 4);
    const H = sumArr(halves);
    const sym = shape;
    let code, name, key;
    if (nSom === 0) {
      code = `0 ${H} ${sym}`;
      key = `J|${H}|${sym}`;
      if (H === 0) name = shape === 'o' ? 'Lukket hop' : shape === '<' ? 'Hoftebøjet hop' : 'Strakt hop';
      else name = `${cap(HALF_WORD[H] || H / 2 + '')} skrue hop`;
      return { code, key, name, fullName: name, dd: TR.round1(0.1 * H), jump: true };
    }
    code = `${q} ${halves.join(' ')} ${sym}`;
    const nk = `${dir}|${q}|${halves.join(',')}`;
    key = `${dir}|${code}`;
    name = NAMED[nk];
    if (!name) {
      name = `${SOM_WORD[nSom] || nSom + '-dobbelt salto'} ${dir === 'B' ? 'baglæns' : 'forlæns'}`;
      if (H > 0) {
        if (nSom === 1) name += ` m. ${HALF_WORD[H] || H / 2} skrue`;
        else name += ' · ' + halves.map((h) => (h ? HALF_WORD[h] || h / 2 : '0')).join('-') + ' skrue';
      }
    }
    return { code, key, name, fullName: `${name} ${SHAPE_NAME[shape]}`, dd: difficulty(q, halves, shape), jump: false };
  }

  function describeDrop(q, dir, halves, shape, from, to) {
    const H = sumArr(halves);
    const code = `${POS_CODE[from]} ${q} ${halves.join(' ')} ${shape} ${POS_CODE[to]}`;
    const key = `${from}>${to}|${dir}|${code}`;
    let name = NAMED_DROP[`${from}>${to}|${dir}|${q}|${H}`];
    if (!name) {
      const parts = [];
      if (q > 0) parts.push(`${quarterWord(q)} salto ${dir === 'B' ? 'baglæns' : 'forlæns'}`);
      if (H > 0) parts.push(`${q > 0 ? 'm. ' : ''}${HALF_WORD[H] || H / 2} skrue`);
      name = `${from !== 'feet' ? `Fra ${POS[from]}: ` : ''}${parts.join(' ') || 'hop'} til ${POS[to]}`;
      name = cap(name);
    }
    const fullName = q >= 4 ? `${name} ${SHAPE_NAME[shape]}` : name;
    return { code, key, name, fullName, dd: q === 0 ? TR.round1(0.1 * H) : difficulty(q, halves, shape), jump: q === 0 && H === 0, drop: true };
  }

  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

  // Fordel det samlede antal halve skruer på saltoerne, så summen passer.
  function distribute(buckets, nSom, total) {
    if (nSom <= 1) return [total];
    const b = buckets.slice(0, nSom);
    for (let i = nSom; i < buckets.length; i++) b[nSom - 1] += buckets[i];
    const raw = b.map((v) => v / Math.PI);
    const res = raw.map((v) => Math.floor(v));
    let left = total - sumArr(res);
    const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, c) => c[0] - a[0]);
    for (let k = 0; left > 0 && k < order.length * 4; k++, left--) res[order[k % order.length][1]]++;
    while (left < 0) {
      const i = res.findIndex((v) => v > 0);
      if (i < 0) break;
      res[i]--; left++;
    }
    return res;
  }

  class TrickTracker {
    constructor() { this.active = false; }
    start(phi, psi, x, from, tilt) {
      this.active = true;
      this.from = from || 'feet';
      this.tilt0 = tilt || 0;
      this.phi0 = phi; this.psi0 = psi; this.x0 = x;
      this.dphi = 0; this.raw = 0; this.dpsi = 0; this.t = 0;
      this.shapeW = { o: 0, '<': 0, '/': 0 };
      this.shapeT = { o: 0, '<': 0, '/': 0 };
      this.buckets = [0, 0, 0, 0, 0, 0];
      this.lastClosedT = -1;
      this.facing0 = Math.cos(psi) >= 0 ? 1 : -1;
    }
    // dphi: overkroppens rotation (til genkendelse); raw: saltovinklen (til live-visning og styring)
    update(dphi, dpsi, shape, dt, raw) {
      if (!this.active) return;
      this.dphi += dphi;
      this.raw += raw == null ? dphi : raw; this.dpsi += dpsi; this.t += dt;
      this.shapeW[shape] += Math.abs(dphi);
      this.shapeT[shape] += dt;
      const b = Math.min(Math.floor(Math.abs(this.dphi) / TAU), this.buckets.length - 1);
      this.buckets[b] += Math.abs(dpsi);
      if (shape !== '/') this.lastClosedT = this.t;
    }
    abort() { this.active = false; }
    // Hvad er der roteret indtil videre (til live-visning).
    live() {
      if (!this.active) return null;
      return { quarters: Math.floor(Math.abs(this.raw) / (Math.PI / 2) + 0.05), halves: Math.floor(Math.abs(this.dpsi) / Math.PI + 0.05) };
    }
    // to: hvor springet landede (fødder/ryg/mave); dev: afvigelse fra landestillingen (mod uret).
    finish(to, dev) {
      this.active = false;
      to = to || 'feet';
      // Rotation mellem grundstillingerne (start- og slutvip trækkes fra).
      const rot = this.dphi + this.tilt0 - (dev || 0);
      let q = Math.round(Math.abs(rot) / (Math.PI / 2));
      if (this.from === 'feet' && to === 'feet') q = Math.round(q / 4) * 4;
      const nSom = Math.floor(q / 4);
      const H = Math.round(Math.abs(this.dpsi) / Math.PI);
      let shape;
      if (q < 4) {
        shape = this.shapeT.o > 0.18 ? 'o' : this.shapeT['<'] > 0.18 ? '<' : '/';
      } else {
        const w = this.shapeW;
        shape = w.o >= w['<'] && w.o >= w['/'] ? 'o' : w['<'] >= w['/'] ? '<' : '/';
      }
      const dirSign = Math.sign(rot) * this.facing0;
      const dir = q === 0 ? '' : dirSign > 0 ? 'B' : 'F';
      const halves = distribute(this.buckets, Math.max(1, Math.round(q / 4)), H);
      const d = describe(q, dir, halves, shape, this.from, to);
      return {
        ...d, quarters: q, somersaults: nSom, dir, halves, totalHalves: H, shape, from: this.from, to,
        tof: this.t, x0: this.x0,
        openTime: this.lastClosedT < 0 ? this.t : this.t - this.lastClosedT,
        usedClosed: this.lastClosedT >= 0,
      };
    }
  }

  TR.TrickTracker = TrickTracker;
  TR.Tricks = { describe, difficulty, distribute, HALF_WORD, SHAPE_NAME, SHAPE_LONG, NAMED, NAMED_DROP, POS };

  // Tekst til live-visning i luften, fx "1¼ salto · ½ skrue".
  TR.liveText = function (live) {
    if (!live) return '';
    const parts = [];
    const q = live.quarters;
    if (q > 0) {
      const whole = Math.floor(q / 4), frac = q % 4;
      const fr = ['', '¼', '½', '¾'][frac];
      parts.push(`${whole || ''}${fr} salto`);
    }
    if (live.halves > 0) parts.push(`${HALF_WORD[live.halves] || live.halves / 2} skrue`);
    return parts.join(' · ');
  };
})(globalThis);
