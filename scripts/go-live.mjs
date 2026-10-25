// /lax: carry the current Claude Code conversation into a live `lax` session (one that hears you through Lax).
// Claude Code loads the Lax channel only at startup, so a running session can't switch on; instead this opens a
// new terminal window in the same folder running `lax --resume <this conversation>`.
//   node scripts/go-live.mjs [session-id] [--dry-run]   (id defaults to $CLAUDE_CODE_SESSION_ID, set inside Claude Code)
// LAX_TERMINAL picks the app (lib/terminal.mjs: Ghostty|iTerm|Terminal on macOS, the terminal's command on Linux).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudePid, processArgs } from '../lib/claude-pid.mjs';
import { openTerminal, terminalApp, terminalArgs, terminalScript, q } from '../lib/terminal.mjs';

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

const app = terminalApp();
const cmd = `exec ${q(LAX)} --resume ${id}`;
if (process.platform === 'linux') {
  if (dry) { console.log(`would open ${app} with: ${cmd}\n--- argv ---\n${JSON.stringify([app, ...terminalArgs(app, cwd, cmd)])}`); process.exit(0); }
} else {
  const script = terminalScript(app, cwd, cmd);
  if (!script) fail(`Unknown LAX_TERMINAL: ${app} (use Ghostty, iTerm or Terminal).`);
  if (dry) { console.log(`would open ${app} with: ${cmd}\n--- AppleScript ---\n${script}`); process.exit(0); }
}
try { await openTerminal(cwd, cmd, app); }
catch (e) { fail(`${e.message}\nRun it yourself: cd ${q(cwd)} && ${cmd}`); }
console.log(`Opened ${app}: lax --resume ${id} in ${cwd}.\nThe conversation continues there and hears you through Lax. Close this session so the two don't both write to it.`);
