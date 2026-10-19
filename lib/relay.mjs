// The Mac's end of the relay (relay/worker.mjs, Phase 11): one WebSocket out to the person's own Worker, and every
// request the phone sent there replayed against Lax on this Mac (127.0.0.1 only), its answer streamed back up.
// Each replayed request is marked x-lax-relay, so it never counts as "this Mac" (lib/auth.mjs isLocal).
// Pings every 20 s; no answer in 45 s, or the Mac woke from sleep, and it reconnects (1 s, then up to 30 s apart).
// On linking it tells the relay a hash of the phone's token, so the relay holds only what your phone sent while the Mac slept.
import crypto from 'node:crypto';

const CHUNK = 256 * 1024, PING = 20e3, DEAD = 45e3;

/** Starts the link. { url: the Worker (https://…), key, port: Lax's, token: the phone's, log }. Returns { stop, linked() }. */
export function startRelay({ url, key, port, token, log = () => {} }) {
  const wsUrl = url.replace(/\/$/, '').replace(/^http/, 'ws') + '/_relay/mac';
  let ws = null, stopped = false, wait = 1e3, heard = 0, timer = null, retry = null, up = false;
  const open = new Map(); // id → { head, body: [], ctrl }

  function connect() {
    if (stopped) return;
    try { ws = new WebSocket(wsUrl, { headers: { 'x-relay-key': key } }); } catch (e) { log(`relay: ${e.message}`); return later(); }
    ws.onopen = () => { up = true; wait = 1e3; heard = Date.now(); log('relay: linked');
      if (token) send({ t: 'hello', token: crypto.createHash('sha256').update(token).digest('hex') }); };
    ws.onmessage = (e) => { heard = Date.now(); if (e.data !== 'pong') frame(e.data); };
    ws.onclose = () => { if (up) log('relay: link lost'); up = false; for (const o of open.values()) o.ctrl.abort(); open.clear(); later(); };
    ws.onerror = () => {};
  }
  function later() {
    if (stopped || retry) return;
    retry = setTimeout(() => { retry = null; connect(); }, wait); wait = Math.min(wait * 2, 30e3);
  }
  timer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - heard > DEAD) { log('relay: no answer, reconnecting'); try { ws.close(); } catch {} return; }
    try { ws.send('ping'); } catch {}
  }, PING);

  const send = (f) => { try { ws?.send(JSON.stringify(f)); } catch {} };
  function frame(data) {
    let f; try { f = JSON.parse(data); } catch { return; }
    if (f.t === 'req') open.set(f.id, { head: f, body: [], ctrl: new AbortController() });
    else if (f.t === 'body') open.get(f.id)?.body.push(Buffer.from(f.b64, 'base64'));
    else if (f.t === 'sent') replay(f.id);
    else if (f.t === 'abort') { open.get(f.id)?.ctrl.abort(); open.delete(f.id); }
  }
  async function replay(id) {
    const o = open.get(id); if (!o) return;
    const { method, path, headers } = o.head, body = o.body.length ? Buffer.concat(o.body) : undefined;
    try {
      if (!path.startsWith('/')) throw new Error('bad path');
      const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { ...headers, 'x-lax-relay': '1' }, body, signal: o.ctrl.signal, redirect: 'manual' });
      send({ t: 'head', id, status: r.status, headers: Object.fromEntries(r.headers) });
      if (r.body) for await (const c of r.body) for (let i = 0; i < c.length; i += CHUNK) send({ t: 'chunk', id, b64: Buffer.from(c.subarray(i, i + CHUNK)).toString('base64') });
    } catch (e) {
      if (!o.ctrl.signal.aborted) send({ t: 'head', id, status: 502, headers: { 'content-type': 'application/json' } }), send({ t: 'chunk', id, b64: Buffer.from(JSON.stringify({ error: e.message })).toString('base64') });
    }
    send({ t: 'end', id }); open.delete(id);
  }

  connect();
  return {
    linked: () => up,
    stop() { stopped = true; clearInterval(timer); clearTimeout(retry); for (const o of open.values()) o.ctrl.abort(); try { ws?.close(); } catch {} },
  };
}
