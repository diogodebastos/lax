// Moving Lax to another machine (scripts/move-to-linux.mjs), between two throwaway homes: pack on the "Mac", unpack on
// the "Linux box": its life comes whole (a snapshot), the old home folder becomes the new one in its mind and wishes,
// but never in secrets/ or the archive; Mac-only tools stay behind; an existing Lax isn't covered without --force.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lax-move-test-')));
const MAC = path.join(T, 'Users', 'me'), LINUX = path.join(T, 'home', 'me'), OLD = path.join(MAC, '.lax'), NEW = path.join(LINUX, '.lax');
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const write = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const move = (home, ...a) => { try { return execFileSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts', 'move-to-linux.mjs'), ...a],
  { encoding: 'utf8', env: { ...process.env, HOME: home, LAX_HOME: path.join(home, '.lax') }, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return 'ERR ' + e.stderr; } };

write(path.join(OLD, 'mind', 'CLAUDE.md'), `My body is at ${MAC}/Desktop/lax.\n`);
write(path.join(OLD, 'wishes.json'), JSON.stringify({ wishes: [{ worktree: `${MAC}/Desktop/lax-wt-x` }] }));
write(path.join(OLD, 'secrets', 'env.json'), JSON.stringify({ LAX_WORKDIR: `${MAC}/Desktop` }));
write(path.join(OLD, 'archive', 'transcripts', 'lax', 'a.jsonl'), `{"cwd":"${MAC}/Desktop/lax"}\n`);
write(path.join(OLD, 'bin', 'mac-only'), 'x');
const db = new DatabaseSync(path.join(OLD, 'life.db')); db.exec("CREATE TABLE kv (k TEXT, v TEXT); INSERT INTO kv VALUES ('xp', '42')"); db.close();

const tgz = path.join(T, 'lax-home.tgz');
check('pack', move(MAC, 'pack', tgz).startsWith('Packed') && fs.existsSync(tgz));
check('…private (0600): it holds secrets', (fs.statSync(tgz).mode & 0o777) === 0o600);
const out = move(LINUX, 'unpack', tgz);
check('unpack', out.startsWith('Unpacked'), out.split('\n')[0]);
const life = new DatabaseSync(path.join(NEW, 'life.db'));
check('its life comes whole', life.prepare("SELECT v FROM kv WHERE k='xp'").get()?.v === '42'); life.close();
check('the old home is the new one in its mind and wishes', fs.readFileSync(path.join(NEW, 'mind', 'CLAUDE.md'), 'utf8').includes(`${LINUX}/Desktop/lax`)
  && fs.readFileSync(path.join(NEW, 'wishes.json'), 'utf8').includes(`${LINUX}/Desktop/lax-wt-x`));
check('…never in secrets/ or the archive', fs.readFileSync(path.join(NEW, 'secrets', 'env.json'), 'utf8').includes(MAC)
  && fs.readFileSync(path.join(NEW, 'archive', 'transcripts', 'lax', 'a.jsonl'), 'utf8').includes(MAC));
check('Mac-only tools stay behind', !fs.existsSync(path.join(NEW, 'bin')));
check('secrets/ is 0700', (fs.statSync(path.join(NEW, 'secrets')).mode & 0o777) === 0o700);
check('a Lax already there isn\'t covered', move(LINUX, 'unpack', tgz).startsWith('ERR'));

fs.rmSync(T, { recursive: true, force: true });
console.log(failed ? `\n${failed} move check(s) failed` : '\nall move checks passed');
process.exit(failed ? 1 : 0);
