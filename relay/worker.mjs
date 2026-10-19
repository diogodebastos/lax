// The relay (Phase 11): how a Lax reaches its person's phone with only a free Cloudflare account, on workers.dev.
// A pipe, for now: the Mac holds one WebSocket here (lib/relay.mjs), and every HTTP request the phone makes is passed down
// it, replayed against Lax on the Mac, and its answer streamed back. So to the phone it's the same as the tunnel: the
// page, the event stream, voice uploads, the token check, all as they are. Nothing is kept here, except what the phone
// sent while the Mac slept (below).
//   GET /_relay/mac   the Mac's WebSocket, with the relay key (secret RELAY_KEY) in x-relay-key
//   GET /_relay/up    { mac }: is the Mac linked? With the phone's token (?t=); open to any page (CORS), so a page on the
//                     tunnel can ask whether to move here (lax.js)
//   anything else     passed to the Mac; "Mac asleep" (503) when it isn't there
// Frames are JSON text. Down: { t: 'req', id, method, path, headers }, { t: 'body', id, b64 }…, { t: 'sent', id };
// { t: 'abort', id } when the phone goes away. Up: { t: 'head', id, status, headers }, { t: 'chunk', id, b64 }…, { t: 'end', id }.
// The Mac pings ("ping" → "pong", answered without waking the object); a minute without one and the Mac counts as asleep.
// Held while it sleeps: a POST the phone marks x-lax-queue (what you said, a yes or no, a setting), with its x-lax-once id
// and the phone's token, is kept in order and answered 202 { ok, queued }. On linking the Mac says { t: 'hello', token:
// sha256 of the token }; only requests with that token are held, and they go to the Mac in order, before anything new,
// each once (a repeat of an id is answered by the Mac with the first answer, lib/once.mjs). Kept 12 hours at most.
import { DurableObject } from 'cloudflare:workers';

const CHUNK = 256 * 1024; // bytes per body frame: WebSocket messages stay well under their 1 MiB limit
const ASLEEP_AFTER = 60e3;
// Wrong tokens (the Mac's 401s) from one address: after 20 in 10 minutes it's refused until they're up.
const LIMIT = 20, WINDOW = 10 * 6e4;
// Not passed on: hop-by-hop, and Cloudflare's own. x-lax-relay is the Mac client's to set (never "this Mac", lib/auth.mjs).
const DROP_REQ = /^(host|connection|upgrade|keep-alive|transfer-encoding|content-length|cf-.*|x-forwarded-.*|x-real-ip|x-lax-relay)$/i;
const DROP_RES = /^(connection|keep-alive|transfer-encoding|content-length|content-encoding)$/i;
const HOLD = { paths: /^\/api\/(talk|decide|settings)$/, max: 100, bytes: 64 * 1024, ms: 12 * 3600e3 };

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const same = (a, b) => { // constant time, for the key
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0); return d === 0;
};
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const asleep = (req) => /text\/html/.test(req.headers.get('accept') || '')
  ? new Response('<!doctype html><meta name="viewport" content="width=device-width"><title>Lax</title><body style="background:#000;color:#b7b0a4;font:16px monospace;display:grid;place-items:center;height:90vh">zzz… the Mac is asleep</body>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '30' } })
  : Response.json({ error: 'Mac asleep' }, { status: 503, headers: { 'retry-after': '30' } });

export class Relay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.open = new Map(); // id → { head, writer } for requests in flight (they keep the object awake)
    this.misses = new Map();
    this.sql = this.ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS held (n INTEGER PRIMARY KEY AUTOINCREMENT, once TEXT UNIQUE, at INTEGER, method TEXT, path TEXT, headers TEXT, body BLOB)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
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

    if (url.pathname === '/_relay/up') {
      const known = this.sql.exec("SELECT v FROM meta WHERE k = 'token'").toArray()[0]?.v, t = url.searchParams.get('t') || '';
      const ok = !!known && !!t && same(await sha(t), known);
      if (!ok && ip) { const n = this.misses.get(ip) || { since: now, count: 0 }; n.count++; this.misses.set(ip, n); } // counts as a wrong token
      return Response.json(ok ? { mac: !!this.mac() } : { error: 'bad token' }, { status: ok ? 200 : 401, headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    }

    const headers = {};
    for (const [k, v] of req.headers) if (!DROP_REQ.test(k)) headers[k] = v;
    const r = { method: req.method, path: url.pathname + url.search, headers, body: req.body ? new Uint8Array(await req.arrayBuffer()) : null };
    let mac = this.mac();
    if (mac && this.waiting()) { await this.flush(); mac = this.mac(); } // what it held goes first
    const h = mac && await this.pass(mac, r);
    if (!h) return await this.hold(req, url, r) || asleep(req);
    if (h.status === 401 && ip) { const n = this.misses.get(ip) || { since: now, count: 0 }; n.count++; this.misses.set(ip, n); }
    const out = new Headers(); for (const [k, v] of Object.entries(h.headers || {})) if (!DROP_RES.test(k)) out.set(k, v);
    return new Response(h.stream, { status: h.status, headers: out });
  }

  // One request down to the Mac; its head (with the body as a stream), or null when the Mac isn't answering.
  async pass(mac, { method, path, headers, body }) {
    const id = crypto.randomUUID();
    const head = new Promise((resolve) => this.open.set(id, { resolve }));
    try {
      mac.send(JSON.stringify({ t: 'req', id, method, path, headers }));
      if (body) for (let i = 0; i < body.length; i += CHUNK) mac.send(JSON.stringify({ t: 'body', id, b64: b64(body.subarray(i, i + CHUNK)) }));
      mac.send(JSON.stringify({ t: 'sent', id }));
    } catch { this.open.delete(id); return null; }
    const h = await Promise.race([head, new Promise((r) => setTimeout(() => r(null), 30e3))]);
    if (!h) this.drop(id);
    return h;
  }

  // The Mac is asleep: keep what the phone marked to be held, if it's the phone's (its token, as the Mac last said).
  async hold(req, url, r) {
    const once = req.headers.get('x-lax-once') || '', token = req.headers.get('x-lax-token') || url.searchParams.get('t') || '';
    if (req.method !== 'POST' || req.headers.get('x-lax-queue') !== '1' || !HOLD.paths.test(url.pathname) || !/^[\w-]{8,64}$/.test(once)) return null;
    if ((r.body?.length || 0) > HOLD.bytes) return null;
    const known = this.sql.exec("SELECT v FROM meta WHERE k = 'token'").toArray()[0]?.v;
    if (!known || !token || !same(await sha(token), known)) return null;
    this.sql.exec('DELETE FROM held WHERE at < ?', Date.now() - HOLD.ms);
    if (this.sql.exec('SELECT COUNT(*) AS c FROM held').one().c >= HOLD.max) return null;
    this.sql.exec('INSERT OR IGNORE INTO held (once, at, method, path, headers, body) VALUES (?, ?, ?, ?, ?, ?)',
      once, Date.now(), r.method, r.path, JSON.stringify(r.headers), r.body || new Uint8Array());
    return Response.json({ ok: true, queued: true }, { status: 202 });
  }

  waiting() { return this.sql.exec('SELECT COUNT(*) AS c FROM held').one().c > 0; }

  // What it held, to the Mac in order. A row goes once the Mac has answered it; if the Mac stops answering, the rest wait.
  flush() {
    return this.flushing ||= (async () => {
      this.sql.exec('DELETE FROM held WHERE at < ?', Date.now() - HOLD.ms);
      for (const row of this.sql.exec('SELECT * FROM held ORDER BY n').toArray()) {
        const mac = this.mac(); if (!mac) break;
        const body = new Uint8Array(row.body);
        const h = await this.pass(mac, { method: row.method, path: row.path, headers: JSON.parse(row.headers), body: body.length ? body : null });
        if (!h) break;
        try { await h.stream.pipeTo(new WritableStream()); } catch {}
        if (h.status >= 500) break;
        this.sql.exec('DELETE FROM held WHERE n = ?', row.n);
      }
    })().finally(() => { this.flushing = null; });
  }

  webSocketMessage(ws, data) {
    let f; try { f = JSON.parse(data); } catch { return; }
    if (f.t === 'hello') { // the Mac's back, and says whose token to hold for
      if (/^[0-9a-f]{64}$/.test(f.token || '')) this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('token', ?)", f.token);
      this.flush(); return;
    }
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
