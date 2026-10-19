// The ways in (Phase 11): the tunnel (LAX_PUBLIC_URL, your own domain) and the relay (LAX_RELAY_URL, workers.dev).
// The phone opens one; when it breaks and the other still reaches this Mac, the page moves there, and back to the one
// you chose once it works again (lax.js). Whether each works is seen from here: the relay by its link (lib/relay.mjs),
// the tunnel by asking Lax through it every minute; an answer from Lax itself (not Cloudflare's error page) means it's up.
const EVERY = 60e3;

/** { tunnel, relay } URLs; relayLinked: () => bool. Returns { view(), stop() }; onChange when one goes up or down. */
export function startWays({ tunnel, relay, relayLinked = () => false, headers = {}, onChange = () => {} }) {
  tunnel = (tunnel || '').replace(/\/$/, ''); relay = (relay || '').replace(/\/$/, '');
  if (tunnel === relay) tunnel = ''; // a Lax with only the relay has it as its public URL too
  let tunnelUp = null, timer = null, last = '';
  async function check() {
    if (!tunnel) return;
    try {
      const r = await fetch(tunnel + '/api/brief', { headers, redirect: 'manual', signal: AbortSignal.timeout(10e3) });
      tunnelUp = /application\/json/.test(r.headers.get('content-type') || ''); // Lax answers JSON, even its 401
    } catch { tunnelUp = false; }
    const now = JSON.stringify(view()); if (now !== last) { last = now; onChange(); }
  }
  function view() {
    const w = {};
    if (tunnel) w.tunnel = { url: tunnel, up: tunnelUp === true }; // not checked yet: not up, so a page never moves on a guess
    if (relay) w.relay = { url: relay, up: !!relayLinked() };
    return Object.keys(w).length > 1 ? { ...w, prefer: tunnel ? 'tunnel' : 'relay' } : null; // one way: nowhere to move
  }
  if (tunnel && relay) { check(); timer = setInterval(check, EVERY); }
  return { view, check, stop: () => clearInterval(timer) };
}
