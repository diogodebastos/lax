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
