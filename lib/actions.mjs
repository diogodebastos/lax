// Quick actions by voice: a closed list of things Lax may type into a live `lax` session (bin/claude-lax.mjs).
// Never free text: injected keys are as powerful as typing at the terminal.
import net from 'node:net';

/** action → what is typed. Text is typed, then Enter on its own (typed together, it reads as a paste). */
export const ACTIONS = { clear: { text: '/clear' }, compact: { text: '/compact' }, continue: { text: 'continue' }, stop: { keys: '\x1b' } };

/** "Clear." / "stop!" / "/compact" → the action; anything longer ("clear up the README") is a normal message. */
export function voiceAction(text) {
  const w = String(text || '').trim().toLowerCase().replace(/^\//, '').replace(/[.!?,\s]+$/, '');
  return Object.hasOwn(ACTIONS, w) ? w : null;
}

/** Ask the wrapper behind `sock` to do `action`. Resolves true if it did. */
export function sendAction(sock, action, timeout = 2000) {
  return new Promise((resolve) => {
    if (!sock || !Object.hasOwn(ACTIONS, action)) return resolve(false);
    let out = '';
    const c = net.connect(sock, () => c.write(action + '\n'));
    c.setEncoding('utf8'); c.setTimeout(timeout, () => c.destroy());
    c.on('data', (d) => { out += d; });
    c.on('close', () => resolve(out.trim() === 'ok'));
    c.on('error', () => resolve(false));
  });
}
