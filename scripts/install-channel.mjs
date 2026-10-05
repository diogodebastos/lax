// Registers the lax channel as a user-level MCP server, installs `lax` (and `claude-lax`, same thing) in ~/.local/bin,
// and the /lax skill in ~/.claude/skills (moves a running conversation into a live `lax` session)
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
// The /lax skill: carries the current conversation into a live `lax` session (scripts/go-live.mjs).
const SKILL = path.join(os.homedir(), '.claude', 'skills', 'lax', 'SKILL.md');
const SKILL_MD = `---
name: lax
description: Make this conversation hear you through Lax (the pixel companion on the phone) by reopening it as a live \`lax\` session in a new terminal window. Use when the user types /lax or asks to "go live", "make this session hear me", "move this to lax", or wants to talk to this session from the phone.
---

Claude Code loads the Lax channel only when a session starts, so this session can't switch on by itself.
Instead, open this same conversation in a new terminal window as a live \`lax\` session:

\`\`\`bash
node ${path.join(ROOT, 'scripts', 'go-live.mjs')}
\`\`\`

Run it from this session's working directory (the folder the conversation started in). Then tell the user, briefly:
- what the script printed (where it opened, or why it couldn't);
- on success: the conversation continues in the new window and hears them through Lax, and they should close this
  session so the two don't both write to the same conversation.
If it couldn't open a terminal, give them the command it printed to run themselves.
`;
// Unset CLAUDE_CODE_ENTRYPOINT: a terminal opened by the desktop app (/lax) inherits claude-desktop, which would label the tab ·mac.
const SCRIPT = '#!/bin/sh\n# lax channel: a Claude Code session that hears you through Lax\nunset CLAUDE_CODE_ENTRYPOINT\nexec claude --dangerously-load-development-channels server:lax "$@"\n';

const claude = (...args) => { try { return execFileSync('claude', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return e.stdout || e.message; } };
claude('mcp', 'remove', '--scope', 'user', 'lax');
const rc = fs.existsSync(RC) ? fs.readFileSync(RC, 'utf8') : '';
const without = rc.split('\n').filter((l) => !l.includes('# lax channel')).join('\n');

fs.writeFileSync(RC, without); // drop the old alias line, if any
if (remove) {
  for (const b of BINS) fs.rmSync(b, { force: true });
  fs.rmSync(path.dirname(SKILL), { recursive: true, force: true });
  console.log('lax channel removed (MCP server + lax / claude-lax + /lax skill).');
} else {
  console.log(claude('mcp', 'add', '--scope', 'user', 'lax', '--', NODE, CHANNEL).trim());
  fs.mkdirSync(path.dirname(BINS[0]), { recursive: true });
  for (const b of BINS) fs.writeFileSync(b, SCRIPT, { mode: 0o755 });
  fs.mkdirSync(path.dirname(SKILL), { recursive: true });
  fs.writeFileSync(SKILL, SKILL_MD);
  console.log(`installed ${BINS.join(' and ')}, and the /lax skill. Run: lax (or /lax inside a session)`);
}
