// Moves your Lax (~/.lax: its mind, life, memories, wishes, settings, secrets) to another machine, e.g. from the Mac to
// Linux. Its body (this repo) and your projects move by git or a copy; this is everything else.
//   On the old machine:  node scripts/move-to-linux.mjs pack [lax-home.tgz]
//   On the new one:      node scripts/move-to-linux.mjs unpack lax-home.tgz
// pack snapshots life.db safely even while Lax runs, and leaves out Mac-only tools (~/.lax/bin) and Lax's own
// worktrees. unpack refuses to cover a Lax that's already there (--force does), then rewrites the old home folder
// (/Users/you) to the new one (/home/you) in its mind, wishes and notes. Never secrets/ (check LAX_WORKDIR in
// secrets/env.json yourself), nor the archived transcripts and logs: they're history.
// The .tgz holds your secrets (the phone's token, the tunnel's): copy it straight over and delete it after.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { HOME, DB } from '../lib/paths.mjs';

const [cmd, file = 'lax-home.tgz'] = process.argv.slice(2), force = process.argv.includes('--force');
const PARENT = path.dirname(HOME), NAME = path.basename(HOME), MANIFEST = 'moved-from.json';
const SKIP_DIRS = new Set(['secrets', 'archive', 'logs', 'bin', 'worktrees', '.git', 'node_modules']);
const TEXT = /\.(md|json|jsonl|txt|ya?ml|html)$/;

/** Every text file under dir that could hold a path (skipping history, secrets and tools). */
function* texts(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* texts(p); }
    else if (e.isFile() && TEXT.test(e.name)) yield p;
  }
}
/** Old home → new home in those files; how many files changed. */
export function rewrite(dir, from, to) {
  let n = 0;
  if (!from || from === to) return 0;
  for (const f of texts(dir)) {
    const s = fs.readFileSync(f, 'utf8');
    if (s.includes(from)) { fs.writeFileSync(f, s.split(from).join(to)); n++; }
  }
  return n;
}

if (cmd === 'pack') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-move-')), snap = path.join(tmp, NAME);
  fs.mkdirSync(snap);
  if (fs.existsSync(DB)) { const db = new DatabaseSync(DB); db.exec(`VACUUM INTO '${path.join(snap, 'life.db').replace(/'/g, "''")}'`); db.close(); }
  fs.writeFileSync(path.join(snap, MANIFEST), JSON.stringify({ home: os.homedir(), at: new Date().toISOString(), from: process.platform }) + '\n');
  const out = path.resolve(file), tar = out.replace(/\.tgz$|\.tar\.gz$|$/, '.tar');
  // The live life.db stays out; its snapshot goes in after (an --exclude would drop that too).
  execFileSync('tar', ['-cf', tar, ...['bin', 'worktrees', 'life.db', 'life.db-wal', 'life.db-shm', MANIFEST].flatMap((x) => ['--exclude', `${NAME}/${x}`]), '-C', PARENT, NAME]);
  execFileSync('tar', ['-rf', tar, '-C', tmp, ...fs.readdirSync(snap).map((x) => `${NAME}/${x}`)]);
  execFileSync('gzip', ['-f', tar]); fs.renameSync(tar + '.gz', out);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.chmodSync(out, 0o600);
  console.log(`Packed ${HOME} into ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB). It holds your secrets: copy it over, then delete it.`);
} else if (cmd === 'unpack') {
  if (fs.existsSync(DB) && !force) { console.error(`There's already a Lax at ${HOME} (life.db). Move it away, or --force to cover it.`); process.exit(1); }
  fs.mkdirSync(PARENT, { recursive: true });
  execFileSync('tar', ['-xzf', path.resolve(file), '-C', PARENT]);
  let from = null; try { from = JSON.parse(fs.readFileSync(path.join(HOME, MANIFEST), 'utf8')).home; } catch {}
  const n = rewrite(HOME, from, os.homedir());
  fs.chmodSync(path.join(HOME, 'secrets'), 0o700);
  try { execFileSync('git', ['-C', path.join(HOME, 'mind'), 'commit', '-qam', `I moved: ${from} is now ${os.homedir()}`], { stdio: 'ignore' }); } catch {}
  console.log(`Unpacked into ${HOME}; ${from} → ${os.homedir()} in ${n} file(s).`);
  console.log(`Next, in the Lax repo: npm install, npm run install-hooks, npm run install-channel, npm run install-service, npm run whisper.
Check LAX_WORKDIR in ${path.join(HOME, 'secrets', 'env.json')}: it may still name the old machine's folder.`);
} else {
  console.log('usage: node scripts/move-to-linux.mjs pack [file.tgz]  |  unpack file.tgz [--force]');
  process.exit(cmd ? 1 : 0);
}
