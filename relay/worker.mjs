// The relay (Phase 11): how a Lax reaches its person's phone with only a free Cloudflare account, on workers.dev.
// A pipe, for now: the Mac holds one WebSocket here (lib/relay.mjs), and every HTTP request the phone makes is passed down
// it, replayed against Lax on the Mac, and its answer streamed back. So to the phone it's the same as the tunnel: the
// page, the event stream, voice uploads, the token check, all as they are. Nothing is kept here.
//   GET /_relay/mac   the Mac's WebSocket, with the relay key (secret RELAY_KEY) in x-relay-key
//   anything else     passed to the Mac; "Mac asleep" (503) when it isn't there
// Frames are JSON text. Down: { t: 'req', id, method, path, headers }, { t: 'body', id, b64 }…, { t: 'sent', id };
// { t: 'abort', id } when the phone goes away. Up: { t: 'head', id, status, headers }, { t: 'chunk', id, b64 }…, { t: 'end', id }.
// The Mac pings ("ping" → "pong", answered without waking the object); a minute without one and the Mac counts as asleep.
import { DurableObject } from 'cloudflare:workers';

const CHUNK = 256 * 1024; // bytes per body frame: WebSocket messages stay well under their 1 MiB limit
const ASLEEP_AFTER = 60e3;
// Wrong tokens (the Mac's 401s) from one address: after 20 in 10 minutes it's refused until they're up.
const LIMIT = 20, WINDOW = 10 * 6e4;
// Not passed on: hop-by-hop, and Cloudflare's own. x-lax-relay is the Mac client's to set (never "this Mac", lib/auth.mjs).
const DROP_REQ = /^(host|connection|upgrade|keep-alive|transfer-encoding|content-length|cf-.*|x-forwarded-.*|x-real-ip|x-lax-relay)$/i;
const DROP_RES = /^(connection|keep-alive|transfer-encoding|content-length|content-encoding)$/i;

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const same = (a, b) => { // constant time, for the key
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0); return d === 0;
};
const asleep = (req) => /text\/html/.test(req.headers.get('accept') || '')
  ? new Response('<!doctype html><meta name="viewport" content="width=device-width"><title>Lax</title><body style="background:#000;color:#b7b0a4;font:16px monospace;display:grid;place-items:center;height:90vh">zzz… the Mac is asleep</body>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '30' } })
  : Response.json({ error: 'Mac asleep' }, { status: 503, headers: { 'retry-after': '30' } });

export class Relay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.open = new Map(); // id → { head, writer } for requests in flight (they keep the object awake)
    this.misses = new Map();
  }

  mac() {
    const now = Date.now();
    return this.ctx.getWebSockets('mac').find((ws) => {
      const seen = Math.max(this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() || 0, ws.deserializeAttachment()?.at || 0);
      return now - seen < ASLEEP_AFTER;
    });
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/_relay/mac') {
      if (!this.env.RELAY_KEY || !same(req.headers.get('x-relay-key') || '', this.env.RELAY_KEY)) return new Response('no', { status: 401 });
      if (req.headers.get('upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
      for (const old of this.ctx.getWebSockets('mac')) try { old.close(1000, 'a newer Mac link'); } catch {}
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, ['mac']);
      server.serializeAttachment({ at: Date.now() });
      return new Response(null, { status: 101, webSocket: client });
    }

    const ip = req.headers.get('cf-connecting-ip') || '', now = Date.now(), m = this.misses.get(ip);
    if (m && now - m.since > WINDOW) this.misses.delete(ip);
    else if (m?.count >= LIMIT) return Response.json({ error: 'too many wrong tokens' }, { status: 429 });

    const mac = this.mac();
    if (!mac) return asleep(req);
    const id = crypto.randomUUID(), headers = {};
    for (const [k, v] of req.headers) if (!DROP_REQ.test(k)) headers[k] = v;
    const head = new Promise((resolve) => this.open.set(id, { resolve }));
    try {
      mac.send(JSON.stringify({ t: 'req', id, method: req.method, path: url.pathname + url.search, headers }));
      if (req.body) {
        const body = new Uint8Array(await req.arrayBuffer());
        for (let i = 0; i < body.length; i += CHUNK) mac.send(JSON.stringify({ t: 'body', id, b64: b64(body.subarray(i, i + CHUNK)) }));
      }
      mac.send(JSON.stringify({ t: 'sent', id }));
    } catch { this.open.delete(id); return asleep(req); }

    const h = await Promise.race([head, new Promise((r) => setTimeout(() => r(null), 30e3))]);
    if (!h) { this.drop(id); return asleep(req); }
    if (h.status === 401 && ip) { const n = this.misses.get(ip) || { since: now, count: 0 }; n.count++; this.misses.set(ip, n); }
    const out = new Headers(); for (const [k, v] of Object.entries(h.headers || {})) if (!DROP_RES.test(k)) out.set(k, v);
    return new Response(h.stream, { status: h.status, headers: out });
  }

  webSocketMessage(ws, data) {
    let f; try { f = JSON.parse(data); } catch { return; }
    const o = this.open.get(f.id);
    if (!o) return;
    if (f.t === 'head') {
      const { readable, writable } = new TransformStream();
      o.writer = writable.getWriter();
      o.resolve({ status: f.status, headers: f.headers, stream: readable });
    } else if (f.t === 'chunk' && o.writer) {
      o.writer.write(unb64(f.b64)).catch(() => this.drop(f.id, ws)); // the phone went away
    } else if (f.t === 'end') {
      o.writer?.close().catch(() => {}); this.open.delete(f.id);
    }
  }

  drop(id, ws) {
    const o = this.open.get(id); if (!o) return;
    this.open.delete(id); try { o.writer?.abort(); } catch {}
    try { (ws || this.mac())?.send(JSON.stringify({ t: 'abort', id })); } catch {}
  }

  webSocketClose(ws) { this.lost(ws); }
  webSocketError(ws) { this.lost(ws); }
  lost(ws) { // the Mac's link went: what was in flight ends (the phone retries, and sees "Mac asleep" until it's back)
    if (this.ctx.getWebSockets('mac').some((w) => w !== ws && w.readyState === WebSocket.OPEN)) return;
    for (const [id, o] of this.open) { this.open.delete(id); o.resolve(null); try { o.writer?.close(); } catch {} }
  }
}

export default {
  fetch: (req, env) => env.RELAY.get(env.RELAY.idFromName('lax')).fetch(req),
};
