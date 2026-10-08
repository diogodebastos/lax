// Lax learns what it couldn't do (Phase 5, #13). A session that hears you through Lax (or Lax itself) says "I can't"
// and calls the channel's `gap` tool → a wish (~/.lax/wishes.json; similar asks become one wish) → a proposal, drafted
// in the background → asked by voice at a quiet moment → on your yes: an issue, a build in a worktree of its body on
// lax/learn-<slug>, the guardrails (lib/guard.mjs) and the tests, a pull request → "merge it": merged, restarted,
// checked, rolled back if it broke (scripts/after-merge.mjs). Nothing reaches main without your yes.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { HOME, MIND, LOGS } from './paths.mjs';
import { runClaude, lastJson } from './claude-run.mjs';
import { commitMind } from './home.mjs';
import { checkBranch, refuses, OFF_LIMITS } from './guard.mjs';

export const WISHES = path.join(HOME, 'wishes.json');
export const WISHING = path.join(MIND, 'wishing.md');

const WISHING_MD = `# How I draft a wish

This file is mine: it tells me how to turn "I can't" into a proposal, and I may improve it (the weekly review is the time for that).

## Same wish or a new one?
Two asks are the same wish when the same ability would answer both, even in other words ("share to WhatsApp" and
"send this to Rita"). Then I answer with its id in "same_as", and I don't draft again.

## Not a gap
If it was really a one-off mistake, a misunderstanding, or something I can already do, I say so in "not_a_gap".

## The proposal
Short, in markdown, like the ones the user wrote for quick actions (#11) and sharing (#12):
- **What I'd do**: the ability, from the user's side, in one or two sentences.
- **How**: which parts of my body change (I read the code first), and the smallest change that does it.
- **What I need from you**: apps, permissions, accounts. "Nothing" is a fine answer.
- **Tests**: how I'll prove it works, on a throwaway Lax.
- **Risks**, and **what stays off limits**.
I never propose to touch how I'm reached or protected (auth, tokens, the tunnel, secrets, my guardrails): that's "off_limits".

## What I say
"say" is read aloud on the phone: one or two plain sentences, no markdown. When they asked it, what I'd do, then
"Want me to?". Like: "You asked me to share to WhatsApp yesterday. I can learn it: I'd open the chat on your Mac with
the image pasted in, and you press Enter. Want me to?"

## Answer
I finish with ONE line of JSON and nothing after it:
{"wish": {"same_as": "", "title": "a few words", "slug": "kebab-case", "say": "…", "proposal": "…", "off_limits": "", "not_a_gap": ""}}
`;

export function ensureWishing() { if (!fs.existsSync(WISHING)) { fs.writeFileSync(WISHING, WISHING_MD); commitMind('I keep a wish list of what I can\'t do yet'); } }

const now = () => Date.now();
const day = (t) => new Date(t).toISOString().slice(0, 10);
const slugify = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'wish';
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// What you say back to a wish question, in plain words. Anything else is a correction ("on the Mac, not the phone").
const norm = (t) => String(t || '').toLowerCase().replace(/[.!?,]+/g, ' ').replace(/\s+/g, ' ').trim();
export function verdict(text) {
  const t = norm(text);
  if (/^(yes|yeah|yep|yup|sure|ok|okay|go|go ahead|do it|please|please do|learn it|build it|merge|merge it|ship it)( please)?$/.test(t)) return 'yes';
  if (/^(no|nope|nah|no thanks|no thank you|never|don't|dont|not interested)$/.test(t)) return 'no';
  if (/^(later|not now|maybe later|ask me later|another time|not yet|tomorrow)$/.test(t)) return 'later';
  return t ? 'other' : '';
}
// "Any wishes?" / "what do you want to learn?": said to Lax itself.
export const WISH_ASK = /^(?:(?:hey |ok )?lax,? )?(?:any wishes|do you have any wishes|what do you (?:want|wish) to learn|what would you like to learn|(?:read me )?your wish ?list|what's on your wish ?list)\b/i;
export const MERGE_IT = /^(?:(?:ok |okay |yes,? )?merge it|ship it)\b/i;

/**
 * deps: { settings(), feed(line, kind, project), diary(text), say(text, kind), broadcast(type, data), pending (Map), quiet() → bool,
 *   gainXp(n), body (the repo Lax builds on), claude, gh, log(...), record(kind, text) (its learning record), restart (command) }
 */
export function createLearn(deps) {
  const BODY = deps.body, GH = deps.gh || process.env.LAX_GH || 'gh';
  const DRAFT_MODEL = process.env.LAX_DRAFT_MODEL || 'sonnet', BUILD_MODEL = process.env.LAX_BUILD_MODEL || 'opus';
  const EVERY = Number(process.env.LAX_WISH_EVERY || 3 * 3600) * 1000; // at most one offer this often, unasked
  const LATER = Number(process.env.LAX_WISH_LATER || 24 * 3600) * 1000;
  const me = () => deps.settings().name.toLowerCase();
  const record = (kind, text) => deps.record?.(kind, text);

  // ---------- the wish list ----------
  const load = () => { try { return JSON.parse(fs.readFileSync(WISHES, 'utf8')); } catch { return { wishes: [], lastOffer: 0 }; } };
  let list = load();
  const save = () => fs.writeFileSync(WISHES, JSON.stringify(list, null, 2) + '\n');
  // After a restart: a question that was on screen is gone, and a build was cut off. Offered again. ('merging' waits for after-merge.)
  for (const w of list.wishes) {
    if (w.status === 'proposed') w.status = 'new';
    if (w.status === 'building' || w.status === 'approved') { w.status = 'new'; w.failed = 'I was restarted while building it'; }
  }
  const find = (id) => list.wishes.find((w) => w.id === id);
  const open = () => list.wishes.filter((w) => !['declined', 'merged', 'drafting'].includes(w.status));
  const note = (w, what) => { (w.history ||= []).push({ ts: now(), what: cut(what, 300) }); };

  // ---------- notice: a gap → a draft (one at a time, in the background) ----------
  const drafts = []; let drafting = false;
  function gap({ asked, why, idea, project, voice }) {
    if (!deps.settings().learns) return false;
    asked = cut(asked, 200); why = cut(why, 300); idea = cut(idea, 300);
    if (!asked) return false;
    const ask = { asked, why, idea, project: project || '?', ts: now(), via: voice ? 'lax' : 'session' };
    deps.feed(`> wish: ${asked}`, 'diary', me());
    const no = refuses(`${asked} ${idea}`);
    if (no) { list.wishes.push({ id: newId(), title: asked, slug: slugify(asked), asks: [ask], count: 1, first: ask.ts, last: ask.ts, status: 'declined', why: no }); save();
      record('refused', `${asked}: ${no}`); return true; }
    drafts.push({ ask }); draftNext(); return true;
  }
  const newId = () => 'w' + now().toString(36) + Math.random().toString(36).slice(2, 5);

  async function draftNext() {
    if (drafting || !drafts.length) return;
    drafting = true;
    const job = drafts.shift();
    try { await (job.fix ? redraft(job) : draftAsk(job.ask)); }
    catch (e) { deps.log?.('learn: draft failed:', e.message); }
    finally { drafting = false; draftNext(); }
  }
  function draftPrompt(extra) {
    ensureWishing();
    const known = open().concat(list.wishes.filter((w) => w.status === 'declined'))
      .map((w) => `- ${w.id} [${w.status}] ${w.title}: ${w.asks.map((a) => a.asked).slice(-3).join(' / ')}`).join('\n') || '(none yet)';
    return `Draft a wish, following wishing.md (your instructions for this). Today is ${day(now())}.\n`
      + `Your body (the Lax app's code) is at ${BODY}: read what you need there before proposing how. You can't change anything now.\n`
      + `Off limits, always: ${OFF_LIMITS.join(', ')}, and anything about auth, tokens, the tunnel or secrets.\n\n`
      + `Wishes you already have:\n${known}\n\n${extra}`;
  }
  const askLine = (a) => `"${a.asked}" (${day(a.ts)}, in ${a.project}${a.via === 'lax' ? ', said to you' : ''}). Why not: ${a.why}${a.idea ? `. Idea: ${a.idea}` : ''}`;
  const draftRun = (prompt) => runClaude({ prompt, cwd: MIND, model: DRAFT_MODEL, maxTurns: 25, timeoutMs: 8 * 60e3, claude: deps.claude,
    env: { LAX_BUILD: BODY, LAX_DRAFT: '1', LAX_HOME: HOME } }).then((r) => ({ ...r, wish: lastJson(r.text, 'wish').wish || null }));

  async function draftAsk(ask) {
    const r = await draftRun(draftPrompt(`The new ask:\n${askLine(ask)}`));
    const d = r.wish;
    if (!d) { deps.log?.('learn: no draft:', cut(r.err || r.text, 200)); return; }
    const same = d.same_as && find(String(d.same_as));
    if (same) { // asked again, maybe in other words
      same.asks.push(ask); same.count++; same.last = ask.ts; save();
      deps.feed(`  same wish as "${same.title}" (asked ${same.count} times)`, 'diary', me());
      return;
    }
    const w = { id: newId(), title: cut(d.title || ask.asked, 60), slug: uniqueSlug(slugify(d.slug || d.title || ask.asked)),
      asks: [ask], count: 1, first: ask.ts, last: ask.ts, status: 'new', say: cut(d.say, 400), proposal: String(d.proposal || '').slice(0, 6000) };
    if (d.not_a_gap) { w.status = 'declined'; w.why = cut(d.not_a_gap, 200); record('not a gap', `${w.title}: ${w.why}`); }
    else if (d.off_limits) { w.status = 'declined'; w.why = cut(d.off_limits, 200); record('refused', `${w.title}: ${w.why}`); }
    list.wishes.push(w); save();
    if (w.status === 'new') deps.feed(`  wish drafted: ${w.title}`, 'diary', me());
  }
  function uniqueSlug(s) { let x = s, i = 2; while (list.wishes.some((w) => w.slug === x)) x = `${s}-${i++}`; return x; }

  // A correction ("on the Mac, not the phone"): the proposal is drafted again with it, then offered again.
  async function redraft({ fix: id, text }) {
    const w = find(id); if (!w) return;
    const r = await draftRun(draftPrompt(`Revise wish ${w.id} ("${w.title}") with the user's correction. Keep "same_as" empty.\n`
      + `Asks:\n${w.asks.map((a) => '- ' + askLine(a)).join('\n')}\n\nYour proposal so far:\n${w.proposal}\n\nThe user said: "${text}"`));
    if (r.wish) { w.say = cut(r.wish.say, 400) || w.say; w.proposal = String(r.wish.proposal || w.proposal).slice(0, 6000); w.title = cut(r.wish.title || w.title, 60); }
    w.status = 'new'; save();
    if (r.wish) offer(w); else deps.say(`I couldn't redo that proposal. Ask me for my wishes later.`, 'error');
  }

  // ---------- ask by voice ----------
  let asking = null; // { id (pending id), wish id, kind: 'offer' | 'merge' }
  function question(w, kind, text, options, details) {
    if (asking) deps.pending.get(asking.id)?.finish('none');
    const id = `wish-${kind}-${w.id}-${now().toString(36)}`;
    const bubble = { id, kind: 'question', project: me(), questions: [{ question: text, header: kind === 'offer' ? 'wish' : 'ready', options }], text, details, speak: true };
    const timer = setTimeout(() => deps.pending.get(id)?.finish('none'), 10 * 60e3);
    asking = { id, wish: w.id, kind };
    deps.pending.set(id, { bubble, finish(decision, answers) {
      if (!deps.pending.delete(id)) return;
      clearTimeout(timer); deps.broadcast('clear', { id });
      if (asking?.id === id) asking = null;
      const said = decision === 'answer' ? String(Object.values(answers || {})[0] || '') : '';
      (kind === 'offer' ? answerOffer : answerMerge)(w.id, said);
    } });
    deps.broadcast('bubble', bubble);
  }
  function offer(w) {
    w.status = 'proposed'; w.offered = now(); list.lastOffer = now(); save();
    const text = w.failed ? `Last time, building ${w.title} failed: ${cut(w.failed, 120)}. Want me to try again?` : w.say || `I could learn this: ${w.title}. Want me to?`;
    question(w, 'offer', text, [
      { label: 'Yes', description: 'Open an issue and build it on a branch' },
      { label: 'No', description: 'Don\'t offer it again' },
      { label: 'Later', description: 'Ask me tomorrow' }], w.proposal);
  }
  function answerOffer(id, said) {
    const w = find(id); if (!w) return;
    const v = verdict(said);
    if (!said) { w.status = 'later'; w.laterUntil = now() + EVERY; save(); return; } // no answer: offered again another time
    note(w, `you said: ${said}`);
    if (v === 'yes') { w.status = 'approved'; save(); deps.say(`Okay, I'll learn it. I'll tell you when it's ready.`); return queueBuild(w); }
    if (v === 'no') { w.status = 'declined'; w.why = 'you said no'; save(); record('declined', w.title); deps.say(`Okay, I won't offer that again.`); return; }
    if (v === 'later') { w.status = 'later'; w.laterUntil = now() + LATER; save(); deps.say(`Okay, I'll ask you tomorrow.`); return; }
    record('corrected', `${w.title}: ${said}`);
    deps.say(`Got it. Let me redo the proposal.`);
    drafts.push({ fix: w.id, text: said }); draftNext();
  }
  function answerMerge(id, said) {
    const w = find(id); if (!w || w.status !== 'review') return;
    const v = verdict(said);
    if (!said || v === 'later' || v === 'no') return; // it waits: "merge it" any time
    note(w, `you said: ${said}`);
    if (v === 'yes') return merge(w);
    record('changes asked', `${w.title}: ${said}`);
    deps.say(`Okay, I'll change it: ${cut(said, 80)}.`);
    queueBuild(w, said);
  }
  function askMerge(w) {
    question(w, 'merge', `${w.built ? cut(w.built, 140) + ' ' : ''}${w.title} is ready to try. Merge it?`, [
      { label: 'Merge it', description: 'Into main; I restart and check myself' },
      { label: 'Not yet', description: 'Say what to change, or merge it later' }],
      [w.try && `Try it: ${w.try}`, w.pr && `Pull request: ${w.pr}`, w.issue && `Issue: ${w.issue}`].filter(Boolean).join('\n'));
  }

  // At a quiet moment, at most one offer every few hours.
  function tick() {
    if (!deps.settings().learns || asking || building || !deps.quiet() || now() - (list.lastOffer || 0) < EVERY) return;
    const w = list.wishes.find((x) => x.status === 'new' || (x.status === 'later' && now() > (x.laterUntil || 0)));
    if (w) offer(w);
  }
  setInterval(tick, 60e3).unref();

  /** What you said, if it's for Lax's learning: an open wish question, "any wishes?", or "merge it". toLax: said in Lax's own tab. */
  function hears(text, { toLax = true } = {}) {
    if (asking && deps.pending.has(asking.id)) { // answering the question on screen
      deps.feed(`> ${cut(text, 90)}`, 'prompt', me());
      deps.pending.get(asking.id).finish('answer', { q: text });
      return true;
    }
    if (!toLax) return false;
    if (WISH_ASK.test(text.trim())) { deps.feed(`> ${cut(text, 90)}`, 'prompt', me()); anyWishes(); return true; }
    const ready = list.wishes.find((w) => w.status === 'review');
    if (ready && MERGE_IT.test(text.trim())) { deps.feed(`> ${cut(text, 90)}`, 'prompt', me()); merge(ready); return true; }
    return false;
  }
  function anyWishes() {
    const ready = list.wishes.find((w) => w.status === 'review');
    if (ready) return askMerge(ready);
    const b = list.wishes.find((w) => w.status === 'building' || w.status === 'approved');
    const w = list.wishes.find((x) => ['new', 'later', 'proposed'].includes(x.status));
    if (w) return offer(w);
    if (b) return deps.say(`I'm learning ${b.title} right now. I'll tell you when it's ready.`);
    deps.say(drafting || drafts.length ? `I'm still thinking about one. Ask me again in a minute.` : `No wishes right now. If I ever can't do something, I'll remember it.`);
  }

  // ---------- on yes: issue → worktree → build → guardrails + tests → pull request ----------
  const run = (cmd, args, opt = {}) => new Promise((resolve, reject) =>
    execFile(cmd, args, { cwd: BODY, timeout: 10 * 60e3, maxBuffer: 8 << 20, ...opt }, (e, out, err) =>
      e ? reject(Object.assign(e, { out: String(out || '') + String(err || '') })) : resolve(String(out).trim())));
  const git = (...a) => run('git', ['-C', BODY, ...a]);
  const builds = []; let building = null;
  function queueBuild(w, change) { w.status = 'approved'; save(); builds.push({ id: w.id, change }); buildNext(); }
  async function buildNext() {
    if (building || !builds.length) return;
    const job = builds.shift(), w = find(job.id); if (!w) return buildNext();
    building = w.id; w.status = 'building'; delete w.failed; save();
    deps.feed(`  learning: ${w.title}`, 'diary', me());
    try { await build(w, job.change); }
    catch (e) {
      w.status = 'new'; w.failed = cut(e.message, 200); save();
      record('build failed', `${w.title}: ${w.failed}`);
      deps.feed(`  couldn't learn ${w.title}: ${w.failed}`, 'error', me());
      deps.say(`I couldn't learn ${w.title}. ${cut(e.message, 140)}`, 'error');
    } finally { building = null; buildNext(); }
  }
  async function build(w, change) {
    w.branch = `lax/learn-${w.slug}`; w.worktree = path.join(path.dirname(BODY), `lax-wt-learn-${w.slug}`);
    if (!w.issue) { // the issue first: what it'll learn, before any code
      await run(GH, ['label', 'create', 'lax-learns', '--color', 'f9a825', '--description', 'Something Lax learned by itself'], {}).catch(() => {});
      w.issue = (await run(GH, ['issue', 'create', '--title', `Lax learns: ${w.title}`, '--label', 'lax-learns', '--body', issueBody(w)])).split('\n').pop();
      save(); deps.feed(`  issue: ${w.issue}`, 'diary', me());
    }
    if (!fs.existsSync(w.worktree)) {
      const exists = await git('rev-parse', '--verify', '--quiet', w.branch).then(() => true, () => false);
      await git('worktree', 'add', w.worktree, ...(exists ? [w.branch] : ['-b', w.branch, 'main']));
    }
    const nm = path.join(w.worktree, 'node_modules'); // the tests need the body's packages
    if (!fs.existsSync(nm) && fs.existsSync(path.join(BODY, 'node_modules'))) fs.symlinkSync(path.join(BODY, 'node_modules'), nm);
    // Built before (a retry after a failed check): check that first; build again only if it still fails.
    const ahead = !change && await git('rev-list', '--count', `main..${w.branch}`).then(Number, () => 0);
    let r = ahead ? { text: JSON.stringify({ built: w.built || '', try: w.try || '' }) } : await buildRun(w, change ? `The user tried it and asked for a change: "${change}". Make it on this branch.` : '');
    let why = await verify(w);
    if (why) { r = await buildRun(w, `Your last try didn't pass: ${why}\nFix that.`); why = await verify(w); }
    if (why) throw new Error(why);
    const res = lastJson(r.text, 'built');
    w.built = cut(res.built || w.built, 200); w.try = cut(res.try || w.try, 200);
    await git('push', '-u', 'origin', w.branch);
    if (!w.pr) w.pr = (await run(GH, ['pr', 'create', '--head', w.branch, '--base', 'main', '--title', `Lax learns: ${w.title}`,
      '--body', `${w.built}\n\nTry it: ${w.try}\n\nCloses ${w.issue}\n\nBuilt by Lax on your yes. Say "merge it" to Lax, or merge here.`])).split('\n').pop();
    w.status = 'review'; save();
    deps.diary(`learned ${w.title}, waiting for your merge`); deps.gainXp(10);
    askMerge(w);
  }
  const issueBody = (w) => `${w.proposal}\n\n---\nAsked ${w.count} time${w.count > 1 ? 's' : ''}:\n${w.asks.map((a) => `- "${a.asked}" (${day(a.ts)}, ${a.project})`).join('\n')}\n\nProposed by Lax; approved by voice. Label \`lax-learns\`.`;
  function buildRun(w, extra) {
    const prompt = `You are Lax, learning something new by changing your own body: the Lax app, in this git worktree (${w.worktree}, branch ${w.branch}).\n`
      + `What to learn: ${w.title}. It's tracked in ${w.issue}.\n\n<proposal>\n${w.proposal}\n</proposal>\n\n`
      + `How:\n- Read the README and the code you'll touch first; match its style, naming and comment density. The smallest change that does it.\n`
      + `- Add or extend a test in scripts/test-*.mjs (tests run a private Lax: a temp LAX_HOME and their own port; see scripts/test-brain.mjs). `
      + `A new test file goes at the end of "test" in package.json; nothing else there changes.\n`
      + `- Run npm test until it passes, then commit (git add, git commit) with a message that says what Lax can do now.\n`
      + `- Off limits (a guardrail checks it; touching them fails the build): ${OFF_LIMITS.join(', ')}. No pushing: Lax does that.\n`
      + (extra ? `\n${extra}\n` : '')
      + `\nFinish with ONE line of JSON and nothing after it: {"built": "what you can do now, one plain sentence", "try": "how the user tries it, by voice if possible"}`;
    return runClaude({ prompt, cwd: w.worktree, model: BUILD_MODEL, maxTurns: 80, timeoutMs: 40 * 60e3, claude: deps.claude,
      env: { LAX_BUILD: w.worktree, LAX_HOME: HOME } });
  }
  // The guardrails, then the tests: '' when it's good to go, or why not.
  async function verify(w) {
    const dirty = await run('git', ['-C', w.worktree, 'status', '--porcelain']).catch(() => '');
    if (dirty) return `there are uncommitted changes: ${cut(dirty, 120)}`;
    const g = checkBranch(BODY, w.branch);
    if (!g.ok) return g.why;
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^LAX_(HOME|DATA|PORT|URL|BUILD|DRAFT)$/.test(k)));
    try { await run('npm', ['test'], { cwd: w.worktree, env, timeout: 15 * 60e3 }); }
    catch (e) { // the whole output goes to a log; why it failed: the failed checks and the error itself
      const out = String(e.out || e.message), log = path.join(LOGS, `learn-${w.slug}.log`);
      try { fs.writeFileSync(log, out); } catch {}
      const lines = out.split('\n').filter((l) => /^\s*✗|^\s*\w*Error\b|check\(s\) failed|ERR!/.test(l));
      return `npm test failed (${log}):\n${(lines.length ? lines : out.trim().split('\n').slice(-8)).slice(0, 12).join('\n')}`;
    }
    return '';
  }

  // ---------- "merge it": guardrails again, merge into main, restart, check, roll back if broken ----------
  async function merge(w) {
    try {
      if (building) throw new Error(`I'm still building ${find(building)?.title || 'something'}`);
      const branch = await git('rev-parse', '--abbrev-ref', 'HEAD');
      if (branch !== 'main') throw new Error(`my body's checkout is on ${branch}, not main`);
      if (await git('status', '--porcelain', '--untracked-files=no')) throw new Error('my body has uncommitted changes on the Mac');
      const g = checkBranch(BODY, w.branch);
      if (!g.ok) throw new Error(g.why);
      const prev = await git('rev-parse', 'HEAD');
      await run('git', ['-C', BODY, '-c', 'user.name=Lax', '-c', 'user.email=lax@localhost', 'merge', '--no-ff', '-m', `Lax learns: ${w.title}${w.pr ? ` (${w.pr})` : ''}`, w.branch]);
      w.status = 'merging'; w.prev = prev; save();
      record('merged', w.title);
      deps.say(`Merging ${w.title}. I'll restart and tell you how I feel.`);
      // Detached: it restarts this server, so it has to outlive it.
      spawn(process.execPath, [path.join(BODY, 'scripts', 'after-merge.mjs'), BODY, prev, w.id], { detached: true, stdio: 'ignore',
        env: { ...process.env, ...(deps.restart && { LAX_RESTART: deps.restart }) } }).unref();
    } catch (e) {
      deps.say(`I can't merge ${w.title} yet: ${cut(e.message, 140)}.`, 'error');
    }
  }
  /** scripts/after-merge.mjs reports back (after the restart, so to the new server): healthy, or rolled back. */
  function merged({ id, ok, why }) {
    const w = find(id); if (!w) return false;
    if (ok) {
      w.status = 'merged'; w.merged = now(); save();
      deps.diary(`learned ${w.title}`); deps.gainXp(20);
      deps.say(`I merged ${w.title}, restarted, and I feel fine.${w.try ? ' ' + cut(w.try, 120) : ''}`);
      git('worktree', 'remove', '--force', w.worktree).then(() => git('branch', '-d', w.branch)).catch(() => {});
    } else {
      w.status = 'review'; w.failed = cut(why, 200); save();
      record('reverted', `${w.title}: ${w.failed}`);
      deps.say(`Merging ${w.title} broke me, so I rolled it back. ${cut(why, 120)}`, 'error');
    }
    return true;
  }

  return { gap, hears, tick, merged, offer: (id) => find(id) && offer(find(id)), wishes: () => list.wishes, busy: () => drafting || !!building };
}
