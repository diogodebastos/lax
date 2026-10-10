// The public demo's one piece of code: Lax's mind, live (lax.diogodebastos.com/demo/mind, Phase 6.1). Everything else
// under /demo is static (wrangler.jsonc: assets, built by scripts/demo.mjs). The Mac pushes the public shape of its mind
// and what it's doing (lib/public-mind.mjs); one Durable Object keeps the last of it and hands it to every viewer, so the
// page works with the Mac off. What comes in is checked against the shape (lib/mind-shape.mjs) by the Worker in front,
// which always runs the newest code: a Durable Object can outlive a deploy while viewers stay connected, so it only
// keeps and hands out what it's given, and never needs to change when the shape does.
//   POST /demo/mind/api/push   from the Mac, with its key (secret MIND_KEY): { snap, events }
//   GET  /demo/mind/api/live   a WebSocket: { snap } on connect, then { snap, events } on each push
//   GET  /demo/mind/api/snap   { snap }, for viewers without a socket
// Events are only passed on, live, to whoever is watching: never kept, so what it did can't be read back later.
import { DurableObject } from 'cloudflare:workers';
import { clean, cleanEvents } from '../lib/mind-shape.mjs';

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

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
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
  },
};
// The one room everyone watches. The old ones ('lax' ran the shape check itself and outlived a deploy; 'mind' kept the
// last events) are told to forget everything on each push, once they run this code.
const room = (env) => env.MIND.get(env.MIND.idFromName('now'));
const OLD = ['lax', 'mind'];
