// lib/terminal.mjs: the AppleScript each terminal app gets, the argv each Linux terminal gets, and the "open on mac" phrase.
import assert from 'node:assert/strict';
import { terminalScript, terminalArgs, q, ON_MAC, closeTarget } from '../lib/terminal.mjs';

const cwd = "/Users/me/it's here", cmd = `exec claude --resume abc --add-dir '/Users/me/REPOS'`;
const g = terminalScript('Ghostty', cwd, cmd);
assert.match(g, /initial working directory:"\/Users\/me\/it's here"/);
assert.ok(g.includes(`/bin/zsh -ilc 'cd '\\\\''`), 'quotes survive shell + AppleScript'); // ' → '\'' then \ → \\ for AppleScript
assert.match(terminalScript('iTerm', cwd, cmd), /create window with default profile command "\/bin\/zsh -ilc/);
assert.match(terminalScript('Terminal', cwd, cmd), /do script "cd /);
assert.equal(terminalScript('Hyper', cwd, cmd), null);

// Linux: each terminal's argv before `$SHELL -ilc LINE`; an unknown one gets -e.
const SH = process.env.SHELL || '/bin/sh', here = "/home/me/it's here";
assert.deepEqual(terminalArgs('konsole', here, 'exec lax'), ['-e', SH, '-ilc', `cd ${q(here)} && exec lax`]);
assert.equal(q(here), `'/home/me/it'\\''s here'`);
assert.deepEqual(terminalArgs('kitty', here, 'exec lax'), [SH, '-ilc', `cd ${q(here)} && exec lax`]);
assert.deepEqual(terminalArgs('/usr/bin/gnome-terminal', here, 'x').slice(0, 2), ['--', SH]);
assert.deepEqual(terminalArgs('zorbterm', here, 'x').slice(0, 2), ['-e', SH]);

for (const t of ['Open on the Mac.', 'continue on mac', 'open this on my Mac', 'Open it on the Mac please', 'move it to the mac',
  'open on my computer', 'continue this on my laptop', 'open it on the PC']) assert.ok(ON_MAC.test(t), t);
for (const t of ['open the readme on the mac', 'open a terminal', 'what is on the mac', 'mac']) assert.ok(!ON_MAC.test(t), t);

// "Close the fisicai session": which one, by project (its folder) or tab name; two alike, ask; no name, a message.
const list = [{ id: 'a', project: 'fisicai', where: 'cli' }, { id: 'b', project: 'edge-cava', where: 'cli' }, { id: 'c', project: 'reports', where: 'cli' }, { id: 'd', project: 'reports', where: 'mac' }];
for (const t of ['close the fisicai session', 'Close fisicai.', 'end fisicai cli', 'quit the fisicai tab', 'fecha a sessão do fisicai']) assert.equal(closeTarget(t, list)?.session?.id, 'a', t);
assert.equal(closeTarget('close edge cava', list)?.session?.id, 'b');
assert.deepEqual(closeTarget('close the reports session', list), { many: ['reports·cli', 'reports·mac'] });
assert.deepEqual(closeTarget('close the zorblat session', list), { none: ['fisicai·cli', 'edge-cava·cli', 'reports·cli', 'reports·mac'] });
for (const t of ['close', 'close the session', 'close it', 'close the readme', 'exit plan mode', 'end of the day', 'open fisicai']) assert.equal(closeTarget(t, list), null, t);
assert.deepEqual(closeTarget('close the lax session', []), { none: [] }); // Lax's own conversation is never in the list
console.log('terminal: ok');
