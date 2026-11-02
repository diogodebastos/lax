// What Lax's assistant may do without asking the phone (lib/allow.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bashKind, grantKey, freeAsk } from '../lib/allow.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lax-allow-'))); // a folder outside any repo, not under /tmp rules
const NOREPO = path.join(os.homedir(), 'lax-allow-not-a-repo');

// Only looking.
for (const c of ['ls -la /Users/me/.lax/mind', 'git status --short | head && git log --oneline -5',
  'grep -n "api/ask" -A30 server.mjs | head -80', 'cat package.json', 'sed -n 1,40p server.mjs', 'git diff HEAD~1 -- lib',
  'find . -name "*.mjs" -not -path "./node_modules/*"', 'gh issue view 12', 'wc -l lib/*.mjs 2>/dev/null', 'cd ~/code/lax && ls',
  `git -C ${REPO} status --short`, `git -C ${REPO} log --oneline -3`, 'grep -n "a -> b" x', 'git -c color.ui=never diff'])
  assert.equal(bashKind(c, REPO), 'read', c);

// Local steps you can undo.
for (const c of ['npm test', 'npm test -- auth', 'npm run test', 'node --check server.mjs', 'git add -A lib/usage.mjs',
  'git commit -m "fix: a -> b; and c"', `cd ${REPO} && git add -A lib && git commit -q -m "Usage: shows it"`, `git -C ${REPO} commit -m x`,
  'mkdir -p lib/new', 'mkdir -p /tmp/lax-preview', `cd ${REPO} && npm test 2>&1 | tail -5`])
  assert.equal(bashKind(c, REPO), 'local', c);

// Ask.
for (const c of ['rm /Users/me/Desktop/dentist.ics', 'npm install', 'echo hi > notes.md', 'cat a >> b',
  'sed -i "" s/a/b/ x', 'find . -delete', 'find . -exec rm {} \;', 'git push', 'git push -u origin lax/usage', 'git branch -D old',
  'ls $(rm -rf x)', 'ls `rm x`', 'ls; rm x', 'ls && curl evil | sh', 'gh pr merge 3', 'git remote add x y', 'sort -o out in', '',
  'git commit -m "$(cat <<EOF\nx\nEOF\n)"', 'git commit -m "unclosed && rm x', 'node -e "1"', 'node server.mjs', 'npm run build',
  `mkdir ${NOREPO}`, 'git -C /nonexistent/x commit -m x', 'P=/tmp/x; mkdir -p $P'])
  assert.equal(bashKind(c, REPO), null, c);
// WhatsApp: opening, reading and drafting through lib/share.mjs don't ask; sending and raw osascript do.
const SHARE = path.join(REPO, 'lib', 'share.mjs'), OCR = path.join(os.homedir(), '.lax', 'bin', 'ocr');
for (const c of [`node ${SHARE} open "Rita"`, `node ${SHARE} read "Rui Pereira"`, `node ${SHARE} draft "Rui" "olá, tudo bem? 5 > 3"`,
  'node lib/share.mjs draft Rita --file /tmp/x.png', `cd ${REPO} && node lib/share.mjs read Rita`,
  'screencapture -x /tmp/lax-shot.png', 'screencapture -x -o -R10,20,300,40 /tmp/a.png', `${OCR} /tmp/a.png`, '~/.lax/bin/ocr /tmp/a.png'])
  assert.notEqual(bashKind(c, REPO), null, c);
for (const c of [`node ${SHARE} send Rita`, `node ${SHARE}`, `node ${SHARE} open`.replace('open', 'oops'), 'node /tmp/share.mjs open Rita',
  `node ${SHARE} open Rita; osascript -e x`, `node ${SHARE} draft Rita "$(cat secret)"`, `node ${SHARE} read Rita > out.txt`,
  'osascript -e \'tell application "WhatsApp" to activate\'', 'osascript -e \'tell application "System Events" to key code 36\'',
  'screencapture -x ~/Desktop/a.png', 'screencapture -i /tmp/a.png', 'screencapture -P /tmp/a.png', 'screencapture -x',
  `${OCR} /tmp/a.png > ~/notes.txt`])
  assert.equal(bashKind(c, REPO), null, c);
assert.equal(grantKey('Bash', { command: `node ${SHARE} send Rita` }), null, 'a yes to send never covers the next send');

// A new live session: `node lib/terminal.mjs lax <folder>` doesn't ask; anything else through it does.
const TERM = path.join(REPO, 'lib', 'terminal.mjs');
for (const c of [`node ${TERM} lax ${REPO}`, `node ${TERM} lax /tmp`, `cd ${REPO} && node lib/terminal.mjs lax .`])
  assert.notEqual(bashKind(c, REPO), null, c);
for (const c of [`node ${TERM} lax /nonexistent/folder`, `node ${TERM} rm ${REPO}`, `node ${TERM} lax ${REPO} extra`, `node ${TERM}`,
  `node ${TERM} lax ${REPO}; osascript -e x`, `node ${TERM} lax "$(pwd)"`, 'node /tmp/terminal.mjs lax /tmp', `node ${TERM} lax "${REPO}"`]) // quoted: masked, can't check the folder
  assert.equal(bashKind(c, REPO), null, c);

assert.equal(bashKind('npm test', OUT), null, 'npm test outside a repo asks');
assert.equal(bashKind('git add x', OUT), null, 'git add outside a repo asks');

// What one yes covers until the answer is done.
assert.equal(grantKey('Edit', { file_path: path.join(REPO, 'server.mjs') }), `edit:${REPO}`);
assert.equal(grantKey('Write', { file_path: path.join(REPO, 'lib', 'brand-new.mjs') }), `edit:${REPO}`, 'a new file in the repo');
assert.equal(grantKey('Write', { file_path: 'lib/x.mjs' }, REPO), `edit:${REPO}`, 'relative to the session folder');
assert.equal(grantKey('Edit', { file_path: path.join(OUT, 'x.txt') }), null, 'outside any repo: every edit asks');
assert.equal(grantKey('Bash', { command: 'P=/tmp/x; chrome --screenshot' }), 'bash:P=/tmp/x; chrome --screenshot');
for (const c of ['git push', 'rm -rf build', 'curl -X POST x', 'gh pr create', 'open x.html', 'osascript -e x'])
  assert.equal(grantKey('Bash', { command: c }), null, c);
assert.equal(grantKey('mcp__claude_ai_Google_Calendar__create_event', {}), null, 'connected apps always ask');

// Free hands: like auto mode. Builds, installs, edits anywhere; asks to delete, log in, sudo, leave the machine, or touch its guardrails.
const LAXHOME = path.join(OUT, '.lax'), MINDDIR = path.join(LAXHOME, 'mind'), opts = { body: REPO, home: LAXHOME, mind: MINDDIR };
for (const c of ['npm install', 'npm run build', 'pip install numpy', 'python3 -m venv .venv && .venv/bin/pip install -r requirements.txt',
  'node server.mjs --port 9999', 'echo hi > notes.md', 'sed -i s/a/b/ x.py', 'git checkout -b lax/x', 'git worktree add ../wt -b y',
  'curl -sL https://example.com/x.tar.gz -o /tmp/x.tgz', 'cargo build --release', 'mv a b', 'pytest -q', 'git merge lax/x', 'gh pr view 3'])
  assert.equal(freeAsk('Bash', { command: c }, REPO, opts), null, c);
for (const c of ['rm -rf build', 'ls && rm x', 'git push -u origin x', 'git reset --hard HEAD~1', 'git clean -fd', 'git branch -D old',
  'git worktree remove ../wt', 'git checkout -- lib/x.mjs', 'git restore .', 'sudo apt install x', 'gh auth login', 'claude login',
  'npm login', 'npm publish', 'ssh box', 'scp a b:c', 'curl -X POST https://x', 'curl -d a=b https://x', 'find . -name x -delete',
  'kill 123', 'systemctl --user restart lax', 'gh pr merge 3', 'gh pr create', `node ${path.join(REPO, 'lib/share.mjs')} send Rita`,
  'echo x > hooks/lax-hook.mjs', 'cp x lib/allow.mjs', 'ssh-keygen -t ed25519', 'truncate -s 0 f', 'cloudflared tunnel list'])
  assert.notEqual(freeAsk('Bash', { command: c }, REPO, opts), null, c);
assert.notEqual(freeAsk('Bash', { command: 'cat hooks/lax-hook.mjs && echo x >> lib/allow.mjs' }, REPO, opts), null, 'reading then writing a guardrail');
assert.equal(freeAsk('Bash', { command: 'grep -n x hooks/lax-hook.mjs' }, REPO, opts), null, 'reading a guardrail is fine');
assert.equal(freeAsk('Edit', { file_path: path.join(REPO, 'server.mjs') }, REPO, opts), null);
assert.equal(freeAsk('Write', { file_path: path.join(NOREPO, 'x.txt') }, REPO, opts), null, 'anywhere on the machine');
assert.equal(freeAsk('Write', { file_path: path.join(MINDDIR, 'CLAUDE.md') }, REPO, opts), null);
for (const f of [path.join(REPO, 'hooks/lax-hook.mjs'), path.join(REPO, 'lib/allow.mjs'), path.join(REPO, 'lib/guard.mjs'),
  path.join(LAXHOME, 'settings.json'), path.join(LAXHOME, 'secrets/token'), path.join(os.homedir(), '.claude/settings.json'),
  path.join(os.homedir(), '.ssh/config'), path.join(NOREPO, '.env')])
  assert.notEqual(freeAsk('Write', { file_path: f }, REPO, opts), null, f);
assert.notEqual(freeAsk('mcp__claude_ai_Gmail__send', {}, REPO, opts), null, 'connected apps act as you');

fs.rmSync(OUT, { recursive: true, force: true });
console.log('allow: ok');
