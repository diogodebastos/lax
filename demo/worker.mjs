// The public demo's one piece of code: Lax's mind, live (lax.diogodebastos.com/demo/mind, Phase 6.1). Everything else
// under /demo is static (wrangler.jsonc: assets, built by scripts/demo.mjs). The Mac pushes the public shape of its mind
// and what it's doing (lib/public-mind.mjs); one Durable Object keeps the last of it and hands it to every viewer, so the
// page works with the Mac off. What comes in is checked against the shape (lib/mind-shape.mjs) before it's kept.
//   POST /demo/mind/api/push   from the Mac, with its key (secret MIND_KEY): { snap, events }
//   GET  /demo/mind/api/live   a WebSocket: { snap, recent } on connect, then { snap, events } on each push
//   GET  /demo/mind/api/snap   the same as one JSON answer, for viewers without a socket
import { DurableObject } from 'cloudflare:workers';
import { clean, cleanEvents } from '../lib/mind-shape.mjs';

const RECENT = 50;

export class Mind extends DurableObject {
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path.endsWith('/push')) {
      let body; try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
      const snap = clean(body?.snap); if (!snap) return new Response('not the shape', { status: 422 });
      snap.seen = Date.now(); // the Worker's clock says when the Mac was last heard from
      const events = cleanEvents(body.events);
      const recent = [...((await this.ctx.storage.get('recent')) || []), ...events].slice(-RECENT);
      await this.ctx.storage.put({ snap, recent });
      const msg = JSON.stringify({ snap, events });
      for (const ws of this.ctx.getWebSockets()) try { ws.send(msg); } catch {}
      return Response.json({ ok: true, viewers: this.ctx.getWebSockets().length });
    }
    const hello = { snap: (await this.ctx.storage.get('snap')) || null, recent: (await this.ctx.storage.get('recent')) || [] };
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
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/demo/mind/api/')) return env.ASSETS.fetch(req);
    const route = url.pathname.slice('/demo/mind/api/'.length);
    if (route === 'push') {
      if (req.method !== 'POST') return new Response('POST only', { status: 405 });
      if (!(await sameKey((req.headers.get('authorization') || '').replace(/^Bearer /, ''), env.MIND_KEY))) return new Response('no', { status: 401 });
    } else if (!['live', 'snap'].includes(route) || req.method !== 'GET') return new Response('not found', { status: 404 });
    return env.MIND.get(env.MIND.idFromName('lax')).fetch(req);
  },
};
