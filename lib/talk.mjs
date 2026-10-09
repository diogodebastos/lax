// Lax's own conversation (its tab): when to start a fresh one, and what it carries over from the last.
// One endless conversation re-sends its whole history on every message (and re-writes it when the cache has gone
// cold), so it starts over after a quiet spell or once it's long. What matters long-term lives in Lax's notes.
import { conversation } from './transcript.mjs';

export const FRESH_HOURS = 8; // a day's talk stays one conversation; every morning starts fresh
export const FRESH_TOKENS = 150_000;

/** How full a conversation is, from one model call's usage: everything it read in. */
export const contextSize = (u = {}) => (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);

/** Why the next message should start a fresh conversation ('quiet 9h', 'long (163k)'), or null to carry on. */
export function freshDue({ last, tokens } = {}, now = Date.now(), { hours = FRESH_HOURS, maxTokens = FRESH_TOKENS } = {}) {
  if (last && now - last >= hours * 3600e3) return `quiet ${Math.floor((now - last) / 3600e3)}h`;
  if (tokens && tokens >= maxTokens) return `long (${Math.round(tokens / 1000)}k)`;
  return null;
}

/** "Start fresh" / "new conversation" / "nova conversa" by voice: the whole thing said, nothing else ("start the server fresh" isn't it). */
export const FRESH = /^(?:(?:ok(?:ay)?|let'?s|please|can we|lax|vamos|podemos|por favor)[ ,]+)*(?:start (?:fresh|over|again|a new (?:conversation|chat))|(?:a )?new (?:conversation|chat)|fresh start|forget this conversation|(?:começar|começa)(?: de novo| do zero| uma nova conversa)|(?:recomeçar|recomeça)(?: do zero)?|(?:uma )?nova conversa|esquece esta conversa)(?: please| por favor)?[.!?]*$/iu;

const clipLine = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/** The last turns of the previous conversation, short ("You: … / Me: …"), for the first message of a new one.
 *  clean: strips what isn't what you said (the context block). Empty when there's nothing to carry. */
export function recap(records, { turns = 5, clean = (t) => t, n = 300 } = {}) {
  const lines = [];
  for (const it of conversation(records, turns)) {
    if (it.kind === 'prompt') { const t = clipLine(clean(it.text), n); if (t) lines.push(`You: ${t}`); }
    else if (it.kind === 'answer') lines.push(`Me: ${clipLine(it.text, n)}`);
  }
  return lines.join('\n');
}
