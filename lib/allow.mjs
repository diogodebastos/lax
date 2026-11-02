// What Lax's assistant may do without asking the phone first (it runs headless: the phone is its only terminal).
//   bashKind(command, cwd)  'read'  only looking (ls, cat, grep, git status/log/diff…)
//                           'local' a local step you can undo (npm test, node --check, git add/commit, mkdir in a repo or /tmp)
//                           null    anything else: ask
//   grantKey(tool, input)   what one yes on the phone covers until the assistant finishes answering: edits anywhere in that
//                           repo, or the same command again. null for what asks every time (push, rm, sending, outside repos).
// Strict on purpose: every part of a chain must pass, with no writes (>), no substitution ($(…), backticks) and no flags
// that make a reader write or run things (sed -i, find -exec…).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { offLimits } from './guard.mjs';

const READERS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'rg', 'pwd', 'echo', 'printf', 'date', 'which',
  'whoami', 'file', 'stat', 'du', 'df', 'tree', 'sort', 'uniq', 'cut', 'tr', 'column', 'nl', 'basename', 'dirname',
  'realpath', 'jq', 'diff', 'cd', 'true', 'test', 'uname', 'sw_vers', 'cal']);
const GIT_READ = new Set(['status', 'log', 'diff', 'show', 'branch', 'remote', 'rev-parse', 'ls-files', 'blame', 'describe', 'shortlog', 'tag']);
const GH = /^(issue|pr|repo|release|run) (view|list|status|diff|checks)\b/;
const TMP = [...new Set(['/tmp', '/private/tmp', os.tmpdir(), fs.realpathSync(os.tmpdir())])];
// Always asks, even right after a yes: it leaves the Mac, deletes, or acts as you.
// WhatsApp through this repo's lib/share.mjs: open, read and draft can never send, so they don't ask.
// Sending (`send`), raw osascript and everything else WhatsApp still asks.
const SHARE = path.join(path.dirname(new URL(import.meta.url).pathname), 'share.mjs');
// A new live session (lib/terminal.mjs lax <folder>) doesn't ask either: you asked for it, and it only opens a window.
const TERMINAL = path.join(path.dirname(new URL(import.meta.url).pathname), 'terminal.mjs');
const OCR = path.join(process.env.LAX_HOME || path.join(os.homedir(), '.lax'), 'bin', 'ocr');
const ALWAYS_ASK = /\b(share\.mjs\s+send|push|rm|rmdir|curl|wget|scp|ssh|rsync|osascript|open|gh|publish|sudo|kill|launchctl|systemctl|loginctl)\b/;

const home = (p) => p.replace(/^~(?=\/|$)/, os.homedir());
const inside = (p, dir) => (p + path.sep).startsWith(dir + path.sep);
/** The git repo a path is in (its top folder), or null. Works for files that don't exist yet and for worktrees. */
export function repoRoot(p) {
  for (let d = path.resolve(home(String(p || ''))); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    if (d === path.dirname(d)) return null;
  }
}

// Quoted text is just text ("fix: a -> b" in a commit message): blank it out before reading the command's shape.
// Substitution runs even inside double quotes, so it's refused before that.
function shape(command) {
  const c = String(command || '').replace(/\d?>\s*\/dev\/null|2>&1/g, ' ');
  if (!c.trim() || /`|\$\(|<\(|<</.test(c)) return null;
  const masked = c.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'[^']*'/g, "''");
  return /[>\n]/.test(masked) || /["']/.test(masked.replace(/""|''/g, '')) ? null : masked; // a stray quote: can't tell, ask
}

function partKind(words, cwd) {
  const [cmd, ...rest] = words, args = rest.join(' ');
  if (cmd === 'git') {
    let i = 0, dir = cwd;
    for (; i < rest.length && rest[i].startsWith('-'); i++) {
      if (rest[i] === '-C') dir = path.resolve(cwd, home(rest[++i] || ''));
      else if (rest[i] === '-c') i++;
    }
    const sub = rest[i], subArgs = ' ' + rest.slice(i + 1).join(' ');
    if (GIT_READ.has(sub) && !/\s-(D|d|m|M)\b|--delete|--set-url|\s(add|remove|rename|set-head|prune)\b/.test(subArgs)) return 'read';
    if ((sub === 'add' || sub === 'commit') && repoRoot(dir)) return 'local';
    return null;
  }
  if (cmd === 'gh') return GH.test(args) ? 'read' : null;
  if (cmd === 'sed') return /(^|\s)-n\b/.test(args) && !/(^|\s)-i|\bw\s|\/w\b|\be\b/.test(args) ? 'read' : null;
  if (cmd === 'find') return /-(exec|execdir|ok|okdir|delete|fprint|fprintf|fls)\b/.test(args) ? null : 'read';
  if (cmd === 'sort') return /(^|\s)-o\b/.test(args) ? null : 'read';
  if (cmd === 'npm') return /^(test|t)(\s|$)|^run test(\s|$)/.test(args) && repoRoot(cwd) ? 'local' : null;
  if (cmd === 'node') {
    if (/^(--check|-c)\s/.test(args)) return 'local';
    const ours = rest[0] && path.resolve(cwd, home(rest[0]));
    if (ours === TERMINAL) { // a new `lax` session in a real folder: it only opens a window, and always runs `lax`
      const dir = rest[2] && path.resolve(cwd, home(rest[2]));
      return rest[1] === 'lax' && rest.length === 3 && fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ? 'local' : null;
    }
    return ours === SHARE && ['open', 'read', 'draft'].includes(rest[1]) ? 'local' : null;
  }
  if (cmd === 'screencapture') { // a still of the screen into a temp file: nothing interactive, nothing that opens it
    const files = rest.filter((w) => !w.startsWith('-'));
    return files.length && rest.every((w) => !w.startsWith('-') || /^-(x|o|C|R[\d,.]+|l\d+|t\w+)$/.test(w))
      && files.every((f) => TMP.some((t) => inside(path.resolve(cwd, home(f)), t))) ? 'local' : null;
  }
  if (path.resolve(cwd, home(cmd)) === OCR) return 'read';
  if (cmd === 'mkdir') {
    const dirs = rest.filter((w) => !w.startsWith('-'));
    return dirs.length && dirs.every((d) => { const p = path.resolve(cwd, home(d)); return TMP.some((t) => inside(p, t)) || !!repoRoot(p); }) ? 'local' : null;
  }
  return READERS.has(cmd) ? 'read' : null;
}

export function bashKind(command, cwd = process.cwd()) {
  const c = shape(command); if (c === null) return null;
  let kind = 'read';
  for (const part of c.split(/&&|\|\||[|;]/)) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const k = partKind(words, cwd);
    if (!k) return null;
    if (k === 'local') kind = 'local';
    if (words[0] === 'cd') cwd = path.resolve(cwd, home(words[1] || os.homedir()));
  }
  return kind;
}
export const readOnlyBash = (command, cwd) => bashKind(command, cwd) === 'read';

// Free hands (settings.json `freeHands`, a toggle on the phone): on a machine that is Lax's own, it works like Claude
// Code's auto mode. It does what it needs to without asking, and asks only for what deletes, logs in or acts as you, runs as
// root, leaves the machine, or changes its own guardrails. Its secrets and database stay refused (that's the hook, before this).
const FREE_DELETE = /(^|[\s;&|(])(rm|rmdir|unlink|shred|trash|trash-put|gio\s+trash|truncate|dd|mkfs(\.\w+)?|wipefs|fdisk|parted)(\s|$)/;
const FREE_GIT = /\bgit\b[^;&|]*\s(push|clean|reset\s+[^;&|]*--hard|reset\s+--hard|stash\s+(drop|clear)|branch\s+[^;&|]*(-[dD]\b|--delete)|worktree\s+(remove|prune)|tag\s+[^;&|]*(-d\b|--delete)|remote\s+(remove|rm|set-url)|checkout\s+[^;&|]*--\s|restore\b|filter-branch|filter-repo|update-ref\s+-d|reflog\s+(expire|delete)|gc\s+[^;&|]*--prune)/;
const FREE_LOGIN = /\b(login|logout|auth|passwd|chpasswd|ssh-keygen|ssh-add|ssh-copy-id|gpg|keyring|secret-tool|setup-token|rotate-token)\b/;
const FREE_ROOT = /(^|[\s;&|(])(sudo|su|doas|pkexec|chown|chattr|visudo|usermod|useradd|userdel)(\s|$)/;
const FREE_OUT = /(^|[\s;&|(])(ssh|scp|sftp|rsync|osascript|crontab|reboot|shutdown|poweroff|halt|systemctl|launchctl|loginctl|kill|pkill|killall|cloudflared)(\s|$)|\bnpm\s+(publish|unpublish|deprecate|owner|token|adduser)\b|\b(twine|cargo)\s+(upload|publish|login)\b|\bgh\s+(?!(issue|pr|repo|release|run|search|api)\s+(view|list|status|diff|checks|search)\b)\S|\bshare\.mjs\s+send\b|\bcurl\b[^;&|]*\s(-X\s*(POST|PUT|PATCH|DELETE)|-d\b|--data|-F\b|--form|-T\b|--upload-file)|\bwget\b[^;&|]*--post|\bfind\b[^;&|]*\s-delete\b|\bxargs\b[^;&|]*\brm\b|\bchmod\s+[^;&|]*(-R|777)/;

/** Under free hands: null if Lax may just do it, or why it still asks. `body` is Lax's own repo (its guardrails). */
export function freeAsk(tool, input = {}, cwd = process.cwd(), { body, home: laxHome, mind } = {}) {
  const ti = input || {};
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) {
    const f = ti.file_path || ti.notebook_path || '';
    if (!f) return 'no file';
    const abs = path.resolve(cwd, home(f)), claudeDir = path.join(os.homedir(), '.claude');
    if (mind && inside(abs, mind)) return null;
    if (laxHome && inside(abs, laxHome)) return 'Lax\'s home outside its mind (settings, wishes, secrets)';
    if (inside(abs, claudeDir) && /settings(\.local)?\.json$|\.credentials/.test(abs)) return 'Claude Code\'s own settings or login';
    if (/(^|\/)(\.env[^/]*|\.netrc|\.npmrc|\.pypirc|id_[a-z0-9]+|[^/]+\.pem|credentials[^/]*)$/i.test(abs) || inside(abs, path.join(os.homedir(), '.ssh'))) return 'keys or tokens';
    const root = repoRoot(abs);
    if (root && guarded(root, body) && offLimits(path.relative(root, abs))) return 'Lax\'s own guardrails';
    return null;
  }
  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    if (!cmd.trim()) return 'empty command';
    if (FREE_DELETE.test(cmd) || FREE_GIT.test(cmd)) return 'it deletes or throws work away';
    if (FREE_LOGIN.test(cmd)) return 'it logs in or touches keys';
    if (FREE_ROOT.test(cmd)) return 'it runs as root';
    if (FREE_OUT.test(cmd)) return 'it leaves this machine, sends, or stops something running';
    if (/hooks\/lax-hook\.mjs|lib\/(allow|guard|auth|paths)\.mjs|\.claude\/settings/.test(cmd) && bashKind(cmd, cwd) !== 'read') return 'Lax\'s own guardrails';
    return null;
  }
  return 'not a file edit or a command'; // connected apps (mail, calendar…) act as you: each one asks
}
// Lax's body and its worktrees share guardrails (lib/guard.mjs).
function guarded(root, body) {
  if (body && path.resolve(root) === path.resolve(body)) return true;
  try { return fs.existsSync(path.join(root, 'hooks', 'lax-hook.mjs')) && fs.existsSync(path.join(root, 'lib', 'allow.mjs')); } catch { return false; }
}

/** What a yes for this tool call also covers until the assistant finishes answering (null: nothing, ask again). */
export function grantKey(tool, input = {}, cwd = process.cwd()) {
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) {
    const file = input.file_path || input.notebook_path || '';
    const root = file && repoRoot(path.resolve(cwd, file));
    return root ? `edit:${root}` : null;
  }
  if (tool === 'Bash') {
    const cmd = String(input.command || '').trim();
    return cmd && !ALWAYS_ASK.test(cmd) ? `bash:${cmd}` : null;
  }
  return null; // connected apps (calendar, mail…) and the rest: they act as you, so every one asks
}
