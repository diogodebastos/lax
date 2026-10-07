// What a session's assistant said between its steps ("Building a mockup of the cover screen now…"), read from the
// end of its transcript. Hooks never carry it; Claude Code shows it, so the phone's terminal should too.
import fs from 'node:fs';

const TAIL = 64 * 1024;

/** The records at the end of a transcript (the first, cut-off line is dropped). */
export function tailRecords(file, bytes = TAIL) {
  let fd; try { fd = fs.openSync(file, 'r'); } catch { return []; }
  try {
    const size = fs.fstatSync(fd).size, start = Math.max(0, size - bytes), buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n'); if (start > 0) lines.shift();
    const out = [];
    for (const l of lines) { if (!l.trim()) continue; try { out.push(JSON.parse(l)); } catch {} }
    return out;
  } finally { fs.closeSync(fd); }
}

// A prompt you typed (not a tool result coming back): where a turn starts.
const isPrompt = (r) => r.type === 'user' && !r.isSidechain && !r.isMeta && (typeof r.message?.content === 'string'
  || (Array.isArray(r.message?.content) && r.message.content.some((c) => c.type === 'text')));
const textOf = (r) => r.type === 'assistant' && !r.isSidechain && Array.isArray(r.message?.content)
  ? r.message.content.filter((c) => c.type === 'text' && c.text?.trim()).map((c) => c.text.trim()).join('\n\n') : '';

/**
 * The assistant's text since `sinceUuid` (the last one already shown). When that one isn't in the tail (first look
 * at a session, or a long gap), only this turn's text: never a session's whole history.
 * Returns { texts: [string], last: uuid of the newest text shown, or sinceUuid }.
 */
export function newAssistantText(records, sinceUuid) {
  let from = sinceUuid ? records.findIndex((r) => r.uuid === sinceUuid) + 1 : 0;
  if (from === 0) { const p = records.findLastIndex(isPrompt); from = p + 1; }
  const texts = []; let last = sinceUuid;
  for (const r of records.slice(from)) { const t = textOf(r); if (t) { texts.push(t); last = r.uuid; } }
  return { texts, last };
}

/**
 * A conversation's last turns, as feed lines for Lax's own tab (its history survives a restart): what you said, what
 * it said between steps, each step (tool + input, for the caller to describe), and its answer. Oldest first.
 * Returns [{ kind: 'prompt' | 'say' | 'tool' | 'answer', text?, tool?, input?, ts }].
 */
export function conversation(records, maxTurns = 25) {
  const turns = []; let turn = null, pendingText = null;
  const flush = (final) => { if (!pendingText) return; turn?.items.push({ ...pendingText, kind: final ? 'answer' : 'say' }); pendingText = null; };
  for (const r of records) {
    const ts = Date.parse(r.timestamp) || 0;
    if (isPrompt(r)) {
      flush(true);
      const c = r.message.content, text = typeof c === 'string' ? c : c.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      if (!text.trim() || /^<(command|local-command|system)/.test(text.trim())) continue;
      turn = { items: [{ kind: 'prompt', text: text.trim(), ts }] }; turns.push(turn); continue;
    }
    if (!turn || r.isSidechain || r.type !== 'assistant' || !Array.isArray(r.message?.content)) continue;
    for (const b of r.message.content) {
      if (b.type === 'text' && b.text?.trim()) { flush(false); pendingText = { text: b.text.trim(), ts }; }
      else if (b.type === 'tool_use') { flush(false); turn.items.push({ kind: 'tool', tool: b.name, input: b.input || {}, ts }); }
    }
  }
  flush(true);
  return turns.slice(-maxTurns).flatMap((t) => t.items);
}
