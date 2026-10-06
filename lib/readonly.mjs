// Is this shell command only looking? Lax's assistant runs such commands without asking the phone first.
// Strict on purpose: every part of a pipeline or chain must be a known reader, with no writes (>), no substitution
// ($(…), backticks) and no flags that make a reader write or run things (sed -i, find -exec…). Anything else asks.
const READERS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'rg', 'pwd', 'echo', 'printf', 'date', 'which',
  'whoami', 'file', 'stat', 'du', 'df', 'tree', 'sort', 'uniq', 'cut', 'tr', 'column', 'nl', 'basename', 'dirname',
  'realpath', 'jq', 'diff', 'cd', 'true', 'test', 'uname', 'sw_vers', 'cal']);
const GIT = new Set(['status', 'log', 'diff', 'show', 'branch', 'remote', 'rev-parse', 'ls-files', 'blame', 'describe', 'shortlog', 'tag']);
const GH = /^(issue|pr|repo|release|run) (view|list|status|diff|checks)\b/;

function partOk(part) {
  const words = part.trim().split(/\s+/);
  const [cmd, ...rest] = words, args = rest.join(' ');
  if (!cmd) return true;
  if (cmd === 'git') return GIT.has(rest.find((w) => !w.startsWith('-')) || '') && !/\s-(D|d|m|M)\b|--delete|--set-url|\b(add|remove|rename)\b/.test(' ' + args);
  if (cmd === 'gh') return GH.test(args);
  if (cmd === 'sed') return /(^|\s)-n\b/.test(args) && !/(^|\s)-i|\bw\s|\/w\b|\be\b/.test(args);
  if (cmd === 'find') return !/-(exec|execdir|ok|okdir|delete|fprint|fprintf|fls)\b/.test(args);
  if (cmd === 'sort') return !/(^|\s)-o\b/.test(args);
  return READERS.has(cmd);
}

export function readOnlyBash(command) {
  const c = String(command || '').replace(/\d?>\s*\/dev\/null|2>&1/g, ' ');
  if (!c.trim() || /[>`]|\$\(|<\(|\n/.test(c)) return false;
  return c.split(/&&|\|\||[|;]/).every(partOk);
}
