// Lax's body, drawn (Phase 6.2): one copy for both sides, so Lax looks the same wherever it shows itself. The page
// loads it as a plain script and draws on its canvas every frame (lax.js); the Mac imports it (lib/self.mjs) to draw
// the same Lax as SVG for the pages it makes. No exports, so it's a global: LaxBody.
(() => {
  const SIZES = { sprout: [10, 9], blob: [13, 12], cube: [15, 14], brick: [17, 16], legend: [19, 18] };
  const shade = (hex, amt) => { const n = parseInt(hex.slice(1), 16), t = amt < 0 ? 0 : 255, a = Math.abs(amt);
    return '#' + [16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * (1 - a) + t * a).toString(16).padStart(2, '0')).join(''); };

  /** Draws Lax on g (anything with fillStyle and fillRect) in the colours C, standing on (CX, GROUND), and says where
   *  its body is: { cx, x0, y0, w, h }. o: { stage, form, lift (how far the crown rises to clear the form), wears(trait),
   *  m (its mode: idle, working, sleep…), t (ms, for what moves), s (squash), y (hop height), look (-1, 0, 1),
   *  blinking, spark(x, y, colour, speed, life) }. */
  function render(g, C, o) {
    const { stage, form = null, lift: crownLift = 0, m = 'idle', t = 0, blinking = false, CX, GROUND } = o;
    const wears = o.wears || (() => false), spark = o.spark || (() => {});
    const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    // Outlined shapes: all the outlines first, then the fills, so touching rects read as one piece.
    const blk = (rects, c) => { for (const [x, y, w, h] of rects) px(x - 1, y - 1, w + 2, h + 2, C.out); for (const [x, y, w, h] of rects) px(x, y, w, h, c); };
    // Mirror a rect to the other side of the body.
    const mirror = (x0, w, rects) => rects.map(([x, y, rw, rh]) => [2 * x0 + w - x - rw, y, rw, rh]);
    // Each line is a nod, not a copy: a seedling that becomes a tree, a candle that becomes a firebird, a drop that
    // becomes a whale's spout, a plug that arcs, a fox, and the fox's sun, moon and lucky cat.
    const LEAF = '#3f9a52', LEAF_HI = '#7fd08a', WATER = '#bfe3ff', FOAM = '#e6f1fb', METAL = '#c9ccd2', CORD = '#4b5158';
    const flame = (x, y, wd, ht, m, t) => { if (m === 'sleep') { blk([[x + 1, y + ht - 2, wd - 2, 2]], C.red); return; } // embers when asleep
      const f = Math.round(t / 110) % 2; blk([[x, y + 2 - f, wd, ht - 2 + f], [x + 1, y - f, wd - 2, 2]], C.gold); px(x + 1, y + ht - 2, wd - 2, 2, C.red); };
    const tail = (x0, B, big, tip) => { const sw = Math.round(Math.sin(t / 300)); // a bushy tail, white at the tip
      blk([[x0 - 3, B - 6, 3, 3], [x0 - 5 - big, B - 10 - big, 3 + big, 5 + big]], C.body); px(x0 - 5 - big + sw, B - 10 - big, 3 + big, 2, tip); };
    // Behind the body: wings, tails, rays, a cord.
    function formBack(f, x0, y0, w, h, m, t) {
      const R = x0 + w, B = y0 + h, cxm = x0 + Math.floor(w / 2);
      if (f === 'kit') tail(x0, B, 0, '#f3e6c8');
      if (f === 'brush' || f === 'rays' || f === 'crescent') tail(x0, B, 1, f === 'crescent' ? '#c9cff0' : '#f3e6c8');
      if (f === 'rays') { const on = Math.sin(t / 600) > 0 ? 1 : 0; // the sun behind its head
        blk([[cxm, y0 - 7 - on, 1, 3], [x0 - 2, y0 - 4, 2, 2], [R, y0 - 4, 2, 2], [x0 - 4 - on, y0 + 1, 3, 1], [R + 1 + on, y0 + 1, 3, 1]], C.gold); }
      if (f === 'phoenix') { const fl = Math.sin(t / (m === 'working' ? 90 : 220)) > 0 ? 1 : 0; // wings of flame
        const wing = [[x0 - 3, y0 + 3, 3, 4], [x0 - 5, y0 + 1 - fl, 2, 5], [x0 - 7, y0 - 1 - fl, 2, 5], [x0 - 9, y0 - 3 - fl, 2, 4]];
        for (const side of [wing, mirror(x0, w, wing)]) { blk(side, C.gold); for (const [x, y, rw] of side) px(x, y, rw, 1, C.red); } }
      if (f === 'ripple' || f === 'spout') { const sw = Math.round(Math.sin(t / 400)); blk([[R, B - 5, 3, 3], [R + 2, B - 8 - sw, 3, 4], [R + 1, B - 10 - sw, 3, 2]], FOAM); } // a wave
      if (f === 'plug' || f === 'prongs' || f === 'coil') { // the cord, and its plug
        px(R, B - 4, 3, 1, CORD); px(R + 2, B - 7, 1, 3, CORD); px(R + 2, B - 8, 3, 1, CORD); blk([[R + 5, B - 9, 3, 3]], METAL); px(R + 8, B - 9, 1, 1, METAL); px(R + 8, B - 7, 1, 1, METAL); }
      if (f === 'float') { const fl = Math.sin(t / 160) > 0 ? 1 : 0; const wing = [[x0 - 3, y0 + 3 - fl, 3, 2], [x0 - 5, y0 + 1 - fl, 3, 2]]; blk([...wing, ...mirror(x0, w, wing)], '#fff4fa'); }
    }
    // On the body: ears, what grows on its head, a collar.
    function formFront(f, x0, y0, w, h, m, t) {
      const B = y0 + h, ears = (rects, inner, tip) => { blk([...rects, ...mirror(x0, w, rects)], C.body);
        if (inner) for (const r of [inner, ...mirror(x0, w, [inner])]) px(...r, tip || shade(C.body, -0.35)); };
      const cxm = x0 + Math.floor(w / 2), sw = Math.round(Math.sin(t / 500));
      if (f === 'sprig') { px(cxm, y0 - 3, 1, 3, LEAF); blk([[cxm - 3 + sw, y0 - 5, 3, 2], [cxm + 1 + sw, y0 - 6, 3, 2]], LEAF); px(cxm + 2 + sw, y0 - 6, 1, 1, LEAF_HI); }
      if (f === 'sapling') { px(cxm, y0 - 7, 1, 7, '#8a5a3c');
        blk([[cxm - 4 + sw, y0 - 5, 4, 2], [cxm + 1 + sw, y0 - 8, 4, 2], [cxm - 3 + sw, y0 - 10, 3, 2]], LEAF); px(cxm + 2 + sw, y0 - 8, 2, 1, LEAF_HI); }
      if (f === 'canopy') { blk([[cxm - 1, y0 - 4, 3, 4]], '#8a5a3c'); // a little tree, in bloom
        blk([[cxm - 6 + sw, y0 - 9, 13, 5], [cxm - 4 + sw, y0 - 11, 9, 2], [cxm - 2 + sw, y0 - 12, 5, 1]], LEAF);
        px(cxm - 4 + sw, y0 - 10, 4, 1, LEAF_HI); for (const [x, y] of [[-4, -7], [3, -9], [0, -6], [5, -6]]) px(cxm + x + sw, y0 + y, 1, 1, '#ef7f9f'); }
      if (f === 'wick') flame(cxm - 1, y0 - 5, 3, 5, m, t);
      if (f === 'torch' || f === 'phoenix') { flame(cxm - 2, y0 - 7, 5, 7, m, t); if (m === 'working' && Math.random() < 0.2) spark(cxm, y0 - 8, C.gold, 0.6, 16); }
      if (f === 'drop' || f === 'ripple') { blk([[cxm - 1, y0 - 3, 3, 2], [cxm, y0 - 5, 1, 2]], WATER); px(cxm - 1, y0 - 3, 1, 1, '#ffffff'); }
      if (f === 'spout') { const k = Math.round(Math.sin(t / 250)); // a whale's spout
        blk([[cxm, y0 - 5, 1, 5], [cxm - 1, y0 - 7, 3, 2], [cxm - 3, y0 - 9 + k, 2, 2], [cxm + 2, y0 - 9 + k, 2, 2], [cxm - 5, y0 - 8 + k, 2, 2], [cxm + 4, y0 - 8 + k, 2, 2]], WATER);
        px(cxm - 3, y0 - 9 + k, 1, 1, '#ffffff'); px(cxm - 5, y0 - 5 + k, 1, 1, WATER); px(cxm + 5, y0 - 5 + k, 1, 1, WATER);
        if (m === 'happy' && Math.random() < 0.3) { spark(cxm - 4, y0 - 8, C.glass, 0.6, 24); spark(cxm + 4, y0 - 8, C.glass, 0.6, 24); } }
      if (f === 'plug' || f === 'prongs' || f === 'coil') { const tall = f === 'plug' ? 2 : f === 'prongs' ? 3 : 4; // prongs on its head
        blk([[cxm - 3, y0 - tall, 2, tall], [cxm + 2, y0 - tall, 2, tall]], METAL);
        if (f === 'coil' && m !== 'sleep' && Math.sin(t / 90) > -0.2) { const z = Math.round(t / 80) % 2; // the arc between them
          px(cxm - 1, y0 - tall - 1 + z, 1, 1, '#fff8c0'); px(cxm, y0 - tall - z, 1, 1, '#ffffff'); px(cxm + 1, y0 - tall - 1 + z, 1, 1, '#fff8c0'); }
        if (f !== 'plug' && (m === 'happy' || m === 'working') && Math.random() < 0.12) spark(cxm + (Math.random() < .5 ? -2 : 3), y0 - tall, C.gold, 0.7, 14); }
      if (f === 'kit') ears([[x0, y0 - 3, 4, 3], [x0 + 1, y0 - 5, 2, 2]], [x0 + 1, y0 - 4, 1, 3], '#5b3a22');
      if (f === 'brush' || f === 'rays' || f === 'crescent') ears([[x0, y0 - 3, 5, 3], [x0 + 1, y0 - 6, 3, 3], [x0 + 1, y0 - 8, 2, 2]], [x0 + 2, y0 - 5, 1, 4], shade(C.body, -0.35));
      if (f === 'lucky' || f === 'float') ears([[x0 + 1, y0 - 3, 3, 3], [x0 + 2, y0 - 4, 1, 1]], f === 'lucky' ? [x0 + 2, y0 - 2, 1, 2] : null, '#7a5a3a');
      if (f === 'lucky') { const up = m === 'sleep' ? 0 : Math.round((Math.sin(t / 260) + 1) * 1.5); // the beckoning paw, and its collar and coin
        blk([[x0 + w + 1, y0 + 3 - up, 3, 4]], C.body); px(x0 + w + 1, y0 + 3 - up, 3, 1, '#ffffff');
        px(x0, B - 6, w, 1, C.band); blk([[x0 + Math.floor(w / 2) - 1, B - 5, 3, 3]], C.gold); px(x0 + Math.floor(w / 2), B - 4, 1, 1, '#c99a2e'); }
      if (f === 'float' && m !== 'sleep' && Math.random() < 0.04) spark(x0 + Math.random() * w, y0 + Math.random() * h, '#ffd6ea', 0.3, 30);
    }
    // Over the face: the moon's crescent, the lucky cat's whiskers.
    function formTop(f, x0, y0, w, h, eyeY, m, t) {
      const cx = x0 + Math.floor(w / 2);
      if (f === 'crescent') { const c = m === 'sleep' || Math.sin(t / 500) > 0.6 ? '#ffffff' : '#c9cff0'; // brighter in the dark
        px(cx - 1, y0 + 1, 2, 1, c); px(cx - 2, y0 + 2, 1, 2, c); px(cx - 1, y0 + 4, 2, 1, c);
        if (m === 'sleep' && Math.random() < 0.03) spark(x0 + Math.random() * w, y0 - 4, '#fff6c8', 0.2, 40); }
      if (f === 'lucky') for (const y of [eyeY + 3, eyeY + 5]) { px(x0 - 4, y, 4, 1, C.dust); px(x0 + w, y, 4, 1, C.dust); }
    }

    const [bw, bh] = SIZES[stage] || SIZES.cube;
    let s = o.s || 0;
    if (m === 'sleep') s += Math.sin(t / 700) * 0.04;
    if (m === 'idle' && !o.y) s += Math.sin(t / 400) * 0.03;
    const w = Math.max(6, Math.round(bw * (1 + s))), h = Math.max(4, Math.round(bh * (1 - s)));
    let dx = 0;
    if (m === 'working') dx = Math.round(Math.sin(t / 45));
    if (m === 'talking') s += Math.sin(t / 60) * 0.03;
    const by = Math.round(o.y || 0) + (form === 'float' ? 4 + Math.round(Math.sin(t / 400) * 1.5) : 0); // the pink one hovers
    const cx = CX + dx, x0 = cx - Math.floor(w / 2), feetH = 2, y0 = GROUND - feetH - h - by;
    const shadowW = Math.max(4, w - Math.round(by / 2));
    px(cx - shadowW / 2, GROUND + 1, shadowW, 1, C.shadow);

    // cape behind
    if (wears('cape')) { const fl = Math.round(Math.sin(t / 120) * 2); px(x0 - 3 + fl, y0 + 3, 3, h - 2, C.cape); px(x0 - 4 + fl * 2, y0 + 5, 2, h - 5, C.cape); }
    if (form) formBack(form, x0, y0, w, h, m, t);

    // feet: the body's shade, not its outline colour, so they show on a dark background too
    const run = m === 'working' ? Math.round(Math.sin(t / 50)) : 0;
    px(x0 + 2, GROUND - feetH - Math.max(0, run) - by, 3, 2, C.lo);
    px(x0 + w - 5, GROUND - feetH - Math.max(0, -run) - by, 3, 2, C.lo);

    // body: thick outline, flat fill, light top-left, shade bottom-right (Meat Boy-ish chunk)
    px(x0 - 1, y0 - 1, w + 2, h + 2, C.out);
    px(x0, y0, w, h, C.body);
    px(x0, y0 + h - 2, w, 2, C.lo); px(x0 + w - 2, y0, 2, h, C.lo);
    px(x0 + 1, y0 + 1, w - 4, 1, C.hi); px(x0 + 1, y0 + 1, 1, h - 4, C.hi);
    if (stage === 'sprout' || stage === 'blob') { // round the corners
      for (const [cx2, cy2] of [[x0 - 1, y0 - 1], [x0 + w, y0 - 1], [x0 - 1, y0 + h], [x0 + w, y0 + h]]) px(cx2, cy2, 1, 1, C.bg);
      for (const [cx2, cy2] of [[x0, y0], [x0 + w - 1, y0], [x0, y0 + h - 1], [x0 + w - 1, y0 + h - 1]]) px(cx2, cy2, 1, 1, C.out);
    }
    if (wears('scar')) { px(x0 + w - 5, y0 + h - 6, 1, 1, C.out); px(x0 + w - 4, y0 + h - 5, 1, 1, C.out); px(x0 + w - 3, y0 + h - 4, 1, 1, C.out); }
    if (form) formFront(form, x0, y0, w, h, m, t);

    // arms when waving
    if (m === 'waiting' || m === 'happy') { const up = Math.sin(t / 90) > 0 ? 2 : 0;
      px(x0 - 3, y0 + 4 - up, 2, 3, C.out); px(x0 + w + 1, y0 + 4 - (2 - up), 2, 3, C.out); }

    // face
    const eyeY = y0 + Math.max(2, Math.floor(h * 0.3)), ex1 = x0 + Math.floor(w * 0.22), ex2 = x0 + w - Math.floor(w * 0.22) - 3;
    const look = m === 'thinking' ? 0 : m === 'working' ? 1 : o.look || 0;
    const eye = (ex) => {
      if (m === 'sleep' || blinking) { px(ex, eyeY + 2, 3, 1, C.out); return; }
      if (m === 'happy') { px(ex, eyeY + 2, 1, 1, C.out); px(ex + 1, eyeY + 1, 1, 1, C.out); px(ex + 2, eyeY + 2, 1, 1, C.out); return; }
      if (m === 'error' && (o.s || 0) > 0.1) { px(ex, eyeY, 1, 1, C.out); px(ex + 2, eyeY, 1, 1, C.out); px(ex + 1, eyeY + 1, 1, 1, C.out); px(ex, eyeY + 2, 1, 1, C.out); px(ex + 2, eyeY + 2, 1, 1, C.out); return; }
      const big = m === 'listening' || m === 'waiting';
      px(ex, eyeY - (big ? 1 : 0), 3, big ? 5 : 4, C.eye);
      const py = m === 'thinking' ? eyeY - (big ? 1 : 0) : eyeY + 1;
      px(ex + 1 + Math.max(-1, Math.min(1, look)) * (look > 0 ? 1 : 1), py, 1 + (big ? 1 : 0) - (look > 0 && big ? 1 : 0), 2, C.out);
    };
    eye(ex1); eye(ex2);
    // A frame all round an eye (5 x 6, just outside it).
    const frame = (ex, c) => { px(ex - 1, eyeY - 1, 5, 1, c); px(ex - 1, eyeY + 4, 5, 1, c); px(ex - 1, eyeY, 1, 4, c); px(ex + 3, eyeY, 1, 4, c); };
    if (wears('glasses')) { frame(ex1, C.out); frame(ex2, C.out); px(ex1 + 4, eyeY + 1, ex2 - ex1 - 5, 1, C.out); // bridge
      px(x0, eyeY + 1, ex1 - 1 - x0, 1, C.out); px(ex2 + 4, eyeY + 1, x0 + w - ex2 - 4, 1, C.out); } // arms to the sides
    if (wears('monocle')) { frame(ex2, C.gold); px(ex2 + 3, eyeY + 5, 1, 3, C.gold); } // and its chain

    // mouth
    const my = eyeY + 6, mx = cx - 2;
    if (m === 'talking') { const open = Math.sin(t / 70) > 0; px(mx, my, 4, open ? 3 : 1, C.out); if (open) px(mx + 1, my + 1, 2, 1, C.red); }
    else if (m === 'happy' || m === 'idle') { px(mx, my, 1, 1, C.out); px(mx + 1, my + 1, 2, 1, C.out); px(mx + 3, my, 1, 1, C.out); }
    else if (m === 'error' || m === 'waiting') px(mx + 1, my, 2, 2, C.out);
    else if (m === 'working') px(mx, my + 1, 4, 1, C.out);

    // headgear
    if (wears('headband')) { px(x0, y0 + 1, w, 2, C.band); const fl = Math.round(Math.sin(t / 80) * 1.5);
      px(x0 - 3, y0 + 1 + fl, 3, 1, C.band); px(x0 - 5, y0 + 2 - fl, 2, 1, C.band); }
    if (wears('goggles')) { px(x0 + 1, y0, w - 2, 1, C.out); px(ex1, y0 - 1, 3, 2, C.glass); px(ex2, y0 - 1, 3, 2, C.glass); }
    if (wears('antenna')) { px(cx, y0 - 5, 1, 4, C.stick); px(cx - 1, y0 - 7, 3, 2, Math.sin(t / 200) > 0 ? C.gold : '#fff1a8'); }
    if (stage === 'sprout' && !form) { px(cx, y0 - 3, 1, 2, C.green); px(cx + 1, y0 - 4, 2, 1, C.green); px(cx - 2, y0 - 3, 2, 1, C.green); }
    if (form) formTop(form, x0, y0, w, h, eyeY, m, t);
    if (stage === 'legend') { const cy = y0 - crownLift; px(cx - 4, cy - 3, 9, 2, C.gold); px(cx - 4, cy - 5, 1, 2, C.gold); px(cx, cy - 5, 1, 2, C.gold); px(cx + 4, cy - 5, 1, 2, C.gold); }
    if (wears('flame') && m !== 'sleep') { const f = Math.round(t / 100) % 2; px(x0 + w + 2, y0 - 2 - f, 2, 3, C.gold); px(x0 + w + 2, y0, 2, 1, C.red); }
    return { cx, x0, y0, w, h };
  }

  /** The egg, wobbling by tilt, with crack (0-10) pixels of a zigzag crack across it while it hatches. Its speckles are
   *  whatever leads so far (C.body). */
  function egg(g, C, { tilt = 0, crack = 0, CX, GROUND }) {
    const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    const rows = [4, 6, 8, 8, 10, 10, 12, 12, 12, 12, 12, 10, 8, 6], h = rows.length, y0 = GROUND - h;
    px(CX - 5, GROUND + 1, 10, 1, C.shadow);
    rows.forEach((w, i) => { const x = CX - w / 2 + Math.round(tilt * (h - i) / h); px(x - 1, y0 + i, w + 2, 1, C.out); });
    px(CX - 1 + Math.round(tilt), y0 - 1, 2, 1, C.out);
    rows.forEach((w, i) => { const x = CX - w / 2 + Math.round(tilt * (h - i) / h); px(x, y0 + i, w, 1, '#f3e6cf');
      if (i > 2) px(x + w - 2, y0 + i, 2, 1, '#cdbb9c'); if (i > 1 && i < 6) px(x + 1, y0 + i, 1, 1, '#fffaf0'); });
    for (const [dx, dy] of [[-2, 4], [2, 7], [-4, 9], [1, 10], [2, 2]]) px(CX + dx + Math.round(tilt * (h - dy) / h), y0 + dy, 2, 2, C.body); // what leads, so far
    for (let i = 0; i < crack; i++) px(CX - 5 + i + Math.round(tilt * 0.5), y0 + 6 + (i % 2), 1, 1, C.out);
  }

  globalThis.LaxBody = { render, egg, SIZES, shade };
})();
