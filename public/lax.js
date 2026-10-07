// Lax's body: pixel avatar, speech bubble, terminal feed, voice in/out.
'use strict';

// ---------- setup ----------
const qs = new URLSearchParams(location.search);
let TOKEN = qs.get('t');
try { if (TOKEN) localStorage.lax_t = TOKEN; else TOKEN = localStorage.lax_t; } catch {}
if (qs.get('t')) history.replaceState(null, '', location.pathname);
// Demo mode only under /demo (the public demo and its local preview); a plain /?demo is the real app.
const DEMO = qs.has('demo') && location.pathname.startsWith('/demo');
// Inside the Lax Android app: Android's own speech recognition, TTS and vibration (see android/…/LaxBridge.kt).
const NATIVE = (() => { try { return window.LaxNative?.isNative() ? window.LaxNative : null; } catch { return null; } })();
const buzz = (pattern) => (NATIVE ? NATIVE.vibrate(pattern.join(',')) : navigator.vibrate?.(pattern));

const $ = (s) => document.querySelector(s);
const app = $('#app'), cv = $('#stage'), g = cv.getContext('2d');
const W = 52, H = 51, GROUND = 46, CX = 26;
// Bodies: 'wide' = closed Flip 3 cover screen (512×260 landscape strip), 'tall' = cover screen held sideways
// (260×512), 'big' = phone open / Flex mode (fluid; Lax on the top half, terminal below the fold),
// 'side' = phone open and held sideways (Lax on the left half, tabs + terminal on the right). ?layout= forces one.
function layoutFor() {
  const forced = qs.get('layout'); if (forced) return forced;
  if (innerWidth >= 340 && innerHeight >= 600) return 'big';
  // The cover screen is never 300 tall, so any landscape screen that is gets the side layout (open phone, desktop).
  if (innerHeight >= 300 && innerWidth > innerHeight) return 'side';
  return innerWidth / innerHeight > 1.3 ? 'wide' : 'tall';
}
function fit() {
  const l = layoutFor();
  // In the app the page runs under the camera hole: keep the top bar clear of it.
  try { const i = JSON.parse(NATIVE?.insets() || '{}'); document.documentElement.style.setProperty('--inset-top', (i.top || 0) + 'px'); } catch {}
  // 'side' is 'big' turned sideways: same sizes, two halves side by side.
  document.body.classList.toggle('big', l === 'big' || l === 'side'); document.body.classList.toggle('side', l === 'side');
  document.body.classList.toggle('wide', l === 'wide');
  const b = $('#bubble'), want = l === 'wide' ? $('#bottom') : $('#top'); // open phone, either way up: above Lax
  if (b.parentElement !== want) want.insertBefore(b, want.firstElementChild);
  cv.style.cssText = '';
  if (l === 'wide') { app.style.transform = `scale(${Math.min(innerWidth / 512, innerHeight / 260)})`; return; }
  if (l === 'tall') { app.style.transform = `scale(${Math.min(innerWidth / 260, innerHeight / 512)})`; return; }
  const top = $('#top').getBoundingClientRect(), k = Math.max(1, Math.floor(Math.min(top.width / W, (top.height - 40) / H)));
  cv.style.width = W * k + 'px'; cv.style.height = H * k + 'px';
  // Lax stands on the hint line: the gap from its shadow (canvas row GROUND+2) down to the hint text equals the gap
  // from the hint text down to the tabs (the bottom of #top), so shadow, text and tabs are evenly spaced.
  const hint = $('#hint').getBoundingClientRect(), gap = top.bottom - hint.bottom, hintTop = hint.top - top.top;
  cv.style.left = Math.round((top.width - W * k) / 2) + 'px'; cv.style.top = Math.round(hintTop - gap - (GROUND + 2) * k) + 'px';
}
addEventListener('resize', fit); fit();
document.fonts?.ready.then(fit); // the pixel font changes the hint's height, which Lax's position depends on

const VERSION = 'v0.4';
// Diagnostics → the Mac's server log (data/server.log), so phone-only problems are visible there.
const diag = (event, data = {}) => { if (DEMO || !TOKEN) return; try { fetch('/api/diag', { method: 'POST', keepalive: true,
  headers: { 'content-type': 'application/json', 'x-lax-token': TOKEN }, body: JSON.stringify({ event, ...data }) }); } catch {} };
addEventListener('error', (e) => diag('js-error', { msg: e.message, at: `${e.filename}:${e.lineno}` }));
const api = (p, body) => fetch(p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': TOKEN }, body: JSON.stringify(body || {}) }).then((r) => r.json());

// ---------- palette ----------
const C = { bg: '#000', shadow: '#2a2521', ink: '#000', out: '#120c0a', body: '#D97757', hi: '#F2A585', lo: '#A9522F', eye: '#fff8ee', red: '#ff4b3e', band: '#e0302a',
  glass: '#7fd3ff', gold: '#ffd25a', green: '#6fd36f', ground: '#1f1c19', dust: '#5b544b', cape: '#3b4cc0' };
const SIZES = { sprout: [10, 9], blob: [13, 12], cube: [15, 14], brick: [17, 16], legend: [19, 18] };

// ---------- world state ----------
let settings = { name: 'Lax', color: '#D97757', voice: true, pitch: 1.6, speakDone: false, captions: false, phoneApprovals: true, askTimeout: 30, theme: 'system' };
const shade = (hex, amt) => { const n = parseInt(hex.slice(1), 16), t = amt < 0 ? 0 : 255, a = Math.abs(amt);
  return '#' + [16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * (1 - a) + t * a).toString(16).padStart(2, '0')).join(''); };
// Theme: system (the phone's or computer's dark mode), light or dark. Remembered per device so the page starts right.
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function systemDark() { try { const n = NATIVE?.nightMode?.(); if (typeof n === 'boolean') return n; } catch {} return darkQuery.matches; }
function applyTheme() {
  let t = settings.theme || 'system';
  if (t === 'system') t = systemDark() ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  const css = getComputedStyle(document.documentElement);
  C.bg = css.getPropertyValue('--bg').trim(); C.shadow = css.getPropertyValue('--dot').trim();
  try { localStorage.lax_theme = settings.theme || 'system'; } catch {}
}
try { if (localStorage.lax_theme) settings.theme = localStorage.lax_theme; } catch {}
darkQuery.addEventListener?.('change', applyTheme);
window.laxOnTheme = applyTheme; // the app calls this when the phone switches dark mode
function applyLook() {
  applyTheme();
  try { updateHint(); } catch {} // (not ready on the very first call)
  const wakeName = document.querySelector('#wakeName'); if (wakeName) wakeName.textContent = settings.name;
  C.body = settings.color; C.hi = shade(settings.color, 0.3); C.lo = shade(settings.color, -0.25);
  document.documentElement.style.setProperty('--coral', settings.color);
  $('#nameBtn').textContent = settings.name.toUpperCase(); $('#lifeName').textContent = settings.name.toUpperCase(); $('#menuName').textContent = settings.name.toUpperCase();
}
let pet = { name: 'Lax', level: 1, stage: 'sprout', traits: [], mood: 'happy', xp: 0, prevXp: 0, nextXp: 10 };
let sessions = [], voiceBusy = false, thinking = false, lastWork = 0, channels = [], voiceTarget = 'background', usage = null;
// The Mac is asleep or off (no link): Lax sleeps too. ASLEEP = the app's offline copy of this page (no Mac at all).
const ASLEEP = qs.has('asleep'); let macAsleep = ASLEEP;
let listening = false, speaking = false, react = null, reactUntil = 0;
const body = { y: 0, vy: 0, s: 0, sv: 0, look: 0, blinkAt: 0, nextHop: 3 };
const parts = [];

function mode(now) {
  if (bubbles.some((b) => b.actions)) return 'waiting';
  if (listening) return 'listening';
  if (speaking) return 'talking';
  if (react && now < reactUntil) return react;
  if (macAsleep) return 'sleep';
  if (voiceBusy || thinking) return 'thinking';
  if (now - lastWork < 5000) return 'working';
  if (pet.mood === 'sleepy' || pet.mood === 'dusty') return 'sleep';
  return 'idle';
}
function setReact(state, ms = 1800) { react = state; reactUntil = performance.now() + ms; if (state === 'happy') hop(1.6); if (state === 'error') splat(); }

// ---------- physics ----------
function hop(power = 1) { if (body.y <= 0.01) { body.vy = 1.1 * power; body.s = -0.25; body.sv = 0; } }
function splat() { body.s = 0.55; body.sv = 0; for (let i = 0; i < 14; i++) spark(CX, GROUND - 3, C.body, 1.4); }
function spark(x, y, color, speed = 1, life = 40) {
  const a = Math.random() * Math.PI, v = (0.4 + Math.random()) * speed;
  parts.push({ x, y, vx: Math.cos(a) * v * (Math.random() < .5 ? -1 : 1), vy: -Math.sin(a) * v, life, max: life, color, g: 0.06 });
}
function step(dt, m, t) {
  // gravity + landing squash
  if (body.y > 0 || body.vy > 0) {
    body.vy -= 0.09 * dt; body.y += body.vy * dt;
    if (body.y <= 0) { body.y = 0; const impact = Math.min(0.45, -body.vy * 0.28); body.vy = 0; body.s = impact; body.sv = 0;
      for (let i = 0; i < 4; i++) parts.push({ x: CX + (Math.random() - .5) * 14, y: GROUND, vx: (Math.random() - .5) * .6, vy: -Math.random() * .3, life: 18, max: 18, color: C.dust, g: 0.02 }); }
  }
  // squash spring
  body.sv += (-0.18 * body.s - 0.22 * body.sv) * dt; body.s += body.sv * dt;
  // per-mode behaviour
  body.nextHop -= dt / 60;
  if (m === 'idle' && body.nextHop <= 0) { hop(0.7 + Math.random() * 0.5); body.nextHop = 3 + Math.random() * 5; body.look = Math.round(Math.random() * 2 - 1); }
  if (m === 'waiting' && body.y === 0 && body.nextHop <= 0) { hop(0.9); body.nextHop = 0.7; }
  if (m === 'working') { if (Math.random() < 0.25 * dt) parts.push({ x: CX - 13 + Math.random() * 3, y: GROUND - 2 - Math.random() * 10, vx: -0.9, vy: 0, life: 12, max: 12, color: C.lo, g: 0, line: true });
    if (Math.random() < 0.02 * dt) parts.push({ x: CX + 6, y: GROUND - 18, vx: 0.3, vy: -0.3, life: 30, max: 30, color: C.glass, g: 0.04 }); }
  if (m === 'happy' && Math.random() < 0.3 * dt) spark(CX + (Math.random() - .5) * 26, GROUND - 22 - Math.random() * 10, Math.random() < .5 ? C.gold : C.eye, 0.4, 28);
  if (pet.mood === 'dusty' && Math.random() < 0.03 * dt) parts.push({ x: CX - 8 + Math.random() * 16, y: GROUND - 16, vx: 0, vy: 0.1, life: 50, max: 50, color: C.dust, g: 0.005 });
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > GROUND) { p.y = GROUND; p.vy = 0; p.vx *= .5; } if ((p.life -= dt) <= 0) parts.splice(i, 1); }
}

// ---------- drawing ----------
const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
// Outlined shapes: all the outlines first, then the fills, so touching rects read as one piece.
const blk = (rects, c) => { for (const [x, y, w, h] of rects) px(x - 1, y - 1, w + 2, h + 2, C.out); for (const [x, y, w, h] of rects) px(x, y, w, h, c); };
// At level 50 Lax evolves into its colour's form, after the familiar face that colour comes from
// ([form, how far the level-100 crown rises to clear it]). A custom colour stays a plain brick.
const FORMS = { '#5abf8e': ['bloom', 9], '#d97757': ['wings', 0], '#5aa7e6': ['cannons', 2], '#f6d23c': ['bolt', 4], '#a8754a': ['ruff', 4],
  '#c58fd8': ['gem', 4], '#403e4a': ['rings', 4], '#f2ede3': ['coin', 6], '#f4a6c8': ['float', 0] };
const formOf = () => (pet.stage === 'brick' || pet.stage === 'legend') && FORMS[String(settings.color).toLowerCase()] || [null, 0];
// Mirror a rect to the other side of the body.
const mirror = (x0, w, rects) => rects.map(([x, y, rw, rh]) => [2 * x0 + w - x - rw, y, rw, rh]);
// Behind the body: wings and tails.
function formBack(f, x0, y0, w, h, m, t) {
  const R = x0 + w, B = y0 + h;
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
  if (f === 'bolt') { px(x0 + 1, eyeY + 4, 2, 2, C.red); px(x0 + w - 3, eyeY + 4, 2, 2, C.red);
    if ((m === 'happy' || m === 'working') && Math.random() < 0.15) spark(x0 + (Math.random() < .5 ? 1 : w - 2), eyeY + 4, C.gold, 0.7, 14); }
  if (f === 'gem') { blk([[cx - 1, y0 + 1, 3, 2]], '#e2304a'); px(cx - 1, y0 + 1, 1, 1, '#ffb3c0'); }
  if (f === 'rings') { const c = ringGlow(m, t); px(cx - 1, y0 + 1, 3, 1, c); px(cx - 2, y0 + 2, 1, 1, c); px(cx + 2, y0 + 2, 1, 1, c); px(cx - 1, y0 + 3, 3, 1, c); }
  if (f === 'coin') { blk([[cx - 1, y0 - 5, 3, 1], [cx - 2, y0 - 4, 5, 3], [cx - 1, y0 - 1, 3, 1]], C.gold); px(cx, y0 - 4, 1, 3, '#c99a2e');
    if (Math.round(t / 900) % 4 === 0) px(cx - 1, y0 - 4, 1, 1, '#fff8d0');
    for (const y of [eyeY + 3, eyeY + 5]) { px(x0 - 4, y, 4, 1, C.dust); px(x0 + w, y, 4, 1, C.dust); } }
}
function draw(m, t) {
  g.clearRect(0, 0, W, H);
  // ground: the dotted line is the hint's line in the page (#hint), so text never sits on it
  const [bw, bh] = SIZES[pet.stage] || SIZES.cube;
  let s = body.s;
  if (m === 'sleep') s += Math.sin(t / 700) * 0.04;
  if (m === 'idle' && body.y === 0) s += Math.sin(t / 400) * 0.03;
  const w = Math.max(6, Math.round(bw * (1 + s))), h = Math.max(4, Math.round(bh * (1 - s)));
  let dx = 0;
  if (m === 'working') dx = Math.round(Math.sin(t / 45));
  if (m === 'talking') s += Math.sin(t / 60) * 0.03;
  const [form, crownLift] = formOf();
  const by = Math.round(body.y) + (form === 'float' ? 4 + Math.round(Math.sin(t / 400) * 1.5) : 0); // the pink one hovers
  const cx = CX + dx, x0 = cx - Math.floor(w / 2), feetH = 2, y0 = GROUND - feetH - h - by;
  const shadowW = Math.max(4, w - Math.round(by / 2));
  px(cx - shadowW / 2, GROUND + 1, shadowW, 1, C.shadow);

  // cape behind
  if (pet.traits.includes('cape')) { const fl = Math.round(Math.sin(t / 120) * 2); px(x0 - 3 + fl, y0 + 3, 3, h - 2, C.cape); px(x0 - 4 + fl * 2, y0 + 5, 2, h - 5, C.cape); }
  if (form) formBack(form, x0, y0, w, h, m, t);

  // feet
  const run = m === 'working' ? Math.round(Math.sin(t / 50)) : 0;
  px(x0 + 2, GROUND - feetH - Math.max(0, run) - by, 3, 2, C.out);
  px(x0 + w - 5, GROUND - feetH - Math.max(0, -run) - by, 3, 2, C.out);

  // body: thick outline, flat fill, light top-left, shade bottom-right (Meat Boy-ish chunk)
  px(x0 - 1, y0 - 1, w + 2, h + 2, C.out);
  px(x0, y0, w, h, C.body);
  px(x0, y0 + h - 2, w, 2, C.lo); px(x0 + w - 2, y0, 2, h, C.lo);
  px(x0 + 1, y0 + 1, w - 4, 1, C.hi); px(x0 + 1, y0 + 1, 1, h - 4, C.hi);
  if (pet.stage === 'sprout' || pet.stage === 'blob') { // round the corners
    for (const [cx2, cy2] of [[x0 - 1, y0 - 1], [x0 + w, y0 - 1], [x0 - 1, y0 + h], [x0 + w, y0 + h]]) px(cx2, cy2, 1, 1, C.bg);
    for (const [cx2, cy2] of [[x0, y0], [x0 + w - 1, y0], [x0, y0 + h - 1], [x0 + w - 1, y0 + h - 1]]) px(cx2, cy2, 1, 1, C.out);
  }
  if (pet.traits.includes('scar')) { px(x0 + w - 5, y0 + h - 6, 1, 1, C.out); px(x0 + w - 4, y0 + h - 5, 1, 1, C.out); px(x0 + w - 3, y0 + h - 4, 1, 1, C.out); }
  if (form) formFront(form, x0, y0, w, h, m, t);

  // arms when waving
  if (m === 'waiting' || m === 'happy') { const up = Math.sin(t / 90) > 0 ? 2 : 0;
    px(x0 - 3, y0 + 4 - up, 2, 3, C.out); px(x0 + w + 1, y0 + 4 - (2 - up), 2, 3, C.out); }

  // face
  const eyeY = y0 + Math.max(2, Math.floor(h * 0.3)), ex1 = x0 + Math.floor(w * 0.22), ex2 = x0 + w - Math.floor(w * 0.22) - 3;
  const now = performance.now(); if (now > body.blinkAt + 3500 + Math.random() * 3000) body.blinkAt = now;
  const blinking = now - body.blinkAt < 120;
  const look = m === 'thinking' ? 0 : m === 'working' ? 1 : body.look;
  const eye = (ex) => {
    if (m === 'sleep' || blinking) { px(ex, eyeY + 2, 3, 1, C.out); return; }
    if (m === 'happy') { px(ex, eyeY + 2, 1, 1, C.out); px(ex + 1, eyeY + 1, 1, 1, C.out); px(ex + 2, eyeY + 2, 1, 1, C.out); return; }
    if (m === 'error' && body.s > 0.1) { px(ex, eyeY, 1, 1, C.out); px(ex + 2, eyeY, 1, 1, C.out); px(ex + 1, eyeY + 1, 1, 1, C.out); px(ex, eyeY + 2, 1, 1, C.out); px(ex + 2, eyeY + 2, 1, 1, C.out); return; }
    const big = m === 'listening' || m === 'waiting';
    px(ex, eyeY - (big ? 1 : 0), 3, big ? 5 : 4, C.eye);
    const py = m === 'thinking' ? eyeY - (big ? 1 : 0) : eyeY + 1;
    px(ex + 1 + Math.max(-1, Math.min(1, look)) * (look > 0 ? 1 : 1), py, 1 + (big ? 1 : 0) - (look > 0 && big ? 1 : 0), 2, C.out);
  };
  eye(ex1); eye(ex2);
  if (pet.traits.includes('glasses')) { px(ex1 - 1, eyeY - 1, 5, 1, C.out); px(ex2 - 1, eyeY - 1, 5, 1, C.out); px(ex1 + 4, eyeY, ex2 - ex1 - 4, 1, C.out); }
  if (pet.traits.includes('monocle')) { px(ex2 - 1, eyeY - 1, 5, 1, C.gold); px(ex2 - 1, eyeY + 4, 5, 1, C.gold); px(ex2 + 3, eyeY + 4, 1, 4, C.gold); }

  // mouth
  const my = eyeY + 6, mx = cx - 2;
  if (m === 'talking') { const open = Math.sin(t / 70) > 0; px(mx, my, 4, open ? 3 : 1, C.out); if (open) px(mx + 1, my + 1, 2, 1, C.red); }
  else if (m === 'happy' || m === 'idle') { px(mx, my, 1, 1, C.out); px(mx + 1, my + 1, 2, 1, C.out); px(mx + 3, my, 1, 1, C.out); }
  else if (m === 'error' || m === 'waiting') px(mx + 1, my, 2, 2, C.out);
  else if (m === 'working') px(mx, my + 1, 4, 1, C.out);

  // headgear
  if (pet.traits.includes('headband')) { px(x0, y0 + 1, w, 2, C.band); const fl = Math.round(Math.sin(t / 80) * 1.5);
    px(x0 - 3, y0 + 1 + fl, 3, 1, C.band); px(x0 - 5, y0 + 2 - fl, 2, 1, C.band); }
  if (pet.traits.includes('goggles')) { px(x0 + 1, y0, w - 2, 1, C.out); px(ex1, y0 - 1, 3, 2, C.glass); px(ex2, y0 - 1, 3, 2, C.glass); }
  if (pet.traits.includes('antenna')) { px(cx, y0 - 5, 1, 4, C.out); px(cx - 1, y0 - 7, 3, 2, Math.sin(t / 200) > 0 ? C.red : C.gold); }
  if (pet.stage === 'sprout') { px(cx, y0 - 3, 1, 2, C.green); px(cx + 1, y0 - 4, 2, 1, C.green); px(cx - 2, y0 - 3, 2, 1, C.green); }
  if (form) formTop(form, x0, y0, w, h, eyeY, m, t);
  if (pet.stage === 'legend') { const cy = y0 - crownLift; px(cx - 4, cy - 3, 9, 2, C.gold); px(cx - 4, cy - 5, 1, 2, C.gold); px(cx, cy - 5, 1, 2, C.gold); px(cx + 4, cy - 5, 1, 2, C.gold); }
  if (pet.traits.includes('flame') && m !== 'sleep') { const f = Math.round(t / 100) % 2; px(x0 + w + 2, y0 - 2 - f, 2, 3, C.gold); px(x0 + w + 2, y0, 2, 1, C.red); }

  // overlays
  const top = y0 - 10;
  if (m === 'waiting') { const b = Math.round(t / 150) % 2; px(cx + 7, top - b, 2, 5, C.gold); px(cx + 7, top + 6 - b, 2, 2, C.gold); }
  if (m === 'thinking') for (let i = 0; i < 3; i++) if (Math.floor(t / 300) % 4 > i) px(cx + 8 + i * 3, top + 2, 2, 2, C.eye);
  if (m === 'sleep') { const z = Math.floor(t / 600) % 3; px(cx + 8 + z * 2, top + 4 - z * 3, 3, 1, C.dust); px(cx + 9 + z * 2, top + 5 - z * 3, 1, 1, C.dust); px(cx + 8 + z * 2, top + 6 - z * 3, 3, 1, C.dust); }
  if (m === 'listening') { const r = Math.floor(t / 180) % 3; for (let i = 0; i <= r; i++) { px(x0 - 4 - i * 3, y0 + h / 2 - 2 - i, 1, 4 + i * 2, C.glass); px(x0 + w + 3 + i * 3, y0 + h / 2 - 2 - i, 1, 4 + i * 2, C.glass); } }

  for (const p of parts) { g.globalAlpha = Math.max(0, p.life / p.max); px(p.x, p.y, p.line ? 3 : 1, 1, p.color); }
  g.globalAlpha = 1;
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(3, (now - last) / 16.67); last = now;
  const m = mode(now); step(dt, m, now); draw(m, now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- HUD + feed ----------
// Tab labels: project·where (mac = desktop app, cli = terminal / claude-lax, api = headless, web = cloud), numbered if repeated.
function tabLabels(list) {
  const seen = {};
  return list.map((s) => { const base = `${s.project}·${s.where || 'cli'}`; seen[base] = (seen[base] || 0) + 1; return seen[base] > 1 ? `${base} ${seen[base]}` : base; });
}
function renderHud() {
  // Tabs: Lax's own (its name: just your talk with Lax, outside any session), then one per session. The open tab filters the terminal; a live one (claude-lax) also hears your voice.
  const shown = sessions.slice(0, 8), labels = tabLabels(shown);
  if (view !== 'all' && !shown.some((s) => s.id === view)) setView('all');
  $('#chips').innerHTML = `<span class="all${view === 'all' ? ' sel' : ''}" data-view="all">${esc(settings.name.toLowerCase())}</span>` + shown.map((s, i) => {
    const ch = channels.find((c) => c.sessionPid && c.sessionPid === s.pid), open = s.id === view;
    const badge = open ? '' : bubbles.some((b) => b.session === s.id && needsYou(b)) ? ' ask' : unseen.has(s.id) ? ' new' : '';
    return `<span class="${s.status}${ch ? ' live' : ''}${open ? (ch ? ' sel' : ' front') : ''}${badge}" data-view="${esc(s.id)}" data-cid="${ch ? ch.cid : ''}" data-label="${esc(labels[i])}">${esc(labels[i])}</span>`;
  }).join('');
  $('#lvl').textContent = `Lv${pet.level}`;
  $('#xp i').style.width = Math.round(100 * (pet.xp - pet.prevXp) / Math.max(1, pet.nextXp - pet.prevXp)) + '%';
  // Cover screen: the open tab's name in place of the menu (settings live in the open app).
  const vi = shown.findIndex((s) => s.id === view); $('#tab').textContent = vi < 0 ? settings.name.toLowerCase() : labels[vi];
  $('#dots').innerHTML = shown.map((s) => `<b class="${s.status}${s.id === view ? ' on' : ''}" data-view="${esc(s.id)}" title="${esc(s.project)}"></b>`).join('');
}
const term = $('#term');
// Which tab is open: 'all' or a session id. Per device, so it lives here, not on the Mac.
let view = 'all'; try { view = localStorage.lax_view || 'all'; } catch {}
// Tabs only show on the open phone; the cover screen has none, so there everything is shown and every bubble is "here".
const tabbed = () => document.body.classList.contains('big');
// session: the line's session id; none = Lax's own (shown in Lax's tab only); '*' = shown in every tab (local link messages).
const visible = (d) => !tabbed() || d.dataset.s === '*' || d.dataset.s === (view === 'all' ? '' : view);
// A bubble belongs to another tab when it carries a session that has a tab and that tab isn't open. Those never show
// their buttons or speak (so you can't approve one session's request while talking in another): a needs-you one shows
// a small "<tab> needs you" notice that takes you there, anything else only marks the tab.
const unseen = new Set(); // tabs with something new you haven't opened yet
const needsYou = (b) => b.kind === 'permission' || b.kind === 'question';
const elsewhere = (b) => tabbed() && b.session && b.session !== view && sessions.slice(0, 8).some((s) => s.id === b.session);
function setView(v) {
  view = v; try { localStorage.lax_view = v; } catch {}
  unseen.delete(v);
  for (const d of term.children) if (d.dataset.s !== undefined) d.hidden = !visible(d);
  term.scrollTop = term.scrollHeight;
  renderBubble(); renderHud();
}
function feed(line, kind = 'tool', project, session = '') {
  const d = document.createElement('div'); d.className = kind; d.dataset.s = session; d.hidden = !visible(d);
  // Follow new lines only if you're already at the bottom (so scrolling back to read isn't yanked away).
  const stick = term.scrollHeight - term.scrollTop - term.clientHeight < 40;
  d.append(line); term.insertBefore(d, term.lastElementChild);
  while (term.children.length > 400) term.firstElementChild.remove();
  if (stick) term.scrollTop = term.scrollHeight;
  if (kind === 'tool') lastWork = performance.now();
}

// ---------- bubble ----------
let bubbles = []; // newest last; the one with actions wins
const elB = $('#bubble');
const TAGS = { question: 'question', permission: 'needs you', waiting: 'waiting', done: 'done', reply: 'lax', error: 'uh oh', levelup: '★ level up', you: 'you', listening: 'listening', learned: '✦ learned' };
function showBubble(b) {
  bubbles = bubbles.filter((x) => x.id !== b.id); bubbles.push(b); b.at = performance.now();
  b.sticky = b.actions || b.kind === 'question' || b.kind === 'listening';
  if (!b.sticky) b.expires = performance.now() + (b.kind === 'reply' ? 15000 : 9000);
  renderBubble();
  if (elsewhere(b)) { // another tab's: a short buzz if it needs you, otherwise just a mark on its tab
    if (needsYou(b)) { sfx([660]); buzz([60]); } else unseen.add(b.session);
    return renderHud();
  }
  if (b.kind === 'permission' || b.kind === 'question') { sfx([660, 880, 660]); buzz([80, 60, 80]); }
  else if (b.kind === 'levelup') { sfx([523, 659, 784, 1046]); setReact('happy', 2500); }
  else if (b.kind === 'done') { sfx([784, 1046]); setReact('happy'); }
  else if (b.kind === 'learned') { sfx([659, 988]); setReact('happy', 1200); }
  else if (b.kind === 'error') { sfx([220, 160]); setReact('error'); }
  if (b.speak || (b.kind === 'done' && settings.speakDone)) speak(b.kind === 'permission' ? 'I need you. ' + b.text : b.kind === 'question' ? 'Question. ' + b.questions[0].question : b.say || b.text);
}
function clearBubble(id) { const had = bubbles.find((x) => x.id === id); bubbles = bubbles.filter((x) => x.id !== id); renderBubble(); if (had?.session) renderHud(); }
function renderBubble() {
  const now = performance.now();
  bubbles = bubbles.filter((b) => !b.expires || b.expires > now);
  const here = bubbles.filter((x) => !elsewhere(x)), away = bubbles.find((x) => elsewhere(x) && needsYou(x));
  // The cover screen (closed phone) has no chat: only what needs you gets a bubble; the rest is spoken, and captioned if on.
  const pool = cover() ? here.filter(needsYou) : here;
  const b = pool.find((x) => x.kind === 'listening') || pool.find((x) => x.sticky) || pool[pool.length - 1]; // your words while talking win
  document.body.classList.toggle('solo', cover() && !b); // nothing needs you: Lax has the whole strip
  renderCaption(here, now);
  elB.dataset.away = '';
  if (!b && away) { // another tab needs you: say which, no buttons; tapping it opens that tab
    const i = sessions.slice(0, 8).findIndex((s) => s.id === away.session), label = tabLabels(sessions.slice(0, 8))[i];
    elB.className = 'show away'; elB.dataset.id = away.id; elB.dataset.away = away.session; elB.dataset.key = '';
    elB.querySelector('.tag').textContent = 'elsewhere';
    elB.querySelector('.text').textContent = `${label} needs you. Tap to go there.`;
    elB.querySelector('.actions').style.display = 'none'; elB.querySelector('.det').style.display = 'none';
    return;
  }
  if (!b) { elB.className = ''; elB.dataset.key = ''; return; }
  elB.className = 'show ' + b.kind; elB.dataset.id = b.id;
  if (b.kind !== 'question') elB.querySelector('.tag').textContent = (b.kind === 'reply' ? settings.name.toLowerCase() : TAGS[b.kind]) || '';
  elB.querySelector('.actions').style.display = b.actions ? 'flex' : 'none';
  elB.querySelector('.more').style.display = b.details ? '' : 'none';
  const det = elB.querySelector('.det'); det.textContent = b.details || ''; det.style.display = b.details && b.showDetails ? 'block' : 'none';
  // Cover screen: the project goes up in the tag and the bubble keeps only the gist ("$ npm test"), big enough to read.
  if (cover() && b.gist) { elB.querySelector('.tag').textContent = `${TAGS[b.kind]} · ${b.project}`; elB.querySelector('.text').textContent = b.gist; elB.dataset.key = ''; return; }
  if (b.kind !== 'question') { elB.querySelector('.text').textContent = b.text + (b.details && !b.actions && !b.showDetails ? ' ⋯' : ''); elB.dataset.key = ''; return; }
  // Question: one at a time; only rebuild when something changed (the 1s refresh would wipe selections).
  b.qi ??= 0; b.answers ??= {}; b.picked ??= [];
  const q = b.questions[b.qi], key = `${b.id}:${b.qi}:${b.picked.join('|')}:${answerHook ? 1 : 0}`;
  if (elB.dataset.key === key) return;
  elB.dataset.key = key;
  elB.querySelector('.tag').innerHTML = `${esc(q.header || 'question')} · ${esc(b.project || '')}` + (b.questions.length > 1 ? `<span class="qstep">${b.qi + 1}/${b.questions.length}</span>` : '');
  elB.querySelector('.text').textContent = q.question;
  elB.querySelector('.choices').innerHTML = (q.options || []).map((o, i) =>
    `<button class="opt${b.picked.includes(o.label) ? ' on' : ''}" data-i="${i}">${esc(o.label)}${o.description ? `<small>${esc(o.description)}</small>` : ''}</button>`).join('')
    + `<div class="row">${q.multiSelect ? '<button class="send">send ▶</button>' : ''}<button class="other">${answerHook ? '🎙 listening…' : '🎙 other'}</button><button class="pass">⌨ terminal</button></div>`;
}
// The cover screen's ground line: what Lax heard while you talk, then the first sentence of what it said, for 8s.
// Captions are a setting; mic and network errors always show, since nothing else would tell you.
const cover = () => document.body.classList.contains('wide');
function renderCaption(here, now) {
  const was = hint.className; hint.className = '';
  if (!cover()) { if (was && !listening) hint.textContent = IDLE_HINT; return; }
  if (listening) { if (settings.captions) { hint.className = 'heard'; hint.innerHTML = `<span class="cap">“${esc(words() || '…')}”</span>`; } return; }
  const c = here.findLast((x) => !needsYou(x) && !['listening', 'you'].includes(x.kind) && now - x.at < 8000 && (settings.captions || x.kind === 'error'));
  if (!c) { if (was) hint.textContent = IDLE_HINT; return; }
  hint.className = 'said';
  hint.innerHTML = `<span class="cap"><span class="who">${esc(c.kind === 'reply' ? settings.name.toLowerCase() : TAGS[c.kind] || '')}</span>${esc(c.text.split(/(?<=[.!?])\s/)[0])}</span>`;
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let answerHook = null; // when set, the next thing heard answers the open question instead of going to /api/talk
function answerQuestion(b, answer) {
  const q = b.questions[b.qi];
  b.answers[q.question] = answer; b.picked = []; b.qi++;
  if (b.qi < b.questions.length) { elB.dataset.key = ''; renderBubble(); speak(b.questions[b.qi].question); return; }
  clearBubble(b.id); sfx([880, 1175]); setReact('happy');
  if (!DEMO) api('/api/decide', { id: b.id, decision: 'answer', answers: b.answers });
}
setInterval(renderBubble, 1000);
elB.addEventListener('pointerdown', (e) => e.stopPropagation());
// Swipe a bubble sideways to dismiss it (like tapping). Bubbles that need an answer (✓/✗, questions) snap back.
let swiped = false;
{ let sx = 0, sy = 0, dx = 0, down = false;
  elB.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; dx = 0; down = true; });
  elB.addEventListener('pointermove', (e) => {
    if (!down) return; dx = e.clientX - sx;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - sy)) { elB.style.transform = `translateX(${dx}px)`; elB.style.opacity = String(1 - Math.min(0.8, Math.abs(dx) / 220)); }
  });
  const end = () => {
    if (!down) return; down = false;
    const b = bubbles.find((x) => x.id === elB.dataset.id);
    elB.style.transform = ''; elB.style.opacity = '';
    if (Math.abs(dx) > 70) { swiped = true; if (elB.dataset.away) return; if (b?.kind === 'listening') cancelListening(); else if (b && !b.actions && b.kind !== 'question') clearBubble(b.id); }
  };
  elB.addEventListener('pointerup', end); elB.addEventListener('pointercancel', end);
}
elB.addEventListener('click', (e) => {
  e.stopPropagation();
  if (swiped) { swiped = false; return; } // the end of a swipe isn't a tap
  if (elB.dataset.away) return $('#chips').querySelector(`[data-view="${CSS.escape(elB.dataset.away)}"]`)?.click();
  const id = elB.dataset.id, b = bubbles.find((x) => x.id === id); if (!b) return;
  if (b.kind === 'listening') return cancelListening();
  if (e.target.matches('.more')) { b.showDetails = !b.showDetails; renderBubble(); return; }
  if (e.target.matches('.yes, .no')) { const decision = e.target.matches('.yes') ? 'allow' : 'deny';
    clearBubble(id); sfx(decision === 'allow' ? [880, 1175] : [300, 200]); if (decision === 'allow') setReact('happy'); if (!DEMO) api('/api/decide', { id, decision }); }
  else if (b.kind === 'question') {
    const q = b.questions[b.qi], t = e.target.closest('button'); if (!t) return;
    if (t.matches('.opt')) {
      const label = q.options[+t.dataset.i].label;
      if (!q.multiSelect) return answerQuestion(b, label);
      b.picked = b.picked.includes(label) ? b.picked.filter((l) => l !== label) : [...b.picked, label]; renderBubble();
    } else if (t.matches('.send') && b.picked.length) answerQuestion(b, b.picked.join(', '));
    else if (t.matches('.other')) { answerHook = (text) => answerQuestion(b, text); renderBubble(); startListening(); }
    else if (t.matches('.pass')) { clearBubble(id); if (!DEMO) api('/api/decide', { id, decision: 'pass' }); }
  }
  // A bubble with more to show (e.g. what Lax learned): the first tap opens it, the next closes it.
  else if (!b.actions && b.details && !b.showDetails) { b.showDetails = true; b.expires = performance.now() + 20000; renderBubble(); }
  else if (!b.actions) clearBubble(id);
});

// ---------- sound ----------
let ac;
function sfx(notes) {
  try { ac ||= new AudioContext(); } catch { return; }
  notes.forEach((f, i) => { const o = ac.createOscillator(), v = ac.createGain(), t0 = ac.currentTime + i * 0.07;
    o.type = 'square'; o.frequency.value = f; v.gain.setValueAtTime(0.06, t0); v.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    o.connect(v).connect(ac.destination); o.start(t0); o.stop(t0 + 0.09); });
}
let voice;
function pickVoice() { const vs = speechSynthesis.getVoices(); voice = vs.find((v) => /en[-_]/i.test(v.lang) && /female|samantha|google us/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang)) || vs[0]; }
if (!NATIVE && 'speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!text || !settings.voice) return;
  if (NATIVE) return NATIVE.speak(text, settings.pitch);
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[`*_#]/g, '')); if (voice) u.voice = voice;
  u.pitch = settings.pitch; u.rate = 1.08;
  u.onstart = () => { speaking = true; }; u.onend = u.onerror = () => { speaking = false; };
  speechSynthesis.speak(u);
}

// ---------- tap-to-talk ----------
// Talking. Tap Lax and talk: a breath doesn't end it, about 2s without new words sends it (background noise too).
// Or hold Lax: it listens until you let go (slide off Lax before letting go to cancel). While listening, your words
// show in a bubble; tap Lax, tap the bubble or swipe it away to cancel. Speech recognizers stop at every pause,
// so each stop just starts the next stretch, and the stretches are joined.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const isBrave = !!navigator.brave;
// Set once the browser proves it can't do speech recognition (e.g. Brave: no Google speech service). Then taps go to typing.
let voiceBroken = !SR && !NATIVE;
let rec, said = '', heard = '', talkMode = 'tap', releasing = false, quietTimer = 0;
const QUIET_MS = 2000;
const hint = $('#hint');
let IDLE_HINT = 'tap Lax to talk'; // the character's name, from settings (updateHint)
// Where talking goes: a live Claude Code session (lax channel) or the background session.
function routeChannel() {
  return voiceTarget === 'background' ? null : channels.find((c) => c.cid === voiceTarget) || [...channels].sort((a, b) => b.active - a.active)[0] || null;
}
function setTarget(v) { voiceTarget = v; updateHint(); renderHud(); if (lifeEl.classList.contains('open')) renderLife(); if (!DEMO) api('/api/target', { target: v }); }
function updateHint() { IDLE_HINT = macAsleep ? `zzz… ${settings.name.toLowerCase()} is asleep` : voiceBroken ? `tap ${settings.name} to type` : `tap or hold ${settings.name} to talk`; if (!listening) hint.textContent = IDLE_HINT; }
const MIC_ERRORS = {
  'not-allowed': 'Mic is blocked. Tap the icon left of the address → Permissions → Microphone → Allow, then reload.',
  'service-not-allowed': 'This browser has no speech recognition. Use Chrome.',
  'network': isBrave ? 'Brave can\'t do speech recognition, so type instead (or use Chrome for voice).' : 'Speech service unreachable. Check your connection.',
  'audio-capture': 'No microphone found.',
  ...(NATIVE && { 'not-allowed': 'NAME needs the mic. Allow it, then tap me again.',
    'network': 'Speech service unreachable. Check your connection.', 'busy': 'The mic is busy. Try again in a sec.' }),
  'no-speech': 'I didn\'t hear anything. Tap me and talk.',
};
const micError = (code) => (MIC_ERRORS[code] || 'Mic error: ' + code).replace('NAME', settings.name);
updateHint();
(async () => { let mic = 'unknown'; try { mic = (await navigator.permissions.query({ name: 'microphone' })).state; } catch {}
  diag('load', { v: VERSION, native: !!NATIVE, ua: navigator.userAgent, secure: isSecureContext, sr: !!SR, brave: isBrave, mediaDevices: !!navigator.mediaDevices, mic, w: innerWidth, h: innerHeight, dpr: devicePixelRatio }); })();
function startListening() { if (listening) cancelListening(); else beginListening('tap'); } // tap: talk / cancel
function beginListening(m) {
  if (macAsleep) { hop(0.5); showBubble({ id: 'asleep', kind: 'reply', text: 'Zzz… I\'m asleep right now. I\'ll wake up on my own.' }); return; }
  if (voiceBusy && !answerHook) { showBubble({ id: 'busy', kind: 'reply', text: 'Still working on the last one…' }); return; }
  if (voiceBroken) return typeInstead();
  said = ''; heard = ''; releasing = false; talkMode = m; listening = true; sfx([440]);
  if (m === 'hold') buzz([30]);
  NATIVE ? NATIVE.hush() : speechSynthesis.cancel();
  diag('talk-' + m, { native: !!NATIVE }); showHeard(); listenStretch();
}
const words = () => [said, heard].filter(Boolean).join(' ').trim();
function showHeard(outside = false) {
  hint.textContent = talkMode === 'hold' ? (outside ? 'let go to cancel' : 'let go to send · slide off to cancel') : 'tap me to cancel';
  showBubble({ id: 'listen', kind: 'listening', text: words() || '…' });
}
// One stretch of recognition (until the recognizer stops at a pause).
function listenStretch() {
  if (NATIVE) return NATIVE.listen(navigator.language || 'en-US');
  rec = new SR(); rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let text = '';
  rec.onspeechstart = speechBegan;
  rec.onresult = (e) => { text = [...e.results].map((r) => r[0].transcript).join(''); partial(text); };
  rec.onerror = (e) => {
    diag('sr-error', { error: e.error, message: e.message });
    if (['aborted', 'no-speech'].includes(e.error)) return;
    failListening(e.error);
    // No recognition service at all: remember it and let you type this one right away.
    if (['network', 'service-not-allowed', 'language-not-supported'].includes(e.error)) { voiceBroken = true; updateHint(); setTimeout(typeInstead, 300); }
  };
  rec.onend = () => stretchEnded(text);
  try { rec.start(); } catch (err) { diag('sr-start-throw', { msg: err.message }); failListening(err.message); }
}
// Tap mode sends once your words stop changing for QUIET_MS. Not "once the recognizer hears silence": in a noisy room it
// keeps hearing "speech" that never turns into words, and would wait forever (each stretch times out and starts over).
function armQuiet() { if (talkMode !== 'tap' || !words()) return; clearTimeout(quietTimer); quietTimer = setTimeout(finishListening, QUIET_MS); }
function speechBegan() { armQuiet(); } // talking again: a fresh countdown, so new words have time to arrive
function partial(text) { if (!listening || text === heard) return; heard = text; showHeard(); armQuiet(); }
function stretchEnded(text) {
  if (!listening) return;
  heard = ''; if (text?.trim()) said = [said, text.trim()].join(' ').trim();
  if (releasing) return finishListening();
  if (talkMode === 'tap' && !said) { showBubble({ id: 'mic', kind: 'error', text: micError('no-speech') }); return stopListening(true); }
  listenStretch(); showHeard();
  if (text?.trim()) armQuiet(); // only new words restart it: an empty stretch (noise, then a timeout) leaves the countdown running
}
function stopListening(discard) {
  if (!listening) return;
  diag('sr-end', { heard: words().slice(0, 80), cancelled: discard, talkMode });
  clearTimeout(quietTimer); clearTimeout(releaseTimer); listening = false; releasing = false;
  if (NATIVE) NATIVE.cancelListening(); else if (rec) { rec.onend = null; rec.onerror = null; try { rec.abort(); } catch {} }
  clearBubble('listen'); hint.textContent = IDLE_HINT;
}
function finishListening() { // send what was heard
  if (!listening) return;
  const text = words(), h = answerHook; answerHook = null;
  stopListening(false);
  if (text) { sfx([330]); h ? h(text) : send(text); } else if (h) renderBubble();
}
function cancelListening() {
  if (!listening) return;
  const h = answerHook; answerHook = null;
  stopListening(true); sfx([300, 200]); if (h) renderBubble();
}
function failListening(code) {
  if (!listening) return;
  if (code !== 'aborted') showBubble({ id: 'mic', kind: 'error', text: micError(code) });
  const h = answerHook; answerHook = null; stopListening(true); if (h) renderBubble();
}
// Letting go of a hold: the recognizer delivers its last words, then it's sent (or dropped, if you slid off).
let releaseTimer = 0;
function releaseHold(inside) {
  if (!listening || talkMode !== 'hold') return;
  if (!inside) return cancelListening();
  releasing = true; NATIVE ? NATIVE.stopListening() : rec?.stop();
  releaseTimer = setTimeout(finishListening, 1500); // in case the last words never come
}
// The app's speech recognizer calls these (LaxBridge.kt).
window.laxOnSpeech = (text, final) => { if (!listening) return; final ? stretchEnded(text) : partial(text); };
window.laxOnSpeechBegin = () => { if (listening) speechBegan(); };
window.laxOnSpeechError = (error) => {
  if (!listening || error === 'aborted') return; // aborted: one of ours (a restart or a cancel)
  diag('sr-error', { error, native: true });
  if (error === 'no-speech') return stretchEnded('');
  if (error === 'busy') return void setTimeout(() => listening && listenStretch(), 300); // restarted too fast
  failListening(error);
};

// Typing fallback: same destination as voice (the open question, or your session).
function typeInstead() {
  const h = answerHook; answerHook = null;
  const text = prompt(h ? 'Your answer:' : 'Talk to Lax:');
  if (text?.trim()) (h ? h(text.trim()) : send(text.trim())); else if (h) renderBubble();
}
function send(text) {
  showBubble({ id: 'you' + Date.now(), kind: 'you', text: '“' + text + '”' });
  if (DEMO) { voiceBusy = true; setTimeout(() => { voiceBusy = false; showBubble({ id: 'r' + Date.now(), kind: 'reply', text: 'Demo mode — I heard you!', speak: true }); }, 1800); return; }
  api('/api/talk', { text }).then((r) => { if (!r.ok) showBubble({ id: 'busy', kind: 'error', text: 'I\'m busy, try again in a sec.' }); })
    .catch(() => showBubble({ id: 'net', kind: 'error', text: 'Couldn\'t reach your Mac.' }));
}
const topEl = $('#top');
// Tap: talk (or cancel). Hold (350ms): listen until you let go; slide off before letting go to cancel.
{ let press = null;
  const inside = (e) => { const r = topEl.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  topEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#hud, #bubble') || wakeEl.isConnected || lifeEl.classList.contains('open')) return;
    try { topEl.setPointerCapture(e.pointerId); } catch {}
    const p = press = { id: e.pointerId, held: false, out: false };
    p.timer = setTimeout(() => { p.held = true; if (!listening) beginListening('hold'); }, 350);
  });
  topEl.addEventListener('pointermove', (e) => {
    if (!press?.held || !listening || talkMode !== 'hold') return;
    const out = !inside(e); if (out !== press.out) { press.out = out; showHeard(out); }
  });
  topEl.addEventListener('pointerup', (e) => {
    const p = press; press = null; if (!p || p.id !== e.pointerId) return;
    clearTimeout(p.timer);
    if (!p.held) startListening(); else releaseHold(inside(e));
  });
  topEl.addEventListener('pointercancel', () => { const p = press; press = null; if (!p) return; clearTimeout(p.timer); if (p.held) cancelListening(); });
}
topEl.addEventListener('contextmenu', (e) => e.preventDefault());
// Desktop: hold space to talk.
addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && !listening && e.target === document.body) { e.preventDefault(); beginListening('hold'); } });
addEventListener('keyup', (e) => { if (e.code === 'Space') releaseHold(true); });

// ---------- wake (audio unlock, fullscreen, keep screen on) ----------
const wakeEl = $('#wake');
// The app needs no wake tap: audio, full screen and keep-screen-on are native there.
if (qs.has('awake') || NATIVE) wakeEl.remove();
wakeEl.addEventListener('click', async () => {
  wakeEl.remove(); sfx([523, 784]); hop(1.4);
  try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch {}
  diag('wake');
  if (SR) {
    if (!navigator.mediaDevices) diag('gum-missing');
    else navigator.mediaDevices.getUserMedia({ audio: true })
      .then((st) => { diag('gum-ok', { tracks: st.getTracks().length }); st.getTracks().forEach((t) => t.stop()); })
      .catch((err) => { diag('gum-error', { name: err.name, msg: err.message });
        showBubble({ id: 'mic', kind: 'error', text: err.name === 'NotAllowedError' ? micError('not-allowed') : 'Mic: ' + err.name }); });
  }
  try { await document.documentElement.requestFullscreen?.(); } catch {}
  const lock = async () => { try { await navigator.wakeLock?.request('screen'); } catch {} };
  lock(); document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && lock());
});

// ---------- live link ----------
function applyState(s) { pet = s.pet; sessions = s.sessions; voiceBusy = s.voiceBusy; thinking = !!s.thinking; channels = s.channels || []; voiceTarget = s.voiceTarget || 'auto'; usage = s.usage || null; updateHint(); if (s.settings) settings = s.settings; applyLook(); renderHud(); if (lifeEl.classList.contains('open')) renderLife(); }
// Remember how Lax looks, so the app's offline page can show the same Lax asleep.
const remember = () => { try { NATIVE?.remember(JSON.stringify({ pet, settings })); } catch {} };
function setAsleep(v) { if (macAsleep === v) return; macAsleep = v; updateHint(); }
// The first link asks the Mac for its recent lines, so a fresh page (the app moving to the cover screen, a reload)
// still shows the conversation. Relinks don't: the page already has them.
let linkedOnce = false;
if (DEMO) demo();
else if (ASLEEP) asleep();
else if (!TOKEN) feed('no token — open the URL printed by `npm start`', 'error', undefined, '*');
else connect();
function connect() {
  const es = new EventSource('/api/stream?t=' + encodeURIComponent(TOKEN) + (linkedOnce ? '' : '&backlog=150'));
  es.addEventListener('state', (e) => { applyState(JSON.parse(e.data)); remember(); });
  es.addEventListener('feed', (e) => { const f = JSON.parse(e.data); feed(f.line, f.kind, f.project, f.session); });
  es.addEventListener('bubble', (e) => showBubble(JSON.parse(e.data)));
  es.addEventListener('clear', (e) => clearBubble(JSON.parse(e.data).id));
  es.addEventListener('tab', (e) => { const v = JSON.parse(e.data).view, chip = $('#chips').querySelector(`[data-view="${CSS.escape(v)}"]`); if (chip) goTab(chip); });
  es.addEventListener('reborn', () => { [...term.children].slice(0, -1).forEach((d) => d.remove()); parts.length = 0; hop(1.8);
    showBubble({ id: 'born', kind: 'reply', text: `Hi! I'm ${settings.name}. Nice to meet you.`, speak: true }); });
  es.addEventListener('react', (e) => { const r = JSON.parse(e.data); if (r.state === 'thinking') voiceBusy = true; else setReact(r.state); });
  es.onopen = () => { linkedOnce = true; if (macAsleep) { setAsleep(false); hop(1.4); } feed('linked to mac ✓', 'session', undefined, '*'); };
  es.onerror = () => {
    if (!macAsleep) feed(`${settings.name.toLowerCase()} fell asleep. zzz…`, 'session', undefined, '*');
    setAsleep(true);
    // Cloudflare answers for a sleeping Mac with an error page, which ends EventSource for good: retry by hand.
    if (es.readyState === EventSource.CLOSED) setTimeout(connect, 10000);
  };
}
// The app's offline page: the Mac couldn't be reached at all. Show Lax asleep, as it last looked.
function asleep() {
  try { const m = JSON.parse(NATIVE?.recall() || 'null'); if (m) { pet = m.pet || pet; settings = m.settings || settings; } } catch {}
  applyLook(); renderHud(); updateHint();
  feed(`${settings.name.toLowerCase()} is asleep. zzz…`, 'session', undefined, '*');
  feed('it wakes up on its own.', 'session', undefined, '*');
}

// ---------- demo mode (?demo) — cycles every state without a server ----------
function demo() {
  pet = { name: 'Lax', level: 7, stage: 'cube', traits: ['headband'], mood: 'happy', xp: 400, prevXp: 360, nextXp: 490, streak: 4 };
  sessions = [{ id: 'd1', project: 'api', where: 'mac', status: 'working' }, { id: 'd2', project: 'web', where: 'cli', status: 'done' }];
  settings = { ...settings, captions: true }; view = 'd1'; applyLook(); renderHud(); // the api tab is open, so its feed shows
  setTimeout(() => showBubble({ id: 'hi', kind: 'reply', text: 'Hi, I\'m Lax. Tap me and talk.' }), 400);
  const steps = [
    () => feed('> fix the flaky auth test', 'prompt', 'api', 'd1'),
    () => feed('Read auth.test.ts', 'tool', 'api', 'd1'), () => feed('Grep "refreshToken"', 'tool', 'api', 'd1'),
    () => feed('Edit auth.ts', 'tool', 'api', 'd1'), () => feed('$ npm test -- auth', 'tool', 'api', 'd1'),
    () => feed('  ✗ Bash failed', 'error', 'api', 'd1') || setReact('error'),
    () => feed('Edit auth.ts', 'tool', 'api', 'd1'),
    () => showBubble({ id: 'perm', kind: 'permission', project: 'api', gist: '$ rm -rf dist && npm run build', text: 'api wants to: $ rm -rf dist && npm run build', actions: true }),
    () => {}, () => {}, () => clearBubble('perm') || feed('  ✓ approved from phone', 'done', 'api', 'd1'),
    () => feed('$ npm run build', 'tool', 'api', 'd1'),
    () => feed('✓ api: Fixed the race in token refresh; all 42 tests pass.', 'done', 'api', 'd1') || showBubble({ id: 'd', kind: 'done', text: 'api: Fixed the race in token refresh; all 42 tests pass.' }),
    () => showBubble({ id: 'lv', kind: 'levelup', text: 'Lax reached level 8!' }),
    () => {}, () => { voiceBusy = true; }, () => {}, () => { voiceBusy = false; pet = { ...pet, mood: 'sleepy' }; },
    () => {}, () => { pet = { ...pet, mood: 'happy', traits: ['headband', 'goggles', 'flame'] }; },
  ];
  let i = 0; setInterval(() => steps[i++ % steps.length](), 1300);
}

// ---------- life menu ----------
const lifeEl = $('#life');
// Same order as lib/levels.mjs, where each colour's growth curve lives.
const COLORS = ['#5abf8e', '#D97757', '#5aa7e6', '#f6d23c', '#a8754a', '#c58fd8', '#403e4a', '#f2ede3', '#f4a6c8'];
let memory = null;
function saveSettings(patch) {
  settings = { ...settings, ...patch }; applyLook(); renderLife();
  if (!DEMO) api('/api/settings', patch);
}
async function openLife() {
  lifeEl.classList.add('open'); renderLife();
  if (!DEMO) { try { memory = await fetch('/api/memory', { headers: { 'x-lax-token': TOKEN } }).then((r) => r.json()); } catch {} renderLife(); }
}
function renderLife() {
  $('#sRoute').innerHTML = [['background', 'assistant'], ...channels.map((c) => [c.cid, c.project])]
    .map(([v, l]) => `<button data-v="${esc(v)}" class="${v === voiceTarget ? 'on' : ''}">${esc(l)}</button>`).join('');
  $('#sName').value !== settings.name && document.activeElement !== $('#sName') && ($('#sName').value = settings.name);
  $('#sPitch').value = settings.pitch;
  // Evolved (level 50): the colour is part of its form now, so the swatches go.
  if (pet.colorSet) { $('#swatches').innerHTML = `<span class="set"><i style="background:${settings.color}"></i>its own now</span>`; } else
  $('#swatches').innerHTML = COLORS.map((c) => `<button style="background:${c}" data-c="${c}" class="${c === settings.color ? 'on' : ''}"></button>`).join('')
    + `<input type="color" id="sColor" value="${settings.color}" title="custom" class="${COLORS.some((c) => c.toLowerCase() === settings.color.toLowerCase()) ? '' : 'on'}">`;
  lifeEl.querySelectorAll('.tog').forEach((t) => t.classList.toggle('on', !!settings[t.dataset.k]));
  $('#sWait').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === settings.askTimeout));
  $('#sTheme').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === (settings.theme || 'system')));
  const raw = memory?.raw || {}, p = memory?.pet || pet;
  const days = p.born ? Math.max(0, Math.floor((Date.now() - p.born) / 864e5)) : 0;
  $('#stats').innerHTML = [['level', p.level], ['stage', p.stage], ['xp', p.xp], ['streak', (p.streak || 0) + 'd'], ['age', days + 'd'], ['mood', p.mood],
    ['turns', raw.turns ?? '–'], ['approved', raw.approvals ?? '–'], ['errors', raw.errors ?? '–'], ['voice', memory?.voiceProject ?? '–'],
    ['traits', (p.traits || []).join(', ') || 'none yet']].map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
  const tools = Object.entries(raw.tools || {}).filter(([k]) => !k.startsWith('__')).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = tools[0]?.[1] || 1;
  $('#tools').innerHTML = tools.length ? tools.map(([k, v]) => `<div class="bar"><span>${esc(k.replace(/^mcp__.*?__/, ''))}</span><div class="track"><i style="width:${Math.round(100 * v / max)}%"></i></div><b>${v}</b></div>`).join('') : '<div class="bar"><span>nothing yet</span></div>';
  // Claude plan usage, from the status line of your terminal sessions (hooks/lax-status.mjs).
  const resets = (ms) => { if (!ms) return ''; const d = new Date(ms), hm = d.toTimeString().slice(0, 5);
    return d - Date.now() < 864e5 ? hm : d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + hm; };
  const win = [['five_hour', '5 hours'], ['seven_day', 'week']].filter(([k]) => usage?.[k]);
  $('#usage').innerHTML = win.length ? win.map(([k, l]) => { const w = usage[k], hot = w.pct >= 80;
    return `<div class="bar"><span>${l}${w.resets ? ' · ' + resets(w.resets) : ''}</span><div class="track"><i style="width:${w.pct}%${hot ? ';background:var(--red)' : ''}"></i></div><b>${w.pct}%</b></div>`; }).join('')
    : '<div class="bar"><span>shows once a terminal session runs</span></div>';
  $('#usageAge').textContent = usage?.ts ? `${Math.round((Date.now() - usage.ts) / 60000)} min ago` : '';
  $('#miles').innerHTML = (memory?.milestones || []).slice(0, 12).map((m) => `<li>${new Date(m.ts).toLocaleDateString()} ${m.text.replace(/</g, '&lt;')}</li>`).join('') || '<li>…</li>';
}
$('#nameBtn').addEventListener('click', (e) => { e.stopPropagation(); openLife(); });
lifeEl.addEventListener('pointerdown', (e) => e.stopPropagation());
$('#lifeClose').addEventListener('click', () => lifeEl.classList.remove('open'));
$('#sName').addEventListener('change', (e) => e.target.value.trim() && saveSettings({ name: e.target.value.trim().slice(0, 12) }));
$('#sPitch').addEventListener('change', (e) => { saveSettings({ pitch: +e.target.value }); speak('Is this my voice?'); });
$('#swatches').addEventListener('click', (e) => { if (e.target.dataset.c && !pet.colorSet) { saveSettings({ color: e.target.dataset.c }); hop(1); } });
$('#swatches').addEventListener('change', (e) => { if (e.target.id === 'sColor' && !pet.colorSet) { saveSettings({ color: e.target.value }); hop(1); } });
lifeEl.querySelectorAll('.tog').forEach((t) => t.addEventListener('click', () => saveSettings({ [t.dataset.k]: !settings[t.dataset.k] })));
$('#sWait').addEventListener('click', (e) => e.target.dataset.v && saveSettings({ askTimeout: +e.target.dataset.v }));
$('#sTheme').addEventListener('click', (e) => e.target.dataset.v && saveSettings({ theme: e.target.dataset.v }));
// Rebirth needs a 2-second hold so it can't happen by accident.
{ const btn = $('#rebirth'), fill = btn.querySelector('i'); let t0, raf;
  const tick = () => { const k = Math.min(1, (performance.now() - t0) / 2000); fill.style.width = k * 100 + '%';
    if (k < 1) raf = requestAnimationFrame(tick); else { cancel(); lifeEl.classList.remove('open'); if (DEMO) location.reload(); else api('/api/rebirth'); } };
  const cancel = () => { cancelAnimationFrame(raf); fill.style.width = 0; };
  btn.addEventListener('pointerdown', () => { t0 = performance.now(); tick(); });
  btn.addEventListener('pointerup', cancel); btn.addEventListener('pointerleave', cancel); }
applyLook(); fit();

$('#sRoute').addEventListener('click', (e) => { const v = e.target.dataset.v; if (v) setTarget(v); });
$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('span'); if (!chip) return;
  setView(chip.dataset.view); sfx([660, 880]); hop(0.8);
  if (chip.dataset.cid) return setTarget(chip.dataset.cid);
  // "all" (and sessions that can't hear) → talking goes to Lax itself, the assistant.
  if (voiceTarget !== 'background') setTarget('background'); else renderHud();
  if (chip.dataset.view !== 'all') showBubble({ id: 'notlive', kind: 'reply', text: `${chip.dataset.label} can't hear me, so I'll answer you myself. Start it with "lax" to talk to it.` });
});
setView(view); addEventListener('resize', () => setView(view)); // folding the phone shows or hides the tabs
// Cover screen: no tabs to see, so tap the tab's name (top left) to go to the next one, or a session's square to go
// straight to it: exactly like tapping its tab in the open app. Lax says where you are, since you may not be looking.
$('#tab').addEventListener('click', () => {
  const tabs = [...$('#chips').children]; if (tabs.length < 2) return;
  goTab(tabs[(tabs.findIndex((t) => t.dataset.view === view) + 1) % tabs.length]);
});
$('#dots').addEventListener('click', (e) => {
  const sq = e.target.closest('b'); if (!cover() || !sq || sq.dataset.view === view) return;
  const chip = $('#chips').querySelector(`[data-view="${CSS.escape(sq.dataset.view)}"]`); if (chip) goTab(chip);
});
function goTab(next) {
  next.click();
  const who = next.dataset.view === 'all' ? settings.name : next.dataset.label.split('·')[0].replace(/-/g, ' ');
  if (next.dataset.view !== 'all' && !next.dataset.cid) showBubble({ id: 'notlive', kind: 'reply', text: `${next.dataset.label} can't hear me. I'll answer.` }); // fits the strip
  speak(next.dataset.view === 'all' || next.dataset.cid ? who : `${who}. It can't hear me, so I'll answer.`);
}
