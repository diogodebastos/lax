// How Lax sees itself (Phase 6.2). The pages Lax makes (reports, guides, artifacts) are in its own hand: its look is
// not a brand guide kept somewhere else but who it is today. Its colours come from its current look (species and
// stage, lib/species.mjs), and it's drawn by the phone's own renderer (public/body.js), never a copy, so a page shows
// the Lax of the day it was made. How it sees and expresses itself in words is mind/self.md, its own to rewrite.
import fs from 'node:fs';
import path from 'node:path';
import { MIND } from './paths.mjs';
import { commitMind } from './home.mjs';
import '../public/body.js';

const { render, egg, shade } = globalThis.LaxBody;
export const SELF_MD = path.join(MIND, 'self.md');

// ---------- colours ----------
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [16, 8, 0].map((s) => (n >> s) & 255); };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, k) => hex(rgb(a).map((v, i) => v * (1 - k) + rgb(b)[i] * k)); // k of b into a
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** The colour, lightened (on a dark page) or darkened (on a light one) just enough to read at ratio min. */
function readable(color, bg, min) {
  const toward = lum(bg) < 0.2 ? 1 : -1;
  for (let a = 0; a <= 1; a += 0.02) { const c = a ? shade(color, toward * a) : color; if (contrast(c, bg) >= min) return c; }
  return toward > 0 ? '#ffffff' : '#000000';
}
const norm = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : '#d97757');

/** Everything a page needs, from Lax's colour alone: its body (color, light and dark edge, as on the phone), and for each
 *  theme a page, a card, text, dimmed text, an accent and an edge that read on it (WCAG: accent 4.5, edge 2). */
export function palette(color) {
  const c = norm(color), light = shade(c, 0.3), dark = shade(c, -0.25);
  const theme = (bg, card, fg, dimK, status) => ({ bg, card, fg, dim: mix(fg, bg, dimK), accent: readable(c, bg, 4.5),
    hi: readable(lum(bg) < 0.2 ? light : dark, bg, 4.5), edge: readable(dark, bg, 2), ...status });
  return { color: c, light, dark,
    themes: {
      dark: theme(shade(c, -0.92), shade(c, -0.86), shade(c, 0.94), 0.32, { good: '#7cfc9a', bad: '#ff5a4f' }),
      light: theme(shade(c, 0.94), shade(c, 0.86), shade(c, -0.92), 0.4, { good: '#1f8a4c', bad: '#c8352b' }),
    } };
}

/** The palette as CSS custom properties: dark by default, light for prefers-color-scheme: light. */
export function css(p) {
  const vars = (t) => Object.entries(t).map(([k, v]) => `--${k}:${v};`).join(' ');
  return `:root { --color:${p.color}; --light:${p.light}; --dark:${p.dark}; ${vars(p.themes.dark)} }\n`
    + `@media (prefers-color-scheme: light) { :root { ${vars(p.themes.light)} } }`;
}

// ---------- the body, as SVG ----------
// The phone's palette for what isn't Lax's own colour (public/lax.js C), on nothing: no page, no shadow.
const FIXED = { out: '#120c0a', eye: '#fff8ee', red: '#ff4b3e', band: '#e0302a', stick: '#d9d2c4', glass: '#7fd3ff', gold: '#ffd25a',
  green: '#6fd36f', dust: '#5b544b', cape: '#3b4cc0', bg: 'clear', shadow: null };

// A pretend canvas: each fillRect paints whole pixels in a grid; null paints nothing, and the page's own colour (the
// body rounds its corners with it) clears them.
function grid() {
  const px = new Map(); let fill = null;
  return { px, set fillStyle(c) { fill = c; }, get fillStyle() { return fill; },
    fillRect(x, y, w, h) { if (fill === null) return;
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { if (fill === 'clear') px.delete(`${i},${j}`); else px.set(`${i},${j}`, fill); } } };
}

/** Lax as it stands right now (view = the server's petView(), hidden traits taken off), as a crisp SVG: one path
 *  per colour, cropped to the body. scale: how big each pixel is drawn (width/height attributes). */
export function portrait(view, { hide = [], scale = 4 } = {}) {
  const color = norm(view?.look?.color), C = { ...FIXED, body: color, hi: shade(color, 0.3), lo: shade(color, -0.25) };
  const g = grid(), at = { CX: 40, GROUND: 60 };
  if (view?.hatched === false) egg(g, C, at);
  else render(g, C, { ...at, stage: view?.stage || 'sprout', form: view?.look?.form || null, lift: view?.look?.lift || 0,
    wears: (t) => (view?.traits || []).includes(t) && !hide.includes(t), m: 'idle', t: 0 });
  const keys = [...g.px.keys()].map((k) => k.split(',').map(Number));
  const xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 + 1, h = Math.max(...ys) - y0 + 1;
  // Runs along each row, one path per colour.
  const paths = new Map();
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w;) {
    const c = g.px.get(`${x},${y}`); if (!c) { x++; continue; }
    let n = 1; while (g.px.get(`${x + n},${y}`) === c) n++;
    paths.set(c, (paths.get(c) || '') + `M${x - x0},${y - y0}h${n}v1h-${n}z`); x += n;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges" role="img" aria-label="${esc(view?.name || 'Lax')}">`
    + [...paths].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join('') + '</svg>';
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- self.md ----------
// What Lax starts with; it rewrites it in its weekly review, as it does learning.md.
const SELF_SEED = `# How I see myself

This file is mine: how I see myself and how I express myself, in what I say and in the pages I make (reports, guides,
summaries, artifacts). I rewrite it when I change, in my weekly review. My colours and my body are not here: they come
from how I look today (the \`self\` tool), so a page keeps the look I had the day I made it.

## My voice
- Short, plain, warm. I lead with the answer, then the details.
- No emoji. Plain markers: \`>\` for a callout line, \`[x]\` / \`[ ]\` for a checklist.
- I say "I" for myself and talk to you directly.

## My taste
- Pixel edges: no rounded corners, no blur, no gradients, no soft shadows. Shadows are hard offsets (4px 4px 0).
- A pixel font for headings, labels and numbers (VT323), and a readable one for long text (system sans, 16px):
  long text in a pixel font is hard to read.
- My own colour as the accent, on a page made from it; nothing else bright except good and bad.
- Me in the header, drawn as I am now, crisp (image-rendering: pixelated), never redrawn or recoloured.
- Dark by default, light when the reader's screen is light, readable at phone width.
- Signed at the bottom: made by me, how I was (species, stage) and the date.
`;
export function ensureSelf() {
  if (fs.existsSync(SELF_MD)) return;
  try { fs.writeFileSync(SELF_MD, SELF_SEED); commitMind('I know how I see myself, and how I express myself'); } catch {}
}
export const selfText = () => { try { return fs.readFileSync(SELF_MD, 'utf8'); } catch { return SELF_SEED; } };

/** What the `self` tool answers: who Lax is today, its palette (and as CSS), its body as SVG, and self.md. */
export function self(view, settings = {}) {
  const p = palette(view?.look?.color), hide = settings.hideTraits || [];
  return { name: view?.name || settings.name || 'Lax', species: view?.hatched === false ? 'egg' : view?.species?.name || 'plain',
    form: view?.look?.form || null, stage: view?.stage || null, level: view?.level ?? null,
    wears: (view?.traits || []).filter((t) => !hide.includes(t)), palette: p, css: css(p), face: portrait(view, { hide }),
    date: new Date().toISOString().slice(0, 10), self_md: selfText() };
}
