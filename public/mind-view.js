// Lax's mind on the website: the shared half of mind.html. Holds the snapshot (counts only, lib/mind.mjs builds it),
// plays its events (no words: the network and Lax show them), sizes the canvas, runs the frame loop, and draws the small walking Lax both views use.
// The view (net.js) registers itself with Mind.view(name, { init, resize, update, render, event }) and only draws.
(() => {
  const qs = new URLSearchParams(location.search);
  const AWAY = 10 * 60e3; // no word from the Mac for this long: Lax is asleep
  const views = {};
  const $ = (s) => document.querySelector(s);

  const shade = (hex, amt) => { const n = parseInt(hex.slice(1), 16), t = amt < 0 ? 0 : 255, a = Math.abs(amt);
    return '#' + [16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * (1 - a) + t * a).toString(16).padStart(2, '0')).join(''); };

  const Mind = {
    snap: null, shade,
    asleep() { return !this.snap || Date.now() - this.snap.seen > AWAY; },
    view(name, v) { views[name] = v; },
    // A view's labels: [{ x, y, text, n, hot }] in the view's own pixels, placed over the canvas.
    labels(list) {
      const v = Mind.current, box = $('#labels');
      box.replaceChildren(...list.map((l) => { const s = document.createElement('span');
        s.style.left = (l.x / v.W * 100) + '%'; s.style.top = (l.y / v.H * 100) + '%'; if (l.hot) s.className = 'hot';
        s.append(l.text); if (l.n != null) { const b = document.createElement('b'); b.textContent = ' ' + l.n; s.append(b); }
        return s; }));
    },
    // The small Lax, 9 × 8, standing on (x, y) (its feet). dir -1 left, 1 right, 0 facing you; step flips the legs.
    lax(ctx, x, y, { dir = 0, step = 0, sleep = false, color = Mind.snap?.look?.color || '#D97757' } = {}) {
      const body = ['..xxxxx..', '.xxxxxxx.', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', '.xxxxxxx.'];
      const ox = Math.round(x) - 4, oy = Math.round(y) - 8, hi = shade(color, 0.3), lo = shade(color, -0.25);
      ctx.fillStyle = '#120c0a'; // outline: the body grown by a pixel
      body.forEach((r, j) => [...r].forEach((c, i) => { if (c === 'x') ctx.fillRect(ox + i - 1, oy + j - 1, 3, 3); }));
      body.forEach((r, j) => [...r].forEach((c, i) => { if (c !== 'x') return;
        ctx.fillStyle = j < 2 && i < 5 ? hi : j > 4 ? lo : color; ctx.fillRect(ox + i, oy + j, 1, 1); }));
      // Eyes: open, two tall white pixels; asleep, shut: a flat dash each, a row lower (like the app's closed eyes).
      ctx.fillStyle = sleep ? '#120c0a' : '#fff8ee';
      if (sleep) for (const e of [1, 6]) ctx.fillRect(ox + e, oy + 4, 2, 1);
      else for (const e of dir < 0 ? [1, 4] : dir > 0 ? [4, 7] : [2, 6]) ctx.fillRect(ox + e, oy + 3, 1, 2);
      ctx.fillStyle = lo; // feet
      ctx.fillRect(ox + (step ? 1 : 2), oy + 7, 2, 1); ctx.fillRect(ox + (step ? 6 : 5), oy + 7, 2, 1);
    },
    // The small Lax on its own little canvas (11 × 10 with the outline), for a view to use as a texture. Cached per pose.
    sprite(opts = {}) {
      const key = JSON.stringify(opts) + (Mind.snap?.look?.color || ''), cache = (Mind._sprites ||= {});
      if (cache[key]) return cache[key];
      const cv = document.createElement('canvas'); cv.width = 11; cv.height = 10;
      Mind.lax(cv.getContext('2d'), 5, 9, opts); return (cache[key] = cv);
    },
    // A rising "z" while it sleeps, in pixels.
    zzz(ctx, x, y, t) {
      ctx.fillStyle = '#8a8378';
      for (let k = 0; k < 2; k++) { const p = ((t / 1600) + k / 2) % 1, zx = Math.round(x + p * 4), zy = Math.round(y - p * 10);
        ctx.globalAlpha = 1 - p; ctx.fillRect(zx, zy, 5, 1); for (let d = 1; d < 4; d++) ctx.fillRect(zx + 4 - d, zy + d, 1, 1); ctx.fillRect(zx, zy + 4, 5, 1); }
      ctx.globalAlpha = 1;
    },
    event(e) {
      Mind.current?.event?.(e);
    },
    setSnap(s) { Mind.snap = s; Mind.current?.snap?.(s); },

    start() {
      Mind.current = Object.values(views)[0];
      // A view renders itself (three.js) at a low resolution, scaled up with hard pixels: about 240 px across, so each
      // of its pixels is 2-4 screen pixels whatever the screen. It keeps W and H, which the labels are placed in.
      const c = $('#c'), v = Mind.current; v.init(c);
      const fit = () => { const box = $('#view'), aw = Math.max(200, box.clientWidth), ah = Math.max(150, box.clientHeight);
        const s = Math.max(2, Math.round(Math.min(aw, 960) / 240)), w = Math.floor(aw / s), h = Math.floor(ah / s);
        c.style.width = w * s + 'px'; c.style.height = h * s + 'px'; $('#labels').style.fontSize = Math.min(20, 8 + s * 3) + 'px';
        // It draws behind the title and the links, but is framed in the band between them (in its own pixels).
        const ct = c.getBoundingClientRect().top, top = ($('header').getBoundingClientRect().bottom + 12 - ct) / s, bottom = ($('.note').getBoundingClientRect().top - 12 - ct) / s;
        v.W = w; v.H = h; v.resize(w, h, [Math.max(0, top), Math.min(h, bottom)]); };
      fit(); addEventListener('resize', fit);
      let last = performance.now();
      // Frames can come far apart (a tab coming back, a headless preview): catch up in steps of a frame, up to 2 s.
      const frame = () => { const t = performance.now(); let at = Math.max(last, t - 2000);
        while (t - at > 20) { at += 16; v.update(at, 16); } v.update(t, t - at); v.render(t); last = t; requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
      (qs.has('fake') || location.protocol === 'file:' ? fake : live)();
    },
  };
  window.Mind = Mind;

  // Live: the Worker (demo/worker.mjs) sends the snapshot when we connect, then every push from the Mac with what just
  // happened. Where there's no socket (the local preview, or it fails), the snapshot is asked for every few seconds
  // (the local preview also has the last events, played as they come).
  const API = '/demo/mind/api/';
  function live() {
    let ws, opened = false;
    try { ws = new WebSocket(location.origin.replace(/^http/, 'ws') + API + 'live'); } catch { return poll(); }
    ws.onopen = () => (opened = true);
    ws.onmessage = (m) => { let d; try { d = JSON.parse(m.data); } catch { return; }
      if (d.snap) Mind.setSnap(d.snap);
      for (const e of d.events || []) Mind.event(e); };
    ws.onclose = () => (opened ? setTimeout(live, 5000) : poll());
  }
  function poll() {
    let since = -1;
    const get = () => fetch(API + 'snap', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (d.snap) Mind.setSnap(d.snap);
      const recent = d.recent || [];
      if (since >= 0) for (const e of recent) if (e.at > since) Mind.event(e); // only what happens while you watch
      since = Math.max(since, ...recent.map((e) => e.at), 0);
    }).catch(() => {}).finally(() => setTimeout(get, 3000));
    get();
  }

  // ?fake (and the PNG previews): a made-up mind that keeps doing things.
  function fake() {
    const now = Date.now(), day = 86400e3;
    Mind.setSnap({ v: 1, seen: qs.has('asleep') ? now - day : now, owner: 'diogo', look: { color: qs.get('color') || '#d97757', stage: 'blob' },
      you: 9, projects: [{ name: 'lax', notes: 24 }, { name: '', notes: 11 }, { name: '', notes: 6 }, { name: '', notes: 3 }],
      episodes: { total: 14, week: 3 }, archive: 400, skills: { drafts: 1, installed: 2 },
      rules: { learning: now - 2 * day, wishing: now - 9 * day, remembering: now - 1 * day }, week: { heard: 23, spoke: 19, changes: 31 }, doing: {},
      sessions: [{ p: 0, state: 'working' }, { p: 1, state: 'idle' }, { p: null, state: 'working' }], roles: [{ name: 'researcher', work: 3, week: 2, p: [1] }] });
    if (qs.has('asleep')) return;
    const kinds = ['tool', 'hear', 'speak', 'track', 'tool', 'recall', 'reflect', 'episode', 'practice', 'skill', 'forget', 'learned', 'work', 'review'];
    let i = 0;
    const tick = () => {
      const kind = qs.get('event') || kinds[i++ % kinds.length], s = Mind.snap, e = { kind, at: Date.now() };
      if (kind === 'episode') { e.n = 1; s.episodes.total++; s.episodes.week++; }
      if (kind === 'skill') s.skills.drafts++;
      const lasts = { hear: 'hearing', speak: 'speaking', reflect: 'reflecting', recall: 'recalling' }[kind]; // as if it took a moment
      if (lasts) { s.doing[lasts] = true; setTimeout(() => { s.doing[lasts] = false; }, 3000); }
      if (kind === 'tool') { e.session = 0; e.n = 4; }
      if (['track', 'practice', 'work'].includes(kind)) { e.role = 0; if (kind === 'work') { e.project = 1; s.roles[0].work++; s.roles[0].week++; } }
      if (kind === 'hear') s.week.heard++; if (kind === 'speak') s.week.spoke++; if (['episode', 'learned', 'review', 'forget'].includes(kind)) s.week.changes++;
      if (kind === 'forget') s.episodes.total = Math.max(0, s.episodes.total - 1);
      if (kind === 'learned') s.you++;
      if (kind === 'review') s.rules.learning = Date.now();
      s.seen = Date.now(); Mind.setSnap(s); Mind.event(e);
      setTimeout(tick, qs.has('event') ? 4000 : 6000);
    };
    setTimeout(tick, +(qs.get('first') || 1500));
  }
})();
