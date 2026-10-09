// Recall (Phase 6): "how did we fix that in August?" answered from Lax's long-term memory, searched when needed and
// never loaded whole. Grep first: episodes, then notes, then the archived transcripts. No index, no embeddings.
// Two ways in, one way of searching (RECALL_HOW): the `recall` tool (channel/lax-channel.mjs → /api/recall → a fenced,
// read-only headless run here), and Lax's own voice assistant, which follows the same steps itself (lib/home.mjs).
import { MIND, HOME, ARCHIVE } from './paths.mjs';
import { runClaude, lastJson } from './claude-run.mjs';

export const RECALL_HOW = `1. Grep \`episodes/\` (in your mind, ${MIND}) for the words that matter, and their likely synonyms. Read only the
     episodes that match. Header lines (\`where:\`, \`tags:\`, \`when:\`) narrow it down.
  2. Then your notes (\`projects/\`, \`CLAUDE.md\`) if the episodes don't have it.
  3. Still nothing, or it needs the exact detail: Grep the archived transcripts (${ARCHIVE}, one folder per project,
     one .jsonl per session). Search with files_with_matches first, then a narrow pattern with a little context; never
     read a whole transcript.
  Answer with when and where (date and project), and say how sure you are. If it isn't there, say so: never make it up.`;

const MODEL = process.env.LAX_RECALL_MODEL || 'sonnet';

/** Searches Lax's memory for the answer: resolves { ok, answer, found }. */
export async function recall(query, { claude, cwd } = {}) {
  const q = String(query || '').trim().slice(0, 1000);
  if (!q) return { ok: false, answer: 'Ask me something to recall.' };
  const prompt = `Recall from your long-term memory, to answer a question from ${cwd ? `a Claude Code session in ${cwd}` : 'the user'}.\n`
    + `Search like this:\n  ${RECALL_HOW}\n\nThe question: ${q}\n\n`
    + `Answer briefly: the answer first (with date and project), then the files you found it in. Finish with ONE line of JSON and nothing after it:\n`
    + `{"found": true}  (false if your memory doesn't have it)`;
  const r = await runClaude({ prompt, cwd: MIND, model: MODEL, claude, allowedTools: 'Read,Glob,Grep', maxTurns: 30, timeoutMs: 4 * 60e3,
    env: { LAX_RECALL: '1', LAX_HOME: HOME } });
  const answer = String(r.text || '').replace(/\s*\{[^{}]*"found"[^{}]*\}\s*$/, '').trim();
  if (!r.ok) return { ok: false, answer: answer || `I couldn't search my memory: ${r.err.slice(0, 200)}` };
  return { ok: true, answer, found: lastJson(r.text, 'found').found !== false };
}
