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
    // Behind the body: wings and tails.
    function formBack(f, x0, y0, w, h, m, t) {
      const R = x0 + w, B = y0 + h;
      // On the way there: the ember tail, the turtle's shell and tail, the young bolt, the kit's tail.
      if (f === 'ember' || f === 'blaze') { const big = f === 'blaze' ? 1 : 0, f2 = Math.round(t / 110) % 2;
        blk([[R, B - 3, 3 + big, 2], [R + 2 + big, B - 6 - big, 2, 4 + big]], C.body);
        if (m !== 'sleep') { blk([[R + 1 + big, B - 9 - big * 2 - f2, 4, 3 + big + f2]], C.gold); px(R + 2 + big, B - 7 - big * 2, 2, 1 + big, C.red); } }
      if (f === 'shell0' || f === 'shell1') { const sh = [[x0 - 2, y0 + 3, 1, h - 5]]; blk([...sh, ...mirror(x0, w, sh)], '#a7774a');
        if (f === 'shell0') blk([[R, B - 4, 3, 2], [R + 2, B - 7, 2, 4], [R, B - 8, 3, 2]], C.body);
        else blk([[R, B - 5, 3, 3], [R + 2, B - 9, 3, 5], [R + 4, B - 11, 3, 4]], '#e6f1fb'); }
      if (f === 'spark') { blk([[R + 1, B - 7, 2, 4], [R + 1, B - 8, 4, 2], [R + 3, B - 12, 2, 5]], C.body); blk([[R - 1, B - 4, 3, 2]], '#8a5a2b'); }
      if (f === 'kit') { const sw = Math.round(Math.sin(t / 300)); blk([[x0 - 3, B - 6, 3, 2], [x0 - 5 + sw, B - 9, 3, 4]], C.body); px(x0 - 5 + sw, B - 9, 3, 1, '#f3e6c8'); }
      if (f === 'wings') { // the fire lizard's last form: teal wings with an orange rim, and its tail flame
        const fl = Math.sin(t / (m === 'working' ? 90 : 220)) > 0 ? 1 : 0;
        const wing = [[x0 - 3, y0 + 2, 3, 6], [x0 - 5, y0, 2, 7], [x0 - 7, y0 - 2 + fl, 2, 7], [x0 - 9, y0 - 4 + fl, 2, 7], [x0 - 11, y0 - 6 + fl * 2, 2, 6], [x0 - 12, y0 - 8 + fl * 2, 2, 3]];
        for (const side of [wing, mirror(x0, w, wing)]) { blk(side, '#2c8a8f'); for (const [x, y, rw] of side) px(x, y, rw, 1, C.body); }
        blk([[R, B - 3, 5, 2], [R + 4, B - 6, 2, 4]], C.body);
        if (m !== 'sleep') { const f2 = Math.round(t / 110) % 2; blk([[R + 3, B - 10 - f2, 4, 4 + f2]], C.gold); px(R + 4, B - 8, 2, 2, C.red); }
      }
      if (f === 'cannons') { const shell = [[x0 - 2, y0 + 3, 2, h - 5]]; blk([...shell, ...mirror(x0, w, shell)], '#a7774a'); }
      if (f === 'bolt') { // lightning-bolt tail, brown at the base
        blk([[R + 2, B - 9, 2, 5], [R + 2, B - 10, 5, 2], [R + 5, B - 16, 2, 7], [R + 5, B - 17, 6, 2]], C.body);
        blk([[R, B - 5, 3, 2]], '#8a5a2b');
      }
      if (f === 'ruff') { const sw = Math.round(Math.sin(t / 300)); blk([[x0 - 4, B - 7, 4, 3], [x0 - 7, B - 11, 5, 5]], C.body); blk([[x0 - 8 + sw, B - 14, 4, 4]], '#f3e6c8'); }
      if (f === 'gem') { const sw = Math.round(Math.sin(t / 350)); blk([[R, B - 6, 4, 2], [R + 3, B - 9, 2, 4], [R + 1 + sw, B - 13, 2, 4], [R + 5 + sw, B - 14, 2, 5]], C.body); }
      if (f === 'rings') { blk([[x0 - 4, B - 7, 4, 3], [x0 - 7, B - 11, 5, 5], [x0 - 8, B - 15, 4, 5]], C.body); px(x0 - 7, B - 9, 5, 1, ringGlow(m, t)); }
      if (f === 'coin') blk([[R, B - 5, 3, 2], [R + 2, B - 10, 2, 6], [R, B - 11, 3, 2]], C.body), px(R, B - 11, 2, 2, '#7a5a3a');
      if (f === 'float') { const sw = Math.round(Math.sin(t / 260)); blk([[R, B - 2, 3, 1], [R + 3, B - 3, 3, 1], [R + 6, B - 8, 1, 5], [R + 4 + sw, B - 9, 3, 1]], C.body); blk([[R + 3 + sw, B - 12, 3, 3]], C.body); }
    }
    // The moon fox's rings: they glow brighter in the dark (asleep).
    const ringGlow = (m, t) => (m === 'sleep' || Math.sin(t / 500) > 0.6 ? '#fff0a0' : '#f6d23c');
    // On the body, under the face: ears, flowers, cannons, ruffs.
    function formFront(f, x0, y0, w, h, m, t) {
      const B = y0 + h, ears = (rects, inner, tip) => { blk([...rects, ...mirror(x0, w, rects)], C.body);
        if (inner) for (const r of [inner, ...mirror(x0, w, [inner])]) px(...r, tip || shade(C.body, -0.35)); };
      const cxm = x0 + Math.floor(w / 2);
      if (f === 'seed') { blk([[x0 + 2, y0 - 3, w - 4, 3], [x0 + 3, y0 - 5, w - 6, 2]], '#3f9a52'); px(x0 + 4, y0 - 4, 2, 1, '#7fd08a'); } // a bulb on its back
      if (f === 'bud') { const leaf = [[x0 - 3, y0 - 2, 6, 2], [x0 - 5, y0 - 1, 2, 1]]; blk([...leaf, ...mirror(x0, w, leaf)], '#2f7a43'); blk([[cxm - 2, y0 - 3, 5, 2]], '#2f7a43');
        blk([[cxm - 2, y0 - 7, 5, 4], [cxm - 1, y0 - 9, 3, 2]], '#ef7f9f'); px(cxm - 1, y0 - 6, 1, 2, '#fff2f5'); } // the bud before the bloom
      if (f === 'blaze') blk([[x0 + w - 5, y0 - 2, 2, 2], [x0 + w - 4, y0 - 4, 2, 2]], C.body); // a horn
      if (f === 'shell1') { const e = [[x0 - 2, y0 + 1, 3, 2], [x0 - 4, y0 - 1, 3, 3], [x0 - 5, y0 - 3, 2, 2]]; blk([...e, ...mirror(x0, w, e)], '#e6f1fb'); } // fluffy ears
      if (f === 'pichu') ears([[x0 + 1, y0 - 2, 3, 2], [x0, y0 - 5, 4, 3]], [x0, y0 - 5, 4, 1], '#1a1410');
      if (f === 'spark') ears([[x0 + 2, y0 - 3, 3, 3], [x0 + 1, y0 - 6, 2, 3]], [x0 + 1, y0 - 6, 2, 2], '#4a3020');
      if (f === 'kit') ears([[x0, y0 - 3, 4, 3], [x0 + 1, y0 - 5, 2, 2]], [x0 + 1, y0 - 4, 1, 3], '#5b3a22');
      if (f === 'bloom') { // the seed's last form: a big flower on its back
        const sw = Math.round(Math.sin(t / 500));
        const leaf = [[x0 - 5, y0 - 3, 8, 3], [x0 - 8, y0 - 2, 3, 2]]; blk([...leaf, ...mirror(x0, w, leaf)], '#2f7a43'); blk([[x0 + w / 2 - 1, y0 - 3, 3, 3]], '#8a5a3c');
        const cx = x0 + Math.floor(w / 2) + sw; blk([[cx - 6, y0 - 6, 13, 3], [cx - 4, y0 - 8, 9, 2]], '#ef7f9f');
        for (const [x, y] of [[cx - 4, y0 - 5], [cx + 4, y0 - 5], [cx, y0 - 7]]) px(x, y, 1, 1, '#fff2f5');
      }
      if (f === 'cannons') { const can = [[x0 + 1, y0 - 2, 3, 3], [x0 - 1, y0 - 5, 3, 3]]; blk([...can, ...mirror(x0, w, can)], '#a7b0ba');
        for (const [x, y] of [[x0 - 1, y0 - 5], ...mirror(x0, w, [[x0 - 1, y0 - 5, 3, 1]])]) px(x, y, 3, 1, '#4b5158');
        px(x0 + 3, B - 4, w - 6, 2, '#f1e2b0');
        if (m === 'happy' && Math.random() < 0.3) { spark(x0, y0 - 6, C.glass, 0.6, 24); spark(x0 + w, y0 - 6, C.glass, 0.6, 24); } }
      if (f === 'bolt') ears([[x0 + 2, y0 - 3, 3, 3], [x0 + 1, y0 - 7, 2, 4]], [x0 + 1, y0 - 7, 2, 2], '#4a3020');
      if (f === 'ruff') { ears([[x0, y0 - 3, 5, 3], [x0 + 1, y0 - 6, 3, 3], [x0 + 1, y0 - 8, 2, 2]], [x0 + 2, y0 - 5, 1, 4], '#5b3a22');
        blk([[x0 - 2, B - 5, w + 4, 3], [x0 - 1, B - 6, 3, 1], [x0 + w - 2, B - 6, 3, 1]], '#f3e6c8'); }
      if (f === 'gem') ears([[x0 + 1, y0 - 4, 3, 4], [x0 + 1, y0 - 7, 2, 3]], [x0 + 2, y0 - 4, 1, 3], '#e9b8f0');
      if (f === 'rings') { ears([[x0 + 1, y0 - 4, 3, 4], [x0 + 1, y0 - 8, 2, 4]], [x0 + 1, y0 - 5, 3, 1], ringGlow(m, t));
        px(x0, B - 6, 2, 1, ringGlow(m, t)); px(x0 + w - 2, B - 6, 2, 1, ringGlow(m, t)); }
      if (f === 'coin' || f === 'float') ears([[x0 + 1, y0 - 3, 3, 3], [x0 + 2, y0 - 4, 1, 1]], f === 'coin' ? [x0 + 2, y0 - 2, 1, 2] : null, '#7a5a3a');
      if (f === 'float' && m !== 'sleep' && Math.random() < 0.04) spark(x0 + Math.random() * w, y0 + Math.random() * h, '#ffd6ea', 0.3, 30);
    }
    // Over the face: gems, coins, cheeks, whiskers.
    function formTop(f, x0, y0, w, h, eyeY, m, t) {
      const cx = x0 + Math.floor(w / 2);
      if (f === 'pichu' || f === 'spark') { px(x0 + 1, eyeY + 4, 2, 2, C.red); px(x0 + w - 3, eyeY + 4, 2, 2, C.red); }
      if (f === 'bolt') { px(x0 + 1, eyeY + 4, 2, 2, C.red); px(x0 + w - 3, eyeY + 4, 2, 2, C.red);
        if ((m === 'happy' || m === 'working') && Math.random() < 0.15) spark(x0 + (Math.random() < .5 ? 1 : w - 2), eyeY + 4, C.gold, 0.7, 14); }
      if (f === 'gem') { blk([[cx - 1, y0 + 1, 3, 2]], '#e2304a'); px(cx - 1, y0 + 1, 1, 1, '#ffb3c0'); }
      if (f === 'rings') { const c = ringGlow(m, t); px(cx - 1, y0 + 1, 3, 1, c); px(cx - 2, y0 + 2, 1, 1, c); px(cx + 2, y0 + 2, 1, 1, c); px(cx - 1, y0 + 3, 3, 1, c); }
      if (f === 'coin') { blk([[cx - 1, y0 - 5, 3, 1], [cx - 2, y0 - 4, 5, 3], [cx - 1, y0 - 1, 3, 1]], C.gold); px(cx, y0 - 4, 1, 3, '#c99a2e');
        if (Math.round(t / 900) % 4 === 0) px(cx - 1, y0 - 4, 1, 1, '#fff8d0');
        for (const y of [eyeY + 3, eyeY + 5]) { px(x0 - 4, y, 4, 1, C.dust); px(x0 + w, y, 4, 1, C.dust); } }
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
