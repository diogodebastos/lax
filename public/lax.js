// Lax's body: pixel avatar, speech bubble, terminal feed, voice in/out.
'use strict';

// ---------- setup ----------
const qs = new URLSearchParams(location.search);
let TOKEN = qs.get('t');
try { if (TOKEN) localStorage.lax_t = TOKEN; else TOKEN = localStorage.lax_t; } catch {}
if (qs.get('t')) history.replaceState(null, '', location.pathname);
const DEMO = qs.has('demo');
// Inside the Lax Android app: Android's own speech recognition, TTS and vibration (see android/…/LaxBridge.kt).
const NATIVE = (() => { try { return window.LaxNative?.isNative() ? window.LaxNative : null; } catch { return null; } })();
const buzz = (pattern) => (NATIVE ? NATIVE.vibrate(pattern.join(',')) : navigator.vibrate?.(pattern));

const $ = (s) => document.querySelector(s);
const app = $('#app'), cv = $('#stage'), g = cv.getContext('2d');
const W = 52, H = 51, GROUND = 46, CX = 26;
// Three bodies: 'wide' = closed Flip 3 cover screen (512×260 landscape strip), 'tall' = cover screen held sideways
// (260×512), 'big' = phone open / Flex mode (fluid; Lax on the top half, terminal below the fold). ?layout= forces one.
function layoutFor() {
  const forced = qs.get('layout'); if (forced) return forced;
  if (innerWidth >= 340 && innerHeight >= 600) return 'big';
  return innerWidth / innerHeight > 1.3 ? 'wide' : 'tall';
}
function fit() {
  const l = layoutFor();
  // In the app the page runs under the camera hole: keep the top bar clear of it.
  try { const i = JSON.parse(NATIVE?.insets() || '{}'); document.documentElement.style.setProperty('--inset-top', (i.top || 0) + 'px'); } catch {}
  document.body.classList.toggle('big', l === 'big'); document.body.classList.toggle('wide', l === 'wide');
  const b = $('#bubble'), want = l === 'wide' ? $('#bottom') : $('#top');
  if (b.parentElement !== want) want.insertBefore(b, want.firstElementChild);
  cv.style.cssText = '';
  if (l === 'wide') { app.style.transform = `scale(${Math.min(innerWidth / 512, innerHeight / 260)})`; return; }
  if (l === 'tall') { app.style.transform = `scale(${Math.min(innerWidth / 260, innerHeight / 512)})`; return; }
  const top = $('#top').getBoundingClientRect(), k = Math.max(1, Math.floor(Math.min(top.width / W, (top.height - 40) / H)));
  cv.style.width = W * k + 'px'; cv.style.height = H * k + 'px';
  cv.style.left = Math.round((top.width - W * k) / 2) + 'px'; cv.style.top = Math.round(top.height - H * k - 8) + 'px';
}
addEventListener('resize', fit); fit();

const VERSION = 'v0.4';
// Diagnostics → the Mac's server log (data/server.log), so phone-only problems are visible there.
const diag = (event, data = {}) => { if (DEMO || !TOKEN) return; try { fetch('/api/diag', { method: 'POST', keepalive: true,
  headers: { 'content-type': 'application/json', 'x-lax-token': TOKEN }, body: JSON.stringify({ event, ...data }) }); } catch {} };
addEventListener('error', (e) => diag('js-error', { msg: e.message, at: `${e.filename}:${e.lineno}` }));
const api = (p, body) => fetch(p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': TOKEN }, body: JSON.stringify(body || {}) }).then((r) => r.json());

// ---------- palette ----------
const C = { ink: '#000', out: '#120c0a', body: '#D97757', hi: '#F2A585', lo: '#A9522F', eye: '#fff8ee', red: '#ff4b3e', band: '#e0302a',
  glass: '#7fd3ff', gold: '#ffd25a', green: '#6fd36f', ground: '#1f1c19', dust: '#5b544b', cape: '#3b4cc0' };
const SIZES = { sprout: [10, 9], blob: [13, 12], cube: [15, 14], brick: [17, 16], legend: [19, 18] };

// ---------- world state ----------
let settings = { name: 'Lax', color: '#D97757', voice: true, pitch: 1.6, speakDone: false, phoneApprovals: true, askTimeout: 30 };
const shade = (hex, amt) => { const n = parseInt(hex.slice(1), 16), t = amt < 0 ? 0 : 255, a = Math.abs(amt);
  return '#' + [16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * (1 - a) + t * a).toString(16).padStart(2, '0')).join(''); };
function applyLook() {
  C.body = settings.color; C.hi = shade(settings.color, 0.3); C.lo = shade(settings.color, -0.25);
  document.documentElement.style.setProperty('--coral', settings.color);
  $('#nameBtn').textContent = settings.name.toUpperCase(); $('#lifeName').textContent = settings.name.toUpperCase();
}
let pet = { name: 'Lax', level: 1, stage: 'sprout', traits: [], mood: 'happy', xp: 0, prevXp: 0, nextXp: 10 };
let sessions = [], voiceBusy = false, thinking = false, lastWork = 0, channels = [], voiceTarget = 'background';
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
  const cx = CX + dx, x0 = cx - Math.floor(w / 2), feetH = 2, y0 = GROUND - feetH - h - Math.round(body.y);
  const shadowW = Math.max(4, w - Math.round(body.y / 2));
  px(cx - shadowW / 2, GROUND + 1, shadowW, 1, '#2a2521');

  // cape behind
  if (pet.traits.includes('cape')) { const fl = Math.round(Math.sin(t / 120) * 2); px(x0 - 3 + fl, y0 + 3, 3, h - 2, C.cape); px(x0 - 4 + fl * 2, y0 + 5, 2, h - 5, C.cape); }

  // feet
  const run = m === 'working' ? Math.round(Math.sin(t / 50)) : 0;
  px(x0 + 2, GROUND - feetH - Math.max(0, run) - Math.round(body.y), 3, 2, C.out);
  px(x0 + w - 5, GROUND - feetH - Math.max(0, -run) - Math.round(body.y), 3, 2, C.out);

  // body: thick outline, flat fill, light top-left, shade bottom-right (Meat Boy-ish chunk)
  px(x0 - 1, y0 - 1, w + 2, h + 2, C.out);
  px(x0, y0, w, h, C.body);
  px(x0, y0 + h - 2, w, 2, C.lo); px(x0 + w - 2, y0, 2, h, C.lo);
  px(x0 + 1, y0 + 1, w - 4, 1, C.hi); px(x0 + 1, y0 + 1, 1, h - 4, C.hi);
  if (pet.stage === 'sprout' || pet.stage === 'blob') { // round the corners
    for (const [cx2, cy2] of [[x0 - 1, y0 - 1], [x0 + w, y0 - 1], [x0 - 1, y0 + h], [x0 + w, y0 + h]]) px(cx2, cy2, 1, 1, '#000');
    for (const [cx2, cy2] of [[x0, y0], [x0 + w - 1, y0], [x0, y0 + h - 1], [x0 + w - 1, y0 + h - 1]]) px(cx2, cy2, 1, 1, C.out);
  }
  if (pet.traits.includes('scar')) { px(x0 + w - 5, y0 + h - 6, 1, 1, C.out); px(x0 + w - 4, y0 + h - 5, 1, 1, C.out); px(x0 + w - 3, y0 + h - 4, 1, 1, C.out); }

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
  if (pet.stage === 'legend') { px(cx - 4, y0 - 3, 9, 2, C.gold); px(cx - 4, y0 - 5, 1, 2, C.gold); px(cx, y0 - 5, 1, 2, C.gold); px(cx + 4, y0 - 5, 1, 2, C.gold); }
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
  // Tabs: "all", then one per session. The open tab filters the terminal; a live one (claude-lax) also hears your voice.
  const shown = sessions.slice(0, 8), labels = tabLabels(shown);
  if (view !== 'all' && !shown.some((s) => s.id === view)) setView('all');
  $('#chips').innerHTML = `<span class="all${view === 'all' ? ' sel' : ''}" data-view="all">all</span>` + shown.map((s, i) => {
    const ch = channels.find((c) => c.sessionPid && c.sessionPid === s.pid), open = s.id === view;
    return `<span class="${s.status}${ch ? ' live' : ''}${open ? (ch ? ' sel' : ' front') : ''}" data-view="${esc(s.id)}" data-cid="${ch ? ch.cid : ''}" data-label="${esc(labels[i])}">${esc(labels[i])}</span>`;
  }).join('');
  $('#lvl').textContent = `Lv${pet.level}`;
  $('#xp i').style.width = Math.round(100 * (pet.xp - pet.prevXp) / Math.max(1, pet.nextXp - pet.prevXp)) + '%';
  $('#dots').innerHTML = sessions.slice(0, 6).map((s) => `<b class="${s.status}" title="${s.project}"></b>`).join('');
}
const term = $('#term');
// Which tab is open: 'all' or a session id. Per device, so it lives here, not on the Mac.
let view = 'all'; try { view = localStorage.lax_view || 'all'; } catch {}
// session: the line's session id; none = shown under "all" only; '*' = shown in every tab (local link messages).
const visible = (d) => view === 'all' || d.dataset.s === '*' || d.dataset.s === view;
function setView(v) {
  view = v; try { localStorage.lax_view = v; } catch {}
  document.body.classList.toggle('view-all', v === 'all');
  for (const d of term.children) if (d.dataset.s !== undefined) d.hidden = !visible(d);
  term.scrollTop = term.scrollHeight;
}
function feed(line, kind = 'tool', project, session = '') {
  const d = document.createElement('div'); d.className = kind; d.dataset.s = session; d.hidden = !visible(d);
  if (project && kind !== 'session') { const p = document.createElement('span'); p.className = 'p'; p.textContent = project.slice(0, 8) + ' '; d.append(p); }
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
const TAGS = { question: 'question', permission: 'needs you', waiting: 'waiting', done: 'done', reply: 'lax', error: 'uh oh', levelup: '★ level up', you: 'you' };
function showBubble(b) {
  bubbles = bubbles.filter((x) => x.id !== b.id); bubbles.push(b);
  b.sticky = b.actions || b.kind === 'question';
  if (!b.sticky) b.expires = performance.now() + (b.kind === 'reply' ? 15000 : 9000);
  renderBubble();
  if (b.kind === 'permission' || b.kind === 'question') { sfx([660, 880, 660]); buzz([80, 60, 80]); }
  else if (b.kind === 'levelup') { sfx([523, 659, 784, 1046]); setReact('happy', 2500); }
  else if (b.kind === 'done') { sfx([784, 1046]); setReact('happy'); }
  else if (b.kind === 'error') { sfx([220, 160]); setReact('error'); }
  if (b.speak || (b.kind === 'done' && settings.speakDone)) speak(b.kind === 'permission' ? 'I need you. ' + b.text : b.kind === 'question' ? 'Question. ' + b.questions[0].question : b.say || b.text);
}
function clearBubble(id) { bubbles = bubbles.filter((x) => x.id !== id); renderBubble(); }
function renderBubble() {
  const now = performance.now();
  bubbles = bubbles.filter((b) => !b.expires || b.expires > now);
  const b = bubbles.find((x) => x.sticky) || bubbles[bubbles.length - 1];
  if (!b) { elB.className = ''; elB.dataset.key = ''; return; }
  elB.className = 'show ' + b.kind; elB.dataset.id = b.id;
  if (b.kind !== 'question') elB.querySelector('.tag').textContent = TAGS[b.kind] || '';
  elB.querySelector('.actions').style.display = b.actions ? 'flex' : 'none';
  elB.querySelector('.more').style.display = b.details ? '' : 'none';
  const det = elB.querySelector('.det'); det.textContent = b.details || ''; det.style.display = b.details && b.showDetails ? 'block' : 'none';
  if (b.kind !== 'question') { elB.querySelector('.text').textContent = b.text; elB.dataset.key = ''; return; }
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
elB.addEventListener('click', (e) => {
  e.stopPropagation();
  const id = elB.dataset.id, b = bubbles.find((x) => x.id === id); if (!b) return;
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
// Tap once, speak, Lax sends when you pause (tap again to cancel). Hold-to-talk fought Android Chrome:
// the mic permission prompt cancels the touch, and continuous recognition is flaky there.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const isBrave = !!navigator.brave;
// Set once the browser proves it can't do speech recognition (e.g. Brave: no Google speech service). Then taps go to typing.
let voiceBroken = !SR && !NATIVE;
let rec, heard = '', cancelled = false;
const hint = $('#hint');
let IDLE_HINT = 'tap Lax to talk';
// Where talking goes: a live Claude Code session (lax channel) or the background session.
function routeChannel() {
  return voiceTarget === 'background' ? null : channels.find((c) => c.cid === voiceTarget) || [...channels].sort((a, b) => b.active - a.active)[0] || null;
}
function setTarget(v) { voiceTarget = v; updateHint(); renderHud(); if (lifeEl.classList.contains('open')) renderLife(); if (!DEMO) api('/api/target', { target: v }); }
function updateHint() { IDLE_HINT = macAsleep ? `zzz… ${settings.name.toLowerCase()} is asleep` : voiceBroken ? 'tap Lax to type' : 'tap Lax to talk'; if (!listening) hint.textContent = IDLE_HINT; }
const MIC_ERRORS = {
  'not-allowed': 'Mic is blocked. Tap the icon left of the address → Permissions → Microphone → Allow, then reload.',
  'service-not-allowed': 'This browser has no speech recognition. Use Chrome.',
  'network': isBrave ? 'Brave can\'t do speech recognition, so type instead (or use Chrome for voice).' : 'Speech service unreachable. Check your connection.',
  'audio-capture': 'No microphone found.',
  ...(NATIVE && { 'not-allowed': 'Lax needs the mic. Allow it, then tap me again.',
    'network': 'Speech service unreachable. Check your connection.', 'busy': 'The mic is busy. Try again in a sec.' }),
  'no-speech': 'I didn\'t hear anything. Tap me and talk.',
};
updateHint();
(async () => { let mic = 'unknown'; try { mic = (await navigator.permissions.query({ name: 'microphone' })).state; } catch {}
  diag('load', { v: VERSION, native: !!NATIVE, ua: navigator.userAgent, secure: isSecureContext, sr: !!SR, brave: isBrave, mediaDevices: !!navigator.mediaDevices, mic, w: innerWidth, h: innerHeight, dpr: devicePixelRatio }); })();
function startListening() {
  if (macAsleep) { hop(0.5); showBubble({ id: 'asleep', kind: 'reply', text: 'Zzz… I\'m asleep right now. I\'ll wake up on my own.' }); return; }
  if (listening) { cancelled = true; NATIVE ? NATIVE.cancelListening() : rec?.abort(); return; }
  if (voiceBusy && !answerHook) { showBubble({ id: 'busy', kind: 'reply', text: 'Still working on the last one…' }); return; }
  if (voiceBroken) return typeInstead();
  heard = ''; cancelled = false; listening = true; hint.textContent = 'listening… (tap to cancel)'; sfx([440]);
  if (NATIVE) { NATIVE.hush(); diag('talk-tap', { native: true }); NATIVE.listen(navigator.language || 'en-US'); return; }
  speechSynthesis.cancel();
  rec = new SR(); rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  ['start', 'audiostart', 'soundstart', 'speechstart', 'speechend', 'audioend', 'nomatch'].forEach((ev) => rec.addEventListener(ev, () => diag('sr-' + ev)));
  rec.onresult = (e) => { heard = [...e.results].map((r) => r[0].transcript).join(''); hint.textContent = heard.slice(-40); };
  rec.onerror = (e) => {
    diag('sr-error', { error: e.error, message: e.message });
    if (e.error === 'aborted') return;
    showBubble({ id: 'mic', kind: 'error', text: MIC_ERRORS[e.error] || 'Mic error: ' + e.error });
    // No recognition service at all: remember it and let you type this one right away.
    if (['network', 'service-not-allowed', 'language-not-supported'].includes(e.error)) { voiceBroken = true; cancelled = true; updateHint(); setTimeout(typeInstead, 300); }
  };
  rec.onend = endListening;
  diag('talk-tap'); try { rec.start(); } catch (err) { diag('sr-start-throw', { msg: err.message }); listening = false; hint.textContent = IDLE_HINT; showBubble({ id: 'mic', kind: 'error', text: 'Mic error: ' + err.message }); }
}
function endListening() {
  diag('sr-end', { heard: heard.slice(0, 80), cancelled }); listening = false; hint.textContent = IDLE_HINT;
  const h = answerHook; answerHook = null;
  if (!cancelled && heard.trim()) { sfx([330]); h ? h(heard.trim()) : send(heard.trim()); } else if (h) renderBubble();
  heard = '';
}
// The app's speech recognizer calls these (LaxBridge.kt).
window.laxOnSpeech = (text, final) => { if (!listening) return; heard = text; hint.textContent = heard.slice(-40); if (final) endListening(); };
window.laxOnSpeechError = (error) => {
  if (!listening) return;
  diag('sr-error', { error, native: true });
  if (error !== 'aborted') showBubble({ id: 'mic', kind: 'error', text: MIC_ERRORS[error] || 'Mic error: ' + error });
  cancelled = true; endListening();
};
window.laxOnSpeaking = (on) => { speaking = !!on; };
// Typing fallback: same destination as voice (the open question, or your session).
function typeInstead() {
  const h = answerHook; answerHook = null;
  const text = prompt(h ? 'Your answer:' : 'Talk to Lax:');
  if (text?.trim()) (h ? h(text.trim()) : send(text.trim())); else if (h) renderBubble();
}
function stopListening() { if (!listening) return; NATIVE ? NATIVE.stopListening() : rec?.stop(); }
function send(text) {
  showBubble({ id: 'you' + Date.now(), kind: 'you', text: '“' + text + '”' });
  if (DEMO) { voiceBusy = true; setTimeout(() => { voiceBusy = false; showBubble({ id: 'r' + Date.now(), kind: 'reply', text: 'Demo mode — I heard you!', speak: true }); }, 1800); return; }
  api('/api/talk', { text }).then((r) => { if (!r.ok) showBubble({ id: 'busy', kind: 'error', text: 'I\'m busy, try again in a sec.' }); })
    .catch(() => showBubble({ id: 'net', kind: 'error', text: 'Couldn\'t reach your Mac.' }));
}
const topEl = $('#top');
topEl.addEventListener('click', () => { if (!wakeEl.isConnected && !lifeEl.classList.contains('open')) startListening(); });
topEl.addEventListener('contextmenu', (e) => e.preventDefault());
// Desktop: hold space to talk.
addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && !listening && e.target === document.body) { e.preventDefault(); startListening(); } });
addEventListener('keyup', (e) => { if (e.code === 'Space') stopListening(); });

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
        showBubble({ id: 'mic', kind: 'error', text: err.name === 'NotAllowedError' ? MIC_ERRORS['not-allowed'] : 'Mic: ' + err.name }); });
  }
  try { await document.documentElement.requestFullscreen?.(); } catch {}
  const lock = async () => { try { await navigator.wakeLock?.request('screen'); } catch {} };
  lock(); document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && lock());
});

// ---------- live link ----------
function applyState(s) { pet = s.pet; sessions = s.sessions; voiceBusy = s.voiceBusy; thinking = !!s.thinking; channels = s.channels || []; voiceTarget = s.voiceTarget || 'auto'; updateHint(); if (s.settings) settings = s.settings; applyLook(); renderHud(); if (lifeEl.classList.contains('open')) renderLife(); }
// Remember how Lax looks, so the app's offline page can show the same Lax asleep.
const remember = () => { try { NATIVE?.remember(JSON.stringify({ pet, settings })); } catch {} };
function setAsleep(v) { if (macAsleep === v) return; macAsleep = v; updateHint(); }
if (DEMO) demo();
else if (ASLEEP) asleep();
else if (!TOKEN) feed('no token — open the URL printed by `npm start`', 'error', undefined, '*');
else connect();
function connect() {
  const es = new EventSource('/api/stream?t=' + encodeURIComponent(TOKEN));
  es.addEventListener('state', (e) => { applyState(JSON.parse(e.data)); remember(); });
  es.addEventListener('feed', (e) => { const f = JSON.parse(e.data); feed(f.line, f.kind, f.project, f.session); });
  es.addEventListener('bubble', (e) => showBubble(JSON.parse(e.data)));
  es.addEventListener('clear', (e) => clearBubble(JSON.parse(e.data).id));
  es.addEventListener('reborn', () => { [...term.children].slice(0, -1).forEach((d) => d.remove()); parts.length = 0; hop(1.8);
    showBubble({ id: 'born', kind: 'reply', text: `Hi! I'm ${settings.name}. Nice to meet you.`, speak: true }); });
  es.addEventListener('react', (e) => { const r = JSON.parse(e.data); if (r.state === 'thinking') voiceBusy = true; else setReact(r.state); });
  es.onopen = () => { if (macAsleep) { setAsleep(false); hop(1.4); } feed('linked to mac ✓', 'session', undefined, '*'); };
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
  sessions = [{ id: 'd1', project: 'api', where: 'mac', status: 'working' }, { id: 'd2', project: 'web', where: 'cli', status: 'done' }]; applyLook(); renderHud();
  const steps = [
    () => feed('> fix the flaky auth test', 'prompt', 'api'),
    () => feed('Read auth.test.ts', 'tool', 'api'), () => feed('Grep "refreshToken"', 'tool', 'api'),
    () => feed('Edit auth.ts', 'tool', 'api'), () => feed('$ npm test -- auth', 'tool', 'api'),
    () => feed('  ✗ Bash failed', 'error', 'api') || setReact('error'),
    () => feed('Edit auth.ts', 'tool', 'api'),
    () => showBubble({ id: 'perm', kind: 'permission', text: 'api wants to: $ rm -rf dist && npm run build', actions: true }),
    () => {}, () => {}, () => clearBubble('perm') || feed('  ✓ approved from phone', 'done', 'api'),
    () => feed('$ npm run build', 'tool', 'api'),
    () => feed('✓ api: Fixed the race in token refresh; all 42 tests pass.', 'done', 'api') || showBubble({ id: 'd', kind: 'done', text: 'api: Fixed the race in token refresh; all 42 tests pass.' }),
    () => showBubble({ id: 'lv', kind: 'levelup', text: 'Lax reached level 8!' }),
    () => {}, () => { voiceBusy = true; }, () => {}, () => { voiceBusy = false; pet = { ...pet, mood: 'sleepy' }; },
    () => {}, () => { pet = { ...pet, mood: 'happy', traits: ['headband', 'goggles', 'flame'] }; },
  ];
  let i = 0; setInterval(() => steps[i++ % steps.length](), 1300);
}

// ---------- life menu ----------
const lifeEl = $('#life');
const COLORS = ['#D97757', '#5fbf4a', '#4a8fe0', '#9b5de5', '#f2b134', '#e8e2d6', '#ff5d8f', '#3ec1c9'];
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
  $('#swatches').innerHTML = COLORS.map((c) => `<button style="background:${c}" data-c="${c}" class="${c === settings.color ? 'on' : ''}"></button>`).join('')
    + `<input type="color" id="sColor" value="${settings.color}" title="custom">`;
  lifeEl.querySelectorAll('.tog').forEach((t) => t.classList.toggle('on', !!settings[t.dataset.k]));
  $('#sWait').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === settings.askTimeout));
  const raw = memory?.raw || {}, p = memory?.pet || pet;
  const days = p.born ? Math.max(0, Math.floor((Date.now() - p.born) / 864e5)) : 0;
  $('#stats').innerHTML = [['level', p.level], ['stage', p.stage], ['xp', p.xp], ['streak', (p.streak || 0) + 'd'], ['age', days + 'd'], ['mood', p.mood],
    ['turns', raw.turns ?? '–'], ['approved', raw.approvals ?? '–'], ['errors', raw.errors ?? '–'], ['voice', memory?.voiceProject ?? '–'],
    ['traits', (p.traits || []).join(', ') || 'none yet']].map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
  const tools = Object.entries(raw.tools || {}).filter(([k]) => !k.startsWith('__')).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = tools[0]?.[1] || 1;
  $('#tools').innerHTML = tools.length ? tools.map(([k, v]) => `<div class="bar"><span>${esc(k.replace(/^mcp__.*?__/, ''))}</span><div class="track"><i style="width:${Math.round(100 * v / max)}%"></i></div><b>${v}</b></div>`).join('') : '<div class="bar"><span>nothing yet</span></div>';
  $('#miles').innerHTML = (memory?.milestones || []).slice(0, 12).map((m) => `<li>${new Date(m.ts).toLocaleDateString()} ${m.text.replace(/</g, '&lt;')}</li>`).join('') || '<li>…</li>';
}
$('#nameBtn').addEventListener('click', (e) => { e.stopPropagation(); openLife(); });
lifeEl.addEventListener('pointerdown', (e) => e.stopPropagation());
$('#lifeClose').addEventListener('click', () => lifeEl.classList.remove('open'));
$('#sName').addEventListener('change', (e) => e.target.value.trim() && saveSettings({ name: e.target.value.trim().slice(0, 12) }));
$('#sPitch').addEventListener('change', (e) => { saveSettings({ pitch: +e.target.value }); speak('Is this my voice?'); });
$('#swatches').addEventListener('click', (e) => { if (e.target.dataset.c) { saveSettings({ color: e.target.dataset.c }); hop(1); } });
$('#swatches').addEventListener('change', (e) => { if (e.target.id === 'sColor') { saveSettings({ color: e.target.value }); hop(1); } });
lifeEl.querySelectorAll('.tog').forEach((t) => t.addEventListener('click', () => saveSettings({ [t.dataset.k]: !settings[t.dataset.k] })));
$('#sWait').addEventListener('click', (e) => e.target.dataset.v && saveSettings({ askTimeout: +e.target.dataset.v }));
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
  if (chip.dataset.view !== 'all') showBubble({ id: 'notlive', kind: 'reply', text: `${chip.dataset.label} can't hear me, so I'll answer you myself. Start it with claude-lax to talk to it.` });
});
setView(view);
