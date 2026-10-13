// Roles (Phase 6.3, lib/roles.mjs): work found in the episodes, a drafted role offered by voice (yes, no, later),
// the brief a session gets, how reflections learn about roles, and the shape the brain on the website may show.
// In-process with a throwaway Lax home.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lax-roles-'));
process.env.LAX_HOME = path.join(tmp, 'home');
const MIND = path.join(tmp, 'home', 'mind');
fs.mkdirSync(MIND, { recursive: true }); execFileSync('git', ['-C', MIND, 'init', '-q']);
const { header, workLog, practice, rolesBrief, createRoles, ROLES, STATE } = await import('../lib/roles.mjs');
const { shape, clean, cleanEvent } = await import('../lib/mind-shape.mjs');

const episode = (file, head, body = 'What happened.') => { const p = path.join(MIND, 'episodes', file); fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `# ${path.basename(file, '.md')}\n${head}\n\n${body}\n`); };
const role = (name, text) => { fs.mkdirSync(ROLES, { recursive: true }); fs.writeFileSync(path.join(ROLES, name + '.md'), text); };

// ---------- the work, from the episodes ----------
episode('2026-10/2026-10-12-research-noticed-prior-art.md', 'when: 2026-10-12 13:48 to 16:11\nwhere: research\nkind: investigation\noutcome: done\nrole: research\nmade: reports/contact-ranking-guide.html');
episode('2026-10/2026-10-13-research-identity.md', 'when: 2026-10-13 20:13 to 20:20\nwhere: research\nkind: decision\noutcome: done');
episode('2026-10/2026-10-14-fisicai-papers.md', 'when: 2026-10-14 10:00 to 11:00\nwhere: fisicai\nkind: investigation\noutcome: partly\nrole: Research');
episode('2026-10/2026-10-14-lax-bad-role.md', 'where: lax\nrole: not a role!');
const h = header('# T\nwhen: 2026-10-12\nwhere: research\noutcome: done\nrole: research\nmade: a.html, b.md\n\nrole: in the text');
assert.deepEqual([h.title, h.where, h.role, h.made], ['T', 'research', 'research', 'a.html, b.md']);
const log = workLog();
assert.equal(log.length, 2, 'only episodes that say which role did the work, with a role name');
assert.deepEqual(log.map((w) => [w.day, w.where, w.role]), [['2026-10-14', 'fisicai', 'research'], ['2026-10-12', 'research', 'research']]);
assert.equal(log[1].made, 'reports/contact-ranking-guide.html');

// ---------- the brief a session gets ----------
role('research', '# Research\nSplit the question, run tracks in parallel, verify, write, publish a page.\n');
assert.equal(rolesBrief([], 'research'), '');
assert.match(rolesBrief(['research'], 'research'), /How Lax does research \(its practice, roles\/research\.md[\s\S]*run tracks in parallel/);
const elsewhere = rolesBrief(['research'], 'edge-cavai');
assert.match(elsewhere, /Lax's other roles: research \(.*roles\/research\.md\)/); assert.doesNotMatch(elsewhere, /tracks in parallel/);
const { brief } = await import('../lib/brain.mjs');
assert.match(brief('research', 'Lax', ['research']), /keeps these notes[\s\S]*How Lax does research/);
assert.equal(brief('research', 'Lax', []), '', 'no notes and no roles: no brief');

// ---------- offered by voice ----------
const said = [], feed = [], pending = new Map(), bubbles = [], record = [], miles = [], minds = [];
let xp = 0;
const r = createRoles({ settings: () => ({ name: 'Lax', learns: true }), feed: (l) => feed.push(l), diary: () => {}, say: (t) => said.push(t),
  broadcast: (type, d) => type === 'bubble' && bubbles.push(d), pending, quiet: () => true, gainXp: (n) => (xp += n),
  milestone: (t) => miles.push(t), record: (k, t) => record.push(`${k}: ${t}`), mind: (k, x) => minds.push([k, x?.role]) });
assert.equal(r.drafted({ name: 'lawyer', why: 'x' }), false, 'no practice written: nothing to offer');
assert.equal(r.drafted({ name: 'Not A Role', why: 'x' }), false);
assert.equal(r.drafted({ name: 'research', why: 'two reports for Noticed' }), true);
assert.equal(r.drafted({ name: 'research', why: 'again' }), false, 'drafted once');
r.tick();
const b = bubbles.pop();
assert.match(b.text, /I've done research for you 2 times\. Shall I take it on as one of my roles\?/);
assert.match(b.details, /Why: two reports for Noticed[\s\S]*Split the question/, 'its practice, before you say yes');
assert.equal(r.hears('yes'), true);
assert.equal(r.list()[0].status, 'active'); assert.deepEqual(r.active(), ['research']);
assert.equal(xp, 20); assert.deepEqual(miles, ['Lax took on its first role: research']);
assert.match(said.pop(), /Research is one of my roles now/);
assert.ok(minds.some(([k, x]) => k === 'practice' && x === 'research'));
assert.match(execFileSync('git', ['-C', MIND, 'log', '--format=%s'], { encoding: 'utf8' }), /I took on a role: research/);
assert.equal(r.hears('yes'), false, 'nothing on screen: not for roles');
const v = r.view()[0];
assert.deepEqual([v.name, v.status, v.work, v.projects, v.last], ['research', 'active', 2, ['fisicai', 'research'], '2026-10-14']);
assert.match(v.practice, /^# Research/);

// No: never offered again. Later: asked again later.
role('lawyer', '# Lawyer\nRead the contract twice.\n');
r.drafted({ name: 'lawyer', why: 'three contracts' }); r.offer('lawyer'); r.hears('no');
assert.equal(r.list().find((x) => x.name === 'lawyer').status, 'declined');
assert.equal(r.drafted({ name: 'lawyer' }), false);
assert.equal(r.view().some((x) => x.name === 'lawyer'), false, 'a no is not shown');
role('assistant', '# Assistant\nCalendar first.\n');
r.drafted({ name: 'assistant' }); r.offer('assistant'); r.hears('ask me in 3 days');
const later = r.list().find((x) => x.name === 'assistant');
assert.equal(later.status, 'later'); assert.ok(later.laterUntil > Date.now() + 2.9 * 86400e3);
// A yes from the menu while it's asking clears the question.
r.offer('assistant'); assert.equal(pending.size, 1);
assert.equal(r.take('assistant'), ''); assert.equal(pending.size, 0);
assert.deepEqual(miles.pop(), 'Lax took on a role: assistant');
// Kept across a restart: a question on screen is gone, so it's offered again.
r.offer('lawyer'); const restarted = createRoles({ settings: () => ({ name: 'Lax', learns: false }), feed() {}, say() {}, broadcast() {}, pending: new Map(), quiet: () => true });
assert.deepEqual(restarted.active(), ['research', 'assistant']);
assert.equal(JSON.parse(fs.readFileSync(STATE, 'utf8')).roles.length, 3);

// Forget: no longer a role, its practice gone; its work stays in the episodes.
assert.equal(r.forget('assistant'), true);
assert.ok(!fs.existsSync(path.join(ROLES, 'assistant.md'))); assert.deepEqual(r.active(), ['research']);
assert.equal(workLog().length, 2);

// ---------- how reflections learn about roles ----------
const { addRoles, addRolesToRemembering, LEARNING, REMEMBERING, ensureBrain } = await import('../lib/brain.mjs');
fs.writeFileSync(LEARNING, '# How I learn\n\n## Answer\nJSON\n');
addRoles(); addRoles();
const l = fs.readFileSync(LEARNING, 'utf8');
assert.equal(l.match(/## Roles/g).length, 1); assert.match(l, /## Roles[\s\S]*"roles": \[[\s\S]*## Answer/);
fs.writeFileSync(REMEMBERING, '    session: <session id>\n    transcript: <path of the archived transcript>\n\n- A workflow the user repeats: a skill.\n');
addRolesToRemembering(); addRolesToRemembering();
const m = fs.readFileSync(REMEMBERING, 'utf8');
assert.match(m, /transcript: .*\n    role: <one of my roles[^\n]*\n    made: /); assert.equal(m.match(/\n    role: /g).length, 1);
assert.match(m, /a skill\.\n- How I do a kind of work \(research…\): its role, `roles\/<role>\.md`/);
fs.rmSync(LEARNING); fs.rmSync(REMEMBERING); ensureBrain();
assert.match(fs.readFileSync(LEARNING, 'utf8'), /## Roles/); assert.match(fs.readFileSync(REMEMBERING, 'utf8'), /\n    role: /);

// ---------- the brain on the website: shape only ----------
const raw = { projects: [{ name: 'lax', notes: 20 }, { name: 'research', notes: 8 }],
  roles: [{ name: 'doctor', work: [{ day: '2026-10-14', where: 'secret' }] }, { name: 'research', work: [{ day: '2026-10-12', where: 'research' }, { day: '2026-10-14', where: 'fisicai' }] }] };
const s = shape(raw, ['lax'], Date.parse('2026-10-15'), ['research']);
assert.deepEqual(s.roles, [{ name: 'research', work: 2, week: 2, p: [1] }, { name: '', work: 1, week: 1, p: [] }], 'most work first; a role not allowed is unnamed; projects by place');
assert.ok(clean(s), 'the Worker keeps it');
assert.equal(clean({ ...s, roles: [{ ...s.roles[0], title: 'Noticed prior art' }] }), null, 'nothing but the shape');
const { roles: _, ...old } = s;
assert.deepEqual(clean(old)?.roles, [], 'a snapshot kept from before roles still shows');
assert.deepEqual(cleanEvent({ kind: 'track', at: 1, role: 0 }), { kind: 'track', at: 1, role: 0 });
assert.deepEqual(cleanEvent({ kind: 'work', at: 1, project: 1, role: 0 }), { kind: 'work', at: 1, project: 1, role: 0 });
assert.equal(cleanEvent({ kind: 'work', at: 1, role: 0, topic: 'x' }), null);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('roles ok');
process.exit(0);
