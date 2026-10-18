// 3D-tegning (Finalearena) med three.js. Springeren og dugen styres af den samme fysik og kropsmodel
// som 2D-tegningen; tekster, popups, partikler og højdemåler tegnes på 2D-lærredet ovenpå.
// Kan WebGL ikke startes, bruger spillet automatisk 2D-tegningen (TR.Renderer).
(function (G) {
  'use strict';
  const TR = G.TR;
  const THREE = G.THREE;
  if (!THREE || !TR.Renderer) return;
  const B = TR.Body, I = B.IDX, BED = TR.BED, TAU = Math.PI * 2;
  const V = THREE.Vector3, UP = new V(0, 1, 0);
  const rnd = (s) => { const x = Math.sin(s * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const std = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

  // Kameraer, der kan vælges i menuen og i spillet
  TR.CAMS = [
    { id: 'side', name: 'Fra siden', tagline: 'Som et klassisk trampolinspil.' },
    { id: 'skra', name: 'Skråt', tagline: 'Se springet i 3D fra hjørnet.' },
  ];

  TR.webglOK = () => {
    try { const c = document.createElement('canvas'); return !!(G.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; }
  };

  // ---------- Springeren: tilspidsede lemmer, drejet overkrop, hoved med hår og ansigt ----------
  function makeAthlete(root, S) {
    const g = new THREE.Group(); root.add(g);
    const parts = [];
    const add = (m) => { m.castShadow = true; g.add(m); return m; };
    const limb = (a, b, ra, rb, mat) => parts.push({ a, b, m: add(new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, 1, 14, 1, true), mat)) });
    const ball = (j, r, mat) => parts.push({ j, m: add(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8), mat)) });
    for (const s of ['L', 'R']) {
      limb(I['hip' + s], I['knee' + s], 0.085, 0.06, S.legs);
      limb(I['knee' + s], I['ankle' + s], 0.058, 0.04, S.legs);
      limb(I['ankle' + s], I['toe' + s], 0.04, 0.03, S.feet);
      ball(I['hip' + s], 0.085, S.legs); ball(I['knee' + s], 0.058, S.legs); ball(I['ankle' + s], 0.04, S.feet); ball(I['toe' + s], 0.03, S.feet);
      limb(I['sh' + s], I['elbow' + s], 0.048, 0.038, S.skin);
      limb(I['elbow' + s], I['hand' + s], 0.038, 0.03, S.skin);
      ball(I['sh' + s], 0.05, S.suit); ball(I['elbow' + s], 0.038, S.skin); ball(I['hand' + s], 0.038, S.skin);
    }
    limb(I.sh, I.neck, 0.05, 0.05, S.skin);
    const prof = [[0.001, -0.04], [0.78, 0], [0.92, 0.1], [0.84, 0.42], [0.98, 0.7], [1.0, 0.86], [0.72, 1.0], [0.001, 1.04]].map(([r, y]) => new THREE.Vector2(r, y));
    const torso = add(new THREE.Mesh(new THREE.LatheGeometry(prof, 18), S.suit));
    const head = new THREE.Group(); g.add(head);
    const hr = B.LEN.head;
    head.add(add(new THREE.Mesh(new THREE.SphereGeometry(hr, 18, 14), S.skin)));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.06, 18, 14, 0, TAU, 0, 1.75), S.hair); cap.rotation.x = -0.45; cap.castShadow = true; head.add(cap);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.11, 8, 6), S.eye); e.position.set(sx * hr * 0.36, hr * 0.12, hr * 0.92); head.add(e); }

    const a = new V(), b = new V(), d = new V(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4();
    const hip = new V(), sh = new V(), sl = new V(), sr = new V(), up = new V(), side = new V(), front = new V();
    const hc = new V(), nk = new V(), ns = new V(), hu = new V(), hf = new V(), hs = new V();
    const P = (W, i, out) => out.set(W[i * 3], W[i * 3 + 1], W[i * 3 + 2]);
    return function update(W) {
      for (const p of parts) {
        if (p.j != null) { P(W, p.j, p.m.position); continue; }
        P(W, p.a, a); P(W, p.b, b); d.subVectors(b, a); const len = d.length() || 1e-4;
        q.setFromUnitVectors(UP, d.divideScalar(len));
        p.m.position.copy(a).add(b).multiplyScalar(0.5); p.m.quaternion.copy(q); p.m.scale.set(1, len, 1);
      }
      // overkrop: fra hoften mod skulderen, bredden følger skuldrene
      P(W, I.hip, hip); P(W, I.sh, sh); P(W, I.shL, sl); P(W, I.shR, sr);
      up.subVectors(sh, hip); const len = up.length(); up.normalize();
      side.subVectors(sr, sl); side.addScaledVector(up, -side.dot(up)).normalize();
      front.crossVectors(side, up).normalize();
      m4.makeBasis(side, up, front);
      torso.position.copy(hip); torso.quaternion.setFromRotationMatrix(m4); torso.scale.set(0.175, len, 0.115);
      // hoved: op = nakke→hoved, frem = mod næsen
      P(W, I.head, hc); P(W, I.neck, nk); P(W, I.nose, ns);
      hu.subVectors(hc, nk).normalize(); hf.subVectors(ns, hc); hf.addScaledVector(hu, -hf.dot(hu)).normalize();
      hs.crossVectors(hu, hf).normalize();
      m4.makeBasis(hs, hu, hf); head.position.copy(hc); head.quaternion.setFromRotationMatrix(m4);
    };
  }

  // ---------- Trampolinen (FIG-mål) med dug, der bøjer ned under springeren ----------
  function makeTrampoline(root) {
    const g = new THREE.Group(); root.add(g);
    const F = BED.floor, bx = BED.half, bz = BED.width, fx = BED.frameHalf, fz = BED.frameWidth / 2;
    const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
    const bedGeo = new THREE.PlaneGeometry(2 * bx, 2 * bz, 56, 24); bedGeo.rotateX(-Math.PI / 2);
    const base = bedGeo.attributes.position.array.slice();
    add(new THREE.Mesh(bedGeo, std(0x0c0e12, 0.85)), false);
    const padMat = std(0xc81d2c, 0.45), padH = 0.07, pw = fz - bz;
    const pad = (w, dd, x, z) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, padH, dd), padMat)); m.position.set(x, -padH / 2 + 0.01, z); };
    pad(2 * fx, pw, 0, bz + pw / 2); pad(2 * fx, pw, 0, -(bz + pw / 2));
    pad(fx - bx, 2 * bz, bx + (fx - bx) / 2, 0); pad(fx - bx, 2 * bz, -(bx + (fx - bx) / 2), 0);
    // fjedre
    const list = [];
    for (let x = -bx + 0.1; x <= bx - 0.05; x += 0.2) for (const sz of [-1, 1]) list.push([x, sz * bz, x, sz * (fz - 0.03)]);
    for (let z = -bz + 0.1; z <= bz - 0.05; z += 0.2) for (const sx of [-1, 1]) list.push([sx * bx, z, sx * (fx - 0.03), z]);
    const springs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), std(0xc5ccd6, 0.3, 0.8), list.length);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion();
    list.forEach(([x0, z0, x1, z1], i) => { const dv = new V(x1 - x0, 0, z1 - z0), L = dv.length(); qq.setFromUnitVectors(UP, dv.normalize()); m4.compose(new V((x0 + x1) / 2, -0.045, (z0 + z1) / 2), qq, new V(1, L, 1)); springs.setMatrixAt(i, m4); });
    g.add(springs);
    // stel og ben
    const steel = std(0x8a929c, 0.35, 0.7), wheel = std(0x222222, 0.8);
    const tube = (x0, y0, z0, x1, y1, z1, r) => { const dv = new V(x1 - x0, y1 - y0, z1 - z0), L = dv.length(); const m = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 10), steel)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.quaternion.setFromUnitVectors(UP, dv.normalize()); };
    const y0 = -0.1;
    tube(-fx, y0, fz, fx, y0, fz, 0.03); tube(-fx, y0, -fz, fx, y0, -fz, 0.03);
    tube(fx, y0, -fz, fx, y0, fz, 0.03); tube(-fx, y0, -fz, -fx, y0, fz, 0.03);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        tube(sx * 2.25, y0, sz * 1.38, sx * 2.05, F + 0.02, sz * 1.38, 0.028);
        const w = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14), wheel)); w.position.set(sx * 2.05, F + 0.07, sz * 1.38); w.rotation.x = Math.PI / 2;
      }
      tube(sx * 2.13, F + 0.42, -1.38, sx * 2.13, F + 0.42, 1.38, 0.022);
    }
    return function update(depthAt) {
      const pos = bedGeo.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) pos[i + 1] = base[i + 1] - depthAt(base[i], base[i + 2]);
      bedGeo.attributes.position.needsUpdate = true; bedGeo.computeVertexNormals();
    };
  }

  // ---------- Finalearenaen: mørk hal, spotlys, tribuner med publikum ----------
  function makeArena(scene, small) {
    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.Fog(0x05070c, 14, 40);
    scene.add(new THREE.HemisphereLight(0x8899bb, 0x0b0d12, 0.35));
    const spot = new THREE.SpotLight(0xffffff, 2.2, 40, 0.42, 0.45, 1.2);
    spot.position.set(2, 12, 6); spot.target.position.set(0, 0.5, 0); spot.castShadow = true;
    spot.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048); spot.shadow.bias = -0.0005;
    scene.add(spot, spot.target);
    for (const sx of [-1, 1]) { const s2 = new THREE.SpotLight(0x9fc3ff, 0.9, 40, 0.5, 0.6, 1.5); s2.position.set(sx * 9, 9, -2); s2.target.position.set(0, 1, 0); scene.add(s2, s2.target); }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), std(0x1a1f29, 0.7)); floor.rotation.x = -Math.PI / 2; floor.position.y = BED.floor; floor.receiveShadow = true; scene.add(floor);
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 3), std(0x1f4fa3, 0.8)); m.position.set(sx * 3.7, BED.floor + 0.1, 0); m.receiveShadow = m.castShadow = true; scene.add(m); }
    const seatMat = std(0x232a36, 0.9);
    const N = 900, people = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
    const m4 = new THREE.Matrix4(), col = new THREE.Color(); let k = 0;
    const pal = [0xd14b4b, 0x4b7bd1, 0xe0b04b, 0x6bb36b, 0xcfcfcf, 0x8a5bd1, 0x333a48];
    for (let row = 0; row < 9; row++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 0.9), seatMat); st.position.set(0, BED.floor + 0.25 + row * 0.55, -9 - row * 0.9); scene.add(st);
      for (let i = 0; i < 100 && k < N; i++, k++) {
        m4.makeTranslation(-16 + i * 0.32 + rnd(k) * 0.1, BED.floor + 0.75 + row * 0.55, -9 - row * 0.9);
        people.setMatrixAt(k, m4); people.setColorAt(k, col.set(pal[Math.floor(rnd(k + 7) * pal.length)]).multiplyScalar(0.35 + 0.25 * rnd(k + 3)));
      }
    }
    scene.add(people);
  }

  class Renderer3D extends TR.Renderer {
    constructor(canvas) {
      super(canvas);
      this.is3D = true;
      this.camMode = 'side';
      // WebGL-lærredet ligger bag 2D-lærredet, som nu kun bruges til tekster og effekter
      this.gl = document.createElement('canvas');
      this.gl.id = 'game3d';
      this.gl.setAttribute('aria-hidden', 'true');
      canvas.parentNode.insertBefore(this.gl, canvas);
      canvas.classList.add('overlay');
      this.small = Math.min(G.innerWidth || 1000, G.innerHeight || 800) < 600;
      this.R3 = new THREE.WebGLRenderer({ canvas: this.gl, antialias: true });
      this.R3.shadowMap.enabled = true; this.R3.shadowMap.type = THREE.PCFSoftShadowMap;
      this.scene = new THREE.Scene();
      makeArena(this.scene, this.small);
      this.bedUpdate = makeTrampoline(this.scene);
      this.athleteUpdate = makeAthlete(this.scene, {
        skin: std(0xd99a70, 0.55), suit: std(0x1b4fb3, 0.28, 0.15), legs: std(0xf2f4f8, 0.6), feet: std(0xffffff, 0.6),
        hair: std(0x2b1d14, 0.8), eye: std(0x111111, 0.4),
      });
      // timing-ring på dugen (som i 2D): mål + ring, der skrumper ind
      const ringMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      this.ringTarget = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), ringMat(0xffffff));
      this.ringMove = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), ringMat(0xffd166));
      this.ringFill = new THREE.Mesh(new THREE.CircleGeometry(1, 40), ringMat(0xffd166));
      for (const r of [this.ringTarget, this.ringMove, this.ringFill]) { r.rotation.x = -Math.PI / 2 + 0.9; r.renderOrder = 2; this.scene.add(r); }
      this.cam3 = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 200);
      this.resize();
    }

    resize() {
      super.resize();
      if (!this.R3) return;
      this.R3.setPixelRatio(Math.min(G.devicePixelRatio || 1, this.small ? 1.5 : 2));
      this.R3.setSize(this.W, this.H, false);
      this.cam3.aspect = this.W / this.H; this.cam3.updateProjectionMatrix();
    }

    // Skærmkoordinater for et punkt i verden (x, y, z)
    project(x, y, z = 0) {
      const v = this.tmpV || (this.tmpV = new V());
      v.set(x, y, z).project(this.cam3);
      return [(v.x + 1) / 2 * this.W, (1 - v.y) / 2 * this.H];
    }

    render(game, dt) {
      const ctx = this.ctx, a = game.athlete;
      this.t += dt;
      const cam = this.camera(a, dt); // samme zoom og højde som 2D-kameraet
      // --- 3D-kamera ---
      // Fra siden: kameraet rammer planet z = 0 præcis som 2D-kameraet (samme højde og zoom)
      const visH = this.H / cam.ppm, yMid = cam.bottom + (cam.sy(cam.bottom) - this.H / 2) / cam.ppm;
      const dist = visH / 2 / Math.tan((this.cam3.fov * Math.PI) / 360);
      let sx = 0, sy = 0;
      if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.5); sx = (Math.random() - 0.5) * this.shake * 0.15; sy = (Math.random() - 0.5) * this.shake * 0.15; }
      if (this.camMode === 'skra') {
        // Skråt: samme højde og zoom som fra siden (springeren holdes i billedet), men set fra hjørnet
        const k = visH / 6.1;
        this.cam3.position.set(6.2 * k + sx, yMid + 1.1 * k + sy, 7.4 * k);
        this.cam3.lookAt(0, yMid, 0);
      } else {
        this.cam3.position.set(sx, yMid + sy, dist);
        this.cam3.lookAt(sx, yMid + sy, 0);
      }
      // --- springer, dug og timing-ring ---
      this.athleteUpdate(a.world);
      const zf = (z) => { const v = Math.abs(z) / BED.width; return v >= 1 ? 0 : 0.55 + 0.45 * Math.cos(Math.PI * v); };
      this.bedUpdate((x, z) => this.bedProfile(x, a) * zf(z));
      this.updateRing(game, a);
      this.R3.render(this.scene, this.cam3);
      // --- 2D ovenpå: tekster, partikler, højdemåler ---
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      if (this.camMode === 'side') this.heightMeter(ctx, cam);
      this.lastAthleteX = a.x;
      const ov = this.camMode === 'side' ? cam : { ...cam, sx: (x) => this.project(x, 0)[0], sy: (y) => this.project(a.x, y)[1] };
      this.updateParticles(dt);
      this.drawParticles(ctx, ov);
      this.drawFloaters(ctx, ov, dt);
      this.drawPopups(ctx, ov, dt);
    }

    updateRing(game, a) {
      const hide = () => { this.ringTarget.visible = this.ringMove.visible = this.ringFill.visible = false; };
      if (game.demo || a.state === 'crash' || Math.abs(a.x) > BED.half) return hide();
      const t = a.satsTiming();
      if (t == null || t > 0.6 || t < -0.25) return hide();
      const y = -this.bedProfile(a.x, a) * 0.85 + 0.02, base = 0.32;
      for (const r of [this.ringTarget, this.ringMove, this.ringFill]) r.position.set(a.x, y, 0.3);
      this.ringTarget.visible = true; this.ringTarget.scale.setScalar(base); this.ringTarget.material.opacity = 0.55;
      this.ringMove.visible = this.ringFill.visible = false;
      if (t >= 0) {
        const near = t < 0.35;
        this.ringMove.visible = true;
        this.ringMove.scale.setScalar(base * (1 + 3.2 * (t / 0.6)));
        this.ringMove.material.color.set(near ? 0xffd166 : 0x4cc9f0);
        this.ringMove.material.opacity = Math.max(0.25, Math.min(1, 1.3 - t / 0.6));
      } else if (a.sats && a.sats.q == null) {
        this.ringFill.visible = true; this.ringFill.scale.setScalar(base);
        this.ringFill.material.opacity = Math.max(0, (1 + t * 3) * 0.45);
      }
    }
  }

  TR.Renderer3D = Renderer3D;
})(globalThis);
