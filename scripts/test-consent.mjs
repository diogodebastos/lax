// The development-channel warning (bin/claude-lax.mjs): Lax never answers it for you until you've answered it yourself
// once. A fake Claude shows the warning in a pty of our own: the first time `lax` waits for you; you choose "1" and carry
// on → kept in consent.json; next time Lax answers it; choosing "2. Exit" instead keeps nothing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pty = createRequire(import.meta.url)('node-pty');
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lax-consent-')));
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (f()) return true; return f(); };
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

// A fake Claude: the warning first; Enter → it goes and Claude carries on; "2" → it exits.
const FAKE = path.join(TMP, 'fake-claude.mjs'), KEYS = path.join(TMP, 'keys');
fs.writeFileSync(FAKE, `#!${process.execPath}
import fs from 'node:fs';
process.stdin.setRawMode(true); process.stdin.setEncoding('utf8');
process.stdout.write('\\x1b[33mLoading development channels\\x1b[0m: server:lax\\r\\n\\r\\n\\u276f 1. I am using this for local development\\r\\n  2. Exit\\r\\n');
let all = '';
process.stdin.on('data', (d) => {
  all += d; fs.writeFileSync(${JSON.stringify(KEYS)}, all);
  if (all === '\\r') process.stdout.write('\\x1b[2J\\x1b[Hready\\r\\n');
  if (all === '2') process.exit(1);
  if (all.endsWith('bye')) process.exit(0);
});
`, { mode: 0o755 });

const keys = () => { try { return fs.readFileSync(KEYS, 'utf8'); } catch { return ''; } };
const consent = (home) => { try { return JSON.parse(fs.readFileSync(path.join(home, 'consent.json'), 'utf8')); } catch { return null; } };
function lax(home) {
  fs.rmSync(KEYS, { force: true });
  const t = { screen: '', exit: null };
  t.term = pty.spawn(process.execPath, [path.join(ROOT, 'bin', 'claude-lax.mjs')], { cols: 100, rows: 30, cwd: TMP,
    env: { ...process.env, LAX_HOME: home, LAX_DATA: '', LAX_CLAUDE: FAKE } });
  t.term.onData((d) => { t.screen += d; }); t.term.onExit((e) => { t.exit = e; });
  return t;
}

const A = path.join(TMP, 'a');
let t = lax(A);
await until(() => t.screen.includes('local development'));
await sleep(2000);
check('the first time, the warning waits for you: Lax doesn\'t answer it', keys() === '' && !consent(A), JSON.stringify(keys()));
t.term.write('\r');
await until(() => t.screen.includes('ready'));
check('…you answer it and Claude carries on → kept', await until(() => !!consent(A)?.devChannels, 6000), JSON.stringify(consent(A)));
t.term.write('bye'); await until(() => t.exit);

t = lax(A);
check('next time, Lax answers it for you', await until(() => keys() === '\r' && t.screen.includes('ready'), 6000), JSON.stringify(keys()));
t.term.write('bye'); await until(() => t.exit);

const B = path.join(TMP, 'b');
t = lax(B);
await until(() => t.screen.includes('local development'));
t.term.write('2');
await until(() => t.exit); await sleep(3500);
check('"2. Exit" instead → nothing kept', !consent(B), JSON.stringify(consent(B)));

console.log(failed ? `\n${failed} consent check(s) failed` : '\nall consent checks passed');
process.exit(failed ? 1 : 0);
