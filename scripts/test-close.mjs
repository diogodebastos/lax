// "Close the quokka session" by voice, end to end on a PRIVATE Lax (own port + temp data dir): the session's claude
// process ends, its tab leaves the phone, a busy one asks first, a dead one is only reported. The claude is a stand-in:
// `sleep` linked as claude, so the hub's "is it a running claude?" check (lib/claude-pid.mjs) holds.
// The hub also lists the real sessions on this Mac (~/.claude/sessions), so the names here are ones no project has.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { freePort } from './free-port.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = await freePort(), LAX = `http://127.0.0.1:${PORT}`, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-test-'));
const ENV = { ...process.env, LAX_HOME: DATA, LAX_PORT: String(PORT), LAX_URL: LAX, LAX_PUBLIC_URL: '', LAX_CLAUDE: '/usr/bin/false' };
delete ENV.LAX_DATA;
const server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { env: ENV, stdio: 'ignore' });
const fakes = [];
const cleanup = () => { server.kill(); for (const f of fakes) try { f.kill('SIGKILL'); } catch {} fs.rmSync(DATA, { recursive: true, force: true }); };
process.on('exit', cleanup);
for (let i = 0; i < 50 && !fs.existsSync(path.join(DATA, 'secrets', 'token')); i++) await new Promise((r) => setTimeout(r, 100));
for (let i = 0; i < 50; i++) { try { await fetch(LAX + '/'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
const TOKEN = fs.readFileSync(path.join(DATA, 'secrets', 'token'), 'utf8').trim();
const post = (p, b) => fetch(LAX + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': TOKEN }, body: JSON.stringify(b) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const phone = [];
(async () => {
  const res = await fetch(`${LAX}/api/stream?t=${TOKEN}`);
  let buf = '';
  for await (const c of res.body) {
    buf += Buffer.from(c).toString(); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(blk)?.[1], d = /^data: (.*)$/m.exec(blk)?.[1]; if (ev && d) phone.push({ ev, d: JSON.parse(d) }); }
  }
})();
const tabs = () => phone.filter((e) => e.ev === 'state').pop()?.d?.sessions?.map((s) => s.project) || [];
const said = async (re) => { for (let i = 0; i < 40; i++) { const b = phone.filter((e) => e.ev === 'bubble' && re.test(e.d.text || '')).pop(); if (b) return b.d; await sleep(250); } return null; };

// A stand-in claude per session, and its SessionStart as the hooks send it.
// On Linux a copied sleep may be a multicall binary that goes by its name (uutils, Ubuntu 25.10+), and node renames
// itself MainThread: sh, by a link named claude (its process name), waits on a pipe instead (a builtin, no child).
const LINUX = process.platform === 'linux';
const bin = path.join(DATA, 'bin'); fs.mkdirSync(bin);
fs.symlinkSync(LINUX ? '/bin/sh' : '/bin/sleep', path.join(bin, 'claude')); // a link, not a copy: macOS kills a copied Apple binary (SIGKILL)
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function open(sid, project) {
  const p = spawn(path.join(bin, 'claude'), LINUX ? ['-c', 'read x'] : ['600'], { stdio: [LINUX ? 'pipe' : 'ignore', 'ignore', 'ignore'] }); fakes.push(p);
  const exited = new Promise((r) => p.on('exit', r));
  await post('/api/hook', { hook_event_name: 'SessionStart', session_id: sid, cwd: `/tmp/${project}`, lax_session_pid: p.pid, lax_where: 'cli' });
  return { p, exited };
}

const quo = await open('s-quo', 'quokka'), wom = await open('s-wom', 'wombat-pond');
await sleep(300);
check('both sessions have a tab', tabs().includes('quokka') && tabs().includes('wombat-pond'), JSON.stringify(tabs()));

await post('/api/talk', { text: 'close the quokka session', voice: true });
const closed = await said(/^Closed quokka/);
await Promise.race([quo.exited, sleep(2000)]);
check('"close the quokka session": its claude ends', !!closed && !alive(quo.p.pid), closed?.text);await sleep(200);
check('…its tab leaves the phone, the other stays', !tabs().includes('quokka') && tabs().includes('wombat-pond'), JSON.stringify(tabs()));

await post('/api/talk', { text: 'close the zorblat session', voice: true });
check('an unknown name: nothing closes, it says what is open', /wombat-pond·cli/.test((await said(/No session is called/))?.text || '') && alive(wom.p.pid));
await post('/api/talk', { text: 'close the readme' }); // not a session: a message for Lax's assistant
await sleep(400);
check('"close the readme" is not a close', alive(wom.p.pid) && tabs().includes('wombat-pond'));

// The same project twice: it asks which.
const two = await open('s-wom2', 'wombat-pond');
await post('/api/talk', { text: 'end wombat pond', voice: true });
check('two alike: it asks which, closes neither', !!(await said(/Several sessions match/)) && alive(wom.p.pid) && alive(two.p.pid));
two.p.kill(); await post('/api/hook', { hook_event_name: 'SessionEnd', session_id: 's-wom2', cwd: '/tmp/wombat-pond' });

// Busy: it asks first; Cancel leaves it running, Close ends it.
await post('/api/hook', { hook_event_name: 'UserPromptSubmit', session_id: 's-wom', cwd: '/tmp/wombat-pond', prompt: 'refactor everything' });
await post('/api/talk', { text: 'close the wombat pond session', voice: true });
let q = await said(/still working\. Close it anyway/);
check('a working session: it asks before closing', !!q && alive(wom.p.pid));
if (q) await post('/api/decide', { id: q.id, decision: 'answer', answers: { [q.questions[0].question]: 'Cancel' } });
await sleep(500);
check('…Cancel leaves it running', alive(wom.p.pid));
const asked = phone.length;
await post('/api/talk', { text: 'close the wombat pond session', voice: true });
for (let i = 0; i < 20 && !(q = phone.slice(asked).find((e) => e.ev === 'bubble' && /still working/.test(e.d.text || ''))?.d); i++) await sleep(100);
if (q) await post('/api/decide', { id: q.id, decision: 'answer', answers: { [q.questions[0].question]: 'Close' } });
await said(/^Closed wombat-pond/); await Promise.race([wom.exited, sleep(2000)]);
await sleep(200);
check('…Close ends it', !alive(wom.p.pid) && !tabs().includes('wombat-pond'), JSON.stringify(tabs()));

// A session whose pid isn't a running claude (here: this test's own node): reported, nothing is signalled.
await post('/api/hook', { hook_event_name: 'SessionStart', session_id: 's-ghost', cwd: '/tmp/ghostly-yak', lax_session_pid: process.pid, lax_where: 'cli' });
await post('/api/talk', { text: 'close ghostly yak', voice: true });
check('not a running claude: it says so, kills nothing', !!(await said(/ghostly-yak isn't running/)) && alive(process.pid));

console.log(failed ? `\n${failed} check(s) failed` : '\nall close checks passed');
process.exit(failed ? 1 : 0);
