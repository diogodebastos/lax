// Registers the lax channel as a user-level MCP server and installs `lax` (and `claude-lax`, same thing) in ~/.local/bin
// (claude --dangerously-load-development-channels server:lax). A real executable, not an alias, so it also
// works from non-interactive shells. `--remove` undoes both (and cleans up the old alias).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const remove = process.argv.includes('--remove');
const NODE = ['/usr/local/bin/node', '/opt/homebrew/bin/node'].find((p) => fs.existsSync(p)) || process.execPath;
const CHANNEL = path.join(ROOT, 'channel', 'lax-channel.mjs');
const RC = path.join(os.homedir(), process.env.SHELL?.endsWith('bash') ? '.bashrc' : '.zshrc');
// `lax` is the short name, like `claude`; `claude-lax` stays for anything that already uses it.
const BINS = ['lax', 'claude-lax'].map((n) => path.join(os.homedir(), '.local', 'bin', n));
const SCRIPT = '#!/bin/sh\n# lax channel: a Claude Code session that hears you through Lax\nexec claude --dangerously-load-development-channels server:lax "$@"\n';

const claude = (...args) => { try { return execFileSync('claude', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return e.stdout || e.message; } };
claude('mcp', 'remove', '--scope', 'user', 'lax');
const rc = fs.existsSync(RC) ? fs.readFileSync(RC, 'utf8') : '';
const without = rc.split('\n').filter((l) => !l.includes('# lax channel')).join('\n');

fs.writeFileSync(RC, without); // drop the old alias line, if any
if (remove) {
  for (const b of BINS) fs.rmSync(b, { force: true });
  console.log('lax channel removed (MCP server + lax / claude-lax).');
} else {
  console.log(claude('mcp', 'add', '--scope', 'user', 'lax', '--', NODE, CHANNEL).trim());
  fs.mkdirSync(path.dirname(BINS[0]), { recursive: true });
  for (const b of BINS) fs.writeFileSync(b, SCRIPT, { mode: 0o755 });
  console.log(`installed ${BINS.join(' and ')}. Run: lax`);
}
