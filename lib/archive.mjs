// Lax keeps the raw past (Phase 6): every Claude Code transcript is copied into ~/.lax/archive/transcripts when its
// session goes quiet, secrets scrubbed on the way in (lib/scrub.mjs), so nothing depends on Claude Code keeping it
// (it deletes transcripts after `cleanupPeriodDays`). Same layout as ~/.claude/projects: <project dir>/<session>.jsonl,
// plus <session>/subagents/*.jsonl. A sweep at start and once a day backfills what it missed (the server was off,
// the transcripts from before) and scrubs again whatever was kept with older rules.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { ARCHIVE } from './paths.mjs';
import { RULES, scrubLine, ownSecrets } from './scrub.mjs';

export const PROJECTS = path.resolve(process.env.LAX_CLAUDE_PROJECTS
  || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects'));
const STATE = path.join(path.dirname(ARCHIVE), 'state.json'); // what was kept, from which version of the source, with which rules

/** Every .jsonl under dir, as paths relative to it. */
function transcripts(dir, rel = '') {
  let out = [];
  let list; try { list = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of list) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) out = out.concat(transcripts(dir, r));
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(r);
  }
  return out;
}

/** Where a Claude Code transcript is kept in the archive ('' if it isn't one). */
export function keptAs(file) {
  if (!file) return '';
  const rel = path.relative(PROJECTS, path.resolve(file));
  return rel.startsWith('..') || !rel.endsWith('.jsonl') ? '' : path.join(ARCHIVE, rel);
}

/** deps: { log(...), idleMs } */
export function createArchive(deps = {}) {
  const IDLE = deps.idleMs ?? Number(process.env.LAX_ARCHIVE_IDLE || 600) * 1000; // like the reflection: quiet this long
  let state; try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { state = { files: {} }; }
  const timers = new Map();
  let chain = Promise.resolve(), literals = null;

  const saveState = () => { const t = STATE + '.tmp'; fs.writeFileSync(t, JSON.stringify(state)); fs.renameSync(t, STATE); };

  // One file in, scrubbed line by line (async, so a 50 MB transcript doesn't stall the server). src may be the kept copy
  // itself: one Claude Code already deleted, scrubbed again with newer rules. Returns how many lines had secrets.
  async function keep(rel, src) {
    const dest = path.join(ARCHIVE, rel), was = state.files[rel];
    let st; try { st = fs.statSync(src); } catch { return 0; }
    const self = path.resolve(src) === path.resolve(dest);
    if (was && was.rules === RULES && (self || (was.size === st.size && was.mtime === st.mtimeMs)) && fs.existsSync(dest)) return 0;
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
    const tmp = dest + '.tmp', out = fs.createWriteStream(tmp, { mode: 0o600 });
    let hits = 0;
    try {
      const lines = readline.createInterface({ input: fs.createReadStream(src), crlfDelay: Infinity });
      for await (const line of lines) {
        const s = scrubLine(line, literals);
        if (s !== line) hits++;
        if (!out.write(s + '\n')) await new Promise((r) => out.once('drain', r));
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
      fs.renameSync(tmp, dest);
    } catch (e) {
      out.destroy(); fs.rmSync(tmp, { force: true });
      deps.log?.(`couldn't keep ${rel}:`, e.message); return 0;
    }
    state.files[rel] = { size: st.size, mtime: st.mtimeMs, rules: RULES, kept: Date.now() };
    saveState();
    return hits;
  }

  // In order, one at a time, so two calls never write the same file.
  function queue(files, why) {
    chain = chain.then(async () => {
      literals = ownSecrets();
      let n = 0, hits = 0;
      for (const [rel, src] of files) { const before = state.files[rel]?.kept; hits += await keep(rel, src); if (state.files[rel]?.kept !== before) n++; }
      if (n) deps.log?.(`${why}: kept ${n} transcript${n > 1 ? 's' : ''}${hits ? `, ${hits} line${hits > 1 ? 's' : ''} with secrets scrubbed` : ''}`);
      return n;
    }).catch((e) => { deps.log?.('archive failed:', e.message); return 0; });
    return chain;
  }

  /** A session's transcript and its subagents', now. */
  function session(file) {
    if (!keptAs(file)) return chain;
    const rel = path.relative(PROJECTS, path.resolve(file));
    const subs = transcripts(PROJECTS, rel.slice(0, -'.jsonl'.length));
    return queue([[rel, file], ...subs.map((r) => [r, path.join(PROJECTS, r)])], 'session');
  }

  /** Everything: new or grown transcripts, and kept ones scrubbed with older rules (or never scrubbed). */
  function sweep() {
    const live = transcripts(PROJECTS), seen = new Set(live);
    const old = transcripts(ARCHIVE).filter((r) => !seen.has(r) && state.files[r]?.rules !== RULES);
    return queue([...live.map((r) => [r, path.join(PROJECTS, r)]), ...old.map((r) => [r, path.join(ARCHIVE, r)])], 'sweep');
  }

  /** From the hooks: a Stop starts the quiet timer, the next event in that session cancels it, a SessionEnd keeps it now. */
  function onEvent(sid, kind, file) {
    if (!sid || !file) return;
    clearTimeout(timers.get(sid)); timers.delete(sid);
    if (kind === 'Stop') timers.set(sid, setTimeout(() => { timers.delete(sid); session(file); }, IDLE).unref());
    if (kind === 'SessionEnd') session(file);
  }

  return { onEvent, session, sweep, idle: () => chain };
}
