// Lax's mind on the website (lib/mind-shape.mjs, lib/public-mind.mjs): what leaves the Mac is only its shape. A
// throwaway Lax home full of things that must never leave (note text, episode titles, a skill, a hidden project), then
// what would be sent is searched for each of them; the Worker's check refuses anything that isn't exactly the shape.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-mind-'));
process.env.LAX_HOME = path.join(tmp, 'home'); process.env.LAX_SKILLS_DIR = path.join(tmp, 'skills');
const HOME = process.env.LAX_HOME, MIND = path.join(HOME, 'mind');
const put = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const today = new Date().toISOString().slice(0, 10);
put(path.join(MIND, 'CLAUDE.md'), '# Lax\n\n## Notes\n- NOTE_ABOUT_YOU lives in Lisbon\n- NOTE_TWO likes coffee\n');
put(path.join(MIND, 'projects', 'lax.md'), '# lax\n- PROJECT_NOTE one\n- two\n- three\n');
put(path.join(MIND, 'projects', 'hidden-thing.md'), '# hidden\n- HIDDEN_NOTE\n');
put(path.join(MIND, 'episodes', today.slice(0, 7), `${today}-EPISODE_SLUG.md`), '# EPISODE_TITLE fixed the tunnel\nwhere: lax\n');
put(path.join(MIND, 'episodes', '2025-01', '2025-01-02-old-one.md'), '# OLD_TITLE\n');
put(path.join(MIND, 'learning.md'), 'LEARNING_TEXT');
put(path.join(HOME, 'skills.json'), JSON.stringify({ skills: [{ name: 'SKILL_NAME', why: 'SKILL_WHY', status: 'installed' }, { name: 'draft-x', status: 'new' }] }));
put(path.join(HOME, 'archive', 'state.json'), JSON.stringify({ files: { 'a/SECRET_SESSION.jsonl': {}, 'b/c.jsonl': {} } }));
execFileSync('git', ['-C', MIND, 'init', '-q']);
for (const m of ['learned from lax: a', 'kept an episode']) execFileSync('git', ['-C', MIND, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', m]);
const NEVER = ['NOTE_ABOUT_YOU', 'NOTE_TWO', 'Lisbon', 'PROJECT_NOTE', 'hidden-thing', 'HIDDEN_NOTE', 'EPISODE', 'tunnel', 'OLD_TITLE', 'LEARNING_TEXT', 'SKILL_NAME', 'SKILL_WHY', 'draft-x', 'SECRET_SESSION', 'some/folder'];
const leaks = (x) => NEVER.filter((w) => JSON.stringify(x).includes(w));

const { shape, clean, cleanEvent, cleanEvents } = await import('../lib/mind-shape.mjs');
const { readMind, createPublicMind, placesOf, filesIn } = await import('../lib/public-mind.mjs');

// ---------- the snapshot: counts, and only the names you allowed ----------
const live = () => ({ color: '#D97757', stage: 'blob', heard: 5, spoke: 4, busy: true, owner: 'Alex', doing: { hearing: true, secret: true }, sessions: [{ id: 'S1', project: 'lax', status: 'working', cwd: '/some/folder' }, { project: 'hidden-thing', status: 'idle' }, { project: 'elsewhere', status: 'weird' }] });
const snap = shape(readMind(live()), ['lax']);
assert.deepEqual(leaks(snap), []);
assert.equal(snap.owner, 'alex');
assert.equal(shape(readMind({ ...live(), owner: 'Alex <me@x.com>' }), []).owner, ''); // only a plain name
assert.deepEqual(Object.keys(snap), ['v', 'seen', 'look', 'owner', 'you', 'projects', 'episodes', 'archive', 'skills', 'rules', 'week', 'busy', 'doing', 'sessions', 'roles', 'wishes']);
assert.deepEqual(snap.doing, { hearing: true, speaking: false, reflecting: false, recalling: false });
assert.equal(snap.busy, true);
assert.equal(clean({ ...snap, busy: 'yes' }), null);
assert.deepEqual(snap.week, { heard: 5, spoke: 4, changes: 2, dreams: 0 }); // this week: talked to, answered aloud, its mind changed (commits)
assert.equal(snap.you, 2);
assert.deepEqual(snap.projects, [{ name: 'lax', notes: 3 }, { name: '', notes: 1 }]); // the hidden one: there, unnamed
assert.deepEqual(snap.episodes, { total: 2, week: 1 });
assert.equal(snap.archive, 2);
assert.deepEqual(snap.skills, { drafts: 1, installed: 1 });
assert.ok(snap.rules.learning > 0 && snap.rules.wishing === 0);
assert.deepEqual(snap.sessions, [{ p: 0, state: 'working' }, { p: 1, state: 'idle' }, { p: null, state: 'idle' }]);
assert.equal(snap.look.color, '#d97757');
assert.deepEqual(snap.roles, []); // no role yet (Phase 6.3; scripts/test-roles.mjs has them)
assert.equal(shape(readMind(live()), []).projects[0].name, ''); // nothing allowed: no names at all

// ---------- the Worker's check: exactly the shape, or nothing ----------
assert.deepEqual(clean(snap), snap);
assert.equal(clean({ ...snap, note: 'x' }), null); // an extra field
assert.equal(clean({ ...snap, projects: [{ name: 'a'.repeat(40), notes: 1 }] }), null); // a long name
assert.equal(clean({ ...snap, projects: [{ name: 'Has Spaces', notes: 1 }] }), null);
assert.equal(clean({ ...snap, you: 'nine' }), null); // a wrong type
assert.equal(clean({ ...snap, week: { ...snap.week, words: 'hi' } }), null);
{ const { wishes: _w, ...old } = snap; const { dreams: _d, ...week } = snap.week; // kept before wishes and dreams
  const c = clean({ ...old, week }); assert.equal(c?.wishes, 0); assert.equal(c?.week.dreams, 0); }
assert.equal(clean({ ...snap, look: { color: 'red', stage: 'blob' } }), null);
assert.equal(clean({ ...snap, sessions: [{ p: 0, state: 'working', cwd: '/x' }] }), null);
assert.equal(clean(null), null); assert.equal(clean({}), null);
assert.deepEqual(cleanEvent({ kind: 'recall', at: 5 }), { kind: 'recall', at: 5 });
assert.equal(cleanEvent({ kind: 'recall', at: 5, query: 'how did we' }), null); // what it asked never travels
assert.equal(cleanEvent({ kind: 'rm -rf', at: 5 }), null);
assert.equal(cleanEvent({ kind: 'archive', at: 5 }), null); assert.equal(cleanEvent({ kind: 'session', at: 5, n: 1 }), null); // not shown: more of your day than it needs
assert.deepEqual(cleanEvent({ kind: 'recall', at: 5, to: ['memory', 'archive'] }), { kind: 'recall', at: 5, to: ['memory', 'archive'] });
assert.equal(cleanEvent({ kind: 'recall', at: 5, to: ['memory', '/etc/passwd'] }), null); // only the places there are
assert.deepEqual(cleanEvent({ kind: 'tool', at: 5, n: 3, session: 1 }), { kind: 'tool', at: 5, n: 3, session: 1 });

// ---------- where things went ----------
assert.deepEqual(placesOf(['CLAUDE.md', 'projects/lax.md', 'episodes/2026-10/x.md']), { to: ['you', 'project', 'memory'], project: 'lax' });
assert.deepEqual(placesOf(['learning.md', 'skills/deploy/SKILL.md']), { to: ['learning', 'skills'], project: undefined });
assert.deepEqual(placesOf(filesIn('Fixed on 2026-10-07 in lax. Found in episodes/2026-10/2026-10-07-tunnel.md and -Users-me-lax/abc123.jsonl')).to, ['memory', 'archive']);
assert.deepEqual(filesIn('nothing here'), []);
assert.deepEqual(cleanEvents([{ kind: 'hear', at: 1 }, { kind: 'x', at: 2 }, { kind: 'reflect', at: 3, project: 1 }]), [{ kind: 'hear', at: 1 }, { kind: 'reflect', at: 3, project: 1 }]);

// ---------- sending it ----------
const sent = [];
const fakeFetch = async (url, o) => { sent.push({ url, auth: o.headers.authorization, body: JSON.parse(o.body) }); return { ok: true }; };
const pm = createPublicMind({ live, allow: () => ['lax'], key: () => 'k3y', origin: () => 'https://lax.example', fetch: fakeFetch });
pm.event('recall'); pm.event('reflect', { project: 'hidden-thing' }); pm.event('nonsense'); pm.event('episode', { n: 2 });
pm.tool('S1'); pm.tool('S1'); pm.tool('S1'); pm.tool('not-a-session');
assert.equal(await pm.push(), true);
assert.equal(sent.length, 1);
assert.equal(sent[0].url, 'https://lax.example/demo/mind/api/push'); assert.equal(sent[0].auth, 'Bearer k3y');
assert.deepEqual(sent[0].body.events.map((e) => [e.kind, e.project, e.n, e.session]), [['recall', undefined, undefined, undefined], ['reflect', 1, undefined, undefined], ['episode', undefined, 2, undefined], ['tool', undefined, 3, 0]]);
assert.deepEqual(clean(sent[0].body.snap), sent[0].body.snap);
assert.deepEqual(leaks(sent[0].body), []);
assert.equal(await pm.push(), false); // nothing changed, nothing new: not sent again
assert.equal(await pm.push(true), true); // the heartbeat goes anyway
assert.deepEqual(pm.view().recent.map((e) => e.kind), ['recall', 'reflect', 'episode']); // the local preview's copy
pm.stop();

const off = []; // no key: nothing leaves
const pm2 = createPublicMind({ live, allow: () => [], key: () => '', origin: () => 'https://lax.example', fetch: async (...a) => { off.push(a); return { ok: true }; } });
pm2.event('recall'); assert.equal(await pm2.push(true), false); assert.equal(off.length, 0); pm2.stop();

const down = createPublicMind({ live, allow: () => [], key: () => 'k', origin: () => 'https://lax.example', fetch: async () => { throw new Error('offline'); }, log: () => {} });
down.event('hear'); assert.equal(await down.push(), false); // kept for next time
down.stop();

// ---------- where events come from: skills (the others are wired the same way, through deps.mind) ----------
const { createSkills, DRAFTS } = await import('../lib/skills.mjs');
const kinds = [];
const sk = createSkills({ settings: () => ({ name: 'Lax', learns: true }), feed: () => {}, diary: () => {}, say: () => {}, broadcast: () => {}, pending: new Map(),
  quiet: () => false, gainXp: () => {}, milestone: () => {}, record: () => {}, mind: (k) => kinds.push(k) });
put(path.join(DRAFTS, 'deploy', 'SKILL.md'), '---\nname: deploy\ndescription: Use when deploying.\n---\n# Deploy\n1. npm test\n');
assert.equal(sk.drafted({ name: 'deploy', why: 'x' }), true);
assert.equal(sk.install('deploy'), '');
assert.equal(sk.forget('deploy'), true);
assert.deepEqual(kinds, ['skill', 'install', 'forget']);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('mind on the website: ok');
