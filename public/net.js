// The synapses view of Lax's mind: not a brain's shape but what it's made of. The small Lax sits in the middle;
// around it its faculties (hearing, speech, memory, learning, skills, what it knows about you, the projects) and the
// Claude Code sessions plugged into it right now. Links that always exist are faint; a link in use carries pulses.
// Drawn in three.js at a low resolution so it stays pixel art. Counts only (see mind-view.js).
(() => {
  const T = window.THREE;
  // Where each faculty sits around Lax (x right, y up, z towards you), its colour, and what it's connected to.
  const NODES = {
    hearing: { at: [-12, 10, 10], color: '#7fd3ff', label: 'hearing' },
    speech: { at: [12, 10, -10], color: '#ffd25a', label: 'speech' },
    you: { at: [-16, -3, -8], label: 'you' },
    memory: { at: [0, -12, 5], color: '#c9a86a', label: 'memory' },
    learning: { at: [15, -5, 9], color: '#6fd36f', label: 'learning' },
    skills: { at: [20, 3, -14], color: '#b58ad9', label: 'skills' },
    archive: { at: [-6, -19, 14], color: '#8a8378', label: 'archive' },
  };
  const PROJ = [[-22, 12, -12], [-24, -9, 9], [-8, 19, -18], [-18, 1, -24]];
  const LINKS = [['core', 'hearing'], ['core', 'speech'], ['core', 'you'], ['core', 'memory'], ['core', 'learning'], ['memory', 'you'],
    ['memory', 'learning'], ['learning', 'skills'], ['memory', 'archive'], ['learning', 'you']];
  // Where each event goes, along the links: from one node to each of the others. An event that says where it went (to:
  // a recall's sources, what a change touched) goes there instead.
  const ROUTES = { recall: ['core', 'memory'], reflect: ['memory', 'learning'], episode: ['core', 'memory'], skill: ['learning', 'skills'],
    install: ['skills', 'core'], forget: ['core', 'memory'], learned: ['core', 'you'], review: ['memory', 'learning'], rules: ['memory', 'learning'],
    hear: ['hearing', 'core'], speak: ['core', 'speech'] };
  // What it's doing for as long as it lasts (the snapshot's doing): pulses keep running on these links meanwhile.
  const DOING = { hearing: { every: 450, links: [['hearing', 'core']] }, speaking: { every: 450, links: [['core', 'speech']] },
    reflecting: { every: 900, links: [['memory', 'learning'], ['learning', 'you']] }, recalling: { every: 700, links: [['core', 'memory']] } };

  let renderer, scene, cam, amb, sun, world, net, lax, zzz, zzzCtx, ring, floor, bubble, beam;
  const nodes = {}, lines = {}, pulses = [], hot = {}, texs = new WeakMap();
  let sig = '';
  const nextDo = {};
  // Turning the network: drag to turn it, pinch or scroll to zoom. It always turns slowly by itself, except while Lax sleeps.
  const view = { yaw: -0.3, pitch: 0.3, zoom: 1, vy: 0, vp: 0, touched: -1e9, ptrs: new Map(), pinch: 0 };
  const tex = (cv) => { let t = texs.get(cv); if (!t) { t = new T.CanvasTexture(cv); t.minFilter = t.magFilter = T.NearestFilter; texs.set(cv, t); } return t; };
  let rampTex; function ramp() { if (rampTex) return rampTex;
    rampTex = new T.DataTexture(new Uint8Array([80, 80, 80, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, T.RGBAFormat);
    rampTex.minFilter = rampTex.magFilter = T.NearestFilter; rampTex.needsUpdate = true; return rampTex; }
  const toon = (c) => new T.MeshToonMaterial({ color: c, gradientMap: ramp(), flatShading: true });

  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: false }); renderer.setPixelRatio(1);
    scene = new T.Scene(); scene.background = new T.Color('#121110');
    cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 400); cam.position.set(0, 0, 90); cam.lookAt(0, 0, 0); // straight on, so the sprites sit on whole pixels
    amb = new T.AmbientLight('#ffffff', 0.35); sun = new T.DirectionalLight('#fff4e0', 0.75); sun.position.set(-30, 40, 50); scene.add(amb, sun);
    world = new T.Group(); world.position.y = 5; scene.add(world); net = new T.Group(); world.add(net);
    // The ring in the middle is Lax's seat: it sits there while it works or thinks, and lives on the floor otherwise.
    ring = new T.Mesh(new T.RingGeometry(4.2, 4.7, 24), new T.MeshBasicMaterial({ color: '#3a332c', side: T.DoubleSide })); ring.position.y = 5; scene.add(ring);
    floor = new T.Mesh(new T.BoxGeometry(200, 0.5, 0.1), new T.MeshBasicMaterial({ color: '#2c2824' })); scene.add(floor);
    lax = new T.Sprite(new T.SpriteMaterial({ map: tex(Mind.sprite()), transparent: true, alphaTest: 0.5 })); lax.center.set(0.5, 0); lax.scale.set(5.5, 5); scene.add(lax);
    bubble = new T.Sprite(new T.SpriteMaterial({ transparent: true, alphaTest: 0.5 })); bubble.center.set(0, 0); bubble.scale.set(7.5, 5); bubble.visible = false; scene.add(bubble);
    beam = new T.Mesh(new T.BoxGeometry(1, 1, 0.1), new T.MeshBasicMaterial({ color: '#fff8ee', transparent: true })); beam.visible = false; scene.add(beam);
    const zc = document.createElement('canvas'); zc.width = 12; zc.height = 16; zzzCtx = zc.getContext('2d');
    zzz = new T.Sprite(new T.SpriteMaterial({ map: tex(zc), transparent: true })); zzz.center.set(0, 0); zzz.scale.set(4.8, 6.4); scene.add(zzz);
    // Lax, its bubble and the floor stay put whatever way the network is turned: in front while on the floor; in its
    // seat it's a thing at the core, behind what's in front of it (drawPet switches it).
    [floor, beam, lax, bubble, zzz].forEach((o, i) => { o.material.depthTest = false; o.renderOrder = 10 + i; });
    canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); view.ptrs.set(e.pointerId, [e.clientX, e.clientY]); view.touched = performance.now(); canvas.style.cursor = 'grabbing'; });
    canvas.addEventListener('pointermove', (e) => { const p = view.ptrs.get(e.pointerId); if (!p) return; view.touched = performance.now();
      if (view.ptrs.size === 1) { const dx = e.clientX - p[0], dy = e.clientY - p[1], k = 0.008;
        view.yaw += dx * k; view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + dy * k)); view.vy = dx * k / 16; view.vp = dy * k / 16; }
      view.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (view.ptrs.size === 2) { const [a, b] = [...view.ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (view.pinch) zoom(d / view.pinch); view.pinch = d; } });
    const up = (e) => { view.ptrs.delete(e.pointerId); view.pinch = 0; if (!view.ptrs.size) canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.touched = performance.now(); zoom(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    canvas.addEventListener('dblclick', () => Object.assign(view, { yaw: -0.3, pitch: 0.3, zoom: 1, vy: 0, vp: 0 }));
  }
  const zoom = (f) => (view.zoom = Math.max(0.5, Math.min(2.5, view.zoom * f)));
  function resize(w, h) {
    renderer.setSize(w, h, false);
    const halfH = 30, halfW = Math.max(halfH * w / h, 33); const hh = halfW * h / w;
    Object.assign(cam, { left: -halfW, right: halfW, top: hh, bottom: -hh }); cam.updateProjectionMatrix();
  }

  // A faculty: a faceted orb sized by how much it holds, and specks orbiting it, one more each time it doubles.
  function orb(key, at, color, size, specks) {
    const g = new T.Group(); g.position.set(...at); net.add(g);
    const core = new T.Mesh(new T.IcosahedronGeometry(size, 0), toon(color)); g.add(core);
    const bits = []; for (let i = 0; i < specks; i++) { const b = new T.Mesh(new T.BoxGeometry(0.7, 0.7, 0.7), toon(color)); g.add(b); bits.push({ b, a: i / specks * Math.PI * 2, r: size + 1.6 + (i % 3) * 0.7, tilt: (i % 2 ? 0.6 : -0.4) }); }
    nodes[key] = { g, core, bits, color: new T.Color(color), size };
  }
  const specks = (n) => Math.min(10, Math.ceil(Math.log2((n || 0) + 1)));
  const sizeOf = (n) => 1.2 + Math.min(2.8, Math.log2((n || 0) + 1) / 3); // 1.2 for nothing yet, 4 at about 300
  // This week: times you talked to it (hearing), it answered aloud (speech), its mind changed (learning).
  const counts = (s) => ({ hearing: s.week?.heard || 0, speech: s.week?.spoke || 0, learning: s.week?.changes || 0 });
  function build(s) {
    const now = JSON.stringify([s.you, s.episodes.total, s.archive, s.skills, s.projects.map((p) => p.notes), s.sessions, s.week, s.look?.color]); if (now === sig) return; sig = now;
    net.clear(); for (const k in nodes) delete nodes[k]; for (const k in lines) delete lines[k];
    const color = s.look?.color || '#D97757', n = {
      ...counts(s), you: s.you, memory: s.episodes.total, skills: s.skills.installed + s.skills.drafts, archive: s.archive };
    // Every orb's size and specks come from its own number: nothing is drawn bigger than what it holds.
    for (const [k, d] of Object.entries(NODES)) orb(k, d.at, d.color || color, sizeOf(n[k]), specks(n[k]));
    s.projects.slice(0, 4).forEach((p, i) => orb('p' + i, PROJ[i], Mind.shade('#6fd36f', [-0.1, -0.35, 0.2, -0.5][i]), 1.3 + Math.min(1.4, Math.log2(p.notes + 1) / 4), 0));
    // Sessions plugged in right now: a small cube beside its project (or near Lax), linked straight to Lax.
    (s.sessions || []).slice(0, 6).forEach((ss, i) => {
      const base = ss.p != null && PROJ[ss.p] ? PROJ[ss.p] : [-6, 16, 2], at = [base[0] + 5 + (i % 2) * 2, base[1] + 4 - (i % 3) * 2, base[2] + 6];
      const g = new T.Group(); g.position.set(...at); net.add(g);
      const core = new T.Mesh(new T.BoxGeometry(2, 2, 2), toon(ss.state === 'working' ? '#e8e2d6' : '#6b645a')); g.add(core);
      nodes['s' + i] = { g, core, bits: [], color: new T.Color('#e8e2d6'), size: 1, session: ss };
    });
    const pos = (k) => (k === 'core' ? new T.Vector3(0, 0, 0) : nodes[k]?.g.position);
    const link = (a, b, live) => { if (!pos(a) || !pos(b)) return;
      const geo = new T.BufferGeometry().setFromPoints([pos(a), pos(b)]);
      const l = new T.Line(geo, new T.LineBasicMaterial({ color: live ? '#8a8378' : '#3a332c' })); net.add(l); lines[a + '-' + b] = lines[b + '-' + a] = l;
      if (a === 'core' || b === 'core') l.userData.core = { other: a === 'core' ? b : a, end: a === 'core' ? 0 : 1 }; };
    for (const [a, b] of LINKS) link(a, b);
    s.projects.slice(0, 4).forEach((p, i) => link('p' + i, 'memory'));
    (s.sessions || []).slice(0, 6).forEach((ss, i) => { link('s' + i, 'core', true); if (ss.p != null && nodes['p' + ss.p]) link('s' + i, 'p' + ss.p); });
  }

  function pulse(from, to, t0, grey) {
    const bits = [0, 1, 2].map((k) => { const b = new T.Mesh(new T.BoxGeometry(1.1 - k * 0.3, 1.1 - k * 0.3, 1.1 - k * 0.3),
      new T.MeshBasicMaterial({ color: grey ? '#8a8378' : '#fff8ee', transparent: true, opacity: 1 - k * 0.3 })); b.visible = false; world.add(b); return b; });
    pulses.push({ from, to, t0, dur: 650, bits });
  }
  const at = (k) => (k === 'core' ? new T.Vector3(0, 0, 0) : nodes[k]?.g.position.clone());
  // Links into the middle stop at the ring's edge (as seen on screen, however the network is turned): the point on
  // the line from the core to the other end where it leaves the ring. In the network's own coordinates.
  const RING = 4.7;
  function edge(other) {
    const c = world.localToWorld(new T.Vector3()), o = world.localToWorld(other.clone()), d = Math.hypot(o.x - c.x, o.y - c.y);
    return world.worldToLocal(c.lerp(o, Math.min(1, RING / d)));
  }
  const ends = (a, b) => { const pa = at(a), pb = at(b); if (!pa || !pb) return [];
    return [a === 'core' ? edge(pb) : pa, b === 'core' ? edge(pa) : pb]; };

  function update(t, dt) {
    const s = Mind.snap; if (!s || !scene) return; build(s);
    const asleep = Mind.asleep();
    if (!view.ptrs.size) { view.yaw += view.vy * dt; view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + view.vp * dt)); view.vy *= 0.94; view.vp *= 0.94;
      if (!asleep) view.yaw += dt * 0.00008; } // always turning slowly, unless Lax sleeps
    petUpdate(t, dt);
    for (const [k, d] of Object.entries(DOING)) if (!asleep && s.doing?.[k] && !(nextDo[k] > t)) { nextDo[k] = t + d.every;
      for (const [a, b] of d.links) pulse(a, b, t); hot[d.links[0][0]] = t + 1500; }
    for (let i = pulses.length - 1; i >= 0; i--) { const p = pulses[i];
      if (t - p.t0 > p.dur) { hot[p.to] = t + 2500; hot[p.from + '-' + p.to] = t + 1200; world.remove(...p.bits); pulses.splice(i, 1); } }
  }

  function render(t) {
    const s = Mind.snap; if (!s) { renderer.render(scene, cam); return; }
    const asleep = Mind.asleep(), glow = new T.Color(s.look?.color || '#D97757'), white = new T.Color('#fff8ee');
    const dimmer = asleep ? 0.55 + 0.15 * Math.sin(t / 900) : 1;
    amb.intensity = 0.35 * dimmer; sun.intensity = 0.75 * dimmer;
    world.rotation.set(view.pitch, view.yaw, 0, 'XYZ'); world.scale.setScalar(view.zoom); world.updateMatrixWorld();
    for (const l of new Set(Object.values(lines))) { const c = l.userData.core; if (!c || !nodes[c.other]) continue;
      const p = edge(nodes[c.other].g.position); l.geometry.attributes.position.setXYZ(c.end, p.x, p.y, p.z); l.geometry.attributes.position.needsUpdate = true; }
    for (const [k, n] of Object.entries(nodes)) {
      const on = hot[k] > t, heat = on ? (hot[k] - t) / 2500 : 0;
      n.core.material.color.copy(n.color).lerp(white, heat * (0.5 + 0.3 * Math.sin(t / 80))).multiplyScalar(asleep ? 0.6 : 1);
      if (n.session) n.core.material.color.copy(n.session.state === 'working' && !asleep ? n.color : new T.Color('#6b645a'));
      n.core.rotation.y = t / 2400 + n.size; n.core.rotation.x = t / 3100;
      n.g.position.y += Math.sin(t / 1200 + n.size * 3) * 0.004;
      for (const b of n.bits) { const a = b.a + t / 2600; b.b.position.set(Math.cos(a) * b.r, Math.sin(a) * b.r * b.tilt, Math.sin(a) * b.r); }
    }
    for (const [k, l] of Object.entries(lines)) l.material.color.set(hot[k] > t ? glow : l.userData.base ||= '#' + l.material.color.getHexString());
    for (const p of pulses) { const q = (t - p.t0) / p.dur, [a, b] = ends(p.from, p.to); if (!a || !b) continue;
      p.bits.forEach((bit, k) => { const r = q - k * 0.07; bit.visible = r >= 0 && r <= 1; bit.position.copy(a).lerp(b, Math.max(0, Math.min(1, r))); }); }
    drawPet(t, asleep, glow);
    renderer.render(scene, cam);
    labels(s, t);
  }

  // The small Lax on its own: on the floor it potters about (walks, stops, hops, looks around, says something in a
  // bubble too small to read); when there's work, it teleports to its seat in the middle and back when it's done.
  const SEAT = 2.5; // Lax's feet when it sits in the middle (the core is at y 5)
  const pet = { x: -20, dir: 1, mode: 'idle', until: 0, tx: 0, hops: 0, chat: 0, seat: false, busy: 0, tp: null };
  const floorY = () => cam.bottom + 3.5, roam = () => [cam.left + 5, cam.right - 5];
  function gibberish(thinking) { // a little speech bubble of scribbles (or dots while it thinks)
    const cv = document.createElement('canvas'); cv.width = 15; cv.height = 10; const c = cv.getContext('2d');
    c.fillStyle = '#120c0a'; c.fillRect(0, 0, 15, 8); c.fillRect(2, 7, 3, 3);
    c.fillStyle = '#e8e2d6'; c.fillRect(1, 1, 13, 6); c.fillRect(3, 7, 1, 2);
    c.fillStyle = '#5b544b';
    if (thinking) [4, 7, 10].forEach((x) => c.fillRect(x, 3, 1, 1));
    else for (const y of [2, 4]) { let x = 2; while (x < 12) { const w = 1 + Math.floor(Math.random() * 3); if (x + w > 13) break; c.fillRect(x, y, w, 1); x += w + 1; } }
    return tex(cv);
  }
  function teleport(t, toSeat) { const [a, b] = roam();
    pet.tp = { t0: t, from: pet.seat ? [0, SEAT] : [pet.x, floorY()], to: toSeat ? [0, SEAT] : [(pet.x = a + Math.random() * (b - a)), floorY()], toSeat };
  }
  function petUpdate(t, dt) {
    if (Mind.asleep()) { if (pet.seat && !pet.tp) teleport(t, false); pet.mode = 'sleep'; return; }
    if (pet.mode === 'sleep') pet.mode = 'idle';
    if (pet.tp) { if (t - pet.tp.t0 > 600) { pet.seat = pet.tp.toSeat; pet.tp = null; pet.until = t + 800; } return; }
    // At work (the Mac says so: a session working, answering you, reflecting, recalling), or a moment for an event.
    const working = Mind.snap?.busy || pet.busy > t;
    if (!pet.seat && working) return teleport(t, true);
    if (pet.seat) { if (!working) teleport(t, false); else if (t > pet.chat && Math.random() < 0.004) { bubble.material.map = gibberish(true); pet.chat = t + 1600; } return; }
    const [a, b] = roam();
    if (pet.mode === 'walk') { const d = pet.tx - pet.x, v = 0.006 * dt; pet.dir = Math.sign(d) || pet.dir;
      if (Math.abs(d) <= v) { pet.x = pet.tx; pet.mode = 'idle'; pet.until = t + 600 + Math.random() * 1500; } else pet.x += Math.sign(d) * v; return; }
    if (pet.mode === 'look' && t < pet.until) { pet.dir = Math.floor(t / 700) % 2 ? 1 : -1; return; }
    if (t < pet.until) return;
    const r = Math.random(); pet.dir = pet.mode === 'look' ? 0 : pet.dir;
    if (r < 0.4) { pet.mode = 'walk'; pet.tx = Math.max(a, Math.min(b, pet.x + (Math.random() - 0.5) * 30)); }
    else if (r < 0.62) { pet.mode = 'chat'; pet.dir = 0; bubble.material.map = gibberish(false); pet.chat = t + 2200; pet.until = t + 2600; }
    else if (r < 0.77) { pet.mode = 'hop'; pet.hops = t; pet.until = t + 900; }
    else if (r < 0.9) { pet.mode = 'look'; pet.until = t + 2800; }
    else { pet.mode = 'idle'; pet.dir = 0; pet.until = t + 2500; }
  }
  function drawPet(t, asleep, glow) {
    floor.position.set(0, floorY() - 0.25, 0);
    let x = pet.seat ? 0 : pet.x, y = pet.seat ? SEAT : floorY(), sx = 1, sy = 1;
    beam.visible = false;
    if (pet.tp) { // squeeze into a beam of light, then out of one where it's going
      const p = (t - pet.tp.t0) / 600, out = p < 0.5, k = out ? p * 2 : (1 - p) * 2, [bx, by] = out ? pet.tp.from : pet.tp.to;
      x = bx; y = by; sx = 1 - k * 0.8; sy = 1 + k * 1.2;
      beam.visible = true; beam.position.set(bx, by + 6, 1); beam.scale.set(1.5 * (1 - k * 0.5), 14, 1); beam.material.opacity = k; beam.material.color.copy(glow).lerp(new T.Color('#fff8ee'), 0.5);
    }
    const hopping = !pet.seat && pet.mode === 'hop' && t < pet.until, up = hopping ? Math.abs(Math.sin((t - pet.hops) / 450 * Math.PI)) * 2.5 : pet.seat && hot.core > t ? Math.abs(Math.sin(t / 150)) * 0.8 : 0;
    const walking = !pet.seat && pet.mode === 'walk', z = pet.seat ? 0 : 3;
    const breath = asleep && Math.floor(t / 1400) % 2 ? -0.6 : 0; // asleep: slow breaths, a pixel down and back
    for (const o of [lax, bubble]) o.material.depthTest = !!pet.seat && !pet.tp;
    lax.material.map = tex(Mind.sprite({ dir: asleep || pet.seat ? 0 : pet.dir, step: walking ? Math.floor(t / 140) % 2 : 0, sleep: asleep }));
    if (pet.tp) { lax.position.set(x, y + up, z); lax.scale.set(5.5 * sx, 5 * sy, 1); }
    else onPixels(lax, x, y + up + breath, z, 11, 10, 0.5);
    bubble.visible = !asleep && !pet.tp && t < pet.chat; if (bubble.visible) onPixels(bubble, x + 1.2, y + 5 + up, z, 15, 10, 0);
    ring.material.color.set(pet.seat ? (hot.core > t ? glow : '#8a8378') : '#3a332c');
    zzz.visible = asleep;
    if (asleep) { zzzCtx.clearRect(0, 0, 12, 16); Mind.zzz(zzzCtx, 2, 12, t); zzz.material.map.needsUpdate = true; onPixels(zzz, x + 1.5, y + 3, 3, 12, 16, 0); }
  }
  // Put a sprite on whole screen pixels at a whole number of screen pixels per texel (about half a unit each), so a
  // pixel of Lax is never drawn wider than its neighbour (one eye bigger than the other). x is where its centerX
  // falls (0 = left edge, 0.5 = middle); y is its bottom.
  function onPixels(o, x, y, z, w, h, centerX) {
    const upp = (cam.right - cam.left) / Mind.current.W, k = Math.max(1, Math.round(0.5 / upp)) * upp;
    const left = cam.left + Math.round((x - w * k * centerX - cam.left) / upp) * upp, bottom = cam.bottom + Math.round((y - cam.bottom) / upp) * upp;
    o.scale.set(w * k, h * k, 1); o.position.set(left + w * k * centerX, bottom, z);
  }

  let lastLabels = '';
  function labels(s, t) {
    const place = (k, dy) => { const n = nodes[k]; if (!n) return { x: -99, y: -99 };
      const v = n.g.getWorldPosition(new T.Vector3()).project(cam);
      return { x: Math.round((v.x + 1) / 2 * Mind.current.W), y: Math.round((1 - v.y) / 2 * Mind.current.H) + (dy ?? Math.round(n.size * 2) + 6) }; };
    const sessions = (s.sessions || []).length, working = (s.sessions || []).filter((x) => x.state === 'working').length;
    const list = [
      { ...place('hearing'), text: 'hearing', n: counts(s).hearing, hot: hot.hearing > t }, { ...place('speech'), text: 'speech', n: counts(s).speech, hot: hot.speech > t },
      { ...place('you'), text: s.owner || 'you', n: s.you, hot: hot.you > t }, { ...place('memory'), text: 'memory', n: s.episodes.total, hot: hot.memory > t },
      { ...place('learning'), text: 'learning', n: counts(s).learning, hot: hot.learning > t },
      { ...place('skills'), text: 'skills', n: s.skills.installed + (s.skills.drafts ? `+${s.skills.drafts}` : ''), hot: hot.skills > t },
      { ...place('archive'), text: 'archive', n: s.archive, hot: hot.archive > t },
      ...s.projects.slice(0, 4).map((p, i) => ({ ...place('p' + i), text: p.name || '', n: p.notes, hot: hot['p' + i] > t })),
      ...(sessions ? [{ ...place('s0', 8), text: 'sessions', n: working ? `${working}/${sessions}` : sessions, hot: hot.core > t }] : []),
    ];
    const k = JSON.stringify(list); if (k === lastLabels) return; lastLabels = k; Mind.labels(list);
  }

  Mind.view('synapses', { W: 240, H: 160, init, resize, update, render,
    event(e) {
      const t0 = performance.now();
      if (e.kind === 'tool') { // one pulse per real tool call, up its session's link
        if (!nodes['s' + e.session]) return;
        for (let i = 0; i < Math.min(8, e.n || 1); i++) pulse('s' + e.session, 'core', t0 + i * 180);
        return;
      }
      const r = ROUTES[e.kind]; if (!r) return;
      let from = r[0], targets = [r[1]];
      if (e.to?.length) targets = e.to.map((p) => (p === 'project' ? 'p' + e.project : p)).filter((k) => nodes[k]);
      if (e.kind === 'reflect' && nodes['p' + e.project]) { from = 'p' + e.project; targets = ['memory']; }
      if (e.kind === 'recall' || e.to?.length) from = e.kind === 'rules' ? 'memory' : 'core';
      const t = t0 + (pet.seat ? 0 : 650); // let it get to its seat first
      let longest = 0;
      for (const to of targets) longest = Math.max(longest, travel(from, to, t, e.kind === 'forget'));
      pet.busy = Math.max(pet.busy, t + longest + 2200);
      hot[from] = t + 2500;
    } });
  // Pulses from one node to another along the links (the shortest way), each hop leaving as the last arrives. Its length in ms.
  function travel(from, to, t, grey) {
    const next = {}; for (const k of Object.keys(lines)) { const [a, b] = k.split('-'); (next[a] ||= new Set()).add(b); }
    const prev = { [from]: null }, q = [from];
    while (q.length) { const n = q.shift(); if (n === to) break; for (const m of next[n] || []) if (!(m in prev)) { prev[m] = n; q.push(m); } }
    if (!(to in prev)) return 0;
    const hops = []; for (let n = to; prev[n] != null; n = prev[n]) hops.unshift([prev[n], n]);
    hops.forEach(([a, b], i) => pulse(a, b, t + i * 650, grey));
    return hops.length * 650;
  }
})();
