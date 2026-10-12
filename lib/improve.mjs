// Lax improves itself (Phase 8, #8): what it notices by itself, not what you asked for (that's lib/learn.mjs). It keeps
// a friction log (~/.lax/friction.json): an approval answered at the terminal instead of the phone, one nobody answered,
// a voice run that failed, a session started without Lax, "Lax, that was annoying". Once a night, if there was any, it
// picks ONE small fix to its own body (drafted read-only), builds it on a branch through the wish flow (fenced, guarded,
// tested on a throwaway Lax; nothing pushed), and in the morning tells you what it saw and what it changed: "merge it",
// "no", or how to do it instead. A merge restarts it and rolls back if it breaks (scripts/after-merge.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { HOME } from './paths.mjs';
import { runClaude, lastJson } from './claude-run.mjs';
import { OFF_LIMITS } from './guard.mjs';

export const FRICTION = path.join(HOME, 'friction.json');
export const NIGHT_HOUR = Number(process.env.LAX_NIGHT_HOUR ?? 3); // when it works on itself (the Mac's time)

/** "Lax, that was annoying" / "isso foi irritante": said to Lax, the whole message is the complaint. */
export const ANNOYED = /^(?:(?:hey |ok |olá )?lax,? )?(?:that(?: was|'s| is)|this(?: is|'s)|it(?: was|'s)|you(?:'re| are| were)|isso (?:foi|é|está)|tu (?:és|foste|estás)|estás|és)(?: (?:so|really|very|a bit|kind of|super|mesmo|muito|um bocado|tão))* (?:annoying|irritating|frustrating|useless|broken|slow|irritante|chato|chata|frustrante|inútil|lento|lenta)(?![\p{L}])/iu;

const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const localDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * deps: { settings(), feed(line, kind, project), learn (lib/learn.mjs: selfFix, wishes, busy), body (the repo it changes),
 *   claude, log(...), now() (tests) }
 */
export function createImprove(deps) {
  const now = deps.now || Date.now;
  const me = () => deps.settings().name.toLowerCase();
  const load = () => { try { return JSON.parse(fs.readFileSync(FRICTION, 'utf8')); } catch { return { items: [], lastNight: 0 }; } };
  let state = load();
  const save = () => fs.writeFileSync(FRICTION, JSON.stringify(state, null, 2) + '\n');

  /** Something that got in your way. once: a key it's noted under at most once a day (a session without Lax, per project). */
  function note(kind, text, once) {
    if (once && state.items.some((f) => f.once === once && localDay(f.ts) === localDay(now()))) return false;
    state.items = [...state.items, { ts: now(), kind, text: cut(text, 300), ...(once && { once }) }].slice(-500); save();
    deps.feed(`  friction: ${kind}: ${cut(text, 100)}`, 'diary', me());
    return true;
  }
  const since = () => state.items.filter((f) => f.ts > (state.lastNight || 0));

  // ---------- the night: one fix, drafted read-only, built on a branch by the wish flow ----------
  let working = false;
  async function night(force = false) {
    if (working || !deps.settings().learns) return false;
    const t = now(), fresh = since();
    if (!force && (new Date(t).getHours() !== NIGHT_HOUR || localDay(state.lastNight || 0) === localDay(t))) return false;
    if (deps.learn.wishes().some((w) => w.self && ['approved', 'building', 'review', 'merging'].includes(w.status))) return false; // one at a time
    state.lastNight = t; save();
    if (!fresh.length) return false;
    working = true;
    try {
      const declined = deps.learn.wishes().filter((w) => w.self && w.status === 'declined').slice(-10)
        .map((w) => `- ${w.title} (${w.why || 'declined'}): ${cut(w.saw, 120)}`).join('\n') || '(none)';
      const counts = {}; for (const f of fresh) counts[f.kind] = (counts[f.kind] || 0) + 1;
      const prompt = `Tonight you improve yourself: pick ONE small fix to your own body (the Lax app's code, at ${deps.body}) that would `
        + `take away some of the friction below, the user's or yours. Read the code first; you can't change anything now.\n`
        + `Off limits, always: ${OFF_LIMITS.join(', ')}, and anything about auth, tokens, the tunnel or secrets.\n`
        + `Small means a few files, with a test. If nothing is worth fixing, or it can't be fixed in code (the user's habits), say so in "none".\n\n`
        + `Friction since last night (${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}):\n`
        + fresh.slice(-60).map((f) => `- ${new Date(f.ts).toISOString().slice(0, 16)} ${f.kind}: ${f.text}`).join('\n')
        + `\n\nFixes the user said no to (don't propose them again):\n${declined}\n\n`
        + `The proposal is markdown: **What I saw**, **What I'd change** (files, the smallest change), **Tests**, **Risks**.\n`
        + `Finish with ONE line of JSON and nothing after it:\n`
        + `{"fix": {"none": "", "saw": "what got in the way, one plain sentence", "title": "a few words", "slug": "kebab-case", "proposal": "…"}}`;
      const r = await runClaude({ prompt, cwd: deps.body, model: process.env.LAX_DRAFT_MODEL || 'sonnet', maxTurns: 30, timeoutMs: 10 * 60e3,
        claude: deps.claude, env: { LAX_BUILD: deps.body, LAX_DRAFT: '1', LAX_HOME: HOME } });
      const fix = lastJson(r.text, 'fix').fix;
      if (!fix) { deps.log?.('improve: no answer:', cut(r.err || r.text, 200)); return false; }
      if (fix.none || !fix.title) { deps.feed(`  looked at ${fresh.length} friction${fresh.length > 1 ? 's' : ''}, nothing to fix: ${cut(fix.none, 120)}`, 'diary', me()); return false; }
      return deps.learn.selfFix({ saw: cut(fix.saw, 200), title: cut(fix.title, 60), slug: fix.slug, proposal: String(fix.proposal || '').slice(0, 6000) });
    } finally { working = false; }
  }
  setInterval(() => night().catch((e) => deps.log?.('improve:', e.message)), 10 * 60e3).unref();

  return { note, night, friction: () => state.items, busy: () => working };
}
