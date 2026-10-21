// The public demo's one piece of code: Lax's mind, live (<host>/demo/mind, Phase 6.1). Everything else
// under /demo is static (wrangler.jsonc: assets, built by scripts/demo.mjs). The Mac pushes the public shape of its mind
// and what it's doing (lib/public-mind.mjs); one Durable Object keeps the last of it and hands it to every viewer, so the
// page works with the Mac off. What comes in is checked against the shape (lib/mind-shape.mjs) by the Worker in front,
// which always runs the newest code: a Durable Object can outlive a deploy while viewers stay connected, so it only
// keeps and hands out what it's given, and never needs to change when the shape does.
//   POST /demo/mind/api/push   from the Mac, with its key (secret MIND_KEY): { snap, events }
//   GET  /demo/mind/api/live   a WebSocket: { snap } on connect, then { snap, events } on each push
//   GET  /demo/mind/api/snap   { snap }, for viewers without a socket
// And share cards (lib/card.mjs), made on the Mac when you ask and frozen then, each at its own unguessable address:
//   POST /demo/card/api/make     from the Mac, with its key: { card, png } → { id }
//   POST /demo/card/api/forget   from the Mac, with its key: { id }
//   GET  /demo/card/<id>         its page, with what WhatsApp and X read for the preview; .png its picture
// Events are only passed on, live, to whoever is watching: never kept, so what it did can't be read back later.
import { DurableObject } from 'cloudflare:workers';
import { clean, cleanEvents, cleanCard } from '../lib/mind-shape.mjs';

export class Mind extends DurableObject {
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path.endsWith('/push')) {
      const { snap, events } = await req.json(); // checked by the Worker (below)
      await this.ctx.storage.put('snap', snap);
      const msg = JSON.stringify({ snap, events });
      for (const ws of this.ctx.getWebSockets()) try { ws.send(msg); } catch {}
      return Response.json({ ok: true, viewers: this.ctx.getWebSockets().length });
    }
    if (path.endsWith('/forget')) { await this.ctx.storage.deleteAll(); return new Response('forgotten'); } // an old room, emptied
    const hello = { snap: (await this.ctx.storage.get('snap')) || null };
    if (path.endsWith('/live')) {
      if (req.headers.get('upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server); // hibernates between pushes
      server.send(JSON.stringify(hello));
      return new Response(null, { status: 101, webSocket: client });
    }
    return Response.json(hello, { headers: { 'cache-control': 'no-store' } });
  }
  webSocketMessage() {} // viewers only listen
  webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code); } catch {} }
}

async function sameKey(given, key) {
  if (!key || !given) return false;
  const enc = new TextEncoder(), [a, b] = await Promise.all([given, key].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  return crypto.subtle.timingSafeEqual(a, b);
}

// The cards, in one Durable Object's SQLite: a few hundred at most, the oldest let go first.
export class Cards extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, at INTEGER, card TEXT, png BLOB)');
  }
  async fetch(req) {
    const url = new URL(req.url), id = url.searchParams.get('id') || '';
    if (url.pathname === '/put') {
      const { card, png } = await req.json(), nid = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
      this.sql.exec('INSERT INTO cards (id, at, card, png) VALUES (?, ?, ?, ?)', nid, Date.now(), JSON.stringify(card), Uint8Array.from(atob(png), (c) => c.charCodeAt(0)));
      this.sql.exec('DELETE FROM cards WHERE id NOT IN (SELECT id FROM cards ORDER BY at DESC LIMIT 300)');
      return Response.json({ id: nid });
    }
    if (url.pathname === '/forget') { this.sql.exec('DELETE FROM cards WHERE id = ?', id); return Response.json({ ok: true }); }
    const row = this.sql.exec('SELECT card, png FROM cards WHERE id = ?', id).toArray()[0];
    if (!row) return new Response('not found', { status: 404 });
    return url.pathname === '/png' ? new Response(row.png, { headers: { 'content-type': 'image/png' } }) : Response.json(JSON.parse(row.card));
  }
}
const cards = (env) => env.CARDS.get(env.CARDS.idFromName('cards'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function cardPage(c, id, origin) {
  const title = `${c.name}, level ${c.level} ${[c.species, c.stage].filter(Boolean).join(' ')}`;
  const says = [plural(c.days, 'day', 'days') + ' together', plural(c.heard, 'time', 'times') + ' it heard me', plural(c.memories, 'memory', 'memories'), plural(c.changes, 'change', 'changes') + ' to itself'].join(' · ');
  const img = `${origin}/demo/card/${id}.png`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(says)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(says)}">
<meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${origin}/demo/card/${id}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${img}">
<link rel="icon" href="/demo/favicon.svg" type="image/svg+xml"><link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet">
<style>body{margin:0;background:#121110;color:#e8e2d6;font:21px/1.15 'VT323',ui-monospace,monospace;display:flex;flex-direction:column;align-items:center;gap:18px;padding:32px 16px}
img{width:100%;max-width:900px;image-rendering:pixelated;display:block}p{margin:0;color:#8a8378;text-align:center;max-width:900px}a{color:#e8e2d6}a:hover{color:${c.color}}</style></head>
<body><img src="${img}" alt="${esc(title)}: ${esc(says)}"><p>${esc(says)}</p><p><a href="/demo">See Lax live</a> · <a href="/demo#own">make your own</a></p></body></html>`;
}

/** The public face's requests: the pages (assets), the mind's API and the cards. Also served by the relay (relay/worker.mjs). */
export async function demo(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/demo/card/')) return card(req, env, url);
    if (!url.pathname.startsWith('/demo/mind/api/')) return env.ASSETS.fetch(req);
    const route = url.pathname.slice('/demo/mind/api/'.length);
    if (route === 'push') {
      if (req.method !== 'POST') return new Response('POST only', { status: 405 });
      if (!(await sameKey((req.headers.get('authorization') || '').replace(/^Bearer /, ''), env.MIND_KEY))) return new Response('no', { status: 401 });
      let body; try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
      const snap = clean(body?.snap); if (!snap) return new Response('not the shape', { status: 422 });
      snap.seen = Date.now(); // the Worker's clock says when the Mac was last heard from
      ctx.waitUntil(Promise.all(OLD.map((n) => env.MIND.get(env.MIND.idFromName(n)).fetch('https://room/forget').catch(() => {}))));
      return room(env).fetch(new Request(req.url, { method: 'POST', body: JSON.stringify({ snap, events: cleanEvents(body.events) }) }));
    } else if (!['live', 'snap'].includes(route) || req.method !== 'GET') return new Response('not found', { status: 404 });
    return room(env).fetch(req);
}
export default { fetch: demo };
// The one room everyone watches. The old ones ('lax' ran the shape check itself and outlived a deploy; 'mind' kept the
// last events) are told to forget everything on each push, once they run this code.
const room = (env) => env.MIND.get(env.MIND.idFromName('now'));
const OLD = ['lax', 'mind'];

async function card(req, env, url) {
  const route = url.pathname.slice('/demo/card/'.length);
  if (route === 'api/make' || route === 'api/forget') {
    if (req.method !== 'POST') return new Response('POST only', { status: 405 });
    if (!(await sameKey((req.headers.get('authorization') || '').replace(/^Bearer /, ''), env.MIND_KEY))) return new Response('no', { status: 401 });
    let body; try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
    if (route === 'api/forget') return cards(env).fetch(`https://cards/forget?id=${encodeURIComponent(String(body?.id || ''))}`);
    const c = cleanCard(body?.card), png = typeof body?.png === 'string' && body.png.length < 400e3 ? body.png : '';
    if (!c) return new Response('not a card', { status: 422 });
    if (!png.startsWith('iVBORw0KGgo')) return new Response('not a png', { status: 422 }); // the PNG signature, in base64
    return cards(env).fetch('https://cards/put', { method: 'POST', body: JSON.stringify({ card: c, png }) });
  }
  const m = /^([0-9a-f]{16})(\.png)?$/.exec(route);
  if (!m || req.method !== 'GET') return new Response('not found', { status: 404 });
  const r = await cards(env).fetch(`https://cards/${m[2] ? 'png' : 'card'}?id=${m[1]}`);
  if (!r.ok) return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  if (m[2]) return new Response(r.body, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
  return new Response(cardPage(await r.json(), m[1], url.origin), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
