// A new terminal window on the Mac running a command in a folder (used by /lax and by "open on mac").
// LAX_TERMINAL=Ghostty|iTerm|Terminal picks the app (default: the first one installed, in that order).
import fs from 'node:fs';
import { execFile } from 'node:child_process';

export const terminalApp = () => process.env.LAX_TERMINAL || ['Ghostty', 'iTerm'].find((a) => fs.existsSync(`/Applications/${a}.app`)) || 'Terminal';
// "open on the mac", "continue this on my Mac": said to Lax, it opens Lax's own conversation there.
export const ON_MAC = /^(please )?(open|continue|move|take)( (this|it|that|us))?( (on|to) (the |my )?mac)\b/i;
export const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`; // shell quoting

/** The AppleScript that opens `app` in `cwd` running `cmd` (in an interactive login shell, so PATH is the user's own). */
export function terminalScript(app, cwd, cmd) {
  const as = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const line = `cd ${q(cwd)} && ${cmd}`, shell = `/bin/zsh -ilc ${q(line)}`;
  return {
    // Ghostty 1.3+ is scriptable: a new window with its own folder and command.
    Ghostty: `tell application "Ghostty"\nactivate\nnew window with configuration {initial working directory:"${as(cwd)}", command:"${as(shell)}"}\nend tell`,
    iTerm: `tell application "iTerm"\nactivate\ncreate window with default profile command "${as(shell)}"\nend tell`,
    Terminal: `tell application "Terminal"\nactivate\ndo script "${as(line)}"\nend tell`,
  }[app] || null;
}

// `node lib/terminal.mjs lax <folder>`: a new live `lax` session in that folder, in its own window. Lax's assistant runs it
// without asking (lib/allow.mjs): the command is always `lax`, only the folder varies, and it must be a real folder.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [what, dir] = process.argv.slice(2);
  if (what !== 'lax' || !dir || !fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error('usage: node lib/terminal.mjs lax <folder>'); process.exit(1);
  }
  openTerminal(fs.realpathSync(dir), 'lax').then((app) => console.log(`a new lax session is open in ${app}, in ${dir}`),
    (e) => { console.error(e.message); process.exit(1); });
}

/** Opens it; resolves with the app's name, rejects with why it couldn't. */
export function openTerminal(cwd, cmd, app = terminalApp()) {
  const script = terminalScript(app, cwd, cmd);
  if (!script) return Promise.reject(new Error(`Unknown LAX_TERMINAL: ${app} (use Ghostty, iTerm or Terminal).`));
  return new Promise((resolve, reject) => execFile('osascript', ['-e', script], { timeout: 15000 },
    (err, _out, stderr) => err ? reject(new Error(`Couldn't open ${app}: ${String(stderr || err.message).trim()}`)) : resolve(app)));
}
