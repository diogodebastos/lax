// Exactly once (Phase 11): the phone tags each POST with x-lax-once, a fresh id, and sends the same id again when it
// retries (the network switched mid-request) or when the relay hands over what it held while the Mac slept. The first
// one does the work; a repeat gets the first one's answer, waiting for it if it's still running. Ids live 10 minutes.
const KEEP = 10 * 6e4, MAX = 1000;

export function once() {
  const seen = new Map(); // id → { at, done: Promise<{ code, headers, body }> }
  const ok = (id) => typeof id === 'string' && /^[\w-]{8,64}$/.test(id);
  return {
    /** A repeat: answers res with the first one's answer and returns true. Otherwise watches res for its answer. */
    seen(id, res) {
      if (!ok(id)) return false;
      const now = Date.now();
      for (const [k, v] of seen) if (now - v.at > KEEP || seen.size > MAX) seen.delete(k); else break; // oldest first
      const prev = seen.get(id);
      if (prev) {
        prev.done.then((a) => { res.writeHead(a.code, { ...a.headers, 'x-lax-once': 'repeat' }); res.end(a.body); },
          () => { res.writeHead(409, { 'content-type': 'application/json' }); res.end('{"error":"the first try failed"}'); });
        return true;
      }
      let code = 200, headers = {}, resolve, reject;
      const done = new Promise((y, n) => { resolve = y; reject = n; }); done.catch(() => {});
      const { writeHead, end } = res;
      res.writeHead = function (c, h) { code = c; headers = h || {}; return writeHead.apply(this, arguments); };
      res.end = function (b) { resolve({ code, headers, body: b ?? '' }); return end.apply(this, arguments); };
      res.on('close', () => { if (!res.writableEnded) { seen.delete(id); reject(); } }); // never answered: a retry may do it
      seen.set(id, { at: now, done });
      return false;
    },
  };
}
