// Lax hears you right (Phase 4.3): the words you use that speech doesn't know, and what it hears instead.
// ~/.lax/vocab.json, a plain file Lax grows and you may edit:
//   { "heard": { "physic ai": "fisicai" }, "words": ["Veralicious"] }
// heard: misheard → meant, fixed before your words are shown or sent (public/heard.js does the fixing, on both sides).
// It grows from use: a session that had to read "physic AI" as fisicai says so (the `misheard` tool), and so do you
// ("you keep mishearing physic AI, it's fisicai", or typing it over right after). words: names to listen for beyond the
// ones Lax finds by itself; a name you had to spell out ("F I S I C A I") becomes one.
import fs from 'node:fs';
import path from 'node:path';
import '../public/heard.js';

export const { fix, pick, spell, hear, norm, squash } = globalThis.LaxHeard;

/** Built in: what speech hears instead of the quick actions' words (lib/actions.mjs). */
export const SEED = { 'plan mouth': 'plan mode', 'plan mood': 'plan mode', 'plan mod': 'plan mode', 'plan modes': 'plan mode',
  'planned mode': 'plan mode', 'blind mode': 'plan mode', 'blinde mode': 'plan mode', aiko: 'haiku' };

export function readVocab(file) {
  let v = {}; try { v = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return { heard: v.heard && typeof v.heard === 'object' ? v.heard : {}, words: Array.isArray(v.words) ? v.words.map(String) : [] };
}

/** One misheard → meant pair, kept. null if it isn't one: empty, too long, the same words, or a pair that would turn
 *  ordinary talk into something else (a single short common word like "lacks" is fine, "the" is not). */
export function addHeard(file, heard, meant) {
  const h = norm(heard), m = String(meant || '').replace(/\s+/g, ' ').trim();
  if (!h || !m || h.length > 40 || m.length > 40 || h === norm(m) || h.length < 3) return null;
  const v = readVocab(file);
  v.heard[h] = m;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(v, null, 2) + '\n');
  return { heard: h, meant: m };
}

/** A name to listen for (one you spelled out), kept unless Lax knows it already. known: the words it listens for now. */
export function addWord(file, word, known = []) {
  const w = String(word || '').trim();
  if (squash(w).length < 3 || w.length > 40 || known.some((k) => squash(k) === squash(w))) return null;
  const v = readVocab(file);
  if (v.words.some((k) => squash(k) === squash(w))) return null;
  v.words.push(w);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(v, null, 2) + '\n');
  return w;
}

/** You dictated, it came out wrong, and you typed it over: "open physic eye" then "open fisicai" → { heard: "physic eye",
 *  meant: "fisicai" }. Only one stretch may differ (at most 4 words heard, 3 meant), the rest must be the same, and the
 *  two must sound alike (spelled close enough), so a different message or a rephrase is never taken for a fix. */
export function typedOver(dictated, typed) {
  const d = norm(dictated).split(' ').filter(Boolean), t = norm(typed).split(' ').filter(Boolean);
  let i = 0; while (i < d.length && i < t.length && d[i] === t[i]) i++;
  let j = 0; while (j < d.length - i && j < t.length - i && d[d.length - 1 - j] === t[t.length - 1 - j]) j++;
  const hs = d.slice(i, d.length - j), ms = t.slice(i, t.length - j);
  if (!hs.length || !ms.length || hs.length > 4 || ms.length > 3 || i + j < Math.ceil(t.length / 2)) return null;
  const a = squash(hs.join('')), b = squash(ms.join(''));
  if (a === b || distance(a, b) > 0.7 * Math.max(a.length, b.length)) return null;
  const meant = String(typed).replace(/[.,!?;:"“”]+/g, ' ').split(/\s+/).filter(Boolean).slice(i, i + ms.length).join(' '); // as you typed it
  return { heard: hs.join(' '), meant };
}
function distance(a, b) {
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Every pair: the built-in ones, then yours (yours win). */
export const allHeard = (v) => ({ ...SEED, ...v.heard });

/** The names your words may contain, most likely first: its own name, the open sessions' projects, the projects it
 *  has notes on, words it was told, what pairs mean, the models, then your folders. Capped (a recognizer hint list
 *  and a line in every message, so it stays short). */
export function knownWords({ name = 'Lax', sessions = [], mind, workdir, vocab = { heard: {}, words: [] }, extra = [] }, max = 60) {
  const ls = (dir, f = () => true) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter(f).map((d) => d.name); } catch { return []; } };
  const notes = mind ? ls(path.join(mind, 'projects'), (d) => d.name.endsWith('.md')).map((n) => n.slice(0, -3)).filter((n) => n !== 'profile') : [];
  const folders = workdir ? ls(workdir, (d) => d.isDirectory() && !d.name.startsWith('.')) : [];
  const all = [name, ...sessions, ...notes, ...vocab.words, ...Object.values(vocab.heard), ...extra, ...folders];
  const seen = new Set(), out = [];
  for (const w of all) { const k = norm(w); if (k.length >= 2 && !seen.has(k)) { seen.add(k); out.push(String(w).trim()); } }
  return out.slice(0, max);
}

/** Lax's language setting → what a reply is asked to be in (it's read aloud in that language). 'phone': nothing asked. */
const LANGS = { 'en-US': 'English', 'pt-PT': 'European Portuguese' };
export const answerIn = (lang) => (LANGS[lang] ? `Answer in ${LANGS[lang]}: Lax reads it aloud in that language.` : '');

/** The line a dictated message carries for whoever reads it (a live session or Lax's own assistant). */
export const dictatedNote = (words) =>
  `Dictated by voice, so words may be misheard (sound-alikes, split or merged words, no punctuation). ` +
  `Names it may contain: ${words.join(', ')}. If you had to read a misheard word as one of these, call the lax \`misheard\` tool ` +
  `once so Lax fixes it next time.`;

/** "You keep mishearing physic AI, it's fisicai" / "when I say physic AI I mean fisicai"
 *  → { heard, meant }; anything else → null ("X means Y" alone is too common in plain talk to count). */
export function teachCommand(text) {
  const t = String(text || '').trim().replace(/[.!?]+$/, '');
  const m = /^(?:(?:you|lax)\s+)?(?:keep\s+)?mis-?hear(?:ing|s)?\s+["“]?(.+?)["”]?[,;:]?\s+(?:it'?s|it is|that'?s|that is|i mean|i said|should be|as)\s+["“]?(.+?)["”]?$/i.exec(t)
    || /^when i say\s+["“]?(.+?)["”]?[,;:]?\s+i mean\s+["“]?(.+?)["”]?$/i.exec(t);
  return m ? { heard: m[1].trim(), meant: m[2].trim() } : null;
}
