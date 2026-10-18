// Udfordringer som links: al data ligger i #-delen af adressen, så der kræves ingen server.
(function (G) {
  'use strict';
  const TR = G.TR;

  function b64urlEncode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // kind: 'time' (60 s point), 'routine' (rutinepoint), 'skill' (et bestemt spring)
  function encode(ch) {
    const o = { v: 1, k: ch.kind, n: String(ch.name || 'En ven').slice(0, 24), a: ch.arena || 'hall', s: ch.score };
    if (ch.kind === 'skill') { o.m = ch.match; o.t = ch.title; o.e = ch.E; }
    if (ch.kind === 'routine' && ch.list) o.l = ch.list.slice(0, 10);
    return b64urlEncode(JSON.stringify(o));
  }

  function decode(token) {
    try {
      const o = JSON.parse(b64urlDecode(token));
      if (!o || o.v !== 1 || !['time', 'routine', 'skill'].includes(o.k)) return null;
      const ch = { kind: o.k, name: String(o.n || 'En ven').slice(0, 24), arena: TR.arenaById(o.a).id, score: Number(o.s) || 0 };
      if (o.k === 'skill') {
        const m = o.m || {};
        ch.match = { dir: m.dir === 'F' || m.dir === 'B' ? m.dir : undefined, q: m.q | 0, halves: m.halves | 0, shape: ['o', '<', '/'].includes(m.shape) ? m.shape : undefined };
        if (Array.isArray(m.split)) ch.match.split = m.split.map((v) => v | 0).slice(0, 4);
        ch.title = String(o.t || 'Spring').slice(0, 60);
        ch.E = Number(o.e) || 0;
      }
      if (Array.isArray(o.l)) ch.list = o.l.map((s) => String(s).slice(0, 60)).slice(0, 10);
      return ch;
    } catch (e) {
      return null;
    }
  }

  function linkFor(ch) {
    const base = G.location ? G.location.href.split('#')[0] : '';
    return `${base}#udfordring=${encode(ch)}`;
  }

  function fromLocation() {
    if (!G.location) return null;
    const m = /udfordring=([A-Za-z0-9_-]+)/.exec(G.location.hash || '');
    return m ? decode(m[1]) : null;
  }

  function describe(ch) {
    if (ch.kind === 'time') return `${ch.name} fik ${ch.score} point på 60 sekunder. Kan du slå det?`;
    if (ch.kind === 'routine') return `${ch.name} fik ${TR.fmt(ch.score, 2)} point i en rutine. Kan du slå det?`;
    return `${ch.name} landede ${ch.title} med E ${TR.fmt(ch.E)}. Kan du gøre det bedre?`;
  }

  TR.Share = { encode, decode, linkFor, fromLocation, describe };
})(globalThis);
