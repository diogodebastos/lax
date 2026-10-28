// Adds (or with --remove, removes) Lax's hook to ~/.claude/settings.json. Keeps a backup.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EVENTS } from '../hooks/timeouts.mjs';

const file = path.join(os.homedir(), '.claude', 'settings.json');
const hook = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'hooks', 'lax-hook.mjs');
// The node running this (Lax's, 22.13+), by its full path: a Claude Code started outside your shell (launchd, the desktop
// app) may find another node on its PATH, or none, and then the hook fails and nothing reaches the phone.
const node = `"${process.execPath}"`, command = `${node} "${hook}"`;

const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
fs.writeFileSync(file + '.bak-lax', JSON.stringify(settings, null, 2));
settings.hooks ||= {};
for (const [ev, timeout] of Object.entries(EVENTS)) {
  const groups = (settings.hooks[ev] || []).map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !String(h.command).includes('lax-hook.mjs')) }))
    .filter((g) => g.hooks.length);
  if (!process.argv.includes('--remove')) groups.push({ hooks: [{ type: 'command', command, timeout }] });
  if (groups.length) settings.hooks[ev] = groups; else delete settings.hooks[ev];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;
// The status line shows your plan usage and hands it to Lax. A status line of your own is never replaced.
const status = path.resolve(path.dirname(hook), 'lax-status.mjs');
const ours = String(settings.statusLine?.command || '').includes('lax-status.mjs');
if (process.argv.includes('--remove')) { if (ours) delete settings.statusLine; }
else if (!settings.statusLine || ours) settings.statusLine = { type: 'command', command: `${node} "${status}"` };
else console.log('You have your own status line, so Lax won\'t see your plan usage (it comes from the status line).');
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
console.log(process.argv.includes('--remove') ? 'Lax hooks removed.' : `Lax hooks installed → ${file} (backup: settings.json.bak-lax)`);
