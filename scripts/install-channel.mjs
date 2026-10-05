// Registers the lax channel as a user-level MCP server and adds a `claude-lax` shell alias
// (claude --dangerously-load-development-channels server:lax). `--remove` undoes both.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const remove = process.argv.includes('--remove');
const NODE = ['/usr/local/bin/node', '/opt/homebrew/bin/node'].find((p) => fs.existsSync(p)) || process.execPath;
const CHANNEL = path.join(ROOT, 'channel', 'lax-channel.mjs');
const RC = path.join(os.homedir(), process.env.SHELL?.endsWith('bash') ? '.bashrc' : '.zshrc');
const ALIAS = "alias claude-lax='claude --dangerously-load-development-channels server:lax'  # lax channel";

const claude = (...args) => { try { return execFileSync('claude', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return e.stdout || e.message; } };
claude('mcp', 'remove', '--scope', 'user', 'lax');
const rc = fs.existsSync(RC) ? fs.readFileSync(RC, 'utf8') : '';
const without = rc.split('\n').filter((l) => !l.includes('# lax channel')).join('\n');

if (remove) {
  fs.writeFileSync(RC, without);
  console.log('lax channel removed (MCP server + claude-lax alias).');
} else {
  console.log(claude('mcp', 'add', '--scope', 'user', 'lax', '--', NODE, CHANNEL).trim());
  fs.writeFileSync(RC, without.replace(/\n*$/, '\n') + ALIAS + '\n');
  console.log(`alias added to ${RC}: claude-lax`);
  console.log('Open a new terminal (or `source ~/.zshrc`), then run: claude-lax');
}
