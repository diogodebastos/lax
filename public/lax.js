// Lax's body: pixel avatar, speech bubble, terminal feed, voice in/out.
'use strict';

// ---------- setup ----------
const qs = new URLSearchParams(location.search);
let TOKEN = qs.get('t');
try { if (TOKEN) localStorage.lax_t = TOKEN; else TOKEN = localStorage.lax_t; } catch {}
const HASH_K = new URLSearchParams(location.hash.slice(1)).get('k'); // the sealing key (below), before the URL is cleaned
// Cleaned to /index.html, not /: that's the address an iPhone saves to the Home Screen, and the relay sends a bare / to the landing.
if (qs.get('t') || HASH_K) history.replaceState(null, '', location.pathname === '/' ? '/index.html' : location.pathname);
// Demo mode only under /demo (the public demo and its local preview); a plain /?demo is the real app.
const DEMO = qs.has('demo') && location.pathname.startsWith('/demo');
// Paired: the relay's front door opens Lax for this browser, not the landing (relay/worker.mjs). A flag, never the token.
if (TOKEN && !DEMO) try { document.cookie = 'lax_paired=1; path=/; max-age=315360000; secure; samesite=lax'; } catch {}
// Inside the Lax Android app: Android's own speech recognition, TTS and vibration (see android/…/LaxBridge.kt).
const NATIVE = (() => { try { return window.LaxNative?.isNative() ? window.LaxNative : null; } catch { return null; } })();
// Added to the Home Screen (iPhone: Share, Add to Home Screen): an app of its own, with storage of its own, not Safari's,
// so it starts unpaired and pairs by pasting the link (the Life menu copies it in Safari).
const STANDALONE = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
// An iPhone or iPad (an iPad says it's a Mac), for wording only: what it does is the same everywhere.
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
const buzz = (pattern) => (NATIVE ? NATIVE.vibrate(pattern.join(',')) : navigator.vibrate?.(pattern));

const $ = (s) => document.querySelector(s);
const app = $('#app'), cv = $('#stage'), g = cv.getContext('2d');
const W = 52, H = 51, GROUND = 46, CX = 26;
// Bodies: 'wide' = closed Flip 3 cover screen (512×260 landscape strip), 'tall' = cover screen held sideways
// (260×512), 'big' = phone open / Flex mode (fluid; Lax on the top half, terminal below the fold),
// 'side' = phone open and held sideways (Lax on the left half, tabs + terminal on the right). ?layout= forces one.
function layoutFor() {
  const forced = qs.get('layout'); if (forced) return forced;
  if (innerWidth >= 340 && innerHeight >= 500) return 'big'; // 500: an iPhone SE in Safari is 375×550
  // The cover screen is never 300 tall, so any landscape screen that is gets the side layout (open phone, desktop).
  if (innerHeight >= 300 && innerWidth > innerHeight) return 'side';
  return innerWidth / innerHeight > 1.3 ? 'wide' : 'tall';
}
function fit() {
  const l = layoutFor();
  // In the app the page runs under the camera hole: keep the top bar clear of it. In a browser, CSS does (env(), index.html).
  if (NATIVE) try { const i = JSON.parse(NATIVE.insets() || '{}'); document.documentElement.style.setProperty('--inset-top', (i.top || 0) + 'px'); } catch {}
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

const VERSION = 'v0.5';
// Diagnostics → the Mac's server log (data/server.log), so phone-only problems are visible there.
// While the Mac sleeps they can't reach it: kept (the last 50, with when) and sent once it's back (connect).
const diagLater = [];
const diag = (event, data = {}) => { if (DEMO || !TOKEN) return;
  if (typeof macAsleep !== 'undefined' && macAsleep) { diagLater.push({ event, ...data, at: new Date().toISOString().slice(11, 19) }); diagLater.splice(0, diagLater.length - 50); return; }
  sealed({ event, ...data }).then((b) => fetch('/api/diag', { method: 'POST', keepalive: true, headers: sealHeaders({ 'content-type': 'application/json', 'x-lax-token': TOKEN }), body: b })).catch(() => {}); };
// ---------- sealed (lib/seal.mjs) ----------
// What this page and the Mac say to each other is sealed with a key only they have: it came after the # of the pairing
// link (never sent to any server), and is kept here. Without one (paired before), plain, as before.
let SEAL = null;
{ const k = HASH_K;
  try { if (k) localStorage.lax_k = k; } catch {}
  let key = k; try { key ||= localStorage.lax_k; } catch {}
  if (key && crypto.subtle) SEAL = crypto.subtle.importKey('raw', Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)), 'AES-GCM', false, ['encrypt', 'decrypt']).catch(() => null); }
const SEAL_K = (() => { try { return localStorage.lax_k || ''; } catch { return ''; } })();
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const sealHeaders = (h) => (SEAL ? { ...h, 'x-lax-seal': '1' } : h);
/** A body to send: { sealed } when there's a key. */
async function sealed(obj) {
  const key = await SEAL; if (!key) return JSON.stringify(obj);
  const iv = crypto.getRandomValues(new Uint8Array(12)), c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  const all = new Uint8Array(12 + c.length); all.set(iv); all.set(c, 12); return JSON.stringify({ sealed: b64(all) });
}
// With a key, a plain answer can only be the relay's word about itself ({ queued }, { error: 'Mac asleep' }, { mac }): it
// can't seal, and anything else plain was made on the way, so it's nothing (it could put its own words on the screen).
const fromRelay = (j) => j && typeof j === 'object' && Object.entries(j).every(([k, v]) => typeof v === 'boolean' || (k === 'error' && /^(Mac asleep|too many wrong tokens|bad token)$/.test(v)));
/** What came: opened if it's { sealed }. */
async function opened(j) {
  if (typeof j?.sealed !== 'string') { if ((await SEAL) && !fromRelay(j)) throw new Error('plain, and this page is sealed'); return j; }
  const key = await SEAL; if (!key) throw new Error('sealed, and no key: pair again');
  const b = Uint8Array.from(atob(j.sealed), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, key, b.subarray(12))));
}
const getJson = (p) => fetch(p, { headers: sealHeaders({ 'x-lax-token': TOKEN }) }).then((r) => r.json()).then(opened);
addEventListener('error', (e) => diag('js-error', { msg: e.message, at: `${e.filename}:${e.lineno}` }));
// Each POST has its own id, the same on a retry (the network switched mid-request), so the Mac does it once (lib/once.mjs).
// What you said, a yes or no and settings may be held by the relay while the Mac sleeps ({ queued: true }, relay/worker.mjs).
const onceId = () => crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
const HELD = /^\/api\/(talk|decide|settings)$/;
async function api(p, body) {
  const headers = sealHeaders({ 'content-type': 'application/json', 'x-lax-token': TOKEN, 'x-lax-once': onceId() });
  if (HELD.test(p)) headers['x-lax-queue'] = '1';
  const sent = await sealed(body || {});
  for (let i = 0; ; i++) {
    try { return await fetch(p, { method: 'POST', headers, body: sent }).then((r) => r.json()).then(opened); }
    catch (e) { if (i >= 2) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
}

// ---------- palette ----------
const C = { bg: '#000', shadow: '#2a2521', ink: '#000', out: '#120c0a', body: '#D97757', hi: '#F2A585', lo: '#A9522F', eye: '#fff8ee', red: '#ff4b3e', band: '#e0302a', stick: '#d9d2c4',
  glass: '#7fd3ff', gold: '#ffd25a', green: '#6fd36f', ground: '#1f1c19', dust: '#5b544b', cape: '#3b4cc0' };

// ---------- world state ----------
// What speech gets wrong (lib/vocab.mjs, from the Mac): the names you use, and misheard → meant (fixed by heard.js).
let vocab = { words: [], heard: {} };
let whisperOn = false, hearing = null; // Whisper on the Mac is up (lib/whisper.mjs); while it writes down what you said: how to drop it
let settings = { name: 'Lax', color: '#D97757', voice: true, sounds: true, pitch: 1.6, speakDone: false, captions: false, phoneApprovals: true, askTimeout: 30, theme: 'system' };
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
  C.stick = t === 'light' ? '#6b645a' : '#d9d2c4'; // the antenna's stick: light on dark, dark on light
  try { localStorage.lax_theme = settings.theme || 'system'; } catch {}
}
try { if (localStorage.lax_theme) settings.theme = localStorage.lax_theme; } catch {}
darkQuery.addEventListener?.('change', applyTheme);
window.laxOnTheme = applyTheme; // the app calls this when the phone switches dark mode
function applyLook() {
  applyTheme();
  try { updateHint(); } catch {} // (not ready on the very first call)
  const wakeName = document.querySelector('#wakeName'); if (wakeName) wakeName.textContent = settings.name;
  const color = pet.look?.color || settings.color || '#D97757'; // the species' colour (an egg: whatever leads); no server: Lax's own
  C.body = color; C.hi = shade(color, 0.3); C.lo = shade(color, -0.25);
  document.documentElement.style.setProperty('--coral', color);
  $('#nameBtn').textContent = settings.name.toUpperCase(); $('#lifeName').textContent = settings.name.toUpperCase(); $('#knowsName').textContent = settings.name.toUpperCase(); $('#menuName').textContent = settings.name.toUpperCase();
}
let pet = { name: 'Lax', level: 1, stage: 'sprout', traits: [], mood: 'happy', xp: 0, prevXp: 0, nextXp: 10 };
// A trait it earned, unless you switched it off in the Life menu.
const wears = (t) => pet.traits.includes(t) && !settings.hideTraits?.includes(t);
let sessions = [], voiceBusy = false, thinking = false, lastWork = 0, channels = [], voiceTarget = 'background', usage = null, budget = null;
// The Mac is asleep or off (no link): Lax sleeps too. ASLEEP = the app's offline copy of this page (no Mac at all).
const ASLEEP = qs.has('asleep'); let macAsleep = ASLEEP;
// Through the relay, a sleeping Mac is its "Mac asleep" (JSON), and what you say is held for it: you can still talk.
let relayHolds = false;
// No key: Lax hasn't hatched. Just an egg that wobbles now and then (and when tapped).
const EGG = !DEMO && !ASLEEP && !TOKEN; let eggTapAt = -1e9;
// A new Lax (first life or a rebirth) is an egg too, until 1000 XP or three worked days (lib/species.mjs). You can talk to it
// meanwhile. When the Mac says it hatched, the shell cracks and its species hops out.
let shell = false, hatchAt = 0;
function hatch() {
  if (EGG || !shell || hatchAt) return;
  hatchAt = performance.now(); sfx([392, 523]);
  setTimeout(() => { shell = false; hatchAt = 0; updateHint(); playTune('hatch'); hop(1.8);
    for (let i = 0; i < 16; i++) spark(CX, GROUND - 8, i % 3 ? '#f3e6cf' : '#cdbb9c', 1.3, 45); }, 550);
}
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
// The body itself (forms, face, traits) is drawn by body.js, shared with the Mac.
function drawEgg(t, m) {
  const since = t - eggTapAt, k = hatchAt ? 1.5 : since < 900 ? 1 : m === 'working' || m === 'talking' ? 0.5 : t % 3200 < 600 ? 0.6 : 0; // hatching, tapped, working, or every few seconds
  const tilt = k * Math.sin(t / (hatchAt ? 35 : 60)) * 2;
  LaxBody.egg(g, C, { tilt, crack: hatchAt ? Math.min(10, Math.floor((t - hatchAt) / 45)) : 0, CX, GROUND });
}
function draw(m, t) {
  g.clearRect(0, 0, W, H);
  if (EGG || shell) return drawEgg(t, m);
  // ground: the dotted line is the hint's line in the page (#hint), so text never sits on it
  const now = performance.now(); if (now > body.blinkAt + 3500 + Math.random() * 3000) body.blinkAt = now;
  const { cx, x0, y0, w, h } = LaxBody.render(g, C, { stage: pet.stage, form: pet.look?.form || null, lift: pet.look?.lift || 0, wears,
    m, t, s: body.s, y: body.y, look: body.look, blinking: now - body.blinkAt < 120, spark, CX, GROUND });

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
  $('#chips').innerHTML = `<span class="all${view === 'all' ? ' sel' : ''}" data-view="all">${esc(settings.name)}</span>` + shown.map((s, i) => {
    const ch = channels.find((c) => c.sessionPid && c.sessionPid === s.pid), open = s.id === view;
    const badge = open ? '' : bubbles.some((b) => b.session === s.id && needsYou(b)) ? ' ask' : unseen.has(s.id) ? ' new' : '';
    return `<span class="${s.status}${ch ? ' live' : ''}${open ? (ch ? ' sel' : ' front') : ''}${badge}" data-view="${esc(s.id)}" data-cid="${ch ? ch.cid : ''}" data-label="${esc(labels[i])}">${esc(labels[i])}</span>`;
  }).join('');
  $('#lvl').textContent = pet.egg ? 'egg' : `Lv${pet.level}`; // an egg's bar: how close it is to hatching
  $('#xp i').style.width = (pet.egg ? pet.egg.pct : Math.round(100 * (pet.xp - pet.prevXp) / Math.max(1, pet.nextXp - pet.prevXp))) + '%';
  // Cover screen: the open tab's name in place of the menu (settings live in the open app).
  const vi = shown.findIndex((s) => s.id === view); $('#tab').textContent = vi < 0 ? settings.name : labels[vi];
  renderStatus();
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
const unheard = new Map(); // session -> the last thing it said aloud while you were on another tab: said when you open it
let goingTab = false; // goTab says it together with the tab's name
const needsYou = (b) => b.kind === 'permission' || b.kind === 'question';
// An answer to what you just said is never elsewhere: you're waiting for it, whichever tab is open.
const elsewhere = (b) => tabbed() && !b.answer && b.session && b.session !== view && sessions.slice(0, 8).some((s) => s.id === b.session);
function setView(v) {
  view = v; try { localStorage.lax_view = v; } catch {}
  unseen.delete(v);
  for (const d of term.children) if (d.dataset.s !== undefined) d.hidden = !visible(d);
  term.scrollTop = term.scrollHeight;
  renderBubble(); renderHud();
}
// The terminal reads like Claude Code: what the assistant says (●), each step with why it runs and the command dim
// under it, a few lines of output (tap for more), edits as +/- lines, reads and searches folded into one line, and a
// subagent's steps indented under it. x: the step's parts from the Mac (server.mjs stepParts); without them, the plain line.
// Built with textContent only: nothing from a session ever becomes HTML.
const el = (cls, ...kids) => { const d = document.createElement('div'); if (cls) d.className = cls; d.append(...kids.filter((k) => k != null)); return d; };
const span = (cls, text) => { const e = document.createElement('span'); if (cls) e.className = cls; e.textContent = text; return e; };
const where = new Map(); // session -> what new lines attach to, per agent ('' = the session itself): its last step, an open "read 3 files" row, its box
const FOLD = /^(Read|Grep|Glob|LS|NotebookRead|mcp__.*)$/;
// A connector's calls count under its name: mcp__Claude_Browser__computer → "browser". Ids for names become "connector".
const mcpName = (t) => { const n = t.split('__')[1] || ''; return /^[0-9a-f-]{20,}$/.test(n) ? 'connector' : n.replace(/^claude[_-]/i, '').replace(/[_-]+/g, ' ').toLowerCase(); };
let lastSay = null; // the open tab's latest narration, for the cover's captions
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
// A long command (a heredoc, a script) shows its first lines; the whole of it is what a long press copies.
const firstLines = (t, n) => { const l = t.split('\n'); return l.length > n ? l.slice(0, n).join('\n') + `\n… ${plural(l.length - n, 'more line')}` : t; };
function feed(line, kind = 'tool', project, session = '', x = {}) {
  // Follow new lines only if you're already at the bottom (so scrolling back to read isn't yanked away).
  const stick = term.scrollHeight - term.scrollTop - term.clientHeight < 40;
  if (!where.has(session)) where.set(session, new Map());
  const lanes = where.get(session);
  // A subagent's lines go in a box under its Agent step (the latest one not taken yet), else at the top level.
  let key = '';
  if (x.agent) {
    if (!lanes.has(x.agent)) {
      const free = [...term.querySelectorAll('.step.agent')].reverse().find((s) => s.dataset.s === session && !s.dataset.agent);
      if (free) { free.dataset.agent = x.agent; const box = el('sub'); free.append(box); lanes.set(x.agent, { box }); }
    }
    if (lanes.has(x.agent)) key = x.agent;
  }
  if (!lanes.has(key)) lanes.set(key, {});
  const at = lanes.get(key);
  const add = (d) => { if (at.box) return at.box.appendChild(d); d.dataset.s = session; d.hidden = !visible(d); return term.insertBefore(d, term.lastElementChild); };
  // Lax's own tab is a conversation: its work (x.own) shows live while it runs, then folds under its answer as
  // "used 3 tools"; your yeses stay where you gave them. Time dividers between talks; its diary in between.
  const laxTab = !session, own = laxTab && x.own, yes = own && /^(done|error)$/.test(kind) && /^ {2}/.test(line);
  const turn = laxTab ? (lanes.turn ??= { work: [] }) : null;
  const put = laxTab ? (d) => { const r = add(d); if (own && !yes) { r.classList.add('own'); turn.work.push(r); } return r; } : add;
  if (laxTab && kind === 'prompt') foldWork(turn, session); // an unanswered turn's work folds before the next one
  if (laxTab && x.ts) {
    const last = lanes.lastTs, d = new Date(x.ts);
    if (!last || x.ts - last > 30 * 60000 || new Date(last).toDateString() !== d.toDateString()) add(el('day', `— ${when(d)} —`));
    lanes.lastTs = x.ts;
  }
  const sessRow = lanes.sess; if (laxTab) lanes.sess = null; // only lines in a row fold together

  if (kind === 'tool' && x.tool && FOLD.test(x.tool)) { // reads and searches in a row: one line that counts up
    let g = at.group;
    if (!g) { g = at.group = put(el('sum')); g.counts = {}; g.label = span('', ''); g.list = el('x'); g.append(g.label, g.list); }
    const k = /^(Read|NotebookRead)$/.test(x.tool) ? 'read' : x.tool === 'LS' ? 'listed' : x.tool.startsWith('mcp__') ? mcpName(x.tool) : 'searched';
    g.counts[k] = (g.counts[k] || 0) + 1;
    g.label.textContent = Object.entries(g.counts).map(([w, c]) => w === 'read' ? 'read ' + plural(c, 'file') : w === 'searched' ? 'searched ' + plural(c, 'pattern')
      : w === 'listed' ? 'listed ' + plural(c, 'folder') : `${w} ${plural(c, 'call')}`).join(' · ');
    g.list.append(el('', line));
  } else if (kind === 'tool' && x.tool) { // a step: ● why (or what), the command dim under it
    at.group = null; at.step?.classList.remove('run');
    const label = x.tool === 'Bash' ? x.desc || '$ ' + (x.cmd || '').split('\n')[0]
      : /^(Edit|MultiEdit)$/.test(x.tool) ? `Update ${x.file}` : x.tool === 'Write' ? `Write ${x.file}`
      : /^(Task|Agent)$/.test(x.tool) ? `Agent: ${x.desc || ''}` : line;
    const s = el('step run' + (/^(Task|Agent)$/.test(x.tool) ? ' agent' : ''));
    s.head = el('head', span('mk', '● '), label); s.append(s.head);
    if (x.tool === 'Bash' && x.desc && x.cmd) s.append(el('cmd', '$ ' + firstLines(x.cmd, 3)));
    s.copy = x.cmd || label;
    if (x.doc) { s.doc = true; s.append(docBox(x.doc)); s.copy += '\n' + x.doc; }
    at.step = put(s);
  } else if ((kind === 'out' && x.out) || (kind === 'diff' && x.diff)) { // under the step it belongs to; tap for more
    at.group = null;
    const s = at.step, isOut = kind === 'out';
    const rows = isOut ? x.out.map((l) => el('', l)) : x.diff.lines.map((l) => el(l[0] === '+' ? 'a' : 'd', l));
    const shown = isOut ? 3 : 4, total = isOut ? x.total : x.diff.add + x.diff.del;
    rows.forEach((r, i) => i >= shown && r.classList.add('x'));
    const box = el(kind + ' fold', ...rows), left = (open) => total - (open ? rows.length : Math.min(shown, rows.length));
    if (left(false) > 0 || rows.length > shown) {
      const more = el('more', ''); box.append(more);
      const label = () => { const o = box.classList.contains('open'), n = left(o); more.textContent = n > 0 ? `… ${plural(n, 'more line')}` : o ? 'less' : ''; };
      label(); box.addEventListener('click', () => { box.classList.toggle('open'); label(); });
    }
    if (!isOut && s) s.head.append(span('n', '  '), span('n a', `+${x.diff.add}`), span('n', ' '), span('n d', `-${x.diff.del}`));
    if (!isOut && s?.doc) { /* the whole file already shows under it */ }
    else if (s) { s.insertBefore(box, s.fail || null); if (isOut) s.copy += '\n' + x.out.join('\n'); } else add(box);
  } else if (kind === 'error' && x.answer) { // the answer went wrong: still the end of the turn
    const r = add(el('error', line)); if (laxTab) foldWork(turn, session, r);
  } else if (kind === 'error' && at.step && /failed$/.test(line)) { // "✗ Bash failed" marks its step
    at.step.classList.replace('run', 'bad') || at.step.classList.add('bad'); at.step.append(at.step.fail = el('error', '✗ failed'));
  } else if (kind === 'say') {
    at.group = null; put(el('say md', span('mk', '● '), ...md(x.text || line.replace(/^● /, ''))));
    if (view === 'all' ? !session : session === view) lastSay = { text: x.text || line, at: performance.now() };
  } else if (kind === 'done' && x.text) {
    at.group = null; at.step?.classList.remove('run');
    const answer = add(el('done md', laxTab && x.answer ? laxFace() : span('mk', '✓ '), ...md(x.text)));
    if (laxTab && x.answer) foldWork(turn, session, answer);
  } else if (yes) { // your yes (or no) to one of Lax's own steps, where you gave it
    add(el(kind === 'done' ? 'yes' : 'no', line.trim()));
  } else if (kind === 'diary') {
    at.group = null; add(el('diary', span('mk', '+ '), x.text || line.replace(/^\+ /, '')));
  } else if (laxTab && kind === 'session' && /live session/.test(line)) { // sessions opening and closing: one line
    const prev = sessRow, item = line.replace(/^● live session: (.*)/, '$1 opened').replace(/^○ live session closed: (.*)/, '$1 closed');
    if (prev?.isConnected) { prev.items.push(item); prev.label.textContent = `live sessions: ${prev.items.join(', ')}`; lanes.sess = prev; }
    else { const r = lanes.sess = add(el('sessions', span('mk', '· '))); r.items = [item]; r.label = span('', `live sessions: ${item}`); r.append(r.label); }
  } else if (kind === 'prompt' && line.startsWith('> ')) {
    at.group = null; at.step?.classList.remove('run');
    const row = add(el('prompt turn', span('mk', '› '), span('', line.slice(2))));
    // Cut short: tap it to read all of what you said (and again to shrink it); a long press copies it whole.
    if (x.text) { row.classList.add('cut'); row.copy = x.text; row.addEventListener('click', () => { row.lastChild.textContent = row.classList.toggle('open') ? x.text : line.slice(2); }); }
  } else {
    at.group = null; add(el(kind, line));
  }
  while (term.children.length > 400) term.firstElementChild.remove();
  if (stick) term.scrollTop = term.scrollHeight;
  if (kind === 'tool') lastWork = performance.now();
}
// A plan, or a markdown file being written: rendered, its first lines, tap to read all of it (never cut in a ``` fence).
function docBox(text) {
  const lines = String(text).replace(/\s+$/, '').split('\n');
  let cut = Math.min(4, lines.length), fence = false;
  for (let i = 0; i < cut; i++) if (/^\s*```/.test(lines[i])) fence = !fence;
  if (fence) { while (cut < lines.length && !/^\s*```/.test(lines[cut])) cut++; cut = Math.min(cut + 1, lines.length); }
  const box = el('doc md fold', el('', ...md(lines.slice(0, cut).join('\n')))), rest = lines.length - cut;
  if (rest > 0) {
    const more = el('more', `… ${plural(rest, 'more line')}`);
    box.append(el('x', ...md(lines.slice(cut).join('\n'))), more);
    box.addEventListener('click', () => { more.textContent = box.classList.toggle('open') ? 'less' : `… ${plural(rest, 'more line')}`; });
  }
  return box;
}
// Lax's answers start with the tiny Lax (public/mind-view.js), small and grey like the old ✓. A mask, so it takes the
// theme's grey; drawn 6x bigger than it shows so the pixels stay sharp.
let faceMask = null;
function laxFace() {
  if (!faceMask) {
    const rows = ['..fffff..', '.fffffff.', 'fffffffff', 'ff.fff.ff', 'ff.fff.ff', 'fffffffff', '.fffffff.', '..ff.ff..'], k = 6;
    const cv = document.createElement('canvas'); cv.width = 9 * k; cv.height = 8 * k; const c = cv.getContext('2d');
    rows.forEach((r, j) => [...r].forEach((ch, i) => ch === 'f' && c.fillRect(i * k, j * k, k, k)));
    faceMask = `url(${cv.toDataURL()})`;
    document.documentElement.style.setProperty('--face', faceMask);
  }
  return span('face', '');
}
// A turn's work, folded under its answer: "used 3 tools", tap to see every step in full.
function foldWork(turn, session, after) {
  const work = turn.work.filter((w) => w.isConnected); turn.work = [];
  if (!work.length) return;
  const n = work.reduce((k, w) => k + (w.classList.contains('step') ? 1 : w.counts ? Object.values(w.counts).reduce((a, b) => a + b, 0) : 0), 0);
  const box = el('used'), list = el('x');
  box.append(span('', n ? `used ${plural(n, 'tool')}` : 'thought it through'), list);
  for (const w of work) { w.classList.remove('run', 'own'); list.append(w); }
  box.dataset.s = session; box.hidden = !visible(box);
  (after || term.lastElementChild.previousElementSibling || term.lastElementChild).after(box);
  box.addEventListener('click', (e) => { if (!e.target.closest('.fold, .sum')) box.classList.toggle('open'); });
}
// "today 09:12", "yesterday 22:10", "Mon 6 Oct 10:00"
function when(d) {
  const hm = d.toTimeString().slice(0, 5), day = new Date(); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  return diff === 0 ? `today ${hm}` : diff === 1 ? `yesterday ${hm}` : `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${hm}`;
}
// Just enough markdown for an answer: **bold**, `code`, # headings and ``` fences. Returns nodes, never HTML.
function md(text) {
  const out = [];
  for (const p of String(text).split(/(```[\s\S]*?(?:```|$))/)) {
    if (p.startsWith('```')) { out.push(el('fence', p.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, ''))); continue; }
    p.split('\n').forEach((ln, i, all) => {
      const h = ln.match(/^#{1,6}\s+(.*)/);
      if (h) out.push(span('h', h[1]));
      else for (const t of ln.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/)) {
        if (/^\*\*[^*]+\*\*$/.test(t)) { const b = document.createElement('b'); b.textContent = t.slice(2, -2); out.push(b); }
        else if (/^`[^`]+`$/.test(t)) { const c = document.createElement('code'); c.textContent = t.slice(1, -1); out.push(c); }
        else if (t) out.push(t);
      }
      if (i < all.length - 1) out.push('\n');
    });
  }
  return out;
}
// Hold a step half a second to copy its command and output (to paste it in a message from the phone), or a message of yours to copy all of it.
{ let timer = null, held = false;
  term.addEventListener('pointerdown', (e) => {
    const s = e.target.closest('.step, .prompt.cut'); held = false; if (!s) return;
    timer = setTimeout(async () => {
      timer = null; held = true; s.classList.add('copied'); setTimeout(() => s.classList.remove('copied'), 900); buzz([30]);
      try { await navigator.clipboard.writeText(s.copy || s.textContent); hint.textContent = 'copied'; }
      catch { const r = document.createRange(); r.selectNodeContents(s); getSelection().removeAllRanges(); getSelection().addRange(r); hint.textContent = 'selected'; }
      setTimeout(() => { if (!listening) hint.textContent = IDLE_HINT; }, 1500);
    }, 500);
  });
  const stop = () => { clearTimeout(timer); timer = null; };
  term.addEventListener('pointerup', stop); term.addEventListener('pointercancel', stop);
  term.addEventListener('pointermove', (e) => Math.abs(e.movementY) > 3 && stop()); // scrolling isn't holding
  // The tap that ends a long press doesn't also open or close the output under it.
  term.addEventListener('click', (e) => { if (held) { held = false; e.stopPropagation(); } }, true);
  term.addEventListener('click', (e) => e.target.closest('.sum')?.classList.toggle('open'));
}
// The open session tab's status, under the terminal: its mode, how full its context is, its model, working or idle.
const MODES = { acceptEdits: 'accept edits', plan: 'plan mode', auto: 'auto mode', bypassPermissions: 'bypass', dontAsk: "don't ask" };
function renderStatus() {
  const st = $('#status'), s = view !== 'all' && sessions.find((x) => x.id === view);
  st.classList.toggle('on', !!s); if (!s) return;
  const bits = [];
  if (MODES[s.mode]) bits.push(span(s.mode === 'plan' ? 'plan' : s.mode === 'acceptEdits' ? '' : 'auto', MODES[s.mode]));
  if (Number.isFinite(s.ctx)) bits.push(span(s.ctx >= 90 ? 'full' : s.ctx >= 70 ? 'hot' : '', `ctx ${s.ctx}%`));
  if (s.model) bits.push(span('', s.model.toLowerCase()));
  bits.push(span('', s.status === 'working' ? 'working' : s.status === 'waiting' ? 'waiting for you' : 'idle'));
  st.replaceChildren(...bits.flatMap((b, i) => (i ? [' · ', b] : [b])));
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
    if (needsYou(b)) { playTune('nudge'); buzz([60]); } else { unseen.add(b.session); if (b.speak) unheard.set(b.session, b.say || b.text); }
    return renderHud();
  }
  if (b.kind === 'permission' || b.kind === 'question') { playTune('needs'); buzz([80, 60, 80]); }
  else if (b.kind === 'levelup') { playTune('levelup'); setReact('happy', 2500); }
  else if (b.kind === 'done') { playTune('done'); setReact('happy'); }
  else if (b.kind === 'learned') { playTune('learned'); setReact('happy', 1200); }
  else if (b.kind === 'error') { playTune('error'); setReact('error'); }
  if (b.speak || (b.kind === 'done' && settings.speakDone)) speak(b.kind === 'permission' ? 'I need you. ' + (b.say || b.text) : b.kind === 'question' ? 'Question. ' + b.questions[0].question : b.say || b.text);
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
  if (b.kind !== 'question') elB.querySelector('.tag').textContent = (b.kind === 'reply' ? settings.name.toLowerCase() : b.to ? `${TAGS[b.kind]} · to ${b.to}` : TAGS[b.kind]) || '';
  elB.querySelector('.actions').style.display = b.actions ? 'flex' : 'none';
  elB.querySelector('.more').style.display = b.details ? '' : 'none';
  const det = elB.querySelector('.det'); det.textContent = b.details || ''; det.style.display = b.details && b.showDetails ? 'block' : 'none';
  // Cover screen: the project goes up in the tag and the bubble keeps only the gist ("$ npm test"), big enough to read.
  if (cover() && b.gist) { elB.querySelector('.tag').textContent = `${TAGS[b.kind]} · ${b.project}`; elB.querySelector('.text').textContent = b.gist; elB.dataset.key = ''; return; }
  if (b.kind !== 'question') {
    const t = b.text + (b.details && !b.actions && !b.showDetails ? ' ⋯' : ''), tEl = elB.querySelector('.text');
    const top = tEl.scrollTop, atEnd = top + tEl.clientHeight >= tEl.scrollHeight - 4;
    // Words Lax fixed (misheard → meant) are underlined while you talk and for a moment after, so you see it working.
    if (b.fixed?.length) tEl.innerHTML = marked(t, b.fixed); else tEl.textContent = t;
    // Long messages scroll. Talking at length, the newest words stay in sight unless you scrolled back to read;
    // anything else keeps where you scrolled to across the 1s refresh, and a new bubble starts at the top.
    const same = tEl.dataset.id === String(b.id); tEl.dataset.id = b.id;
    if (b.kind === 'listening') tEl.scrollTop = atEnd ? tEl.scrollHeight : top;
    else tEl.scrollTop = same ? top : 0;
    elB.dataset.key = ''; return;
  }
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
  // Nothing said to you lately: what the open session's assistant is doing ("Running the tests now."), if captions are on.
  if (!c && settings.captions && lastSay && now - lastSay.at < 8000) { hint.className = 'said'; hint.innerHTML = `<span class="cap">${esc(lastSay.text.split(/(?<=[.!?])\s/)[0])}</span>`; return; }
  if (!c) { if (was) hint.textContent = IDLE_HINT; return; }
  hint.className = 'said';
  hint.innerHTML = `<span class="cap"><span class="who">${esc(c.kind === 'reply' ? settings.name.toLowerCase() : TAGS[c.kind] || '')}</span>${esc(c.text.split(/(?<=[.!?])\s/)[0])}</span>`;
}
const marked = (t, words) => esc(t).replace(new RegExp(`(${words.map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g'), '<u>$1</u>');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let answerHook = null; // when set, the next thing heard answers the open question instead of going to /api/talk
function answerQuestion(b, answer) {
  const q = b.questions[b.qi];
  b.answers[q.question] = answer; b.picked = []; b.qi++;
  if (b.qi < b.questions.length) { elB.dataset.key = ''; renderBubble(); speak(b.questions[b.qi].question); return; }
  clearBubble(b.id); playTune('yes'); setReact('happy');
  if (!DEMO) api('/api/decide', { id: b.id, decision: 'answer', answers: b.answers });
}
setInterval(renderBubble, 1000);
// Reading a long bubble: scrolling it keeps it up a while longer, so it doesn't vanish mid-sentence.
// While Whisper's words wait to go, touching or scrolling holds them (hearing.read), so reading isn't a race.
const READ_MS = 3000;
let touching = false;
elB.querySelector('.text').addEventListener('scroll', () => {
  const b = bubbles.find((x) => x.id === elB.dataset.id); if (b?.expires) b.expires = Math.max(b.expires, performance.now() + 9000);
  hearing?.read?.(touching);
}, { passive: true });
elB.addEventListener('pointerdown', () => { touching = true; hearing?.read?.(true); });
for (const ev of ['pointerup', 'pointercancel']) elB.addEventListener(ev, () => { touching = false; hearing?.read?.(false); });
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
    clearBubble(id); playTune(decision === 'allow' ? 'yes' : 'no'); if (decision === 'allow') setReact('happy'); if (!DEMO) api('/api/decide', { id, decision }); }
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
// Off with "chiptune sounds" in settings (its voice is separate: "speaks out loud").
let ac;
const audio = () => { if (settings.sounds === false) return null; try { return (ac ||= new AudioContext()); } catch { return null; } };
// iOS leaves the sound suspended after a lock, a call or the app switcher (every tune is then dropped), and takes the
// screen's wake lock back, granting it again only from a touch. Both come back on the next touch (in capture: many
// handlers stop it there) and on coming back to the page.
let screenLock = null, keepAwake = false; // keepAwake: from the wake tap on
const unlock = async () => {
  if (ac && ac.state !== 'running') ac.resume().catch(() => {});
  if (keepAwake && (!screenLock || screenLock.released)) try { screenLock = await navigator.wakeLock?.request('screen'); } catch {}
};
for (const ev of ['touchend', 'click']) addEventListener(ev, unlock, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) unlock(); });
// Its tunes (chip.js): one per state, in its species' key, and a "done" jingle that grows with it.
const playTune = (name) => { const a = audio(); if (a) LaxChip.play(a, LaxChip.tune(name, pet)); };
function sfx(notes) {
  const ac = audio(); if (!ac) return;
  notes.forEach((f, i) => { const o = ac.createOscillator(), v = ac.createGain(), t0 = ac.currentTime + i * 0.07;
    o.type = 'square'; o.frequency.value = f; v.gain.setValueAtTime(0.06, t0); v.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    o.connect(v).connect(ac.destination); o.start(t0); o.stop(t0 + 0.09); });
}
let voice;
// Lax speaks in its language setting (English when it follows the phone, as before).
const speakLang = () => (settings.listen && settings.listen !== 'phone' ? settings.listen : 'en-US');
function pickVoice() {
  const vs = speechSynthesis.getVoices(), l = speakLang(), base = l.split('-')[0], tag = (v) => v.lang.replace('_', '-');
  voice = (base === 'en' && vs.find((v) => /^en/i.test(v.lang) && /female|samantha|google us/i.test(v.name)))
    || vs.find((v) => tag(v).toLowerCase() === l.toLowerCase()) || vs.find((v) => tag(v).toLowerCase().startsWith(base)) || vs[0];
}
if (!NATIVE && 'speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!text || !settings.voice) return;
  if (NATIVE) return NATIVE.speakIn ? NATIVE.speakIn(text, settings.pitch, speakLang()) : NATIVE.speak(text, settings.pitch);
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel(); if (!voice || !voice.lang.replace('_', '-').toLowerCase().startsWith(speakLang().split('-')[0])) pickVoice();
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
// Then, with Whisper up on the computer, Lax records you instead (the iPhone's Home Screen app has no recognition): the
// same audio the Android app sends, so nothing changes there. Not MediaRecorder: Safari only makes AAC, which it can't read.
const canRecord = !NATIVE && !!navigator.mediaDevices?.getUserMedia && !!window.AudioContext;
const recordsNow = () => voiceBroken && canRecord && whisperOn && !macAsleep;
let micAc = null, recording = null; // recording: while it records, { stop() → the audio }
let rec, said = '', heard = '', talkMode = 'tap', releasing = false, quietTimer = 0;
const QUIET_MS = 2000;
const hint = $('#hint');
let IDLE_HINT = 'tap Lax to talk'; // the character's name, from settings (updateHint)
// Where talking goes: a live Claude Code session (lax channel) or the background session.
function routeChannel() {
  return voiceTarget === 'background' ? null : channels.find((c) => c.cid === voiceTarget) || [...channels].sort((a, b) => b.active - a.active)[0] || null;
}
function setTarget(v) { voiceTarget = v; updateHint(); renderHud(); if (lifeEl.classList.contains('open')) renderLife(); if (!DEMO) api('/api/target', { target: v }); }
const UNPAIRED = STANDALONE ? 'not paired: tap to paste your link' : 'not paired: scan the QR on your computer\'s /pair page';
function updateHint() { IDLE_HINT = EGG ? UNPAIRED : macAsleep ? `zzz… ${settings.name.toLowerCase()} is asleep${relayHolds ? ', tap to leave a message' : ''}` : voiceBroken && !recordsNow() ? `tap ${settings.name} to type` : `tap or hold ${settings.name} to talk`; if (!listening) hint.textContent = IDLE_HINT; }
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
function startListening() { if (recording) finishListening(); else if (listening || hearing) cancelListening(); else beginListening('tap'); } // tap: talk / cancel (recording: send)
function beginListening(m) {
  if (macAsleep) diag('asleep-tap', { relayHolds, voiceBusy, voiceBroken, hearing: !!hearing });
  if (macAsleep && !relayHolds) { hop(0.5); showBubble({ id: 'asleep', kind: 'reply', text: 'Zzz… I\'m asleep right now. I\'ll wake up on my own.' }); probeRelay(); return; }
  if (voiceBusy && !answerHook) { showBubble({ id: 'busy', kind: 'reply', text: 'Still working on the last one…' }); return; }
  if (hearing) return;
  if (voiceBroken && !recordsNow()) return typeInstead();
  said = ''; heard = ''; releasing = false; talkMode = m; listening = true; playTune('listen');
  if (m === 'hold') buzz([30]);
  NATIVE ? NATIVE.hush() : speechSynthesis.cancel();
  if (voiceBroken) { diag('rec-' + m); startRecording(); return showHeard(); }
  diag('talk-' + m, { native: !!NATIVE }); showHeard(); listenStretch();
}
// Recording for Whisper. Started from the tap (a user gesture), so the AudioContext may start.
function startRecording() {
  micAc ||= new AudioContext(); micAc.resume().catch(() => {});
  const bufs = [], r = recording = { stop() { r.done = true; r.off?.(); return LaxHeard.pcm16k(bufs, micAc.sampleRate); } };
  setTimeout(() => recording === r && finishListening(), 60e3); // a mic left open goes by itself after a minute
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((st) => {
    if (r.done) return st.getTracks().forEach((t) => t.stop()); // sent or cancelled before the mic was ready
    const src = micAc.createMediaStreamSource(st), sp = micAc.createScriptProcessor(4096, 1, 1);
    sp.onaudioprocess = (e) => bufs.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(sp); sp.connect(micAc.destination); // WebKit only runs a processor that's connected; its output stays silent
    r.off = () => { sp.disconnect(); src.disconnect(); st.getTracks().forEach((t) => t.stop()); micAc.suspend().catch(() => {}); };
  }, (err) => {
    diag('gum-error', { name: err.name, msg: err.message });
    if (recording === r) failListening(err.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture');
  });
}
// What was recorded goes to Whisper on the computer; its words go like spoken ones (or answer the open question).
// Tap Lax or the bubble meanwhile to drop it.
function sendRecording() {
  const audio = recording.stop(), h = answerHook; answerHook = null; recording = null;
  stopListening(false);
  if (!audio) { showBubble({ id: 'mic', kind: 'error', text: micError('no-speech') }); if (h) renderBubble(); return; } // sent before the mic was ready
  sfx([330]);
  let dropped = false;
  hearing = () => { dropped = true; hearing = null; clearBubble('listen'); hint.textContent = IDLE_HINT; sfx([300, 200]); if (h) renderBubble(); };
  showBubble({ id: 'listen', kind: 'listening', text: '…' }); hint.textContent = 'writing it down… tap me to cancel';
  api('/api/hear', { audio, lang: listenLang(), phone: '' }).then((r) => r.ok && r.text, () => null).then((w) => {
    if (dropped) return;
    hearing = null; clearBubble('listen'); hint.textContent = IDLE_HINT;
    if (!w) { // offer typing instead
      showBubble({ id: 'mic', kind: 'error', text: 'Couldn\'t hear that. Is Whisper running on your computer (npm run whisper)?' });
      answerHook = h; return void setTimeout(typeInstead, 300);
    }
    const hw = LaxHeard.hear(w, vocab), t = punctuate(hw.text);
    diag('whisper', { phone: '', whisper: t.slice(0, 160) });
    h ? h(t) : send(t, hw);
  });
}
const raw = () => [said, heard].filter(Boolean).join(' ').trim();
const words = () => LaxHeard.hear(raw(), vocab).text; // what you said, spelled names joined and misheard ones fixed
function showHeard(outside = false) {
  hint.textContent = talkMode === 'hold' ? (outside ? 'let go to cancel' : 'let go to send · slide off to cancel') : recording ? 'tap me to send' : 'tap me to cancel';
  showBubble({ id: 'listen', kind: 'listening', text: recording ? (talkMode === 'hold' ? 'recording…' : 'recording… tap me to send') : words() || '…', fixed: LaxHeard.hear(raw(), vocab).fixed, to: talkingTo() });
}
// Lax listens in its own language (Life menu), not the phone's: a phone in pt-PT hearing English mishears a lot.
const listenLang = () => (settings.listen && settings.listen !== 'phone' ? settings.listen : navigator.language || 'en-US');
// One stretch of recognition (until the recognizer stops at a pause).
function listenStretch() {
  // The names you use go to the recognizer as hints (an older app only takes the language).
  const lang = listenLang();
  if (NATIVE) return NATIVE.listenFor ? NATIVE.listenFor(lang, JSON.stringify(vocab.words)) : NATIVE.listen(lang);
  rec = new SR(); rec.lang = lang; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 5;
  let text = '';
  rec.onspeechstart = speechBegan;
  // Of its guesses, the one with a name Lax knows.
  rec.onresult = (e) => { text = [...e.results].map((r) => LaxHeard.pick([...r].map((a) => a.transcript), vocab.words, vocab.heard)).join(''); partial(text); };
  rec.onerror = (e) => {
    diag('sr-error', { error: e.error, message: e.message });
    if (['aborted', 'no-speech'].includes(e.error)) return;
    failListening(e.error);
    // No recognition service at all: remember it and let you type this one right away.
    if (['network', 'service-not-allowed', 'language-not-supported'].includes(e.error)) { voiceBroken = true; updateHint();
      if (recordsNow()) showBubble({ id: 'mic', kind: 'reply', text: 'I\'ll record you instead. Tap me again.' }); else setTimeout(typeInstead, 300); }
  };
  rec.onend = () => stretchEnded(text);
  try { rec.start(); } catch (err) { diag('sr-start-throw', { msg: err.message }); failListening(err.message); }
}
// Tap mode sends once your words stop changing for QUIET_MS. Not "once the recognizer hears silence": in a noisy room it
// keeps hearing "speech" that never turns into words, and would wait forever (each stretch times out and starts over).
function armQuiet() { if (talkMode !== 'tap' || !words()) return; clearTimeout(quietTimer); quietTimer = setTimeout(finishListening, QUIET_MS); }
function speechBegan() { armQuiet(); } // talking again: a fresh countdown, so new words have time to arrive
function partial(text) {
  if (!listening || text === heard) return;
  if (LaxHeard.restarted(heard, text)) said = [said, heard].join(' ').trim(); // the recognizer started over: keep what came before
  heard = text; showHeard(); armQuiet();
}
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
  if (recording) { recording.stop(); recording = null; }
  else if (NATIVE) NATIVE.cancelListening(); else if (rec) { rec.onend = null; rec.onerror = null; try { rec.abort(); } catch {} }
  clearBubble('listen'); hint.textContent = IDLE_HINT;
}
// Speech comes without punctuation, so a question would reach Claude as a statement. Words that open a question get
// their "?" back. "Do"/"when"/"where" need more than the first word: "do the tests", "when you're done push" are orders.
const AUX = 'is|are|am|was|were|does|did|can|could|would|should|will|shall|has|have|had|may|might|isn\'t|aren\'t|wasn\'t|doesn\'t|didn\'t|don\'t|can\'t|won\'t|wouldn\'t|shouldn\'t|couldn\'t|haven\'t|hasn\'t';
const QUESTION = new RegExp(`^(?:(?:what|what's|whats|why|how|how's|who|who's|whose|which)\\b|(?:when|where)(?:'s| (?:${AUX}|do)\\b)|do (?:you|i|we|they)\\b|(?:${AUX}) (?:you|i|we|they|he|she|it|there|this|that|these|those|the|my|your|our|its|lax)\\b)`, 'i');
// Portuguese: question words at the start, or a tag at the end ("vamos experimentar viste"). "Quando"/"que"/"porque"
// need more: "quando acabares faz push" is an order, "que bom" a cheer, "porque não funcionava" an answer.
const PT_END = '(?![\\p{L}])';
const QUESTION_PT = new RegExp(`^(?:(?:o qu[eê]|quem|qual|quais|quant[oa]s?|como|onde|aonde|porqu[eê] é que|porquê|por que|será que|sabes|achas|podes|consegues|queres|estás|está tudo|tens a certeza)${PT_END}|quando (?:é|foi|vais|vamos|podes|chega)${PT_END}|que (?:tal|horas|dia|achas|é|foi|se passa)${PT_END})|(?:^|\\s)(?:viste|não é|percebeste|percebes|concordas|ou não)$`, 'iu');
const punctuate = (t) => !t || /[.!?…]$/.test(t) || !(QUESTION.test(t) || QUESTION_PT.test(t)) ? t : t + '?';
function finishListening() { // send what was heard
  if (!listening) return;
  if (recording) return sendRecording();
  const audio = NATIVE?.takeAudio ? NATIVE.takeAudio() : ''; // what the app recorded meanwhile, for Whisper
  const text = punctuate(words()), heard = LaxHeard.hear(raw(), vocab), h = answerHook; answerHook = null;
  stopListening(false);
  if (!text) { if (h) renderBubble(); return; }
  sfx([330]);
  const go = (t, hd) => (h ? h(t) : send(t, hd));
  if (!audio || !whisperOn || DEMO) return go(text, heard);
  // Whisper on the Mac writes it down again, better on names and Portuguese; the phone's words show meanwhile,
  // and go as they are if it fails or takes too long.
  // Tap Lax or the bubble (or swipe it) meanwhile to drop it. When Whisper's words differ, they show for a moment first.
  // Touching or scrolling the bubble to read it holds the countdown; it starts again a few seconds after you stop.
  let timer = 0, sent = false, whispered = false, then = null; // then: what goes once the countdown runs out
  let looked = false; // you touched the bubble: even the same words wait for you
  const end = () => { clearTimeout(timer); hearing = null; clearBubble('listen'); hint.textContent = IDLE_HINT; };
  const show = (t, fixed, note) => { showBubble({ id: 'listen', kind: 'listening', text: t, fixed }); hint.textContent = note; };
  const wait = (fn, ms) => { then = fn; clearTimeout(timer); if (!touching) timer = setTimeout(fn, ms); };
  hearing = () => { if (sent) return; sent = true; end(); sfx([300, 200]); if (h) renderBubble(); };
  // Still writing it down: Whisper's own wait runs on. Once its words are in, they wait for you to stop reading.
  hearing.read = (still) => { looked = true; if (!whispered) return; clearTimeout(timer); if (!still) timer = setTimeout(then, READ_MS); };
  const fire = (t, hd) => { if (sent) return; sent = true; end(); go(t, hd); };
  const done = (w) => {
    if (sent || whispered) return; whispered = true;
    const hw = w ? LaxHeard.hear(w, vocab) : heard, t = w ? punctuate(hw.text) || text : text;
    if (w) diag('whisper', { phone: text.slice(0, 160), whisper: t.slice(0, 160) });
    const same = LaxHeard.norm(t) === LaxHeard.norm(text);
    if (same && !looked) return fire(t, hw);
    if (!same) show(t, hw.fixed, 'tap me to cancel');
    wait(() => fire(t, hw), 1500);
  };
  show(text, heard.fixed, 'writing it down… tap me to cancel');
  timer = setTimeout(() => done(null), 10000);
  api('/api/hear', { audio, lang: listenLang(), phone: text }).then((r) => done(r.ok && r.text)).catch(() => done(null));
}
function cancelListening() {
  if (hearing) return hearing();
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
  if (recording) return finishListening();
  releasing = true; NATIVE ? NATIVE.stopListening() : rec?.stop();
  releaseTimer = setTimeout(finishListening, 1500); // in case the last words never come
}
// The app's speech recognizer calls these (LaxBridge.kt).
// alts: the recognizer's guesses, best first (a newer app); the one with a name Lax knows wins.
window.laxOnSpeech = (text, final, alts) => { if (!listening) return; if (alts?.length) text = LaxHeard.pick(alts, vocab.words, vocab.heard); final ? stretchEnded(text) : partial(text); };
window.laxOnSpeechBegin = () => { if (listening) speechBegan(); };
window.laxOnSpeaking = (on) => { speaking = !!on; }; // the app's TTS started or stopped: Lax's mouth moves
// Its mind on the website shows hearing and speaking for as long as they last: the Mac hears when each starts and stops.
const told = { listening: false, speaking: false };
if (!DEMO) setInterval(() => { for (const [k, v] of [['listening', listening], ['speaking', speaking]]) if (v !== told[k]) { told[k] = v; api('/api/voice-state', { [k]: v }).catch(() => {}); } }, 250);
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
// The open tab is who you're talking to (open phone or cover screen): a live session's tab is that session, Lax's own
// tab is Lax. Sent with every message, so a route left over from before (a reload, a session tapped yesterday) can't
// take your words elsewhere.
function tabTarget() {
  if (view === 'all') return 'background';
  const s = sessions.find((x) => x.id === view), ch = s && channels.find((c) => c.sessionPid && c.sessionPid === s.pid);
  return ch ? ch.cid : 'background';
}
// A session's tab you're talking to, by its label (null when it's Lax): shown while you talk, so a tab you didn't
// mean to be on is seen before you send.
function talkingTo() {
  if (tabTarget() === 'background') return null;
  return $('#chips').querySelector(`[data-view="${CSS.escape(view)}"]`)?.dataset.label || null;
}
// heard: set when it was dictated (LaxHeard.hear: the words Lax fixed, the names you spelled); typed text is sent as is.
function send(text, heard) {
  showBubble({ id: 'you' + Date.now(), kind: 'you', text: '“' + text + '”', fixed: heard?.fixed });
  if (DEMO) { voiceBusy = true; setTimeout(() => { voiceBusy = false; showBubble({ id: 'r' + Date.now(), kind: 'reply', text: 'Demo mode — I heard you!', speak: true }); }, 1800); return; }
  api('/api/talk', { text, voice: !!heard, spelled: heard?.spelled, target: tabTarget() }).then((r) => {
    if (r.queued) showBubble({ id: 'held', kind: 'reply', text: 'Your Mac is asleep. I\'ll pass it on when it wakes.', speak: true });
    else if (!r.ok) showBubble({ id: 'busy', kind: 'error', text: 'I\'m busy, try again in a sec.' }); })
    .catch(() => showBubble({ id: 'net', kind: 'error', text: 'Couldn\'t reach your Mac.' }));
}
const topEl = $('#top');
// Tap: talk (or cancel). Hold (350ms): listen until you let go; slide off before letting go to cancel.
{ let press = null;
  const inside = (e) => { const r = topEl.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  topEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#hud, #bubble') || wakeEl.isConnected || lifeEl.classList.contains('open')) return;
    if (EGG) { eggTapAt = performance.now(); return; }
    if (shell) eggTapAt = performance.now();
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
addEventListener('keydown', (e) => { if (e.code === 'Space' && !EGG && !e.repeat && !listening && e.target === document.body) { e.preventDefault(); beginListening('hold'); } });
addEventListener('keyup', (e) => { if (e.code === 'Space') releaseHold(true); });

// ---------- wake (audio unlock, fullscreen, keep screen on) ----------
const wakeEl = $('#wake');
// The app needs no wake tap: audio, full screen and keep-screen-on are native there.
if (qs.has('awake') || NATIVE) wakeEl.remove();
if (EGG && STANDALONE) wakeEl.firstElementChild.innerHTML = 'tap to pair<small>paste the link you copied in Safari</small>';
wakeEl.addEventListener('click', async () => {
  // The Home Screen app, unpaired: the link copied in Safari, pasted. Only a link to this same address, never elsewhere.
  if (EGG && STANDALONE) {
    const s = prompt('Paste your pairing link'); if (!s) return;
    try { const u = new URL(s.trim()); if (u.origin === location.origin && u.searchParams.get('t')) return void (location.href = u.href); } catch {}
    wakeEl.querySelector('small').textContent = 'that isn\'t this Lax\'s link. Copy it again in Safari';
    return;
  }
  wakeEl.remove(); if (shell) eggTapAt = performance.now(); else { sfx([523, 784]); hop(1.4); }
  try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch {}
  diag('wake');
  if (SR || canRecord) { // the mic is asked for once, here
    if (!navigator.mediaDevices) diag('gum-missing');
    else navigator.mediaDevices.getUserMedia({ audio: true })
      .then((st) => { diag('gum-ok', { tracks: st.getTracks().length }); st.getTracks().forEach((t) => t.stop()); })
      .catch((err) => { diag('gum-error', { name: err.name, msg: err.message });
        showBubble({ id: 'mic', kind: 'error', text: err.name === 'NotAllowedError' ? micError('not-allowed') : 'Mic: ' + err.name }); });
  }
  try { await document.documentElement.requestFullscreen?.(); } catch {}
  keepAwake = true; unlock(); // and again after every unlock of the phone (above)
});

// ---------- live link ----------
function applyState(s) { pet = s.pet; if (s.pet.hatched === false) shell = true; else if (shell && !hatchAt) hatch(); sessions = s.sessions; voiceBusy = s.voiceBusy; thinking = !!s.thinking; channels = s.channels || []; voiceTarget = s.voiceTarget || 'auto'; usage = s.usage || null; budget = s.budget || null; if (s.vocab) vocab = s.vocab; whisperOn = !!s.whisper; if (s.ways !== undefined) gotWays(s.ways); updateHint(); if (s.settings) settings = s.settings; applyLook(); renderHud(); if (lifeEl.classList.contains('open')) renderLife(); }
// Remember how Lax looks, so the app's offline page can show the same Lax asleep. In the browser, the last state and
// the last 150 lines, so a reload while the Mac can't answer (the page then comes from sw.js) shows the same.
const remember = () => { try { NATIVE?.remember(JSON.stringify({ pet, settings })); } catch {} };
const KEPT = 150;
let lastState = null, keptFeed = [], keepTimer = 0;
try { lastState = JSON.parse(localStorage.lax_last || 'null'); keptFeed = JSON.parse(localStorage.lax_feed || '[]'); } catch {}
function keep(st, f) {
  if (NATIVE || DEMO) return;
  if (st) lastState = { ...st, voiceBusy: false, thinking: false };
  if (f) { keptFeed.push({ ...f, line: String(f.line || '').slice(0, 2000) }); keptFeed.splice(0, keptFeed.length - KEPT); }
  clearTimeout(keepTimer); keepTimer = setTimeout(() => { try { localStorage.lax_last = JSON.stringify(lastState); localStorage.lax_feed = JSON.stringify(keptFeed); } catch {} }, 1000);
}
// Never linked since this page loaded, and the Mac can't answer: show what was kept, until the Mac's own lines replace it.
let showingKept = false;
function showKept() {
  if (showingKept || linkedOnce || (!lastState && !keptFeed.length)) return;
  showingKept = true;
  if (lastState) applyState(lastState);
  for (const f of keptFeed) feed(f.line, f.kind, f.project, f.session, f);
}
// Asked again on every retry: right as the Mac goes, the relay may not know yet, and the first answer can be wrong.
const probeRelay = () => getJson('/api/memory')
  .then((j) => { probeThrew = 0; relayHolds = j.error === 'Mac asleep'; diag('probe', { holds: relayHolds, error: j.error }); updateHint(); },
    (e) => { relayHolds = false; probeThrew++; diag('probe', { holds: false, threw: String(e).slice(0, 80) }); updateHint(); });
let probeThrew = 0; // in a row: the relay itself didn't answer
function setAsleep(v) { if (macAsleep === v) return; macAsleep = v; updateHint(); }
// ---------- the other way in (lib/ways.mjs) ----------
// The Mac says which ways reach it (the tunnel, the relay) and which you chose. When the stream keeps failing here and
// the other way works, the page moves there; once the one you chose works again (the Mac says so), back. Never twice
// within 3 minutes, so a bad minute can't bounce it.
let ways = null; try { ways = JSON.parse(localStorage.lax_ways || 'null'); } catch {}
const movedAt = Number(qs.get('moved')) || 0;
let fellBack = !!movedAt; try { if (movedAt) localStorage.lax_fellback = '1'; else fellBack = localStorage.lax_fellback === '1'; } catch {}
let fails = 0, moving = false;
const wayHere = () => ['tunnel', 'relay'].find((k) => ways?.[k] && new URL(ways[k].url).origin === location.origin) || null;
function gotWays(w) {
  ways = w; try { localStorage.lax_ways = JSON.stringify(w); } catch {}
  const here = wayHere();
  if (w && fellBack && here && here !== w.prefer && w[w.prefer]?.up && Date.now() - movedAt > 3 * 6e4) {
    try { delete localStorage.lax_fellback; } catch {} fellBack = false;
    moveTo(w.prefer, `the ${w.prefer} works again`, true);
  }
}
function moveTo(k, why, back) {
  if (moving || DEMO || NATIVE || STANDALONE) return; moving = true; // the Home Screen app would open it in Safari, without its storage
  feed(`> ${why}, moving to the ${k}`, 'session', undefined, '*'); diag('move', { to: k, why });
  setTimeout(() => location.replace(`${ways[k].url}/?t=${encodeURIComponent(TOKEN)}${back ? '' : '&moved=' + Date.now()}${SEAL_K ? '#k=' + SEAL_K : ''}`), 1500); // the key too: each way's page keeps its own
}
setInterval(() => { if (fellBack && ways && !macAsleep) gotWays(ways); }, 30e3); // the Mac only says when something changes
async function otherWay() {
  const here = wayHere(); if (!here || fails < 2 || Date.now() - movedAt < 3 * 6e4) return;
  if (here === 'tunnel' && ways.relay) { // the relay can say whether the Mac is there
    try { const j = await fetch(`${ways.relay.url}/_relay/up?t=${encodeURIComponent(TOKEN)}`).then((r) => r.json()); if (j.mac) moveTo('relay', 'the tunnel isn\'t answering'); } catch {}
  } else if (here === 'relay' && ways.tunnel && probeThrew >= 2 && navigator.onLine) moveTo('tunnel', 'the relay isn\'t answering');
}
// The first link asks the Mac for its recent lines, so a fresh page (the app moving to the cover screen, a reload)
// still shows the conversation. Relinks don't: the page already has them.
let linkedOnce = false;
let es = null, hiddenAt = 0, shownAt = 0; // the live link; when the page was last hidden and shown (below)
if (DEMO) demo();
else if (ASLEEP) asleep();
else if (!TOKEN) feed(UNPAIRED, 'error', undefined, '*');
else { connect(); if (!NATIVE && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch((e) => diag('sw-error', { msg: String(e).slice(0, 120) })); }
// iOS suspends a page in the background and drops its link. Back after a while: a new link, with the lines missed meanwhile
// (they replace what's shown, like a fresh page), and the errors right as it comes back aren't the computer asleep.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  shownAt = Date.now();
  if (TOKEN && !DEMO && !ASLEEP && es && ((hiddenAt && Date.now() - hiddenAt > 10e3) || es.readyState === EventSource.CLOSED)) { showingKept = true; linkedOnce = false; connect(); }
  hiddenAt = 0;
});
function connect() {
  es?.close();
  const me = es = new EventSource('/api/stream?t=' + encodeURIComponent(TOKEN) + (linkedOnce ? '' : '&backlog=150') + (SEAL ? '&seal=1' : ''));
  // Sealed events open asynchronously: one after another, so they're handled in the order they came. A link that was
  // replaced (above) says nothing more.
  let order = Promise.resolve();
  const on = es.addEventListener.bind(es);
  es.addEventListener = (name, fn) => on(name, (e) => { if (me !== es) return; order = order.then(async () => fn({ data: e.data && JSON.stringify(await opened(JSON.parse(e.data))) })).catch((err) => diag('sealed-event', { name, msg: String(err).slice(0, 120) })); });
  es.addEventListener('state', (e) => { const st = JSON.parse(e.data); applyState(st); remember(); keep(st); });
  es.addEventListener('feed', (e) => { const f = JSON.parse(e.data); feed(f.line, f.kind, f.project, f.session, f); keep(null, f); });
  es.addEventListener('bubble', (e) => showBubble(JSON.parse(e.data)));
  es.addEventListener('clear', (e) => clearBubble(JSON.parse(e.data).id));
  es.addEventListener('tab', (e) => { const v = JSON.parse(e.data).view, chip = $('#chips').querySelector(`[data-view="${CSS.escape(v)}"]`); if (chip) goTab(chip); });
  es.addEventListener('reborn', () => { [...term.children].slice(0, -1).forEach((d) => d.remove()); where.clear(); parts.length = 0; hop(1.8);
    showBubble({ id: 'born', kind: 'reply', text: `Hi! I'm ${settings.name}. Nice to meet you.`, speak: true }); });
  es.addEventListener('sleeping', () => { feed(`${settings.name.toLowerCase()} fell asleep. zzz…`, 'session', undefined, '*'); setAsleep(true); probeRelay(); }); // the Mac said so first (lib/power.mjs)
  es.addEventListener('react', (e) => { const r = JSON.parse(e.data); if (r.state === 'thinking') voiceBusy = true; else setReact(r.state); });
  es.onopen = () => {
    if (me !== es) return;
    if (showingKept) { showingKept = false; [...term.children].slice(0, -1).forEach((d) => d.remove()); where.clear(); parts.length = 0; keptFeed = []; } // the Mac's backlog follows
    linkedOnce = true; fails = 0; if (macAsleep) { setAsleep(false); hop(1.4); } if (diagLater.length) diag('while-asleep', { events: diagLater.splice(0) }); feed('linked to mac ✓', 'session', undefined, '*'); };
  es.onerror = () => {
    if (me !== es) return;
    // The background dropped it: relinked when it's back (above), or here if it's closed for good.
    if (document.hidden || Date.now() - shownAt < 3000) { if (me.readyState === EventSource.CLOSED) setTimeout(() => me === es && connect(), 10000); return; }
    if (!macAsleep) feed(`${settings.name.toLowerCase()} fell asleep. zzz…`, 'session', undefined, '*');
    setAsleep(true); showKept(); fails++; setTimeout(otherWay, 3000); // after the probe below has answered
    // Cloudflare answers for a sleeping Mac with an error page, which ends EventSource for good: retry by hand.
    probeRelay();
    if (me.readyState === EventSource.CLOSED) setTimeout(() => me === es && connect(), 10000);
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
  pet = { name: 'Lax', level: 7, stage: 'cube', traits: ['headband'], mood: 'happy', xp: 400, prevXp: 360, nextXp: 490, streak: 4,
    species: { id: 'plain', name: 'plain', color: '#D97757' }, look: { form: null, color: '#D97757', lift: 0 } };
  sessions = [{ id: 'd1', project: 'api', where: 'mac', status: 'working', mode: 'acceptEdits', ctx: 41, model: 'Opus 5.5' }, { id: 'd2', project: 'web', where: 'cli', status: 'done' }];
  settings = { ...settings, captions: true }; view = 'd1'; applyLook(); renderHud(); // the api tab is open, so its feed shows
  setTimeout(() => showBubble({ id: 'hi', kind: 'reply', text: 'Hi, I\'m Lax. Tap me and talk.' }), 400);
  const steps = [
    () => feed('> fix the flaky auth test', 'prompt', 'api', 'd1'),
    () => feed('● Let me find where the token gets refreshed.', 'say', 'api', 'd1', { text: 'Let me find where the token gets refreshed.' }),
    () => feed('Read auth.test.ts', 'tool', 'api', 'd1', { tool: 'Read' }) || feed('Grep "refreshToken"', 'tool', 'api', 'd1', { tool: 'Grep' }),
    () => feed('Read auth.ts', 'tool', 'api', 'd1', { tool: 'Read' }),
    () => feed('$ npm test -- auth', 'tool', 'api', 'd1', { tool: 'Bash', desc: 'Run the auth tests', cmd: 'npm test -- auth --reporter=dot' }),
    () => { feed('  ✗ Bash failed', 'error', 'api', 'd1'); feed('', 'out', 'api', 'd1', { out: ['FAIL auth.test.ts', '  refresh › keeps the session when two tabs refresh at once', '    expected 200, got 401', '    at auth.test.ts:88:14', 'Tests: 1 failed, 41 passed'], total: 5 }); setReact('error'); },
    () => feed('● Two refreshes race: the second uses a token the first just revoked. One shared refresh fixes it.', 'say', 'api', 'd1', { text: 'Two refreshes race: the second uses a token the first just revoked. One shared refresh fixes it.' }),
    () => { feed('Edit auth.ts', 'tool', 'api', 'd1', { tool: 'Edit', file: 'auth.ts' }); feed('  +3 -1', 'diff', 'api', 'd1', { diff: { add: 3, del: 1, lines: ['- const t = await refresh(old);', '+ inflight ??= refresh(old).finally(() => (inflight = null));', '+ const t = await inflight;', '+ // two tabs, one refresh'] } }); },
    () => showBubble({ id: 'perm', kind: 'permission', project: 'api', gist: '$ rm -rf dist && npm run build', text: 'api wants to: $ rm -rf dist && npm run build', actions: true }),
    () => {}, () => {}, () => clearBubble('perm') || feed('  ✓ approved from phone', 'done', 'api', 'd1'),
    () => feed('$ npm run build', 'tool', 'api', 'd1', { tool: 'Bash', desc: 'Clean build', cmd: 'rm -rf dist && npm run build' }),
    () => feed('✓ api: Fixed the race in token refresh; all 42 tests pass.', 'done', 'api', 'd1', { text: 'Fixed the **race in token refresh**: both tabs now share one `refresh()` call. All 42 tests pass.' }) || showBubble({ id: 'd', kind: 'done', text: 'api: Fixed the race in token refresh; all 42 tests pass.' }),
    () => showBubble({ id: 'lv', kind: 'levelup', text: 'Lax reached level 8!' }),
    () => {}, () => { voiceBusy = true; }, () => {}, () => { voiceBusy = false; pet = { ...pet, mood: 'sleepy' }; },
    () => {}, () => { pet = { ...pet, mood: 'happy', traits: ['headband', 'goggles', 'flame'] }; },
  ];
  let i = 0; setInterval(() => steps[i++ % steps.length](), 1300);
}

// ---------- life menu ----------
const lifeEl = $('#life');
let memory = null, knows = null;
// Long lists show the newest few; "show all" opens the rest (closed again each time the menu opens).
const FEW = 5, showAll = { miles: false, episodes: false };
const moreRow = (k, n) => n > FEW ? `<li class="more" data-more="${k}">${showAll[k] ? 'show fewer' : `show all ${n}`}</li>` : '';
function saveSettings(patch) {
  settings = { ...settings, ...patch }; applyLook(); renderLife();
  if (!DEMO) api('/api/settings', patch);
}
async function openLife() {
  lifeEl.classList.add('open'); showAll.miles = showAll.episodes = false; renderLife();
  if (!DEMO) { try { memory = await getJson('/api/memory'); } catch {} renderLife(); loadKnows(); }
}
// What Lax knows: its skills (a draft waits for your yes, with its whole text) and its newest episodes. Forget = two taps.
async function loadKnows() { try { knows = await getJson('/api/knows'); } catch {} renderKnows(); }
const SKILL_STATE = { new: 'draft', later: 'draft', proposed: 'asking you', installed: '' };
function renderKnows() {
  const k = knows;
  $('#knowsCount').textContent = k ? `${k.notes.projects} project${k.notes.projects === 1 ? '' : 's'} · ${k.notes.you} about you · ${k.episodes.total} episode${k.episodes.total === 1 ? '' : 's'}` : '';
  $('#skills').innerHTML = !k ? '<div class="none">…</div>' : !k.skills.length ? '<div class="none">none yet: a workflow you repeat becomes one</div>'
    : k.skills.map((s) => `<div class="sk" data-skill="${esc(s.name)}"><b>${esc(s.status === 'installed' ? 'lax-' + s.name : s.name)}</b><span class="st">${SKILL_STATE[s.status] ?? ''}</span>`
      + `<p>${esc(s.description || '')}</p>${s.text ? `<pre hidden>${esc(s.text)}</pre>` : ''}<div class="knows-act">`
      + (s.status === 'installed' ? '<button data-do="forget">forget</button>'
        : '<button data-do="read">read it</button><button class="yes" data-do="install">install</button><button data-do="decline">no</button>')
      + '</div></div>').join('');
  // Roles: what it has become (lib/roles.mjs). A draft waits for your yes, with its practice to read.
  const roles = k?.roles || [];
  $('#roles').innerHTML = !k ? '<div class="none">…</div>' : !roles.length ? '<div class="none">none yet: a kind of work it keeps doing for you becomes one</div>'
    : roles.map((r) => `<div class="sk" data-role="${esc(r.name)}"><b>${esc(r.name)}</b><span class="st">${SKILL_STATE[r.status] ?? ''}</span>`
      + `<p>${r.work} piece${r.work === 1 ? '' : 's'} of work${r.projects.length ? ' · ' + esc(r.projects.join(', ')) : ''}${r.last ? ' · last ' + esc(r.last) : ''}</p>`
      + `<pre hidden>${esc(r.practice || '')}</pre><div class="knows-act"><button data-do="read">how it works</button>`
      + (r.status === 'active' ? '<button data-do="forget">forget</button>' : '<button class="yes" data-do="take">take it on</button><button data-do="decline">no</button>')
      + '</div></div>').join('');
  $('#episodes').innerHTML = !k ? '<li class="none">…</li>' : !k.episodes.list.length ? '<li class="none">none yet: kept after each work session</li>'
    : k.episodes.list.slice(0, showAll.episodes ? k.episodes.list.length : FEW).map((e) => `<li data-ep="${esc(e.file)}"><span><i>${esc((e.when || '').slice(0, 10))} ${esc(e.where)}</i> ${esc(e.title)}</span><button>forget</button></li>`).join('')
      + moreRow('episodes', k.episodes.list.length);
}
// Forgetting asks twice: the first tap turns the button into "sure?".
const sure = (btn) => { if (btn.classList.contains('sure')) return true; btn.classList.add('sure'); btn.textContent = 'sure?';
  setTimeout(() => { btn.classList.remove('sure'); btn.textContent = 'forget'; }, 3000); return false; };
$('#skills').addEventListener('click', async (e) => {
  const btn = e.target.closest('button'), row = e.target.closest('[data-skill]'); if (!btn || !row) return;
  const name = row.dataset.skill, what = btn.dataset.do;
  if (what === 'read') { const pre = row.querySelector('pre'); pre.hidden = !pre.hidden; btn.textContent = pre.hidden ? 'read it' : 'hide'; return; }
  if (what === 'forget' && !sure(btn)) return;
  if (DEMO) return;
  const r = await api('/api/knows', { skill: name, do: what });
  if (r.ok && what === 'install') { playTune('learned'); setReact('happy', 1200); }
  loadKnows();
});
$('#roles').addEventListener('click', async (e) => {
  const btn = e.target.closest('button'), row = e.target.closest('[data-role]'); if (!btn || !row) return;
  const what = btn.dataset.do;
  if (what === 'read') { const pre = row.querySelector('pre'); pre.hidden = !pre.hidden; btn.textContent = pre.hidden ? 'how it works' : 'hide'; return; }
  if (what === 'forget' && !sure(btn)) return;
  if (DEMO) return;
  const r = await api('/api/knows', { role: row.dataset.role, do: what });
  if (r.ok && what === 'take') { playTune('learned'); setReact('happy', 1200); }
  loadKnows();
});
lifeEl.addEventListener('click', (e) => { const m = e.target.closest('[data-more]'); if (!m) return;
  showAll[m.dataset.more] = !showAll[m.dataset.more]; m.dataset.more === 'miles' ? renderLife() : renderKnows(); });
$('#episodes').addEventListener('click', async (e) => {
  const btn = e.target.closest('button'), li = e.target.closest('[data-ep]'); if (!btn || !li || !sure(btn) || DEMO) return;
  await api('/api/knows', { episode: li.dataset.ep }); loadKnows();
});
function renderLife() {
  $('#sRoute').innerHTML = [['background', 'assistant'], ...channels.map((c) => [c.cid, c.project])]
    .map(([v, l]) => `<button data-v="${esc(v)}" class="${v === voiceTarget ? 'on' : ''}">${esc(l)}</button>`).join('');
  $('#sName').value !== settings.name && document.activeElement !== $('#sName') && ($('#sName').value = settings.name);
  $('#sPitch').value = settings.pitch;
  renderSpecies();
  // Traits it earned, each one yours to switch off (it keeps earning it; you just don't see it).
  $('#sTraits').innerHTML = (pet.traits || []).map((t) => `<label>${t} <button class="tog${wears(t) ? ' on' : ''}" data-t="${t}"></button></label>`).join('')
    || `<label><span style="color:var(--dim)">none yet${pet.level < 10 ? ' (from level 10)' : ''}</span></label>`;
  lifeEl.querySelectorAll('.tog[data-k]').forEach((t) => t.classList.toggle('on', !!settings[t.dataset.k]));
  $('#sWait').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === settings.askTimeout));
  $('#sListen').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === (settings.listen || 'phone')));
  $('#sBudget').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === (settings.budget || 'light')));
  $('#sTheme').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === (settings.theme || 'system')));
  const raw = memory?.raw || {}, p = memory?.pet || pet;
  const days = p.born ? Math.max(0, Math.floor((Date.now() - p.born) / 864e5)) : 0;
  $('#stats').innerHTML = [['level', p.level], ['stage', p.stage], ['xp', p.xp], ['streak', (p.streak || 0) + 'd'], ['age', days + 'd'], ['mood', p.mood],
    ['turns', raw.turns ?? '–'], ['approved', raw.approvals ?? '–'], ['errors', raw.errors ?? '–'], ['voice', memory?.voiceProject ?? '–'],
    ['traits', (p.traits || []).join(', ') || 'none yet']].map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
  // Tools as the traits count them (this week, Bash a tenth): each trait's tools added up, the one it wears in full colour.
  // Headband, glasses and monocle compete (the biggest wins, from 30); antenna and cape come on top.
  const tally = p.traitTally || [], max = Math.max(1, ...tally.map((r) => r.n));
  $('#tools').innerHTML = tally.length ? tally.map((r) => `<div class="bar${r.worn ? ' worn' : ''}"><span>${esc(r.tools)} <em>${r.trait}${r.worn ? ' (worn)' : ''}</em></span>`
    + `<div class="track"><i style="width:${Math.round(100 * r.n / max)}%"></i></div><b>${r.n}/${r.need}</b></div>`).join('') : '<div class="bar"><span>nothing this week</span></div>';
  // Claude plan usage, from the status line of your terminal sessions (hooks/lax-status.mjs).
  const resets = (ms) => { if (!ms) return ''; const d = new Date(ms), hm = d.toTimeString().slice(0, 5);
    return d - Date.now() < 864e5 ? hm : d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + hm; };
  const win = [['five_hour', '5 hours'], ['seven_day', 'week']].filter(([k]) => usage?.[k]);
  $('#usage').innerHTML = win.length ? win.map(([k, l]) => { const w = usage[k], hot = w.pct >= 80;
    return `<div class="bar"><span>${l}${w.resets ? ' · ' + resets(w.resets) : ''}</span><div class="track"><i style="width:${w.pct}%${hot ? ';background:var(--red)' : ''}"></i></div><b>${w.pct}%</b></div>`; }).join('')
    : '<div class="bar"><span>shows once a terminal session runs</span></div>';
  $('#usageAge').textContent = usage?.ts ? `${Math.round((Date.now() - usage.ts) / 60000)} min ago` : '';
  // What Lax spent by itself today (lib/budget.mjs), and why its own work waits, if it does.
  $('#budget').innerHTML = budget ? `<div class="bar"><span>${esc(settings.name)}'s own work today${budget.paused ? ` · waits: ${esc(budget.paused)}` : ''}</span>`
    + `<div class="track"><i style="width:${Math.min(100, Math.round(100 * budget.own / budget.cap))}%"></i></div><b>${budget.own}/${budget.cap}</b></div>` : '';
  const miles = memory?.milestones || [];
  $('#miles').innerHTML = (miles.slice(0, showAll.miles ? miles.length : FEW).map((m) => `<li>${new Date(m.ts).toLocaleDateString()} ${m.text.replace(/</g, '&lt;')}</li>`).join('') || '<li>…</li>') + moreRow('miles', miles.length);
}
// Species: what it hatched as, and while the bars get tuned, a hand pick.
function renderSpecies() {
  const sp = pet.species;
  const head = pet.egg ? `an egg: ${pet.egg.pct}%${pet.egg.lead ? ', ' + (pet.choices || []).find((c) => c.id === pet.egg.lead)?.name + ' leads' : ''}`
    : sp ? sp.name + (pet.picked ? ' (picked)' : '') : '–';
  $('#species').innerHTML = `<div class="name"><i style="background:${pet.look?.color || 'var(--coral)'}"></i>${esc(head)}</div>`;
  $('#sPick').style.display = pet.egg ? 'none' : '';
  const o = settings.speciesOverride || {}, on = settings.speciesPick && !pet.egg;
  $('#swatches').style.display = on ? '' : 'none';
  if (!on) return;
  const cur = o.id || sp?.id;
  $('#swatches').innerHTML = `<div class="row">${(pet.choices || []).map((c) => `<button style="background:${c.color}" data-s="${c.id}" title="${esc(c.name)}" class="${c.id === cur ? 'on' : ''}"></button>`).join('')}`
    + `<input type="color" id="sColor" value="${cur === 'plain' && o.color || '#3fb8b0'}" title="no species, just a colour" class="${cur === 'plain' ? 'on' : ''}"></div>`
    + (cur === 'fox' ? `<div class="seg">${[{ id: '', name: 'auto' }, ...(pet.branches || [])].map((b) => `<button data-b="${b.id}" class="${(o.branch || '') === b.id ? 'on' : ''}">${esc(b.name)}</button>`).join('')}</div>` : '')
    + (cur === 'pink' ? `<div class="seg"><button data-r="0" class="${o.rare ? '' : 'on'}">copier</button><button data-r="1" class="${o.rare ? 'on' : ''}">rare</button></div>` : '')
    + `<small>${cur === 'plain' ? 'no species: a plain Lax in your colour' : cur === 'fox' || cur === 'pink' ? 'branch and rare show from level 50' : 'its form at your level'}</small>`;
}
$('#nameBtn').addEventListener('click', (e) => { e.stopPropagation(); openLife(); });
lifeEl.addEventListener('pointerdown', (e) => e.stopPropagation());
$('#lifeClose').addEventListener('click', () => lifeEl.classList.remove('open'));
$('#sName').addEventListener('change', (e) => e.target.value.trim() && saveSettings({ name: e.target.value.trim().slice(0, 12) }));
$('#sPitch').addEventListener('change', (e) => { saveSettings({ pitch: +e.target.value }); speak('Is this my voice?'); });
$('#swatches').addEventListener('click', (e) => {
  const d = e.target.closest('button')?.dataset; if (!d) return;
  const o = settings.speciesOverride || { id: pet.species?.id || 'fox', branch: null, rare: false };
  if (d.s) saveSettings({ speciesOverride: { ...o, id: d.s } });
  if (d.b !== undefined) saveSettings({ speciesOverride: { ...o, branch: d.b || null } });
  if (d.r !== undefined) saveSettings({ speciesOverride: { ...o, rare: d.r === '1' } });
  hop(1);
});
// No species at all: a plain Lax in a colour of your own (the rainbow swatch).
$('#swatches').addEventListener('change', (e) => { if (e.target.id === 'sColor') { saveSettings({ speciesOverride: { id: 'plain', color: e.target.value, branch: null, rare: false } }); hop(1); } });
lifeEl.querySelectorAll('.tog[data-k]').forEach((t) => t.addEventListener('click', () => saveSettings({ [t.dataset.k]: !settings[t.dataset.k] })));
$('#sTraits').addEventListener('click', (e) => { const t = e.target.dataset.t; if (!t) return;
  const off = settings.hideTraits || []; saveSettings({ hideTraits: off.includes(t) ? off.filter((x) => x !== t) : [...off, t] }); });
$('#wipeKnows').addEventListener('click', (e) => e.currentTarget.classList.toggle('on')); // not a setting: only for this rebirth
$('#sWait').addEventListener('click', (e) => e.target.dataset.v && saveSettings({ askTimeout: +e.target.dataset.v }));
$('#sListen').addEventListener('click', (e) => e.target.dataset.v && saveSettings({ listen: e.target.dataset.v }));
$('#sBudget').addEventListener('click', (e) => e.target.dataset.v && saveSettings({ budget: e.target.dataset.v }));
// A share card (/api/card, lib/card.mjs): made now, frozen, then to the share sheet (the app's, or the browser's); the link
// stays here to copy.
$('#sCard').addEventListener('click', async (e) => {
  if (e.target.id === 'sLapse') return timelapse(e.target);
  const b = $('#sCard button'), say = $('#cardSays'); if (DEMO || b.disabled) return;
  b.disabled = true; say.textContent = 'making it…';
  try {
    const r = await api('/api/card'); if (!r?.url) throw new Error(r?.error || 'no card');
    say.innerHTML = `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a>`;
    if (NATIVE?.share) NATIVE.share(r.url); else navigator.share?.({ url: r.url }).catch(() => {});
  } catch (e) { say.textContent = `couldn't: ${e.message || e}`; }
  b.disabled = false;
});
// Its timelapse (/api/timelapse, lib/timelapse.mjs): from its egg to today, made now, shown here, then to the share
// sheet as a file (the app's; the browser's where it takes files, or saved from the link).
async function timelapse(b) {
  const say = $('#cardSays'); if (DEMO || b.disabled) return;
  b.disabled = true; say.textContent = 'making it…';
  try {
    const r = await api('/api/timelapse'); if (!r?.gif) throw new Error(r?.error || 'no timelapse');
    const name = 'lax-timelapse.gif', bytes = Uint8Array.from(atob(r.gif), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    say.innerHTML = `<img src="${url}" alt="${esc(settings.name)}'s timelapse"><a href="${url}" download="${name}">save it</a>`;
    const file = new File([bytes], name, { type: 'image/gif' });
    if (NATIVE?.shareFile) NATIVE.shareFile(r.gif, 'image/gif', name);
    else if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file] }).catch(() => {});
  } catch (e) { say.textContent = `couldn't: ${e.message || e}`; }
  b.disabled = false;
}
$('#sTheme').addEventListener('click', (e) => e.target.dataset.v && saveSettings({ theme: e.target.dataset.v }));
// iPhone, in Safari: the Home Screen app has storage of its own, so it needs the pairing link (the token and the key) too.
// Copied here (a tap, so the clipboard is allowed), pasted there on its first tap.
$('#homeApp').hidden = !IOS || !!NATIVE || STANDALONE || DEMO || !TOKEN;
$('#sHome').addEventListener('click', async () => {
  const link = `${location.origin}/index.html?t=${encodeURIComponent(TOKEN)}${SEAL_K ? '#k=' + SEAL_K : ''}`;
  try { await navigator.clipboard.writeText(link); $('#homeSays').textContent = 'copied: open Lax from your Home Screen and paste it'; }
  catch { prompt('Copy this link, then open Lax from your Home Screen and paste it', link); }
});
// Rebirth needs a 2-second hold so it can't happen by accident.
{ const btn = $('#rebirth'), fill = btn.querySelector('i'); let t0, raf;
  const tick = () => { const k = Math.min(1, (performance.now() - t0) / 2000); fill.style.width = k * 100 + '%';
    if (k < 1) raf = requestAnimationFrame(tick); else { cancel(); lifeEl.classList.remove('open'); if (DEMO) location.reload(); else api('/api/rebirth', { knowledge: $('#wipeKnows').classList.contains('on') }); $('#wipeKnows').classList.remove('on'); } };
  const cancel = () => { cancelAnimationFrame(raf); fill.style.width = 0; };
  btn.addEventListener('pointerdown', () => { t0 = performance.now(); tick(); });
  btn.addEventListener('pointerup', cancel); btn.addEventListener('pointerleave', cancel); }
applyLook(); fit();

// Picking where talking goes in Lax's life opens that tab: the open tab is where your words go.
$('#sRoute').addEventListener('click', (e) => {
  const v = e.target.dataset.v; if (!v) return;
  const chip = $('#chips').querySelector(v === 'background' ? '[data-view="all"]' : `[data-cid="${CSS.escape(v)}"]`);
  if (chip) chip.click(); else setTarget(v);
});
$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('span'); if (!chip) return;
  const missed = unheard.get(chip.dataset.view); unheard.delete(chip.dataset.view);
  setView(chip.dataset.view); sfx([660, 880]); hop(0.8);
  if (missed && !goingTab) speak(missed);
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
  const missed = unheard.get(next.dataset.view);
  goingTab = true; try { next.click(); } finally { goingTab = false; }
  const who = next.dataset.view === 'all' ? settings.name : next.dataset.label.split('·')[0].replace(/-/g, ' ');
  if (next.dataset.view !== 'all' && !next.dataset.cid) showBubble({ id: 'notlive', kind: 'reply', text: `${next.dataset.label} can't hear me. I'll answer.` }); // fits the strip
  speak((next.dataset.view === 'all' || next.dataset.cid ? who : `${who}. It can't hear me, so I'll answer.`) + (missed ? `. ${missed}` : ''));
}
