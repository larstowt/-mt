// Opstart: indlæs gemt spil, start løkken og håndtér udfordringslinks.
(function (G) {
  'use strict';
  const TR = G.TR;
  const save = TR.loadSave();
  const game = new TR.Game(document.getElementById('game'), save);
  const ui = new TR.UI(game);
  game.run();
  G.trampolin = { game, ui };

  const ch = TR.Share.fromLocation();
  if (ch) ui.incoming(ch);
  addEventListener('hashchange', () => { const c = TR.Share.fromLocation(); if (c) ui.incoming(c); });

  // Offline/installerbar app (virker kun over http/https, ikke file://)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})(globalThis);
