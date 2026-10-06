// Quick actions by voice: a closed list of things Lax may type into a live `lax` session (bin/claude-lax.mjs).
// Never free text: injected keys are as powerful as typing at the terminal.
import net from 'node:net';

/** action → what the wrapper does:
 *  text: typed, then Enter on its own (typed together, it reads as a paste) · keys: pressed as is
 *  mode: Shift+Tab until the footer shows that mode · read: then send the screen back after that many ms (close: Esc after) */
export const ACTIONS = {
  clear: { text: '/clear' }, compact: { text: '/compact' }, continue: { text: 'continue' }, stop: { keys: '\x1b' },
  quit: { text: '/exit' }, exit: { text: '/exit' },
  'plan mode': { mode: 'plan' },
  context: { text: '/context', read: 2500 },
  usage: { text: '/usage', read: 2500, close: true }, cost: { text: '/usage', read: 2500, close: true },
};

/** "Clear." / "stop!" / "/compact" / "Slash clear" (as speech hears it) / "Plan mode." → the action; anything longer
 *  ("clear up the README") is a normal message. */
export function voiceAction(text) {
  const w = String(text || '').trim().toLowerCase().replace(/^(\/|slash\s+)/, '').replace(/[.!?,\s]+$/, '').replace(/\s+/g, ' ');
  return Object.hasOwn(ACTIONS, w) ? w : null;
}

/** The permission mode in Claude Code's footer ("⏸ plan mode on", "⏵⏵ accept edits on"), or null. */
export function screenMode(screen) {
  const lines = String(screen || '').split('\n').filter((l) => l.trim()).slice(-4).reverse();
  for (const l of lines) { const m = /(\w+) mode on\b|accept edits on\b|bypass permissions on\b/.exec(l); if (m) return m[1] || m[0].replace(/ on$/, ''); }
  return null;
}

/** What a status action's screen says: { say } (one short sentence to read aloud) and { text } (the details, for the feed). */
export function readStatus(action, screen) {
  const s = String(screen || '');
  if (action === 'context') {
    const at = s.lastIndexOf('Context Usage'), part = s.slice(Math.max(0, at)).split(/\n─{10,}/)[0];
    // The header ("27.3k/1m tokens (3%)") scrolls off a short window (Claude Code redraws in place, no scrollback);
    // then it's worked out from what stays at the bottom: free space (and its %) and the autocompact buffer.
    let m = /([\d.]+k?)\/([\d.]+[km]) tokens \((\d+)%\)/.exec(part);
    const free = /Free space: ([\d.]+[km]?) \(([\d.]+)%\)/.exec(part), buffer = /Autocompact buffer: ([\d.]+[km]?) tokens/.exec(part);
    if (!m && free && +free[2] > 0) {
      const k = (t) => parseFloat(t) * (/m$/.test(t) ? 1000 : /k$/.test(t) ? 1 : 0.001);
      const fmt = (n) => n >= 990 ? `${+(n / 1000).toFixed(1)}m` : n >= 100 ? `${Math.round(n)}k` : `${+n.toFixed(1)}k`;
      const total = k(free[1]) / (free[2] / 100), used = Math.max(0, total - k(free[1]) - (buffer ? k(buffer[1]) : 0));
      m = [null, fmt(used), fmt(total), String(Math.round(used / total * 100))];
    }
    const cats = [...part.matchAll(/⛁ ([^:\n]+): ([\d.]+k?) tokens/g)].map((c) => `${c[1]}: ${c[2]}`);
    return m ? { say: `Context is ${m[3]}% full: ${m[1]} of ${m[2]} tokens.`, text: [`${m[1]}/${m[2]} tokens (${m[3]}%)`, ...cats].join('\n') }
      : { say: 'I couldn\'t read the context.', text: '' };
  }
  const limit = (name) => { const m = new RegExp(`${name}\\n[^\\n]*?(\\d+)% used\\n\\s*Resets ([^\\n(]+)`).exec(s); return m && { used: m[1], resets: m[2].trim() }; };
  const sess = limit('Current session'), week = limit('Current week \\(all models\\)');
  const cost = /Total cost:\s+(\$[\d.]+)/.exec(s)?.[1];
  if (!sess && !week) return { say: 'I couldn\'t read the usage.', text: '' };
  const say = [sess && `This session window is ${sess.used}% used, resets ${sess.resets}.`, week && `This week, ${week.used}%.`].filter(Boolean).join(' ');
  const text = [sess && `session ${sess.used}% · resets ${sess.resets}`, week && `week ${week.used}% · resets ${week.resets}`, cost && `this session: ${cost}`].filter(Boolean).join('\n');
  return { say, text };
}

/** Ask the wrapper behind `sock` to do `action`. Resolves { ok, screen? } (screen: for actions that read it back). */
export function sendAction(sock, action, timeout = 8000) {
  return new Promise((resolve) => {
    if (!sock || !Object.hasOwn(ACTIONS, action)) return resolve({ ok: false });
    let out = '';
    const c = net.connect(sock, () => c.write(action + '\n'));
    c.setEncoding('utf8'); c.setTimeout(timeout, () => c.destroy());
    c.on('data', (d) => { out += d; });
    c.on('close', () => { try { resolve(JSON.parse(out)); } catch { resolve({ ok: false }); } });
    c.on('error', () => resolve({ ok: false }));
  });
}
