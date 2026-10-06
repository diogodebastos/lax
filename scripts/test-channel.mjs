// End-to-end check of the lax channel without Claude Code: spawn it over stdio like Claude Code does,
// then drive a Lax server and assert each hop (talk → channel event, reply → bubble, relay → verdict, hook de-dup).
// Runs against a PRIVATE Lax (own port + temp data dir), so your real Lax never sees test sessions, XP or feed lines.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 7798, LAX = `http://127.0.0.1:${PORT}`, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-test-'));
// A throwaway Lax home: memory, secrets and mind all in a temp folder.
const ENV = { ...process.env, LAX_HOME: DATA, LAX_PORT: String(PORT), LAX_URL: LAX, LAX_PUBLIC_URL: '' };
delete ENV.LAX_DATA;
const server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { env: ENV, stdio: 'ignore' });
const cleanup = () => { server.kill(); fs.rmSync(DATA, { recursive: true, force: true }); };
process.on('exit', cleanup);
for (let i = 0; i < 50 && !fs.existsSync(path.join(DATA, 'secrets', 'token')); i++) await new Promise((r) => setTimeout(r, 100));
await new Promise((r) => setTimeout(r, 300));
const TOKEN = fs.readFileSync(path.join(DATA, 'secrets', 'token'), 'utf8').trim();
const H = { 'content-type': 'application/json', 'x-lax-token': TOKEN };
const post = (p, b) => fetch(LAX + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

// Watch what the phone would see.
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

const got = [];
const client = new Client({ name: 'fake-claude-code', version: '0' }, { capabilities: {} });
client.fallbackNotificationHandler = async (n) => { got.push(n); };
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'channel', 'lax-channel.mjs')], cwd: ROOT, stderr: 'ignore', env: { ...ENV, LAX_CHANNEL_FORCE: '1' } }));
const caps = client.getServerCapabilities();
check('channel declares claude/channel + permission relay', !!caps.experimental?.['claude/channel'] && !!caps.experimental?.['claude/channel/permission']);
check('reply tool listed', (await client.listTools()).tools.some((t) => t.name === 'reply'));
await sleep(800);
const state = phone.filter((e) => e.ev === 'state').pop()?.d;
check('server sees the live session', state?.channels?.length >= 1, JSON.stringify(state?.channels?.map((c) => c.project)));

check('talking goes to Lax\'s assistant by default', state?.voiceTarget === 'background', state?.voiceTarget);
// Open the live session's tab (as the phone does), so talking goes into it, not to the assistant.
await post('/api/target', { target: state?.channels?.[0]?.cid });
await post('/api/talk', { text: 'hello from the phone' });
await sleep(500);
const msg = got.find((n) => n.method === 'notifications/claude/channel');
check('talk → channel notification in the session', msg?.params?.content === 'hello from the phone', `chat_id=${msg?.params?.meta?.chat_id}`);

const r = await client.callTool({ name: 'reply', arguments: { chat_id: msg?.params?.meta?.chat_id, text: 'Done! I added the toggle.\n\n```js\ncode()\n```' } });
await sleep(400);
const bubble = phone.find((e) => e.ev === 'bubble' && e.d.kind === 'reply' && e.d.say);
check('reply tool → spoken bubble on phone', r.content[0].text === 'sent to Lax' && bubble?.d.say === 'Done! I added the toggle.', `say="${bubble?.d.say}"`);

await client.notification({ method: 'notifications/claude/channel/permission_request',
  params: { request_id: 'abcde', tool_name: 'Bash', description: 'Delete build output', input_preview: '{"command": "rm -rf dist"}' } });
await sleep(400);
const relay = phone.find((e) => e.ev === 'bubble' && e.d.id === 'relay-abcde');
check('permission relay → ✓/✗ bubble with details', !!relay && relay.d.details.includes('rm -rf dist'), relay?.d.text);
await post('/api/decide', { id: 'relay-abcde', decision: 'allow' });
await sleep(400);
const verdict = got.find((n) => n.method === 'notifications/claude/channel/permission');
check('✓ on phone → verdict back to the session', verdict?.params?.request_id === 'abcde' && verdict?.params?.behavior === 'allow');

// Same session's PermissionRequest hook must step aside for tool approvals (no duplicate bubble)…
const hook = (input) => execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'lax-hook.mjs')], { input: JSON.stringify(input), encoding: 'utf8', timeout: 15000, env: ENV });
const t0 = Date.now();
const out = hook({ hook_event_name: 'PermissionRequest', session_id: 'lax-test', cwd: ROOT, tool_name: 'Bash', tool_input: { command: 'ls' } });
check('hook steps aside for tool approvals in a channel session', out.trim() === '' && Date.now() - t0 < 3000, `${Date.now() - t0}ms`);
// …but questions still use the options UI.
const q = fetch(LAX + '/api/ask', { method: 'POST', headers: H, body: JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: 'lax-test', cwd: ROOT, tool_name: 'AskUserQuestion',
  tool_input: { questions: [{ question: 'Q?', header: 'h', multiSelect: false, options: [{ label: 'A' }, { label: 'B' }] }] } }) }).then((r) => r.json());
await sleep(400);
const qb = phone.find((e) => e.ev === 'bubble' && e.d.kind === 'question');
check('questions still go to the options UI', !!qb);
if (qb) await post('/api/decide', { id: qb.d.id, decision: 'answer', answers: { 'Q?': 'B' } });
check('question answered', (await q).answers?.['Q?'] === 'B');

hook({ hook_event_name: 'SessionEnd', session_id: 'lax-test', cwd: ROOT }); // don't leave a fake session chip behind
await client.close();
await sleep(600);
const after = phone.filter((e) => e.ev === 'state').pop()?.d;
check('closing the session unregisters the channel', (after?.channels?.length ?? 1) === (state?.channels?.length ?? 1) - 1);
// A shell command's output shows in the terminal, like a real one.
await post('/api/hook', { hook_event_name: 'PostToolUse', session_id: 's-out', cwd: '/tmp/out', tool_name: 'Bash', tool_input: { command: 'ls' },
  tool_response: { stdout: 'CLAUDE.md\nlearning.md\nprojects\n' } });
await sleep(200);
const outLine = phone.filter((e) => e.ev === 'feed' && e.d.kind === 'out').pop();
check('a command\'s output shows in the terminal', /CLAUDE\.md[\s\S]*projects/.test(outLine?.d.line || ''));

// Lax's own assistant has no terminal: even with "ask me on the phone" off, its requests come to the phone.
await post('/api/settings', { phoneApprovals: false });
const voiceHook = spawn(process.execPath, [path.join(ROOT, 'hooks', 'lax-hook.mjs')], { env: { ...ENV, LAX_VOICE: '1' }, stdio: ['pipe', 'pipe', 'ignore'] });
let voiceOut = ''; voiceHook.stdout.on('data', (d) => (voiceOut += d));
voiceHook.stdin.end(JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'assistant-x', cwd: '/tmp', tool_name: 'Bash', tool_input: { command: 'ls' } }));
let ask; for (let i = 0; i < 40 && !ask; i++) { await sleep(100); ask = phone.filter((e) => e.ev === 'bubble' && e.d.kind === 'permission' && /\$ ls/.test(e.d.text)).pop(); }
check('approvals off: Lax\'s own request still asks the phone', !!ask);
if (ask) await post('/api/decide', { id: ask.d.id, decision: 'allow' });
await new Promise((r) => voiceHook.on('close', r));
check('…and your yes gets back to it', /"permissionDecision":"allow"/.test(voiceOut));
await post('/api/settings', { phoneApprovals: true });

console.log(failed ? `\n${failed} check(s) failed` : '\nall channel checks passed');
process.exit(failed ? 1 : 0);
