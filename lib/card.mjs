// A share card (Phase 11's public face, Phase 10's "share card"): Lax as it is today and a few counts, as a picture
// that a link shows in WhatsApp or X (1200 × 630, the size they ask for). Made only when you ask, and frozen then.
// Counts and names only, like its mind on the website (lib/mind-shape.mjs): never what it heard, knows or did.
// Drawn here in plain JS, pixel by pixel: Lax by the phone's own renderer (lib/self.mjs pixels), the words in a 5 × 7
// pixel font, and written as a PNG with zlib; no browser, no canvas, nothing to install.
import zlib from 'node:zlib';
import { pixels, palette } from './self.mjs';

const W = 1200, H = 630;

/** What a card says, from petView() and its mind's public shape (lib/public-mind.mjs view().snap). */
export function cardOf(view, snap = {}) {
  const t = snap?.total || {}, days = Math.max(1, Math.floor((Date.now() - (Number(view?.born) || Date.now())) / 864e5));
  return {
    v: 1, at: Date.now(), name: String(view?.name || 'Lax').slice(0, 12), level: Number(view?.level) || 1, stage: view?.stage || 'sprout',
    species: view?.species?.name || '', color: view?.look?.color || '#d97757',
    look: { stage: view?.stage, hatched: view?.hatched !== false, look: view?.look, traits: view?.traits || [] },
    days, heard: Number(t.heard) || 0, memories: Number(snap?.episodes?.total) || 0, changes: Number(t.changes) || 0,
  };
}

// ---------- the picture ----------
// 5 × 7, a row per number (bit 4 is the left column). Lower case is drawn as upper case.
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14],
  4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0],
  '-': [0, 0, 0, 14, 0, 0, 0], '/': [1, 1, 2, 4, 8, 16, 16], "'": [4, 4, 8, 0, 0, 0, 0], '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 2, 4, 0, 4], '+': [0, 4, 4, 31, 4, 4, 0], '·': [0, 0, 0, 4, 0, 0, 0], '%': [24, 25, 2, 4, 8, 19, 3],
};

function canvas(bg) {
  const px = new Uint8Array(W * H * 3), rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const rect = (x, y, w, h, c) => {
    const [r, g, b] = rgb(c);
    for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) { const k = (j * W + i) * 3; px[k] = r; px[k + 1] = g; px[k + 2] = b; }
  };
  rect(0, 0, W, H, bg);
  // Words at s pixels per font pixel; returns where they end.
  const text = (str, x, y, s, c) => {
    for (const ch of String(str).toUpperCase()) {
      const rows = FONT[ch] || FONT['?'];
      rows.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row & (16 >> i)) rect(x + i * s, y + j * s, s, s, c); });
      x += 6 * s;
    }
    return x;
  };
  return { px, rect, text, width: (str, s) => String(str).length * 6 * s - s };
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(px) {
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(W, 0); head.writeUInt32BE(H, 4); head[8] = 8; head[9] = 2; // 8-bit RGB
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** The card as a PNG (a Buffer). */
export function cardPng(card) {
  const p = palette(card.color), t = p.themes.dark, cv = canvas(t.bg);
  // A frame, hard-edged.
  cv.rect(24, 24, W - 48, H - 48, t.edge); cv.rect(32, 32, W - 64, H - 64, t.bg);
  // Lax, as big as fits on the left, standing on its ground.
  const body = pixels(card.look), s = Math.floor(Math.min(400 / body.w, 400 / body.h)), bx = 80 + Math.floor((400 - body.w * s) / 2), by = 490 - body.h * s;
  cv.rect(64, 490, 432, 8, t.card);
  for (let y = 0; y < body.h; y++) for (let x = 0; x < body.w; x++) { const c = body.at(x, y); if (c && c !== 'clear') cv.rect(bx + x * s, by + y * s, s, s, c); }
  // Who, then the counts.
  const X = 560;
  cv.text(card.name, X, 84, 12, p.color);
  cv.text(`LV ${card.level} ${[card.species, card.stage].filter(Boolean).join(' ')}`, X, 194, 5, t.fg);
  const lines = [[card.days, card.days === 1 ? 'day together' : 'days together'], [card.heard, 'times it heard me'], [card.memories, 'memories'], [card.changes, 'changes to itself']];
  lines.forEach(([n, what], i) => { const y = 278 + i * 56; const e = cv.text(String(n), X, y, 4, p.color); cv.text(what, e + 16, y, 4, t.dim); });
  cv.text('a pixel companion for claude code', X, 530, 3, t.dim);
  cv.text('github.com/diogodebastos/lax', X, 562, 3, t.fg);
  return png(cv.px);
}
