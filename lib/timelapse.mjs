// The evolution timelapse (Phase 10): Lax from its egg to today, as an animated GIF. Its story is its milestones
// (life.db): each level, evolution and hatching is a frame, drawn by the phone's own renderer (lib/self.mjs pixels),
// with the white flicker of an evolution between forms. Made only when you ask; names, levels and dates only.
// The GIF is written here in plain JS, like the card's PNG (lib/card.mjs): one palette, LZW, nothing to install.
import { pixels, palette } from './self.mjs';
import { canvas } from './card.mjs';
import { STAGES, stageIdx } from './levels.mjs';
import { formFor } from './species.mjs';

const S = 600; // square: WhatsApp, LinkedIn and X all show it whole
const EGG = '#8a8378', OLD = '#d97757'; // an egg's shell; Lax before species (its colour was the fire one's)
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Its story, from its milestones (oldest first): one frame per look it had, then today's.
 *  sp: its species now (lib/species.mjs; forms it had are drawn from it), now: petView(). */
export function story(milestones, sp, now) {
  const frames = [], level = (t) => Number(/reached level (\d+)/.exec(t)?.[1]) || 0, at = (stage) => STAGES.findIndex(([, s]) => s === stage);
  // A Lax from before species grew without one: its first levels came before any hatching.
  const firstHatch = milestones.findIndex((m) => /hatched/.test(m.text));
  let old = milestones.slice(0, firstHatch < 0 ? milestones.length : firstHatch).some((m) => level(m.text) || /evolved into/.test(m.text));
  let st = { hatched: old, level: 1, stage: 'sprout' };
  const look = () => (!st.hatched ? { form: null, color: EGG, lift: 0 } : old ? { form: null, color: OLD, lift: 0 } : formFor(sp, at(st.stage)));
  const add = (ts) => frames.push({ ts, ...st, look: look(), traits: [] });
  for (const m of milestones) {
    const t = m.text, n = level(t), evolved = /evolved into an? (\w+)/.exec(t)?.[1];
    if (/was born/.test(t)) add(m.ts);
    else if (/went back into its egg/.test(t)) { st = { ...st, hatched: false }; old = false; add(m.ts); }
    else if (/hatched/.test(t)) { st = { ...st, hatched: true, ...(/hatched:/.test(t) && { level: 1, stage: 'sprout' }) }; old = false; add(m.ts); }
    // A level: its stage follows, never back (an old Lax's stages came from its own words, on another curve).
    else if (n) { st = { ...st, level: n, stage: !old && stageIdx(n) > at(st.stage) ? STAGES[stageIdx(n)][1] : st.stage }; add(m.ts); }
    else if (at(evolved) >= 0) { st = { ...st, stage: evolved, level: old ? st.level + 1 : Math.max(st.level + 1, STAGES[at(evolved)][0]) }; add(m.ts); }
  }
  frames.push({ ts: Date.now(), hatched: now.hatched !== false, level: now.level, stage: now.stage, look: now.look, traits: now.traits || [], today: true });
  // The same look at the same level twice (a level reached again after hatching) is one frame.
  return frames.filter((f, i) => f.today || !i || f.level !== frames[i - 1].level || changed(frames[i - 1], f));
}

// ---------- the picture ----------
const caption = (f) => (!f.hatched ? 'EGG' : `LV ${f.level} ${f.stage}`);
const date = (ts) => { const d = new Date(ts); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const changed = (a, b) => a.hatched !== b.hatched || a.stage !== b.stage || a.look.form !== b.look.form || a.look.color !== b.look.color;

/** The timelapse as a GIF (a Buffer). name: Lax's own; color: today's, for the page around it. */
export function timelapseGif(frames, { name = 'Lax', color } = {}) {
  const t = palette(color).themes.dark;
  const bodies = frames.map((f) => pixels(f));
  // One scale for every frame, so it grows on screen as it grew.
  const s = Math.max(1, Math.floor(Math.min(360 / Math.max(...bodies.map((b) => b.w)), 330 / Math.max(...bodies.map((b) => b.h)))));
  const draw = (i, white = false, words = frames[i]) => {
    const f = frames[i], b = bodies[i], cv = canvas(t.bg, S, S), bx = Math.floor((S - b.w * s) / 2), by = 470 - b.h * s;
    cv.rect(24, 24, S - 48, S - 48, t.edge); cv.rect(30, 30, S - 60, S - 60, t.bg);
    cv.text(name, Math.floor((S - cv.width(name, 6)) / 2), 60, 6, palette(f.look.color).themes.dark.accent);
    cv.rect(110, 470, S - 220, 6, t.card);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const c = b.at(x, y); if (c && c !== 'clear') cv.rect(bx + x * s, by + y * s, s, s, white ? '#ffffff' : c); }
    const cap = caption(words), when = words.today ? 'TODAY' : date(words.ts);
    cv.text(cap, Math.floor((S - cv.width(cap, 4)) / 2), 500, 4, t.fg);
    cv.text(when, Math.floor((S - cv.width(when, 3)) / 2), 540, 3, t.dim);
    return cv.px;
  };
  const out = [];
  frames.forEach((f, i) => {
    // Hatching or evolving: the old and the new form flash white, faster and faster, then the new one stands.
    if (i && changed(frames[i - 1], f)) {
      const a = draw(i - 1, true), b = draw(i, true, frames[i - 1]); // what it was, until it stands as what it is
      for (const ms of [240, 200, 160, 120, 100, 80, 60, 60]) out.push([a, ms], [b, ms]);
    }
    out.push([draw(i), f.today ? 3000 : changed(frames[Math.max(0, i - 1)], f) ? 900 : 350]);
  });
  return gif(out, S, S);
}

// ---------- GIF89a ----------
/** frames: [[rgb Uint8Array, ms]]; loops forever. */
export function gif(frames, w, h) {
  const colors = new Map();
  const indexed = frames.map(([px]) => {
    const idx = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const c = (px[i * 3] << 16) | (px[i * 3 + 1] << 8) | px[i * 3 + 2];
      let k = colors.get(c);
      if (k === undefined) { if (colors.size >= 256) throw new Error('more than 256 colours'); k = colors.size; colors.set(c, k); }
      idx[i] = k;
    }
    return idx;
  });
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(2, colors.size)))), table = Buffer.alloc(3 * (1 << bits));
  for (const [c, k] of colors) table.set([c >> 16, (c >> 8) & 255, c & 255], k * 3);
  const u16 = (n) => [n & 255, n >> 8];
  const parts = [Buffer.from('GIF89a'), Buffer.from([...u16(w), ...u16(h), 0xf0 | (bits - 1), 0, 0]), table,
    Buffer.from([0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0])];
  frames.forEach(([, ms], f) => {
    parts.push(Buffer.from([0x21, 0xf9, 4, 0, ...u16(Math.round(ms / 10)), 0, 0]), Buffer.from([0x2c, 0, 0, 0, 0, ...u16(w), ...u16(h), 0, bits]));
    const data = lzw(bits, indexed[f]), blocks = [];
    for (let i = 0; i < data.length; i += 255) { const b = data.subarray(i, i + 255); blocks.push(Buffer.from([b.length]), b); }
    parts.push(...blocks, Buffer.from([0]));
  });
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

// Variable-width LZW, as GIF wants it: codes from min+1 bits up to 12, a clear when the table is full.
function lzw(min, idx) {
  const clear = 1 << min, eoi = clear + 1, out = [];
  let size = min + 1, next = eoi + 1, dict = new Map(), cur = 0, n = 0;
  const emit = (code) => { cur |= code << n; n += size; while (n >= 8) { out.push(cur & 255); cur >>>= 8; n -= 8; } };
  emit(clear);
  let prefix = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], hit = dict.get(prefix * 256 + k);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) { if (next >= 1 << size) size++; dict.set(prefix * 256 + k, next++); }
    else { emit(clear); dict = new Map(); size = min + 1; next = eoi + 1; }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (n > 0) out.push(cur & 255);
  return Buffer.from(out);
}
