// Telling a live session (lib/tell.mjs): which session "the reports one" is, and end to end on a PRIVATE Lax: Lax's voice
// assistant calls `tell` → the words arrive in that live session, marked as passed on; an unknown name sends nothing; and
// the guardrail asks the phone before `tell` runs (it isn't one of the tools that go through without asking).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { matchSession } from '../lib/tell.mjs';
import { freePort } from './free-port.mjs';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- which session ----------
const live = [{ cid: 'a', project: 'reports', active: 1 }, { cid: 'b', project: 'edge-cavai', active: 2 }, { cid: 'c', project: 'lax', active: 3 }];
check('"the reports session" → reports', matchSession(live, 'the reports session').cid === 'a');
check('"edge cava" (dictated) → edge-cavai', matchSession(live, 'edge cava').cid === 'b');
check('"Lax tab" → lax', matchSession(live, 'Lax tab').cid === 'c');
check('unknown → the names that are live', JSON.stringify(matchSession(live, 'fisicai').names) === JSON.stringify(['reports', 'edge-cavai', 'lax']));
check('two projects match → ask which', matchSession([...live, { cid: 'd', project: 'reports-old' }], 'rep').many?.length === 2);
check('the same project twice → the most recently active', matchSession([...live, { cid: 'e', project: 'reports', active: 9 }], 'reports').cid === 'e');
check('no name, one session → that one; several → ask', matchSession([live[0]], 'the session').cid === 'a' && !matchSession(live, 'session').cid);

// ---------- end to end ----------
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = await freePort(), LAX = `http://127.0.0.1:${PORT}`, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-tell-'));
const REPORTS = path.join(DATA, 'reports'); fs.mkdirSync(REPORTS);
const ENV = { ...process.env, LAX_HOME: DATA, LAX_PORT: String(PORT), LAX_URL: LAX, LAX_PUBLIC_URL: '', LAX_SESSION_PID: String(process.pid) };
delete ENV.LAX_DATA; delete ENV.LAX_VOICE; delete ENV.LAX_BUILD; // a build's fence on its own steps isn't the hook under test
const server = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.mjs')], { env: ENV, stdio: 'ignore' });
process.on('exit', () => { server.kill(); fs.rmSync(DATA, { recursive: true, force: true }); });
for (let i = 0; i < 50 && !fs.existsSync(path.join(DATA, 'secrets', 'token')); i++) await sleep(100);
for (let i = 0; i < 50; i++) { try { await fetch(LAX + '/'); break; } catch { await sleep(100); } } // then until it answers

const connect = async (env, cwd, onNote) => {
  const c = new Client({ name: 'fake-claude-code', version: '0' }, { capabilities: {} });
  if (onNote) c.fallbackNotificationHandler = async (n) => { onNote(n); };
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'channel', 'lax-channel.mjs')], cwd, stderr: 'ignore', env: { ...ENV, ...env } }));
  return c;
};
const got = [];
await connect({ LAX_CHANNEL_FORCE: '1' }, REPORTS, (n) => got.push(n)); // a live session in "reports"
const voice = await connect({ LAX_CHANNEL_FORCE: '0', LAX_VOICE: '1' }, DATA); // Lax's own assistant
await sleep(800);
const tools = (await voice.listTools()).tools.map((t) => t.name);
check('the voice assistant has `tell`', tools.includes('tell'), tools.join(','));
const live2 = await connect({ LAX_CHANNEL_FORCE: '1' }, ROOT);
check('…a live session doesn\'t (sessions can\'t tell each other)', !(await live2.listTools()).tools.some((t) => t.name === 'tell'));

const r = await voice.callTool({ name: 'tell', arguments: { session: 'the reports session', text: 'restyle the guide with lax-brand' } });
await sleep(500);
const msg = got.find((n) => n.method === 'notifications/claude/channel');
check('tell → the words arrive in that session', msg?.params?.content === 'restyle the guide with lax-brand', r.content?.[0]?.text);
check('…marked as passed on by Lax, with a note', msg?.params?.meta?.via === 'lax' && /Passed on by Lax/.test(msg?.params?.meta?.note || ''));
const before = got.length;
const no = await voice.callTool({ name: 'tell', arguments: { session: 'fisicai', text: 'hello' } });
await sleep(300);
check('an unknown session: nothing sent, the live ones named', no.isError && got.length === before && /reports/.test(no.content?.[0]?.text), no.content?.[0]?.text);

// The guardrail: `tell` from a voice run isn't let through like `schedule`; it asks the phone (here, with no Lax to ask,
// the hook stays out of it and Claude Code's own permission check decides).
const hook = (tool) => JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'lax-hook.mjs')], { encoding: 'utf8',
  env: { ...process.env, LAX_BUILD: '', LAX_HOME: DATA, LAX_URL: 'http://127.0.0.1:1', LAX_VOICE: '1' },
  input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: DATA, tool_name: tool, tool_input: { session: 'reports', text: 'x' } }) }) || '{}')
  .hookSpecificOutput?.permissionDecision;
check('the guardrail doesn\'t let `tell` through without asking', hook('mcp__lax__tell') !== 'allow' && hook('mcp__lax__schedule') === 'allow');

console.log(failed ? `\n${failed} check(s) failed` : '\nall tell checks passed');
process.exit(failed ? 1 : 0);
