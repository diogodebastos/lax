// The transcript archive (lib/archive.mjs) and its secret scrubbing (lib/scrub.mjs), on a throwaway Lax home.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-archive-'));
process.env.LAX_HOME = path.join(tmp, 'home');
process.env.LAX_CLAUDE_PROJECTS = path.join(tmp, 'projects');
fs.mkdirSync(path.join(process.env.LAX_HOME, 'secrets'), { recursive: true });
fs.writeFileSync(path.join(process.env.LAX_HOME, 'secrets', 'token'), 'laxtok-0123456789abcdef\n');
fs.writeFileSync(path.join(process.env.LAX_HOME, 'secrets', 'env.json'), JSON.stringify({ CF_ACCESS_CLIENT_SECRET: 'cfsecret-9876543210', LAX_PUBLIC_URL: 'https://lax.example.com' }));
const { scrub, scrubLine, ownSecrets, MARK } = await import('../lib/scrub.mjs');
const { createArchive } = await import('../lib/archive.mjs');
const { ARCHIVE } = await import('../lib/paths.mjs');

// Token shapes.
for (const s of ['sk-ant-api03-' + 'a1B2'.repeat(10), 'ghp_' + 'Ab3d'.repeat(9), 'AKIAIOSFODNN7EXAMPLE', 'xoxb-1234567890-abcdefghij',
  'AIza' + 'Sy0123456789abcdefghijklmnopqrstuvw', 'sk_live_' + '4eC39HqLyjWDarjtT1zdp7dc', 'eyJhbGciOiJI.eyJzdWIiOiIx.SflKxwRJSMeKKF2QT4',
  'eyJ' + 'hIjoiNmUwZDk3YmY0ZTI5NDY1MTk0ZjQwOTk0NjM2ODk1NzUiLCJ0IjoiN2Q1YjA2ZjMtNGUz'])
  assert.equal(scrub(`key ${s} here`), `key ${MARK} here`, s);
assert.equal(scrub('-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nIBAAK\n-----END RSA PRIVATE KEY-----\nafter'), `${MARK}\nafter`);
assert.equal(scrub('-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNz'), MARK); // cut short
// What's around the secret stays.
assert.equal(scrub('Authorization: Bearer abc123def456ghi789jkl'), `Authorization: Bearer ${MARK}`);
assert.equal(scrub('git clone https://diogo:hunter2pass@github.com/x.git'), `git clone https://${MARK}@github.com/x.git`);
assert.equal(scrub('export CF_API_TOKEN=Zx9k2Lm4Np6Qr8St0Uv1Wx3Yz'), `export CF_API_TOKEN=${MARK}`);
assert.equal(scrub('{"client_secret": "a8f3k29dk2l3m4n5b6v7"}'), `{"client_secret": "${MARK}"}`);
assert.equal(scrub('SecretBase_Text_Entrance:\n\tgText_Label123456789'), 'SecretBase_Text_Entrance:\n\tgText_Label123456789'); // a label, not a value
// Not secrets: code and numbers stay readable.
for (const s of ['const token = getToken();', '"input_tokens": 12345678901234567', 'TOKEN_FILE=lib/auth-token-store.mjs',
  'password: process.env.DB_PASSWORD', 'the author wrote 3 books', 'sk-learn is a library', 'https://lax.example.com/demo'])
  assert.equal(scrub(s), s, s);
// Lax's own secrets, wherever they show up; a URL in env.json isn't one.
assert.deepEqual(ownSecrets().sort(), ['cfsecret-9876543210', 'laxtok-0123456789abcdef']);
assert.equal(scrub('curl -H "x: laxtok-0123456789abcdef"', ownSecrets()), `curl -H "x: ${MARK}"`);

// A line stays valid JSON; unchanged lines are kept byte for byte; base64 payloads are left alone.
const raw = '{"type":"user","message":{"content":"my key is sk-ant-api03-' + 'x9Y8'.repeat(8) + '\\nthanks"}}';
const out = scrubLine(raw);
assert.equal(JSON.parse(out).message.content, `my key is ${MARK}\nthanks`);
const plain = '{"a":  "nothing here", "n": 1}';
assert.equal(scrubLine(plain), plain);
const img = JSON.stringify({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo+eyJ' + 'A'.repeat(80) } });
assert.equal(scrubLine(img), img);
const thought = JSON.stringify({ type: 'thinking', thinking: 'hm', signature: 'EqQBCkYIBxgCKkB/eyJ' + 'q'.repeat(80) });
assert.equal(scrubLine(thought), thought);
assert.equal(scrubLine('not json, ghp_' + 'Ab3d'.repeat(9)), `not json, ${MARK}`);

// The archive: a session with a subagent, a transcript that's only left in the archive (deleted by Claude Code, kept raw).
const P = process.env.LAX_CLAUDE_PROJECTS, proj = path.join(P, '-Users-x-REPOS-app');
const rec = (text) => JSON.stringify({ type: 'user', message: { content: text } }) + '\n';
fs.mkdirSync(path.join(proj, 's1', 'subagents'), { recursive: true });
fs.writeFileSync(path.join(proj, 's1.jsonl'), rec('hello') + rec('token laxtok-0123456789abcdef'));
fs.writeFileSync(path.join(proj, 's1', 'subagents', 'agent-a.jsonl'), rec('GITHUB_TOKEN=ghp_' + 'Ab3d'.repeat(9)));
fs.writeFileSync(path.join(proj, 's2.jsonl'), rec('another session'));
fs.mkdirSync(path.join(ARCHIVE, '-Users-x-old'), { recursive: true });
fs.writeFileSync(path.join(ARCHIVE, '-Users-x-old', 'gone.jsonl'), rec('old one AKIAIOSFODNN7EXAMPLE'));
const read = (rel) => fs.readFileSync(path.join(ARCHIVE, rel), 'utf8');

const logs = [], a = createArchive({ log: (...m) => logs.push(m.join(' ')), idleMs: 30 });
assert.equal(await a.sweep(), 4);
assert.match(logs.pop(), /sweep: kept 4 transcripts, 3 lines with secrets scrubbed/);
assert.equal(read('-Users-x-REPOS-app/s1.jsonl'), rec('hello') + rec(`token ${MARK}`));
assert.equal(read('-Users-x-REPOS-app/s1/subagents/agent-a.jsonl'), rec(`GITHUB_TOKEN=${MARK}`));
assert.equal(read('-Users-x-REPOS-app/s2.jsonl'), rec('another session'));
assert.equal(read('-Users-x-old/gone.jsonl'), rec(`old one ${MARK}`));
assert.equal(fs.statSync(path.join(ARCHIVE, '-Users-x-REPOS-app/s1.jsonl')).mode & 0o777, 0o600);
// Nothing new: nothing written.
assert.equal(await a.sweep(), 0);

// The session goes on and then quiet: a Stop, then the quiet spell, and it's kept again (a new event cancels the wait).
fs.appendFileSync(path.join(proj, 's1.jsonl'), rec('more work'));
const s1 = path.join(proj, 's1.jsonl');
a.onEvent('s1', 'Stop', s1); a.onEvent('s1', 'UserPromptSubmit', s1);
await new Promise((r) => setTimeout(r, 80)); await a.idle();
assert.doesNotMatch(read('-Users-x-REPOS-app/s1.jsonl'), /more work/);
a.onEvent('s1', 'Stop', s1);
await new Promise((r) => setTimeout(r, 80)); await a.idle();
assert.match(read('-Users-x-REPOS-app/s1.jsonl'), /more work/);
// A SessionEnd keeps it right away.
fs.appendFileSync(path.join(proj, 's2.jsonl'), rec('bye'));
a.onEvent('s2', 'SessionEnd', path.join(proj, 's2.jsonl')); await a.idle();
assert.match(read('-Users-x-REPOS-app/s2.jsonl'), /bye/);
// Outside Claude Code's projects: ignored.
await a.session(path.join(tmp, 'elsewhere.jsonl'));

// Claude Code deletes the source: the kept copy stays, and after a restart nothing is lost or redone.
fs.rmSync(proj, { recursive: true });
assert.equal(await createArchive().sweep(), 0);
assert.match(read('-Users-x-REPOS-app/s1.jsonl'), /more work/);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('archive ok');
