// lib/terminal.mjs: the AppleScript each terminal app gets, and the "open on mac" phrase.
import assert from 'node:assert/strict';
import { terminalScript, ON_MAC } from '../lib/terminal.mjs';

const cwd = "/Users/me/it's here", cmd = `exec claude --resume abc --add-dir '/Users/me/REPOS'`;
const g = terminalScript('Ghostty', cwd, cmd);
assert.match(g, /initial working directory:"\/Users\/me\/it's here"/);
assert.ok(g.includes(`/bin/zsh -ilc 'cd '\\\\''`), 'quotes survive shell + AppleScript'); // ' → '\'' then \ → \\ for AppleScript
assert.match(terminalScript('iTerm', cwd, cmd), /create window with default profile command "\/bin\/zsh -ilc/);
assert.match(terminalScript('Terminal', cwd, cmd), /do script "cd /);
assert.equal(terminalScript('Hyper', cwd, cmd), null);

for (const t of ['Open on the Mac.', 'continue on mac', 'open this on my Mac', 'Open it on the Mac please', 'move it to the mac']) assert.ok(ON_MAC.test(t), t);
for (const t of ['open the readme on the mac', 'open a terminal', 'what is on the mac', 'mac']) assert.ok(!ON_MAC.test(t), t);
console.log('terminal: ok');
