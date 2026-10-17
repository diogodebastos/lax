// `lax watch`: what Lax sees, live in a terminal on the Mac. The phone's feed, plus what the phone's Lax tab leaves
// out: the commands Lax's own assistant runs and their output.
//   lax watch            everything: your sessions and Lax
//   lax watch lax        only Lax (what you said, what it ran, what it answered)
//   lax watch <project>  only that project's sessions
//   --no-history         start from now (default: the last 40 lines first)
//   --lines N            output lines shown under a command (default 6)
//   --verbose            name the files behind "read 3 files"
// Read-only: it never answers anything. Requests that need you show up so you know to look at the phone.
import fs from 'node:fs';
import { readToken, SETTINGS } from '../lib/paths.mjs';
import { DEFAULT_COMPANION_NAME } from '../lib/names.mjs';

const argv = process.argv.slice(2);
const only = argv.find((a, i) => !a.startsWith('-') && argv[i - 1] !== '--lines')?.toLowerCase();
const backlog = argv.includes('--no-history') ? 0 : 40;
const PORT = Number(process.env.LAX_PORT || 7777);
const name = (() => { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')).name || DEFAULT_COMPANION_NAME; } catch { return DEFAULT_COMPANION_NAME; } })().toLowerCase();
const token = readToken();
if (!token) { console.log('Lax has never run here: start it first (npm start in the lax repo).'); process.exit(1); }

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => tty ? `\x1b[${code}m${s}\x1b[0m` : s;
const C = { dim: paint('2'), green: paint('32'), bold: paint('1'), red: paint('31'), amber: paint('33'), coral: paint('38;5;173'), blue: paint('34') };
const KIND = { prompt: C.bold, done: C.green, error: C.red, session: C.dim, out: C.dim, tool: (s) => s };
const time = (ts) => new Date(ts || Date.now()).toTimeString().slice(0, 8);

// Whose line it is: a project's, or Lax's (what you said to it and its answers carry its name; own: its commands).
const whose = (f) => f.own ? name : f.project || name;
// Laid out like the phone's terminal (public/lax.js feed): ● why, the command dim under it, a few lines of output,
// edits as +/- lines, reads folded into one line, a subagent's steps indented. Wrapped to the window, never back at the edge.
const width = () => Math.max(40, process.stdout.columns || 100);
const GUT = 7; // "HH:MM  "
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
function wrap(text, indent) { // soft wrap on spaces with a hanging indent
  const room = width() - GUT - indent, out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      if (line && plain(line).length + 1 + plain(w).length > room) { out.push(line); line = ''; }
      line = line ? line + ' ' + w : w;
      while (plain(line).length > room) { out.push(line.slice(0, room)); line = line.slice(room); }
    }
    out.push(line);
  }
  return out;
}
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const mcpName = (t) => { const n = t.split('__')[1] || ''; return /^[0-9a-f-]{20,}$/.test(n) ? 'connector' : n.replace(/^claude[_-]/i, '').replace(/[_-]+/g, ' ').toLowerCase(); };
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const lines = Math.max(1, Number(argv[argv.indexOf('--lines') + 1]) || 6);
let last = null, stamp = '', group = null, groupTimer = null;
function out(text, { mark = '', indent = 0, paint = (s) => s, sub = false } = {}) {
  const m = time().slice(0, 5), lead = sub ? '│ ' : '', ind = indent + lead.length;
  wrap(text, ind + mark.length).forEach((l, i) => {
    const g = i === 0 && m !== stamp ? C.dim(m.padEnd(GUT)) : ' '.repeat(GUT);
    if (i === 0) stamp = m;
    console.log(g + ' '.repeat(indent) + C.dim(lead) + (i === 0 ? mark : ' '.repeat(plain(mark).length)) + paint(l));
  });
}
function flush() {
  clearTimeout(groupTimer); if (!group) return;
  const n = group.n, g = group; group = null;
  out(Object.entries(n).map(([w, c]) => w === 'read' ? 'read ' + plural(c, 'file') : w === 'searched' ? 'searched ' + plural(c, 'pattern')
    : w === 'listed' ? 'listed ' + plural(c, 'folder') : `${w} ${plural(c, 'call')}`).join(' · ')
    + (verbose ? '  ' + g.names.join(', ') : ''), { indent: 2, paint: C.dim, sub: g.sub });
}
const verbose = argv.includes('--verbose');
const md = (t) => t.replace(/\*\*([^*\n]+)\*\*/g, (_, b) => C.bold(b)).replace(/`([^`\n]+)`/g, (_, c) => C.coral(c)).replace(/^#{1,6}\s+(.*)$/gm, (_, h) => C.bold(h));
function show(f) {
  const who = whose(f), sub = !!f.agent;
  if (only && who.toLowerCase() !== only) return;
  if (!f.tool || !/^(Read|Grep|Glob|LS|NotebookRead|mcp__.*)$/.test(f.tool) || f.kind !== 'tool') flush();
  if (who !== last) { stamp = ''; if (!only) console.log('\n' + (who === name ? C.coral : C.blue)(`── ${who} `) + C.dim('─'.repeat(Math.max(4, width() - who.length - 4)))); last = who; }
  if (f.kind === 'tool' && f.tool && /^(Read|Grep|Glob|LS|NotebookRead|mcp__.*)$/.test(f.tool)) {
    group ??= { n: {}, names: [], sub };
    const k = /Read/.test(f.tool) ? 'read' : f.tool === 'LS' ? 'listed' : f.tool.startsWith('mcp__') ? mcpName(f.tool) : 'searched';
    group.n[k] = (group.n[k] || 0) + 1; group.names.push(f.line.replace(/^\w+ /, ''));
    clearTimeout(groupTimer); groupTimer = setTimeout(flush, 1500);
  } else if (f.kind === 'tool' && f.tool) {
    const label = f.tool === 'Bash' ? f.desc || '$ ' + (f.cmd || '').split('\n')[0]
      : /^(Edit|MultiEdit)$/.test(f.tool) ? `Update ${f.file}` : f.tool === 'Write' ? `Write ${f.file}` : f.line;
    out(label, { mark: C.blue('● '), sub });
    if (f.tool === 'Bash' && f.desc && f.cmd) { const l = f.cmd.split('\n');
      out('$ ' + l.slice(0, 3).join('\n') + (l.length > 3 ? `\n… ${plural(l.length - 3, 'more line')}` : ''), { indent: 2, paint: C.dim, sub }); }
  } else if (f.kind === 'out' && f.out) {
    const room = width() - GUT - 4 - (sub ? 2 : 0);
    f.out.slice(0, lines).forEach((l, i) => out(cut(l.replace(/\t/g, '  '), room), { indent: 2, mark: C.dim(i ? '  ' : '└ '), paint: C.dim, sub }));
    if (f.total > lines) out(`… ${plural(f.total - lines, 'more line')}`, { indent: 4, paint: C.dim, sub });
  } else if (f.kind === 'diff' && f.diff) {
    out(`${C.green('+' + f.diff.add)} ${C.red('-' + f.diff.del)}`, { indent: 2, mark: C.dim('└ '), sub });
    const room = width() - GUT - 4 - (sub ? 2 : 0);
    f.diff.lines.forEach((l) => out(cut(l, room), { indent: 4, paint: l[0] === '+' ? C.green : C.red, sub }));
  } else if (f.kind === 'say') {
    out(md(f.text || f.line.replace(/^● /, '')), { mark: '● ', sub });
  } else if (f.kind === 'done' && f.text) {
    out(md(f.text), { mark: C.green('✓ ') });
  } else if (f.kind === 'prompt') {
    console.log(); stamp = '';
    out(f.line.replace(/^> /, ''), { mark: C.dim('› '), paint: C.bold });
  } else {
    out(f.line.replace(/^ +/, ''), { indent: /^ /.test(f.line) ? 2 : 0, paint: KIND[f.kind] || KIND.tool, sub });
  }
}
function ask(b) {
  if (b.kind !== 'permission' && b.kind !== 'question') return;
  flush();
  console.log(`${C.dim(time())} ${C.amber(`? ${b.text}`)} ${C.dim('(answer on the phone)')}`);
}

let said = false;
async function watch() {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/stream?backlog=${backlog}`, { headers: { 'x-lax-token': token } });
  if (!res.ok) throw new Error(`Lax said ${res.status}`);
  if (!said || backlog) console.log(C.dim(`watching ${only || 'everything'} (ctrl-c to stop)`));
  said = true;
  let buf = '';
  for await (const chunk of res.body) {
    buf += Buffer.from(chunk).toString('utf8');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const msg = buf.slice(0, i); buf = buf.slice(i + 2);
      const event = msg.match(/^event: (.*)$/m)?.[1], data = msg.match(/^data: (.*)$/m)?.[1];
      if (!data) continue;
      try { if (event === 'feed') show(JSON.parse(data)); else if (event === 'bubble') ask(JSON.parse(data)); } catch {}
    }
  }
}

process.on('SIGINT', () => process.exit(0));
for (let quiet = false; ;) {
  try { await watch(); quiet = false; console.log(C.dim('… Lax went away, waiting for it')); }
  catch { if (!quiet) console.log(C.dim(`… Lax isn't running on :${PORT}, waiting for it`)); quiet = true; }
  await new Promise((r) => setTimeout(r, 2000));
}
