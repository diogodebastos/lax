// One-time move: Lax's memory, secrets and logs leave the repo's data/ for ~/.lax, and its mind moves into ~/.lax/mind.
// Stops Lax's background services, moves the files (never overwriting), then reinstalls and starts them again.
//   npm run move-home [-- --dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HOME, MIND, SECRETS, LOGS, DB, ensureDirs } from '../lib/paths.mjs';
import { CLAUDE_MD, ensureHome, commitMind } from '../lib/home.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OLD = path.join(ROOT, 'data');
const dry = process.argv.includes('--dry-run');
const say = (s) => console.log((dry ? '[dry] ' : '') + s);
const DOMAIN = `gui/${process.getuid()}`;

if (!dry) for (const label of ['com.diogodebastos.lax', 'com.diogodebastos.lax-tunnel']) {
  try { execFileSync('launchctl', ['bootout', `${DOMAIN}/${label}`], { stdio: 'ignore' }); say(`stopped ${label}`); } catch {}
}
if (!dry) ensureDirs();

const move = (from, to, mode) => {
  if (!fs.existsSync(from)) return;
  if (fs.existsSync(to)) { say(`skip ${from}: ${to} already exists`); return; }
  say(`${path.relative(ROOT, from)} → ${to}`);
  if (dry) return;
  fs.renameSync(from, to);
  if (mode) fs.chmodSync(to, mode);
};
// data/ → ~/.lax
for (const f of ['token', 'env.json', 'tunnel-token', 'cf-setup-token', 'pair-qr.jpg']) move(path.join(OLD, f), path.join(SECRETS, f), 0o600);
for (const f of ['', '-wal', '-shm']) move(path.join(OLD, 'lax.db' + f), DB + f); // lax.db is now life.db
for (const f of ['server.log', 'tunnel.log']) move(path.join(OLD, f), path.join(LOGS, f));

// ~/.lax/CLAUDE.md (+ .claude/) → ~/.lax/mind, with the new template; the Notes it kept come along.
const oldMd = path.join(HOME, 'CLAUDE.md');
if (fs.existsSync(oldMd) && !fs.existsSync(path.join(MIND, 'CLAUDE.md'))) {
  const notes = (fs.readFileSync(oldMd, 'utf8').split(/^## Notes\s*$/m)[1] || '').trim();
  say(`~/.lax/CLAUDE.md → ${MIND}/CLAUDE.md (new template${notes ? `, keeping ${notes.split('\n').length} note line(s)` : ''})`);
  if (!dry) {
    fs.mkdirSync(MIND, { recursive: true });
    fs.writeFileSync(path.join(MIND, 'CLAUDE.md'), CLAUDE_MD({ repos: process.env.LAX_WORKDIR || path.dirname(ROOT), body: ROOT }) + (notes ? notes + '\n' : ''));
    fs.rmSync(oldMd); fs.rmSync(path.join(HOME, '.claude'), { recursive: true, force: true });
  }
}
if (!dry) { ensureHome({ repos: process.env.LAX_WORKDIR || path.dirname(ROOT), body: ROOT }); commitMind('Lax moved into its own home'); }

if (fs.existsSync(OLD) && !dry) {
  const left = fs.readdirSync(OLD);
  if (left.length) say(`left in data/ (not moved): ${left.join(', ')}`); else { fs.rmdirSync(OLD); say('data/ removed (empty)'); }
}
if (!dry) { execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'install-launchd.mjs')], { stdio: 'inherit' }); }
say(`done. Lax lives in ${HOME}`);
