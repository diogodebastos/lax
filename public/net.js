// The synapses view of Lax's mind: not a brain's shape but what it's made of. The small Lax sits in the middle;
// around it its faculties (hearing, speech, memory, learning, skills, what it knows about you, the projects) and the
// Claude Code sessions plugged into it right now. Links that always exist are faint; a link in use carries pulses.
// Drawn in three.js at a low resolution so it stays pixel art. Counts only (see mind-view.js).
(() => {
  const T = window.THREE;
  // Where things sit: on two spheres around Lax, an inner one for its faculties and an outer one for its work and the
  // archive, like regions of a brain: senses above, memory below, learning to the right; projects with their sessions to
  // the left, roles behind on the right, the archive deep below. Placed once (arrange): each orb settles near its region,
  // and two closer than a spacing push apart (a wide one on the same sphere, a narrow one across, so the two spheres
  // don't line up as seen from Lax). Always the same result.
  function arrange({ IN = 16, OUT = 27, steps = 600 } = {}) {
    // Where each would like to be: its region, spread sideways within it (so the two at a pole don't stack front to back).
    const SEEK = { hearing: [-0.45, 0.85, 0.1], speech: [0.45, 0.85, -0.1], // senses, above
      you: [-0.55, -0.8, 0.1], memory: [0.45, -0.8, 0.15], dreams: [0, -0.75, -0.6], // memory, below
      learning: [0.95, 0.05, 0.05], skills: [0.7, -0.55, 0.35], wishes: [0.7, 0.55, -0.3], // learning, to the right
      archive: [-0.6, -0.7, -0.3], projects: [-0.95, 0.15, 0.2], roles: [0.55, 0.55, -0.6] }; // outer: archive deep, projects left, roles behind right
    const ITEMS = [...['hearing', 'speech', 'you', 'memory', 'dreams', 'learning', 'skills', 'wishes'].map((k) => [k, IN, k]),
      ['archive', OUT, 'archive'], ['projects', OUT, 'projects', 1.6],
      ...[0, 1, 2, 3, 4, 5].map((i) => ['s' + i, OUT, 'projects', 0.55]), ...[0, 1, 2, 3].map((i) => ['r' + i, OUT, 'roles'])];
    const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    const chord = (deg) => 2 * Math.sin(deg * Math.PI / 360);
    const P = ITEMS.map(([k, r, g, size = 1], i) => ({ k, r, size, a: norm(SEEK[g]), v: norm(SEEK[g].map((x, d) => x + 0.25 * Math.sin(i * [2.4, 1.7, 0.9][d] + d))) }));
    for (let s = 0; s < steps; s++) {
      const step = 0.08 * (1 - s / steps) + 0.005;
      const F = P.map((p) => {
        let f = p.a.map((x, i) => (x - p.v[i]) * 0.15); // towards its region
        for (const q of P) { if (q === p) continue;
          const near = (p.r === q.r ? chord(p.r === IN ? 55 : 32) : chord(18)) * (p.size + q.size) / 2;
          const d = p.v.map((x, i) => x - q.v[i]), dist = Math.hypot(...d) + 1e-6;
          if (dist < near) f = f.map((x, i) => x + d[i] / dist * (near - dist) * 2); }
        const dot = f.reduce((t, x, i) => t + x * p.v[i], 0);
        return f.map((x, i) => x - dot * p.v[i]);
      });
      P.forEach((p, i) => { p.v = norm(p.v.map((x, d) => x + step * F[i][d])); });
    }
    return Object.fromEntries(P.map((p) => [p.k, p.v.map((x) => Math.round(x * p.r * 10) / 10)]));
  }
  const AT = arrange();
  const NODES = {
    hearing: { at: AT.hearing, color: '#7fd3ff', label: 'hearing' },
    speech: { at: AT.speech, color: '#ffd25a', label: 'speech' },
    you: { at: AT.you, label: 'you' },
    memory: { at: AT.memory, color: '#c9a86a', label: 'memory' },
    dreams: { at: AT.dreams, color: '#7b86e0', label: 'dreams' }, // going over a session on its own, into memories
    archive: { at: AT.archive, color: '#8a8378', label: 'archive' }, // the full records, deeper down
    learning: { at: AT.learning, color: '#6fd36f', label: 'learning' },
    skills: { at: AT.skills, color: '#b58ad9', label: 'skills' },
    wishes: { at: AT.wishes, color: '#ff8fb1', label: 'wishes' }, // what it can't do yet and would learn
  };
  // The projects: one orb that says "projects", and each project a small unnamed satellite around it, on a ring
  // square to the way it faces out.
  const HUB = AT.projects;
  const PROJ = (() => { const n = HUB.map((v) => v / Math.hypot(...HUB)), up = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const u = cross(n, up).map((v, _, a) => v / Math.hypot(...a)), w = cross(n, u);
    return [0, 1, 2, 3].map((i) => { const a = (i * 90 + 45) * Math.PI / 180; return HUB.map((h, d) => Math.round((h + 5 * (Math.cos(a) * u[d] + Math.sin(a) * w[d])) * 10) / 10); }); })();
  // The sessions plugged in right now, near the projects; the roles it became, across from them.
  const SESS = [0, 1, 2, 3, 4, 5].map((i) => AT['s' + i]);
  const ROLE = [0, 1, 2, 3].map((i) => AT['r' + i]);
  // The solar system (the "orbits" switch in the key): Lax the sun, each region a ring (senses, memory, learning, the
  // archive, the roles, the projects), its orbs evenly round it so they never meet. Rings are spaced by the orbs on them,
  // with gaps that differ like a real system's; the nearer, the faster. The projects carry their satellites and the
  // sessions as moons. Planned in build() from the orbs there are (plan()).
  const REGIONS = [['hearing', 'speech'], ['you', 'memory', 'dreams'], ['learning', 'skills', 'wishes'], ['archive'], ['r0', 'r1', 'r2', 'r3'], ['projects']];
  const GAPS = [0.6, 2.4, 1.1, 3.2, 1.7];
  const TILT = [[0, 0], [0.19, 0.6], [0, 0], [0, 0], [-0.16, 2.2], [0, 0]]; // two rings slightly off the plane: [how much, along which way]
  let orbitPlan = {}, orbitFit = 1;
  function plan() {
    const ext = (k) => nodes[k].size + 0.3 + (k === 'projects' ? 3.2 : 0);
    const groups = REGIONS.map((g) => g.filter((k) => nodes[k])).filter((g) => g.length);
    // The system is shrunk to fit the screen but Lax's seat isn't, so the first ring starts far enough out to stay clear
    // of it after shrinking: worked out from the fit, which depends on where the rings start (a few rounds settle it).
    let start = 11;
    for (let round = 0; round < 4; round++) {
      orbitPlan = {};
      let r = start, prev = 0;
      groups.forEach((g, i) => {
        const e = Math.max(...g.map(ext)); r = i ? r + prev + e + GAPS[(i - 1) % GAPS.length] : r + e; prev = e;
        const [tilt, way] = TILT[REGIONS.findIndex((x) => x.includes(g[0]))] || [0, 0];
        g.forEach((k, j) => { orbitPlan[k] = { r, tilt, way, phase: i * 1.3 + j / g.length * Math.PI * 2 }; });
      });
      orbitFit = Math.min(1, 36 / (r + prev));
      start = Math.max(11, 8 / orbitFit);
    }
  }
  function orbitAt(k, t) {
    const o = orbitPlan[k];
    if (o) { const a = o.phase + t * 0.00028 * (10 / o.r) ** 1.5, x = o.r * Math.cos(a), z0 = o.r * Math.sin(a);
      const y = z0 * Math.sin(o.tilt), z = z0 * Math.cos(o.tilt); // tilted about the x axis, then that tilt turned to its own way
      return new T.Vector3(x * Math.cos(o.way) + z * Math.sin(o.way), y, -x * Math.sin(o.way) + z * Math.cos(o.way)); }
    const m = /^([ps])(\d)$/.exec(k); if (!m || !orbitPlan.projects) return null;
    const j = +m[2], a = m[1] === 'p' ? j * Math.PI / 2 + t * 0.0009 : j * Math.PI / 3 - t * 0.0006, r = m[1] === 'p' ? 2.6 : 3.9;
    return orbitAt('projects', t).add(new T.Vector3(r * Math.cos(a), m[1] === 'p' ? 0 : 1, r * Math.sin(a)));
  }
  // What the key's switches say (mind.html): labels shown, orbits on. Kept in this browser.
  const look = { labels: true, orbits: false };
  try { Object.assign(look, JSON.parse(localStorage.getItem('lax-mind-look') || '{}')); } catch {}
  if (new URLSearchParams(location.search).has('orbits')) look.orbits = true; // a link straight to the solar system
  window.addEventListener('mind:look', (e) => Object.assign(look, e.detail || {}));
  let solar = look.orbits ? 1 : 0, lastT = 0; // how far into the solar system it is, 0 to 1
  const LINKS = [['core', 'hearing'], ['core', 'speech'], ['core', 'you'], ['core', 'memory'], ['core', 'learning'], ['memory', 'you'],
    ['memory', 'learning'], ['learning', 'skills'], ['memory', 'archive'], ['learning', 'you'], ['dreams', 'memory'], ['dreams', 'learning'],
    ['core', 'wishes'], ['wishes', 'learning']];
  // Where each event goes, along the links: from one node to each of the others. An event that says where it went (to:
  // a recall's sources, what a change touched) goes there instead.
  const ROUTES = { recall: ['core', 'memory'], reflect: ['dreams', 'memory'], episode: ['core', 'memory'], skill: ['learning', 'skills'],
    install: ['skills', 'core'], forget: ['core', 'memory'], learned: ['core', 'you'], review: ['memory', 'learning'], rules: ['memory', 'learning'],
    hear: ['hearing', 'core'], speak: ['core', 'speech'] };
  // What it's doing for as long as it lasts (the snapshot's doing): pulses keep running on these links meanwhile.
  const DOING = { hearing: { every: 450, links: [['hearing', 'core']] }, speaking: { every: 450, links: [['core', 'speech']] },
    reflecting: { every: 900, links: [['dreams', 'memory'], ['dreams', 'learning']] }, recalling: { every: 700, links: [['core', 'memory']] } };

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
  // band: the rows [top, bottom] it is framed in, the rest of the window is extra room around it (the floor sits at its bottom).
  let bandBottom = -30;
  function resize(w, h, band = [0, h]) {
    renderer.setSize(w, h, false);
    const bh = Math.max(1, band[1] - band[0]), halfH = 30, halfW = Math.max(halfH * w / bh, 40), upp = 2 * halfW / w;
    const c = ((band[0] + band[1]) / 2 - h / 2) * upp, hh = h / 2 * upp; bandBottom = c - (band[1] - h / 2) * upp;
    Object.assign(cam, { left: -halfW, right: halfW, top: c + hh, bottom: c - hh }); cam.updateProjectionMatrix();
  }

  // A faculty: a faceted orb sized by how much it holds, and specks orbiting it, one more each time it doubles.
  function orb(key, at, color, size, specks) {
    const g = new T.Group(); g.position.set(...at); net.add(g);
    const core = new T.Mesh(new T.IcosahedronGeometry(size, 0), toon(color)); g.add(core);
    const bits = []; for (let i = 0; i < specks; i++) { const b = new T.Mesh(new T.BoxGeometry(0.7, 0.7, 0.7), toon(color)); g.add(b); bits.push({ b, a: i / specks * Math.PI * 2, r: size + 1.6 + (i % 3) * 0.7, tilt: (i % 2 ? 0.6 : -0.4) }); }
    nodes[key] = { g, core, bits, color: new T.Color(color), size, home: new T.Vector3(...at) };
  }
  // Satellites: this week (one more each time it doubles). The orb's size and its number: all time.
  const specks = (n) => Math.min(10, Math.ceil(Math.log2((n || 0) + 1)));
  const sizeOf = (n) => 1.2 + Math.min(2.8, Math.log2((n || 0) + 1) / 3); // 1.2 for nothing yet, 4 at about 300
  // All time: what each orb holds (its size and number).
  const totals = (s) => ({ hearing: s.total?.heard || 0, speech: s.total?.spoke || 0, learning: s.total?.changes || 0, dreams: s.total?.dreams || 0,
    you: s.you, memory: s.episodes.total, skills: s.skills.installed + s.skills.drafts, archive: s.archive, wishes: s.wishes || 0 });
  // This week: its satellites.
  const weekly = (s) => { const w = s.week || {}; return { hearing: w.heard, speech: w.spoke, learning: w.changes, dreams: w.dreams, you: w.you,
    memory: s.episodes.week, skills: w.skills, archive: w.archive, wishes: w.wishes }; };
  function build(s) {
    const now = JSON.stringify([s.you, s.episodes.total, s.archive, s.skills, s.projects.map((p) => p.notes), s.sessions, s.week, s.look?.color, s.roles, s.wishes, s.total]); if (now === sig) return; sig = now;
    net.clear(); for (const k in nodes) delete nodes[k]; for (const k in lines) delete lines[k];
    const color = s.look?.color || '#D97757', n = totals(s), w = weekly(s);
    // Every orb's size comes from what it holds, its satellites from this week: nothing is drawn bigger than it is.
    for (const [k, d] of Object.entries(NODES)) orb(k, d.at, d.color || color, sizeOf(n[k]), specks(w[k]));
    orb('projects', HUB, '#6fd36f', sizeOf(s.projects.length * 8), 0);
    s.projects.slice(0, 4).forEach((p, i) => orb('p' + i, PROJ[i], Mind.shade('#6fd36f', [-0.1, -0.35, 0.2, -0.5][i]), 0.8 + Math.min(0.8, Math.log2(p.notes + 1) / 6), 0));
    // A role, in Lax's own colour (it's what Lax is), sized by its work: a speck for each piece this week.
    (s.roles || []).slice(0, 4).forEach((r, i) => orb('r' + i, ROLE[i], Mind.shade(color, 0.35), sizeOf(r.work * 4), specks(r.week)));
    // Sessions plugged in right now: a small cube in the row above the projects, linked to Lax and to its project.
    (s.sessions || []).slice(0, 6).forEach((ss, i) => {
      const at = SESS[i];
      const g = new T.Group(); g.position.set(...at); net.add(g);
      const core = new T.Mesh(new T.BoxGeometry(2, 2, 2), toon(ss.state === 'working' ? '#e8e2d6' : '#6b645a')); g.add(core);
      nodes['s' + i] = { g, core, bits: [], color: new T.Color('#e8e2d6'), size: 1, session: ss, home: new T.Vector3(...at) };
    });
    const pos = (k) => (k === 'core' ? new T.Vector3(0, 0, 0) : nodes[k]?.g.position);
    const link = (a, b, live) => { if (!pos(a) || !pos(b)) return;
      const geo = new T.BufferGeometry().setFromPoints([pos(a), pos(b)]);
      const l = new T.Line(geo, new T.LineBasicMaterial({ color: live ? '#8a8378' : '#3a332c' })); net.add(l); lines[a + '-' + b] = lines[b + '-' + a] = l;
      l.userData.ab = [a, b]; };
    for (const [a, b] of LINKS) link(a, b);
    link('projects', 'memory'); s.projects.slice(0, 4).forEach((p, i) => link('p' + i, 'projects'));
    (s.roles || []).slice(0, 4).forEach((r, i) => { link('core', 'r' + i); link('r' + i, 'memory'); for (const p of r.p || []) link('r' + i, 'p' + p); });
    (s.sessions || []).slice(0, 6).forEach((ss, i) => { link('s' + i, 'core', true); if (ss.p != null && nodes['p' + ss.p]) link('s' + i, 'p' + ss.p); });
    plan(); // the solar system, for the orbs there are now
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
    // Into the solar system or back, gliding over about a second (looking down on it from higher up); then every orb
    // where it belongs right now.
    const dt = Math.min(100, t - (lastT || t)); lastT = t;
    solar = Math.max(0, Math.min(1, solar + (look.orbits ? 1 : -1) * dt / 900));
    const glide = solar * solar * (3 - 2 * solar);
    world.rotation.set(Math.min(1.3, view.pitch + glide * 0.45), view.yaw, 0, 'XYZ'); world.scale.setScalar(view.zoom * (1 - glide * (1 - orbitFit))); world.updateMatrixWorld();
    for (const [k, n] of Object.entries(nodes)) {
      const p = n.home.clone(); if (glide > 0) { const o = orbitAt(k, t); if (o) p.lerp(o, glide); }
      p.y += Math.sin(t / 1200 + n.size * 3) * 0.3 * (1 - glide); n.g.position.copy(p);
    }
    for (const l of new Set(Object.values(lines))) { const [a, b] = l.userData.ab || []; const pa = at(a), pb = at(b); if (!pa || !pb) continue;
      const e = [a === 'core' ? edge(pb) : pa, b === 'core' ? edge(pa) : pb];
      e.forEach((v, i) => l.geometry.attributes.position.setXYZ(i, v.x, v.y, v.z)); l.geometry.attributes.position.needsUpdate = true;
      l.material.transparent = true; l.material.opacity = 1 - 0.75 * glide; } // faint in the solar system: the orbs' paths are the picture there
    for (const [k, n] of Object.entries(nodes)) {
      const on = hot[k] > t, heat = on ? (hot[k] - t) / 2500 : 0;
      n.core.material.color.copy(n.color).lerp(white, heat * (0.5 + 0.3 * Math.sin(t / 80))).multiplyScalar(asleep ? 0.6 : 1);
      if (n.session) n.core.material.color.copy(n.session.state === 'working' && !asleep ? n.color : new T.Color('#6b645a'));
      n.core.rotation.y = t / 2400 + n.size; n.core.rotation.x = t / 3100;
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
  // Lax's feet when it sits in the middle: its centre on the core (y 5), from how tall it's really drawn (onPixels).
  const texel = () => Math.max(1, Math.round(0.5 / ((cam.right - cam.left) / Mind.current.W))) * ((cam.right - cam.left) / Mind.current.W);
  const seatY = () => 5 - 10 * texel() / 2;
  const pet = { x: -20, dir: 1, mode: 'idle', until: 0, tx: 0, hops: 0, chat: 0, seat: false, busy: 0, tp: null };
  const floorY = () => bandBottom + 3.5, roam = () => [cam.left + 5, cam.right - 5];
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
    pet.tp = { t0: t, from: pet.seat ? [0, seatY()] : [pet.x, floorY()], to: toSeat ? [0, seatY()] : [(pet.x = a + Math.random() * (b - a)), floorY()], toSeat };
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
    let x = pet.seat ? 0 : pet.x, y = pet.seat ? seatY() : floorY(), sx = 1, sy = 1;
    beam.visible = false;
    if (pet.tp) { // squeeze into a beam of light, then out of one where it's going
      const p = (t - pet.tp.t0) / 600, out = p < 0.5, k = out ? p * 2 : (1 - p) * 2, [bx, by] = out ? pet.tp.from : pet.tp.to;
      x = bx; y = by; sx = 1 - k * 0.8; sy = 1 + k * 1.2;
      beam.visible = true; beam.position.set(bx, by + 6, 1); beam.scale.set(1.5 * (1 - k * 0.5), 14, 1); beam.material.opacity = k; beam.material.color.copy(glow).lerp(new T.Color('#fff8ee'), 0.5);
    }
    const hopping = !pet.seat && pet.mode === 'hop' && t < pet.until, up = hopping ? Math.abs(Math.sin((t - pet.hops) / 450 * Math.PI)) * 2.5 : pet.seat && hot.core > t ? Math.abs(Math.sin(t / 150)) * 0.8 : 0;
    const walking = !pet.seat && pet.mode === 'walk', z = pet.seat ? 0 : 3;
    const breath = asleep && Math.floor(t / 1400) % 2 ? -0.6 : 0; // asleep: slow breaths, a pixel down and back
    const float = pet.seat && !pet.tp && !asleep ? Math.sin(t / 650) * 1.1 : 0; // in its seat: floating gently, a couple of pixels up and down
    for (const o of [lax, bubble]) o.material.depthTest = !!pet.seat && !pet.tp;
    lax.material.map = tex(Mind.sprite({ dir: asleep || pet.seat ? 0 : pet.dir, step: walking ? Math.floor(t / 140) % 2 : 0, sleep: asleep }));
    if (pet.tp) { lax.position.set(x, y + up, z); lax.scale.set(5.5 * sx, 5 * sy, 1); }
    else onPixels(lax, x, y + up + breath + float, z, 11, 10, 0.5);
    bubble.visible = !asleep && !pet.tp && t < pet.chat; if (bubble.visible) onPixels(bubble, x + 1.2, y + 5 + up + float, z, 15, 10, 0);
    // While Lax sits in the core, it pulses like a heart, in Lax's colour: about every four seconds, slower asleep, quick and
    // bright on an event. Empty, it rests dim and still.
    const fired = pet.seat && hot.core > t, beat = pet.seat ? 0.5 + 0.5 * Math.sin(t / (fired ? 80 : asleep ? 1400 : 600)) : 0;
    ring.material.color.set(pet.seat ? '#8a8378' : '#3a332c');
    if (pet.seat) ring.material.color.lerp(glow, fired ? 1 : asleep ? 0.2 + 0.3 * beat : 0.25 + 0.75 * beat).lerp(new T.Color('#fff8ee'), fired ? 0.5 * beat : 0);
    ring.scale.setScalar(1 + beat * (asleep ? 0.06 : 0.15));
    zzz.visible = asleep;
    if (asleep) { zzzCtx.clearRect(0, 0, 12, 16); Mind.zzz(zzzCtx, 2, 12, t); zzz.material.map.needsUpdate = true; onPixels(zzz, x + 1.5, y + 3, 3, 12, 16, 0); }
  }
  // Put a sprite on whole screen pixels at a whole number of screen pixels per texel (about half a unit each), so a
  // pixel of Lax is never drawn wider than its neighbour (one eye bigger than the other). x is where its centerX
  // falls (0 = left edge, 0.5 = middle); y is its bottom.
  function onPixels(o, x, y, z, w, h, centerX) {
    const upp = (cam.right - cam.left) / Mind.current.W, k = texel();
    const left = cam.left + Math.round((x - w * k * centerX - cam.left) / upp) * upp, bottom = cam.bottom + Math.round((y - cam.bottom) / upp) * upp;
    o.scale.set(w * k, h * k, 1); o.position.set(left + w * k * centerX, bottom, z);
  }

  let lastLabels = '';
  function labels(s, t) {
    if (!look.labels) { if (lastLabels !== 'off') { lastLabels = 'off'; Mind.labels([]); } return; }
    // Where an orb is on screen (the view's own pixels), how big, and how near (smaller is nearer).
    const where = (k) => { const n = nodes[k]; if (!n) return null; const v = n.g.getWorldPosition(new T.Vector3()).project(cam);
      return { x: (v.x + 1) / 2 * Mind.current.W, y: (1 - v.y) / 2 * Mind.current.H, z: v.z, r: n.size * 2 + 1 }; };
    const sessions = (s.sessions || []).length, working = (s.sessions || []).filter((x) => x.state === 'working').length;
    const n = totals(s);
    const want = [
      ...['hearing', 'speech', 'you', 'memory', 'learning', 'skills', 'archive', 'dreams', 'wishes'].map((k) => ({ k, text: k === 'you' ? s.owner || 'you' : NODES[k].label,
        n: k === 'skills' ? s.skills.installed + (s.skills.drafts ? `+${s.skills.drafts}` : '') : n[k], hot: hot[k] > t })),
      { k: 'projects', text: 'projects', n: s.projects.length, hot: hot.projects > t },
      ...(s.roles || []).slice(0, 4).map((r, i) => ({ k: 'r' + i, text: r.name || 'role', n: r.work, hot: hot['r' + i] > t })),
      ...(sessions ? [{ k: 's0', text: 'sessions', n: working ? `${working}/${sessions}` : sessions, hot: hot.core > t }] : []),
    ];
    // Labels make room for each other: the nearest orbs choose first; each label goes under its orb, else above, right,
    // left, on a diagonal or a step further out, wherever it covers no other label and no orb. One that fits nowhere
    // stays under its orb, dimmed.
    const canvas = document.getElementById('c'), px = (canvas?.clientWidth || Mind.current.W) / Mind.current.W;
    const font = parseFloat(getComputedStyle(document.getElementById('labels')).fontSize) || 14, ch = font * 0.5 / px, lh = font / px;
    const orbs = Object.keys(nodes).map((k) => [k, where(k)]).filter(([, p]) => p);
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const placed = [], list = [];
    for (const l of want.map((l) => ({ ...l, p: where(l.k) })).filter((l) => l.p).sort((a, b) => a.p.z - b.p.z)) {
      const w = (l.text.length + (l.n != null ? String(l.n).length + 1 : 0)) * ch, h = lh, { x, y, r } = l.p;
      const spots = [[x - w / 2, y + r + 2], [x - w / 2, y - r - 2 - h], [x + r + 2, y - h / 2], [x - r - 2 - w, y - h / 2],
        [x + r * 0.7, y + r * 0.7], [x - r * 0.7 - w, y + r * 0.7], [x + r * 0.7, y - r * 0.7 - h], [x - r * 0.7 - w, y - r * 0.7 - h],
        [x - w / 2, y + r + 3 + h], [x - w / 2, y - r - 3 - 2 * h]];
      let at = null;
      for (const [sx, sy] of spots) { const box = { x: sx, y: sy, w, h };
        if (box.x < 0 || box.x + w > Mind.current.W || box.y < 0 || box.y + h > Mind.current.H) continue;
        if (placed.some((b) => hit(box, b))) continue;
        if (orbs.some(([k, o]) => k !== l.k && !(l.k === 'projects' && /^p\d$/.test(k)) && hit(box, { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 }))) continue;
        at = box; break; }
      const box = at || { x: spots[0][0], y: spots[0][1], w, h };
      placed.push(box);
      list.push({ x: Math.round(box.x + w / 2), y: Math.round(box.y), text: l.text, n: l.n, hot: l.hot, dim: !at });
    }
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
      const role = 'r' + e.role;
      // A role at work: a track starting goes from the core to it; what it learned, from it to memory; a finished
      // piece, from it to its project.
      const r = e.kind === 'track' ? ['core', role] : e.kind === 'practice' ? [role, 'memory'] : e.kind === 'work' ? [role, nodes['p' + e.project] ? 'p' + e.project : 'memory'] : ROUTES[e.kind];
      if (!r || (e.role != null && !nodes[role])) return;
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
