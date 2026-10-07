// `lax watch`: what Lax sees, live in a terminal on the Mac. The phone's feed, plus what the phone's Lax tab leaves
// out: the commands Lax's own assistant runs and their output.
//   lax watch            everything: your sessions and Lax
//   lax watch lax        only Lax (what you said, what it ran, what it answered)
//   lax watch <project>  only that project's sessions
//   --no-history         start from now (default: the last 40 lines first)
// Read-only: it never answers anything. Requests that need you show up so you know to look at the phone.
import fs from 'node:fs';
import { readToken, SETTINGS } from '../lib/paths.mjs';

const argv = process.argv.slice(2);
const only = argv.find((a) => !a.startsWith('-'))?.toLowerCase();
const backlog = argv.includes('--no-history') ? 0 : 40;
const PORT = Number(process.env.LAX_PORT || 7777);
const name = (() => { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')).name || 'Lax'; } catch { return 'Lax'; } })().toLowerCase();
const token = readToken();
if (!token) { console.log('Lax has never run here: start it first (npm start in the lax repo).'); process.exit(1); }

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => tty ? `\x1b[${code}m${s}\x1b[0m` : s;
const C = { dim: paint('2'), bold: paint('1'), green: paint('32'), red: paint('31'), amber: paint('33'), coral: paint('38;5;173'), blue: paint('34') };
const KIND = { prompt: C.bold, done: C.green, error: C.red, session: C.dim, out: C.dim, tool: (s) => s };
const time = (ts) => new Date(ts || Date.now()).toTimeString().slice(0, 8);

// Whose line it is: a project's, or Lax's (what you said to it and its answers carry its name; own: its commands).
const whose = (f) => f.own ? name : f.project || name;
let last = null;
function show(f) {
  const who = whose(f);
  if (only && who.toLowerCase() !== only) return;
  if (who !== last && !only) { console.log((who === name ? C.coral : C.blue)(`── ${who} `) + C.dim('─'.repeat(30))); last = who; }
  const text = f.kind === 'out' ? f.line : f.line.split('\n').join('\n         ');
  console.log(`${C.dim(time(f.ts))} ${(KIND[f.kind] || KIND.tool)(text)}`);
}
function ask(b) {
  if (b.kind !== 'permission' && b.kind !== 'question') return;
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
