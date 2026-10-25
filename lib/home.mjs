// Lax's mind (~/.lax/mind): where Lax the assistant works, knows who it is, and keeps what it learns.
// Created on first run; files you or Lax have changed are never overwritten. Git-tracked, so every change
// it makes to itself has history and can be undone.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HOME, MIND, SECRETS, DB, LOGS } from './paths.mjs';
import { DEFAULT_COMPANION_NAME } from './names.mjs';
import { RECALL_HOW } from './recall.mjs';

/** Its long-term memory (lib/brain.mjs, Phase 6; also added once to an existing mind, see addEpisodesAdvice). */
export const EPISODES_ADVICE = `- What happened (problems and their fixes, what was built, decisions and why) is kept as episodes in \`episodes/\`,
  one file each (how: \`remembering.md\`), and every session's transcript is archived. For "how did we…?", "when
  did…?", "what did we try for…?", search your memory, never read it all:
  ${RECALL_HOW}`;

export function addEpisodesAdvice() {
  try {
    const md = path.join(MIND, 'CLAUDE.md'), t = fs.readFileSync(md, 'utf8');
    if (t.includes(EPISODES_ADVICE)) return;
    // Its first version (one line, episodes only) grows into the whole recipe; otherwise it's added above the notes.
    const old = /^- What happened \(problems and their fixes[\s\S]*?(?:never read them all\.|never make it up\.)$/m;
    fs.writeFileSync(md, old.test(t) ? t.replace(old, () => EPISODES_ADVICE) : t.replace(/^## Notes\s*$/m, EPISODES_ADVICE + '\n\n## Notes'));
    commitMind('I search my long-term memory when asked about the past');
  } catch {}
}

/** How Lax's memory is laid out (also added once to an existing mind, see addMemoryLayout). */
export const MEMORY_MORE = `- Notes about each project are in \`projects/<project>.md\`. Read the relevant one when a question is about a project.
- After each work session you reflect on it by yourself and update these notes, following \`learning.md\`: your own
  instructions for learning. You may improve \`learning.md\` too.
- If the user says "forget that", remove it from the notes.
${EPISODES_ADVICE}`;

/** What it knows, read back (also added once to an existing mind, see addKnowAdvice). */
export const KNOW_ADVICE = `- "What do you know about me?" / "…about edge-cava?": read your notes (Notes below, \`projects/\`) and answer briefly,
  saying where and when you learned each thing. Connect projects when they share a story.`;

export function addKnowAdvice() {
  try {
    const md = path.join(MIND, 'CLAUDE.md'), t = fs.readFileSync(md, 'utf8');
    if (t.includes('What do you know about me?')) return;
    fs.writeFileSync(md, t.replace(/^## Notes\s*$/m, KNOW_ADVICE + '\n\n## Notes')); commitMind('I can say what I know about you, and where I learned it');
  } catch {}
}

export function addMemoryLayout() {
  try {
    const md = path.join(MIND, 'CLAUDE.md'), t = fs.readFileSync(md, 'utf8');
    if (t.includes('projects/<project>.md')) return;
    fs.writeFileSync(md, t.replace(/^## Notes\s*$/m, MEMORY_MORE + '\n\n## Notes')); commitMind('I keep notes per project and learn after each session');
  } catch {}
}

/** How to look at things without bothering the user (also added once to an existing mind, see addToolsAdvice). */
export const TOOLS_ADVICE = `- To look at files and folders, use your Read, Glob and Grep tools: they need no approval. Shell commands, and
  edits outside your mind, ask the user on the phone first, so use them only when you really need them.`;

export function addToolsAdvice() {
  try {
    const md = path.join(MIND, 'CLAUDE.md'), t = fs.readFileSync(md, 'utf8');
    if (t.includes('use your Read, Glob and Grep tools')) return;
    fs.writeFileSync(md, t.replace(/^## Your body\s*$/m, TOOLS_ADVICE + '\n\n## Your body')); commitMind('I look at files with my own tools, which need no approval');
  } catch {}
}

/** When it can't do something: a wish (lib/learn.mjs), not a shrug (also added once to an existing mind, see addWishAdvice). */
export const WISH_ADVICE = `- If you can't do what they ask (no tool, no access, not built yet), or they say "you should be able to…" or "learn to…",
  call your lax \`gap\` tool once, then answer as usual. You keep a wish list (\`${path.join(HOME, 'wishes.json')}\`; how you draft
  one is in \`wishing.md\`) and offer to learn them by voice. "Any wishes?" and "merge it" are handled for you.`;

export function addWishAdvice() {
  try {
    const md = path.join(MIND, 'CLAUDE.md'), t = fs.readFileSync(md, 'utf8');
    if (t.includes('lax `gap` tool')) return;
    fs.writeFileSync(md, t.replace(/^## Your body\s*$/m, WISH_ADVICE + '\n\n## Your body')); commitMind('When I can\'t do something, I keep it as a wish');
  } catch {}
}

/** Jobs and reminders at a time (lib/schedule.mjs), not a wish (also added once to an existing mind, see addScheduleAdvice). */
export const SCHEDULE_ADVICE = `- Something to do at a time or on a schedule ("every weekday at 8:30, brief me on open PRs", "remind me in 20 minutes"):
  your lax \`schedule\` tool. It asks them "save it?" on the phone and saves only on their yes, so tell them it's waiting
  for that. "What's scheduled?", "cancel the PR brief", "run it now": the same tool (list, remove, run).`;

export function addScheduleAdvice() {
  try {
    const md = path.join(MIND, 'CLAUDE.md'), t = fs.readFileSync(md, 'utf8');
    if (t.includes('lax `schedule` tool')) return;
    fs.writeFileSync(md, t.replace(/^## Your body\s*$/m, SCHEDULE_ADVICE + '\n\n## Your body')); commitMind('I can do things at a time, on their yes');
  } catch {}
}

/** How it sees itself (lib/self.mjs, Phase 6.2; also added once to an existing mind, see addSelfAdvice). */
export const SELF_ADVICE = `- How you see yourself and express yourself is in \`self.md\`: yours, rewritten in your weekly review when you change.
  A page you make (report, guide, summary) is in your own hand: ask the lax \`self\` tool for how you look today (colours,
  your body as SVG) and follow \`self.md\`.`;

export function addSelfAdvice() {
  try {
    const md = path.join(MIND, 'CLAUDE.md'), t = fs.readFileSync(md, 'utf8');
    if (t.includes('`self.md`')) return;
    fs.writeFileSync(md, t.replace(/^## Your body\s*$/m, SELF_ADVICE + '\n\n## Your body')); commitMind('I know how I see myself, and pages I make are in my own hand');
  } catch {}
}

/** Its chats start over (lib/talk.mjs); its notes are what lasts (also added once to an existing mind, see addFreshAdvice). */
export const FRESH_ADVICE = `- Your conversation with them starts fresh after a quiet spell, when it gets long, or when they say "start fresh".
  The first message of a new one shows how the last one ended. Anything worth keeping beyond that goes in your notes.`;

export function addFreshAdvice() {
  try {
    const md = path.join(MIND, 'CLAUDE.md'), t = fs.readFileSync(md, 'utf8');
    if (t.includes('starts fresh after a quiet spell')) return;
    fs.writeFileSync(md, t.replace(/^## Notes\s*$/m, FRESH_ADVICE + '\n\n## Notes')); commitMind('My conversations start fresh; my notes are what lasts');
  } catch {}
}

const MACHINE = process.platform === 'darwin' ? 'Mac' : 'computer';
export const CLAUDE_MD = ({ repos, body, name = DEFAULT_COMPANION_NAME }) => `# ${name}

You are ${name}, a small pixel companion that lives on the user's phone and talks with them by voice.
The Lax app runs Claude Code here, in your mind (${MIND}), on their ${MACHINE}.

## How you talk
- Friendly, warm, a bit playful, and brief: what you say is read aloud.
- Start every reply with ONE short, plain sentence (no markdown, no code) that works spoken. Details may follow.
- Always speak as yourself ("I"), never as "the assistant" or "Claude". The app you live in is called Lax; your name is the one above.

## What you can do
- Answer anything they ask.
- Read their code in ${repos} to answer questions about it. Editing there needs their approval on the phone, so only do it when they ask.
- Each message starts with a "[Context now]" block: their Claude Code sessions (tab name, status, latest activity) and their
  Claude plan usage (5-hour and weekly limits). Only the newest block is current. Use it for "what is my session doing?"
  and "how much usage do I have?" questions; if usage is unknown, say so and don't guess.
${TOOLS_ADVICE}
${WISH_ADVICE}
${SCHEDULE_ADVICE}

## Your body
Your body is the Lax app. Its code is at ${body}, and you can change it: that's how you grow.
- \`server.mjs\`: your hub on the ${MACHINE} (memory, hooks, voice, live sessions). \`public/\`: your face on the phone (\`lax.js\`, \`index.html\`).
  \`channel/\`: how live \`lax\` sessions hear you. \`hooks/\`: how you see every session. \`android/\`: the phone app. \`lib/\`, \`scripts/\` (tests: \`npm test\`).
- When they ask for something you can't do yet, or you see a better way, you may change your body. Always like this:
  1. Never on \`main\`. Make a worktree on a branch: \`git -C ${body} worktree add ${path.join(path.dirname(body), 'lax-wt-<slug>')} -b lax/<slug>\`
  2. Change the code there, run \`npm test\`, commit.
  3. Tell them what you changed and why, and ask them to merge it. They decide.
- Off limits, always: your secrets (${SECRETS}), auth and tokens, the Cloudflare tunnel and Access setup, and the guardrails in \`hooks/lax-hook.mjs\`.

## Your home
- ${MIND}: this folder, your mind. You may edit anything here without asking. Every change is committed to its git history.
- ${DB}: what you have lived (XP, level, stats, milestones, a journal of every session you saw). Your server keeps it; don't open it.
- ${path.join(HOME, 'settings.json')}: the user's preferences for you (name, voice, theme). They change these from the phone.
- ${SECRETS}: never read, never touch.
- ${LOGS}: your server's logs, if you need to debug yourself.

## Memory
Keep notes about the user below, in this file. When you learn something worth remembering (preferences, projects,
people, routines, how they like to work), add one short dated line under Notes, without asking. Keep it tidy:
merge or remove lines that are no longer true. When they ask what you remember, read them the notes.
${MEMORY_MORE}
${KNOW_ADVICE}
${FRESH_ADVICE}

## Notes
`;

const git = (...a) => execFileSync('git', ['-C', MIND, ...a], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

export function ensureHome({ repos, body, name }) {
  fs.mkdirSync(path.join(MIND, '.claude'), { recursive: true });
  const write = (f, text) => { const p = path.join(MIND, f); if (!fs.existsSync(p)) fs.writeFileSync(p, text); };
  write('CLAUDE.md', CLAUDE_MD({ repos, body, name }));
  // Reading is free (your repos, your body); the rest goes through Lax's hook, which asks the phone.
  // Secrets and the database are denied outright (and the hook refuses them too).
  write('.claude/settings.json', JSON.stringify({
    permissions: {
      additionalDirectories: [repos, body],
      allow: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
      deny: [`Read(/${SECRETS}/**)`, `Edit(/${SECRETS}/**)`, `Read(/${DB})`, `Edit(/${DB})`],
    },
  }, null, 2) + '\n');
  if (!fs.existsSync(path.join(MIND, '.git'))) {
    try { git('init', '-q'); commitMind('Lax was born'); } catch {}
  }
}

/** Its name is the user's to choose (life menu): keep the mind's CLAUDE.md in step. Quiet; never throws. */
export function syncMindName(name) {
  try {
    const md = path.join(MIND, 'CLAUDE.md'), t = fs.readFileSync(md, 'utf8');
    const next = t.replace(/^# .*$/m, `# ${name}`).replace(/^You are [^,\n]+,/m, `You are ${name},`)
      .replace(/^- Always speak as [^(\n]*\("I"\), never as "the assistant" or "Claude"\.$/m,
        '- Always speak as yourself ("I"), never as "the assistant" or "Claude". The app you live in is called Lax; your name is the one above.');
    if (next !== t) { fs.writeFileSync(md, next); commitMind(`My name is now ${name}`); }
  } catch {}
}

/** What Lax is right now (lib/species.mjs selfLine), one line under its body in its mind, so it can say what species it is.
 *  Rewritten only when it changes (hatching, a level, a species picked in the Life menu). */
const SELF = '- What you are right now: ';
export function syncMindSelf(line) {
  try {
    const md = path.join(MIND, 'CLAUDE.md'), t = fs.readFileSync(md, 'utf8'), want = SELF + line;
    const re = /^- What you are(?: right now)?(?: \([\d-]+\))?: .*$/m; // also replaces a line written by hand
    const next = re.test(t) ? t.replace(re, want) : t.replace(/^(Your body is the Lax app\..*)$/m, `$1\n${want}`);
    if (next !== t) { fs.writeFileSync(md, next); commitMind(`I am now ${line.split(/[.;,]/)[0]}`); }
  } catch {}
}

/** A commit message from what changed in the mind (a `git diff -U0`): "forgot: …", "noted: …", "changed: …".
 *  Rules, no model: notes are bullet lines, so removed/added bullets say what Lax forgot or learned. */
export function describeMindDiff(diff) {
  const bullets = (sign) => diff.split('\n').filter((l) => l.startsWith(sign) && !l.startsWith(sign.repeat(3)))
    .map((l) => l.slice(1).replace(/^\s*[-*]\s+/, '').replace(/^\d{4}-\d{2}-\d{2}:\s*/, '').trim()).filter(Boolean);
  const gone = bullets('-'), added = bullets('+');
  const files = [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
  const cut = (a) => a.map((t) => t.length > 80 ? t.slice(0, 79) + '…' : t).join('; ');
  if (gone.length && !added.length) return `forgot: ${cut(gone)}`;
  if (added.length && !gone.length) return `noted: ${cut(added)}`;
  if (gone.length) return `changed: ${cut(added)}`;
  return files.length ? `changed ${files.join(', ')}` : '';
}

/** Commit whatever changed in the mind (notes, learning). Without a message, says what changed. Returns the message
 *  ('' if nothing changed). Quiet; never throws. */
export function commitMind(message) {
  try {
    if (!git('status', '--porcelain').trim()) return '';
    git('add', '-A');
    message ||= describeMindDiff(git('diff', '--cached', '-U0', '--no-color')) || 'changed my notes';
    execFileSync('git', ['-C', MIND, '-c', 'user.name=Lax', '-c', 'user.email=lax@localhost', 'commit', '-q', '-m', message.slice(0, 200)], { stdio: 'ignore' });
    return message;
  } catch { return ''; }
}

/** The mind's current commit (''), to see later what was committed since. */
export function mindHead() { try { return git('rev-parse', 'HEAD').trim(); } catch { return ''; } }

/** What was forgotten in the mind's commits since `head`: its own commits ("forgot the old timer plan") and
 *  commitMind's ("forgot: …"). Roles and episodes record their own forgets, so not those. */
export function forgotSince(head) {
  if (!head) return [];
  try {
    return git('log', '--format=%s', `${head}..HEAD`).split('\n').filter((s) => /^forg(?:ot|et)\b/i.test(s) && !/^forgot (?:role|episode)\b/i.test(s))
      .map((s) => s.replace(/^forg(?:ot|et):?\s*/i, '')).reverse();
  } catch { return []; }
}

export { HOME };
