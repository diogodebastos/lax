// /lax: carry the current Claude Code conversation into a live `lax` session (one that hears you through Lax).
// Claude Code loads the Lax channel only at startup, so a running session can't switch on; instead this opens a
// new terminal window in the same folder running `lax --resume <this conversation>`.
//   node scripts/go-live.mjs [session-id] [--dry-run]   (id defaults to $CLAUDE_CODE_SESSION_ID, set inside Claude Code)
// LAX_TERMINAL=iTerm|Terminal picks the app (default: iTerm if installed, else Terminal).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { claudePid, processArgs } from '../lib/claude-pid.mjs';

const argv = process.argv.slice(2), dry = argv.includes('--dry-run');
const id = argv.find((a) => !a.startsWith('--')) || process.env.CLAUDE_CODE_SESSION_ID;
const cwd = process.cwd();
const fail = (msg) => { console.log(msg); process.exit(1); };

if (!id || !/^[0-9a-f-]{36}$/i.test(id)) fail('No conversation id: run this from inside a Claude Code session (or pass the id).');
const pid = claudePid();
if (pid && processArgs(pid).includes('server:lax')) fail('This session is already live: it hears you through Lax.');
// Conversations are stored per folder; resuming needs the same folder.
const transcript = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${id}.jsonl`);
if (!fs.existsSync(transcript)) fail(`Can't find this conversation under ${path.dirname(transcript)}; is this the folder it started in?`);
const LAX = path.join(os.homedir(), '.local', 'bin', 'lax');
if (!fs.existsSync(LAX)) fail('The `lax` command isn\'t installed: run `npm run install-channel` in the lax repo.');

const app = process.env.LAX_TERMINAL || (fs.existsSync('/Applications/iTerm.app') ? 'iTerm' : 'Terminal');
// An interactive login shell, so PATH (where `claude` lives) is the user's own.
const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const cmd = `cd ${q(cwd)} && exec ${q(LAX)} --resume ${id}`;
const as = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const script = app === 'iTerm'
  ? `tell application "iTerm"\nactivate\ncreate window with default profile command "/bin/zsh -ilc ${as(q(cmd))}"\nend tell`
  : `tell application "Terminal"\nactivate\ndo script "${as(cmd)}"\nend tell`;
if (dry) { console.log(`would open ${app} with: ${cmd}\n--- AppleScript ---\n${script}`); process.exit(0); }
try { execFileSync('osascript', ['-e', script], { stdio: ['ignore', 'ignore', 'pipe'] }); }
catch (e) { fail(`Couldn't open ${app}: ${String(e.stderr || e.message).trim()}\nRun it yourself: ${cmd}`); }
console.log(`Opened ${app}: lax --resume ${id} in ${cwd}.\nThe conversation continues there and hears you through Lax. Close this session so the two don't both write to it.`);
