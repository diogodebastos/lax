#!/usr/bin/env node
// `lax` / `claude-lax`: Claude Code with the Lax channel, inside a small pseudo-terminal so Lax can type a few
// quick actions into it by voice ("clear", "stop", "plan mode", "context"…). Your terminal feels the same: raw keys,
// colours, resize and the exit code all pass straight through.
// Lax reaches it over a private Unix socket (its path is in LAX_PTY, which the channel reports to the server).
// The socket takes action NAMES only, from the closed list in lib/actions.mjs, never free text. A copy of the screen
// (@xterm/headless) lets it switch to a mode by reading the footer, and read status (/context, /usage) back to Lax.
// If node-pty can't load (or there's no terminal), this runs plain `claude` instead: no quick actions, all else the same.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { HOME } from '../lib/paths.mjs';
import { ACTIONS, screenMode } from '../lib/actions.mjs';

const CLAUDE = process.env.LAX_CLAUDE || 'claude';
const args = ['--dangerously-load-development-channels', 'server:lax', ...process.argv.slice(2)];
const env = { ...process.env };
delete env.CLAUDE_CODE_ENTRYPOINT; // a terminal opened by the desktop app (/lax) would label the tab ·mac

const require = createRequire(import.meta.url);
let pty = null, Terminal = null;
try { pty = require('node-pty'); } catch {}
try { ({ Terminal } = require('@xterm/headless')); } catch {} // without it: no plan mode or status, the rest still works

if (!pty || !process.stdin.isTTY || !process.stdout.isTTY) {
  for (const s of ['SIGINT', 'SIGQUIT']) process.on(s, () => {}); // Claude gets them from the terminal itself
  const child = spawn(CLAUDE, args, { stdio: 'inherit', env });
  child.on('exit', (code, sig) => process.exit(sig ? 128 + (os.constants.signals[sig] || 1) : code ?? 0));
} else {
  const dir = path.join(HOME, 'run'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const SOCK = path.join(dir, `pty-${process.pid}.sock`); fs.rmSync(SOCK, { force: true });
  const term = pty.spawn(CLAUDE, args, { name: process.env.TERM || 'xterm-256color', cwd: process.cwd(),
    cols: process.stdout.columns || 80, rows: process.stdout.rows || 24, env: { ...env, LAX_PTY: SOCK } });

  process.stdin.setRawMode(true); process.stdin.setEncoding('utf8'); process.stdin.resume();
  process.stdin.on('data', (d) => term.write(d));
  const vt = Terminal && new Terminal({ cols: term.cols, rows: term.rows, scrollback: 500, allowProposedApi: true });
  term.onData((d) => { process.stdout.write(d); vt?.write(d); });
  process.stdout.on('resize', () => { term.resize(process.stdout.columns, process.stdout.rows); vt?.resize(process.stdout.columns, process.stdout.rows); });
  const screen = () => { // the last 200 lines as text: enough for /context even in a short window
    const b = vt.buffer.active, out = [];
    for (let i = Math.max(0, b.length - 200); i < b.length; i++) out.push(b.getLine(i)?.translateToString(true) ?? '');
    return out.join('\n').replace(/\n+$/, '');
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const type = async (text) => { term.write(text); await sleep(150); term.write('\r'); };

  let busy = Promise.resolve(); // one action at a time
  const act = (name) => (busy = busy.then(async () => {
    const a = Object.hasOwn(ACTIONS, name) ? ACTIONS[name] : null;
    if (!a || ((a.mode || a.read) && !vt)) return { ok: false };
    if (a.keys) { term.write(a.keys); return { ok: true }; }
    if (a.mode) { // Shift+Tab through the modes until the footer shows it; a mode that isn't there stops a full cycle later
      const start = screenMode(screen());
      for (let i = 0; i < 8 && screenMode(screen()) !== a.mode; i++) {
        term.write('\x1b[Z'); await sleep(400);
        if (start && screenMode(screen()) === start) break;
      }
      return { ok: screenMode(screen()) === a.mode };
    }
    await type(a.text);
    if (!a.read) return { ok: true };
    await sleep(a.read);
    const shot = screen();
    if (a.close) { term.write('\x1b'); await sleep(600); } // let the panel close before anything else is typed
    return { ok: true, screen: shot };
  }).catch(() => ({ ok: false })));
  const server = net.createServer((sock) => {
    let buf = '';
    sock.setEncoding('utf8'); sock.on('error', () => {});
    sock.on('data', (d) => {
      buf += d; if (buf.length > 64) return sock.destroy();
      const i = buf.indexOf('\n'); if (i < 0) return;
      buf = buf.slice(0, i).trim(); act(buf).then((r) => sock.end(JSON.stringify(r)));
    });
  }).on('error', () => {}) // no socket (e.g. path too long): Claude runs as usual, just without quick actions
    .listen(SOCK, () => fs.chmodSync(SOCK, 0o600));

  const cleanup = () => { try { server.close(); fs.rmSync(SOCK, { force: true }); } catch {} };
  term.onExit(({ exitCode, signal }) => {
    cleanup(); try { process.stdin.setRawMode(false); } catch {}
    process.exit(signal ? 128 + signal : exitCode);
  });
  for (const s of ['SIGTERM', 'SIGHUP']) process.on(s, () => { try { term.kill(s); } catch {} cleanup(); process.exit(128 + os.constants.signals[s]); });
}
