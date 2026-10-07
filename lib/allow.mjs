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
const OCR = path.join(process.env.LAX_HOME || path.join(os.homedir(), '.lax'), 'bin', 'ocr');
const ALWAYS_ASK = /\b(share\.mjs\s+send|push|rm|rmdir|curl|wget|scp|ssh|rsync|osascript|open|gh|publish|sudo|kill|launchctl)\b/;

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
    const ours = rest[0] && path.resolve(cwd, home(rest[0])) === SHARE;
    return ours && ['open', 'read', 'draft'].includes(rest[1]) ? 'local' : null;
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
