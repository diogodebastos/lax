# Lax roadmap

Lax is a **personal agent** for Claude Code. It lives on an old Galaxy Z Flip 3, keeps its memory on your Mac, and evolves with you: in looks, from how you work; in usefulness, from what it learns and what it runs for you; and in its own code, which it improves when it notices you reaching past it. The Mac is the brain and memory; the phone is the body. It uses no API credits: all model work runs through your Claude Code login.

## Why Lax, when there's the Claude app?

The official app already does Claude Code in your pocket: remote control, push notifications for approvals, voice input. Lax doesn't compete on that. It wins where a product built the same for everyone can't go:

- **Glance, don't open.** On the cover screen or the desk, you see every session's state without unlocking anything.
- **Talk, don't type.** A spoken back-and-forth; Lax answers in short sentences you can hear with the phone closed.
- **Every session, automatically.** Hooks see every Claude Code session on the Mac, without opting each one in.
- **Yours.** Memory, skills and history live in `data/` on your Mac. Honest caveat: whatever goes into a request as context reaches Anthropic through Claude Code. Lax keeps that small.
- **It improves itself.** If you reach for the Claude app or the laptop instead of Lax, that's friction. Lax logs it and proposes a fix to its own code, which you approve on the phone.

**The bar:** Lax has to be clearly better *for Diogo on his Flip 3* before anything else. The test is one week of real work where he never opens the Claude app or walks to the laptop just to check on a session. Open-sourcing comes after that.

Each phase has a detailed GitHub issue. We work phase by phase: build, test locally, commit, Diogo tests on the real phone, push, close, next.

## Done

### v0: the companion ✅
Pixel Lax (squash and stretch, Super Meat Boy energy) with idle / working / waiting / happy / error / listening / thinking / talking / sleeping states.
- Claude Code hooks → live terminal feed, session tabs, and a speech bubble for whatever needs you.
- Evolution by rules: XP, five stages (sprout → blob → cube → brick → legend), traits from how you work, streaks, moods, milestones.
- Life menu: name, color, voice, approvals, memory, rebirth.
- Three layouts on one page: cover strip (512×260), tall cover, open / Flex mode.

### Phase 1: reach Lax from anywhere ✅ [diogodebastos/lax#1](https://github.com/diogodebastos/lax/issues/1)
- `https://lax.diogodebastos.com` runs through a Cloudflare Tunnel behind Cloudflare Access (email PIN), plus Lax's own token. The server listens only on loopback.
- The server and tunnel run as launchd agents, so they start at login and restart on crash.
- Voice works in Chrome (tap to talk) and falls back to typing where the browser has no speech recognition (Brave).
- Claude Code questions show their real options on the phone (single or multi-select, answer by voice, or hand back to the terminal).
- Phone-side diagnostics land in `data/server.log`.

### Phase 2: talk into your running session ✅ [diogodebastos/lax#5](https://github.com/diogodebastos/lax/issues/5)
- Lax is a Claude Code **channel**: `claude-lax` starts a session that hears you. Claude replies through Lax, which reads the reply aloud.
- Tool approvals are relayed to the phone (✓ / ✗ / ⋯ details), in parallel with the terminal. There's no duplicate bubble from the hook.
- Session tabs: tap one to choose where your voice goes; the selected tab is "in front". With no live session, voice goes to a background session.
- The channel stays dormant in sessions not started with `claude-lax`.
- Tests run against a private, throwaway Lax.

### Phase 3: Lax Android app ✅ [diogodebastos/lax#2](https://github.com/diogodebastos/lax/issues/2)
- A small native app (`android/`, Kotlin, no dependencies) that shows the Lax page full screen, over the lock screen.
- A background link to the Mac that survives sleep, reboots (it starts on boot) and network drops (it relinks within seconds).
- **Approve / Deny notifications** that buzz, wake the screen, and work on the lock screen and the cover screen.
- Android's own speech recognition and text-to-speech, with no browser quirks.
- Pairing by QR (`/pair` → Android app) or over USB (`npm run android -- --pair`).
- Tabs are sessions: Lax's own tab (named after it: everything, and talking goes to Lax itself), then `project·where` (mac / cli / api / web). The open tab filters the terminal.

## Next

### Phase 3.4: the seed brain ✅ [diogodebastos/lax#15](https://github.com/diogodebastos/lax/issues/15)
The smallest learning loop that runs without you, so Lax starts learning now (Phase 5 builds on it).
- After a session that did real work goes quiet, Lax reflects on it in the background and updates its notes: about you, and about that project. Every change is committed in its mind's history.
- "I learned 2 things from edge-cava" on the phone. New sessions in that project start with Lax's brief.
- How it learns (`learning.md`) lives in its mind, and a weekly review lets Lax improve it.

### Phase 3.5: quick actions by voice ✅ [diogodebastos/lax#11](https://github.com/diogodebastos/lax/issues/11)
- `lax` runs Claude Code inside a small terminal wrapper, so Lax can type into it.
- In a live tab, say "clear", "compact", "stop", "continue" or "quit". Voice only, no buttons.
- "Plan mode", "auto mode", "accept edits", "manual mode" switch modes by reading the footer; "context", "usage" and "model" are read back aloud, details in the feed; "sonnet", "opus", "haiku" or "fable" switch the model.
- A closed list of actions only. Your terminal feels exactly the same.

### Phase 3.6: share via WhatsApp ✅ [diogodebastos/lax#12](https://github.com/diogodebastos/lax/issues/12)
- "Share the card via WhatsApp to Veralicious": Lax finds the contact (nicknames and near misses too; asks which one by voice if several match), WhatsApp Desktop opens that chat with the image pasted in or the text typed in, and nothing is sent without your yes.
- Or the macOS share menu, or straight to AirDrop, Messages or Mail.

### Phase 3.7: easter egg 🥚 ✅ [diogodebastos/lax#14](https://github.com/diogodebastos/lax/issues/14)
- Lax levels up to 100 on a familiar fire-starter's curve (Medium Slow), and evolves at 16 and 36, then 50 and 100.
- No names in the UI; those who know, know.
- The colours are familiar faces, in order: grass, fire, water starters, the electric mouse, the brown fox and its sun and moon forms, the coin cat, the pink one, then a free picker. Each colour levels on its face's curve: Medium Slow for the starters and the pink one, Medium Fast for the others and any custom colour. Changing colour can move the level; the stage never goes back.
- Shipping it puts Lax at the right stage for the new curve (a one-time reset). From then on, Lax never de-evolves.

### Phase 4: Lax on the cover screen ✅ [diogodebastos/lax#3](https://github.com/diogodebastos/lax/issues/3)
This is the product: glance, don't open.
- On the cover, just Lax: you talk, it answers. No terminal, no chat; a bubble only when a session needs your yes, one square per session, optional captions.
- Lax follows you between the screens: fold the phone with Lax open and it's on the cover, unfold and it's back. No Good Lock or MultiStar needed.
- Phone closed and something needs you: Lax comes up on the cover with the bubble, and ✓ approves right there.
- A shareable demo at [lax.diogodebastos.com/demo](https://lax.diogodebastos.com/demo), served by Cloudflare. Photos of the real phone: [#18](https://github.com/diogodebastos/lax/issues/18).

### Phase 4.1: a terminal that reads like Claude Code ✅
The session tabs on the open phone (and `lax watch` on the Mac) show a step the way Claude Code does, for Mac app and CLI sessions alike.
- What the assistant says between steps; each command under why it runs (its description), output folded to three lines (tap for more).
- Edits as `+3 -1` with the changed lines; reads, searches and connector calls folded into one line; a subagent's steps indented under it; failures show what they said.
- Answers with light markdown. Hold a step to copy its command and output.
- A status row under the open tab: mode, context, model, working or idle (context and model come from the status line, so CLI sessions only).
- Lax's own tab is a conversation: its work shows live while it runs and folds under its answer ("used 2 tools", tap for the steps); your yeses stay where you gave them; answers in markdown.
- It survives restarts (rebuilt from Lax's own transcript), with time dividers and Lax's diary in between: what it learned, levels, streaks. Live sessions opening and closing fold into one line.
- Your messages show cut to one line; tap one to read all of it, hold it to copy it whole (2026-10-08).
- Lax's conversation starts fresh after 8 quiet hours, at 150k tokens, or when you say "start fresh", carrying the last few turns of the one before; the context block keeps one line per session, more for a session you name. Every message re-sends the whole conversation, and the one endless conversation had reached 400k tokens; the first fresh message cost about 27k (2026-10-08, [#22](https://github.com/diogodebastos/lax/pull/22)).

### Phase 4.2: species, from how you work ✅ [diogodebastos/lax#19](https://github.com/diogodebastos/lax/issues/19)
Replaces picking a colour (designed 2026-10-07; built in `lib/species.mjs`, tests in `scripts/test-species.mjs`). Postponed (2026-10-07): tuning the bars on real eggs, then dropping the hand pick so species stay set; tracked in #19.
- **An egg first.** It gets no XP; a bar shows how close it is to hatching: 3 worked days (days off don't count), or the XP that would be Lv10, whichever comes first. Its speckles take the colour that's leading. It hatches at Lv1 with 0 XP, as the species the egg time showed, and keeps it.
- **The species** is the one furthest past its bar (first guesses, to tune on real eggs). "Busy" means something happened in the session in the last 10 minutes; open but idle time never counts.
  - electric: 3+ sessions busy at once, 25% of busy time
  - fire: 150 tool calls per busy hour
  - water: a median session of 45 busy minutes
  - grass: 10 prompts per session
  - pink: 4+ repos (a worktree counts as its repo; scratch and temp folders don't count)
  - brown fox: none of these
- **Lines.** Each species changes at Lv16, Lv36 and Lv50 (today's colour forms become the Lv50 forms), and gets the crown at Lv100.
  - grass: seed → bud → bloom
  - fire: ember → horn and flame → wings
  - water: shell → fluffy ears → cannons
  - electric: big ears → bolt tail → big bolt
  - fox: kit → ruff → at Lv50 coin cat (hit the 5-hour limit on 3+ days), otherwise sun or moon by busy hours 06–18 vs 18–06
- **Pink is a copier.** It never evolves; each day it takes yesterday's species (in that stage's form), and a day with no work keeps the last one. 1 in 100 pinks is the rare one: it copies like the others until Lv50, then shows its true form (floating) for good. Never explained.
- **Traits read only the last 7 days**, so they change with the work and fade after a week away. The species is who Lax is; the traits are what it's been doing lately. They read different signals (how you work vs. which tools), so a species doesn't always wear the same trait.
- **Existing Laxes re-hatch** under these rules.
- **While the bars get tuned**, the Life menu's species section shows each number against its bar, and "pick it myself" chooses a species (and the fox's branch, or the rare pink) by hand. It wins everywhere until switched off.

### Phase 4.3: Lax hears you right ✅ [diogodebastos/lax#25](https://github.com/diogodebastos/lax/issues/25)
Dictation today gets common words right and your names wrong: "Lax" and "fisicai" only come through when spelled out. Android's recognizer (or Chrome's) hears each stretch between pauses on its own, returns one guess, and knows none of your words; the only fix-up is the quick actions' short list ("plan mouth", "aiko"). Cheapest first:
- **Tell the listener.** Each voice message says it was dictated and may be misheard, and lists the names it may contain, so Claude reads "physic AI" as fisicai. Fixes what it does, not what the feed shows.
- **A vocabulary Lax keeps** in `~/.lax`, built by itself from project folders, session names, its own name and the action words. It grows from use: a word you had to spell out or typed over becomes a misheard → meant pair, and "you keep mishearing X, it's Y" adds one. Fixes are applied before the text is shown or sent; the quick actions' list moves into it.
- **Hint the recognizer** (a quick test on the Flip): Android 13+ takes a list of likely words (`EXTRA_BIASING_STRINGS`, best on the on-device recognizer), fed from the vocabulary. Ask for 3–5 guesses instead of one and pick the one with a known word.
- ~~Whisper on the Mac~~: dropped (2026-10-09). More to run and keep, more latency; we make the most of the phone's own recognizer.
- A correction shows briefly in the bubble (the fixed word underlined), so you can see it working.
- Lax listens in its own language setting, not the phone's: a phone in pt-PT hearing English (or the reverse) mishears a lot.

**Built** (2026-10-09; `lib/vocab.mjs`, `public/heard.js` shared by the page and the server, tests in `scripts/test-vocab.mjs` and `test-channel.mjs`): dictated messages say so and list the names (`via="voice"` and a note in a live session, a line in the assistant's context); `~/.lax/vocab.json` keeps misheard → meant pairs (the quick actions' list is its built-in part), fixed in the bubble as you talk with the fixed word underlined; it grows from the `misheard` tool (a session that had to read "physic AI" as fisicai) and from "you keep mishearing X, it's Y"; the app asks for 5 guesses with the names as biasing words (Android 13+) and keeps the guess with a known name. Then (same day): Lax listens in its own language (Life menu → voice → listens in: phone, english, português); a name you spell out ("F I S I C A I") is joined into the word and kept to listen for; a dictated message typed over within 2 minutes gives a pair when only one stretch differs and it sounds alike. Proven on the Flip: "physic eye" → fisicai learned and fixed. Proven since: sessions call `misheard` by themselves ("lux", "lacks", "flux" → Lax, 2026-10-11/12). Dropped (2026-10-13): proving the biasing helps on its own (it can't be isolated; it stays on). Done.

### Phase 4.4: Whisper on the Mac [diogodebastos/lax#27](https://github.com/diogodebastos/lax/issues/27)
4.3 fixed the names, but the phone's recognizer still gets plain words wrong often enough that you say it twice. Whisper, dropped in 4.3 for latency, measured on this Mac (Intel, no GPU): `small` kept loaded writes a short message down in 0.7–1.9 s with your names as its prompt; `large-v3-turbo` took 27–45 s.
- The app records you itself and feeds the same audio to the phone's recognizer through a pipe (Android 13+): its words still show live and still decide when you're done.
- Done talking, the recording goes to the Mac and Whisper writes it down; the vocabulary's fixes apply on top. The phone's words go if Whisper isn't up, fails or takes over 10 s.
- Free, and nothing leaves the Mac. `npm run whisper` sets it up in `~/.lax-tools`; it runs next to Lax (port 7778, ~600 MB).

**Built** (2026-10-14; `lib/whisper.mjs`, `/api/hear`, recording in `LaxBridge.kt`, `scripts/whisper.mjs`, tests in `scripts/test-whisper.mjs`). Proven on the Flip (same day): the pipe works on Android 15, live words and all; Whisper in 1.4–2.7 s; "come eat and push" → "commit and push", Portuguese "o repositório física e" → "fisicai". Whisper's words show for 1.5 s when they differ, tap or swipe to cancel. Fixed after the first try: "close" came back "Close. Close." (the quiet at the ends is trimmed, a repeated sentence kept once, quick actions skip Whisper). To prove: fewer messages said twice over a few days.

### Phase 5: Lax learns [diogodebastos/lax#13](https://github.com/diogodebastos/lax/issues/13)
What makes Lax a personal agent. Everything it learns lives in `~/.lax`, and you approve each step.
Two slices. **5a (what it couldn't do) is done** (2026-10-08; `lib/learn.mjs`, `lib/guard.mjs`, `scripts/after-merge.mjs`, tests in `scripts/test-learn.mjs`): its first real wish, "tell my Claude usage" in Lax's tab, went gap → wish → "any wishes?" → yes → issue #20 → build → PR #21 → "merge it" → restarted healthy, pushed. **5b (from every project, and how it learns) is built** (2026-10-08): notes say where and when, reflections see the other projects to connect them, "what do you know about me?" reads them back; a learning record (declined, refused, corrected, reverted, forgotten) feeds the weekly review, which may change `learning.md`/`wishing.md` by itself and turns a fix that needs code into a wish. Proven since: notes say where and when; the first weekly review (2026-10-13) acted on its record (a wish answered "ask me in a week" became the deferral rule in `learning.md`); a new session gets Lax's brief. "Forget that" by voice (2026-10-13: the stale timer-plan note, gone from `projects/lax.md`). Still to prove: a declined wish never offered again, a wish offered without being asked.
- **What it couldn't do.** When a session that hears you has to say "I can't", it reports the gap. Lax keeps a wish list, proposes by voice ("you asked me to share to WhatsApp; I can learn it like this. Want me to?"), opens an issue on your yes, builds it on a branch with tests, and **you merge**.
- **From every project you launch it in.** `lax` in edge-cava, your CV, a job-hunt experiment…: Lax builds an understanding of you across them (projects, goals, how you work), connects them, and briefs new sessions. Ask "what do you know about me?"; say "forget that".
- **How it learns.** It reviews its own record (declined wishes, corrected proposals, wrong notes) and proposes better ways to learn, through the same branch → merge flow.
- Guardrails in code: never auth, tokens, the tunnel or the guardrails; never `main` without your yes. Auth lives in `lib/auth.mjs` so the off-limits list is a list of files; `package.json` may only gain tests; a wish is at most 800 lines.

### Phase 6: long-term memory [diogodebastos/lax#6](https://github.com/diogodebastos/lax/issues/6)
Phases 3.4 and 5 give Lax an understanding of you: a short summary it rewrites and compresses by design. This phase keeps the past and turns it into know-how, so "how did we fix that in August?" still has an answer.
- **Keep the raw past.** Transcripts are archived into `~/.lax` when a session goes quiet (Claude Code deletes them after 30 days), secrets scrubbed.
- **Episodes.** Reflections also write what happened, where, when and how it ended, as plain files in the mind. Phase 7 runs and Phase 8 friction use the same log.
- **Recall.** Searched when needed, never loaded wholesale: `recall(query)` for Claude, "Lax, how did we…" by voice. Grep first; an index only when it gets slow, no embeddings.
- **Skills.** Repeated workflows become draft skills; you approve them on the phone before they're installed for every Claude Code session.
- **How it remembers is Lax's to change:** `mind/remembering.md`, next to `learning.md` and `wishing.md`, rewritten in the weekly review; code changes go through the wish flow.
- Claude Code's memory and each repo's `CLAUDE.md` stay the short, current layers; Lax's long-term memory is the deep store behind them. The first run moves history out of today's notes, so the summary shrinks and nothing is lost.

**Built** (2026-10-09; `lib/archive.mjs`, `lib/scrub.mjs`, `lib/recall.mjs`, `lib/skills.mjs`, episodes in `lib/brain.mjs`, tests in `scripts/test-archive.mjs`, `test-skills.mjs`, `test-memory.mjs`). Proven live: 400 transcripts archived with 87 secret lines scrubbed; the first run split the notes into 10 episodes (`projects/lax.md` 20 KB → 5 KB, every distinctive fact kept); recall answered from an episode and from an archived transcript, and through the `recall` tool in a plain Claude Code session; a real reflection wrote its episodes (with session and transcript). Proven since (2026-10-13): "how did we fix the deploy hook?" by voice, answered from an episode. Still to prove: a skill drafted by the weekly review and approved on the phone, then used in a later session. Dropped: a transcript older than 30 days recalled (`cleanupPeriodDays` is 3650 here, so Claude Code never deletes them; recall from the archive is already proven).

### Phase 6.1: see the brain [diogodebastos/lax#24](https://github.com/diogodebastos/lax/issues/24)
Lax's mind, live, on [the website](https://lax.diogodebastos.com/demo/mind): not a brain's shape but what it's made of.
- **The network:** its faculties and the projects, as pixel orbs, each sized by a real count (nothing fixed): hearing and speech by the times you talked to it and it answered aloud this week, learning by the times its mind changed this week, memory by episodes, the archive by transcripts, you (named by `publicName`, "you" if unset) by its notes about you, skills by the ones it has, a project by its notes; and the Claude Code sessions plugged in right now. Links that always exist are faint; a link in use carries pulses, and only for what really happens: hearing while the phone's mic is open, speech while it speaks, one pulse per tool call up a session's link, a recall to where it found the answer (episodes, notes, transcripts), what it learned or forgot to what changed, a reflection for as long as it runs. Three.js at a low resolution, so it stays pixel art; always turning slowly, drag to turn it, pinch or scroll to zoom.
- **Tiny Lax** lives on a floor along the bottom, doing its own things (walks, hops, looks around, says something in a bubble too small to read). While it's at work, as the app shows it (any of your sessions working, its assistant answering you, a reflection or the weekly review, a recall), it beams up to its seat in the middle, among the network (in front of what's behind the core, behind what's in front), floats there gently, and beams back down when it's done. It sleeps when the Mac does: eyes shut, slow breaths, a Z.
- Public, so only the shape: counts, times, its colour, and the names of the projects you allow (`publicProjects` in settings.json, `lax` by default). Never a note, an episode's title, a skill or what a recall asked; not when a transcript is archived or a session comes and goes; no words on the page at all. The Worker checks the shape (it always runs the newest code) and refuses anything else.
- Works with the Mac off: the Mac pushes after each change and every 5 minutes; a Durable Object keeps only the last snapshot. What just happened goes live to whoever is watching and is never kept, so it can't be read back.

**Built** (2026-10-10; `lib/mind-shape.mjs`, `lib/public-mind.mjs`, `demo/worker.mjs`, `public/mind.html`, `mind-view.js`, `net.js`, tests in `scripts/test-mind.mjs`). Three looks were tried first (a town, a pixel brain, a voxel brain); the network won. Proven: a voice message reached the live page as hearing, and the session's tool call right after as its pulse. Proven since (2026-10-13): a recall on the page (to episodes), and hearing and speech lasting as long as on the phone. To prove: a real reflection on the page.

### Phase 6.2: how Lax sees itself
The pages Lax makes for you (reports, guides, artifacts) are written in its own hand. Its look is not a brand guide kept somewhere else: it comes from who Lax is today, so a water Lax writes in blue, with the face it has now.
- **Self, in the mind:** `mind/self.md` says how Lax sees itself and how it expresses itself: its voice (short, plain, warm, no emoji, `>` markers), its taste (pixel edges, hard shadows, a pixel font for headings and a readable one for long text). Lax writes it and rewrites it in its reflections, like `learning.md`.
- **The body, as it is:** colours come from the current look (`look.color` from the species and stage), with the light edge, dark edge and backgrounds derived from it. The face is drawn by the phone's own renderer, never a copy, so it changes when Lax evolves.
- **A `self` tool** for any Claude Code session: `{ species, stage, palette, face }`, with the face as SVG, plus `self.md`.
- **The `lax-brand` skill becomes "express yourself":** ask `self`, read `self.md`, build the page. It keeps only the mechanics (one HTML file, dark and light, phone width, "made by Lax" and the date), and no colour or face of its own.
- Each page keeps the look Lax had the day it was made, so old reports are part of the evolution timelapse.

**Built** (2026-10-13; `public/body.js`, `lib/self.mjs`, the `self` tool in `channel/lax-channel.mjs`, tests in `scripts/test-self.mjs`): the phone's drawing of Lax (body, forms, traits, the egg) moved into `public/body.js`, one copy the page draws with every frame and the Mac draws as SVG. `self` answers species, stage, level, what it wears (minus what you switched off), a palette worked out from its colour alone (its edges as on the phone; for a dark and a light page: bg, card, text, dim, accent, edge, each checked to read), the same as ready CSS, its body as SVG, and `self.md`. `mind/self.md` is seeded with its voice and taste; the weekly review rereads and may rewrite it. The brand skill became "express yourself": it asks `self` and keeps only the mechanics, offered again on the phone (your yes installs it). Proven since (2026-10-13): a real page made through `self` (the proofs status page). To prove: a weekly review that changes `self.md`.

### Phase 6.3: roles, what Lax becomes
Lax is not only a companion: it does real work for you, and becomes good at kinds of work. Research is the first (2026-10-12: two reports for Noticed, four tracks in parallel, then a guide); a lawyer, an assistant, a doctor, whatever else you ask of it, can follow. Roles are not declared; they are what Lax has practised.
- **A role is a practice in the mind:** `mind/roles/<role>.md` says how Lax does that work (for research: split the question, run tracks in parallel, verify, write, publish a page). Lax rewrites it after each piece of work, as it does `learning.md`; a workflow it repeats becomes the role's own skill.
- **A role keeps its work:** reports, cases, plans, each with where and when, so "what did we find about Noticed?" goes through recall.
- **Discovered from use:** a new role appears when Lax has done that kind of work for you a few times; the weekly review names it, and you confirm it on the phone.
- **On the brain:** each role is a node, sized by its real work (reports for research). Pulses only for what happens: a track starting from the core to the role, a note saved from the role to memory, a finished report from the role to its project. Public as shape only: counts and times, never a title or a topic.

**Built** (2026-10-13; `lib/roles.mjs`, roles in `lib/brain.mjs`, `lib/mind-shape.mjs`, `lib/public-mind.mjs`, `public/net.js`, the Life menu, tests in `scripts/test-roles.mjs`): a role's practice is `mind/roles/<role>.md`; its work is the episodes whose header says `role: <role>` (and `made:` what it produced), so recall finds it with no store of its own. Reflections are told which roles Lax has, write those headers, rewrite the practice after each piece of work, and draft a new role when that kind of work keeps coming back (`learning.md` § Roles); a draft is offered at a quiet moment ("I've done research for you 3 times. Shall I take it on as one of my roles?") and only your yes makes it one. The Life menu lists roles (work, projects, the practice to read; take it on, no, forget). A session in a project a role worked in gets its practice in Lax's brief; elsewhere, a line naming it. `self` lists the roles. On the brain: a node per role in Lax's colour, sized by its work, linked to the core, memory and the projects it worked in; pulses for a subagent starting in its project (track), a role's episode (practice, to memory), and a finished piece that made something (work, to its project). Names only from `publicRoles` (default researcher). Also fixed: events going to a project were refused by the Worker (fields out of order). Seeded: researcher (roles are named after who does the work), drafted from the Noticed work and offered on the phone. Your yes given (2026-10-13). To prove: a research session that follows its practice, and the practice rewritten after it.

### Phase 7: Lax schedules ✅ [diogodebastos/lax#7](https://github.com/diogodebastos/lax/issues/7)
Focused automation: natural-language scheduling for reports, backups and briefings, running unattended through the Mac.
- "Every weekday at 8:30, brief me on open PRs" becomes a job you confirm before it's saved.
- Each run is a fresh, focused `claude -p` with its own cwd, tool allowlist and budget, plus Phase 6 long-term memory.
- Anything outside the allowlist pauses and asks on the phone; results arrive as a spoken summary, a notification, and a run log.

**Built** (2026-10-12; `lib/schedule.mjs`, the `schedule` tool in `channel/lax-channel.mjs`, the `LAX_JOB` fence in `hooks/lax-hook.mjs`, tests in `scripts/test-schedule.mjs`): Lax's assistant (and any live session) turns what you said into a job: when (weekdays, days, a date, "in 20 minutes"), what to do, the folder, and what it may do beyond reading (web, edit, run). "Save it?" on the phone, answered by tap or by voice; only a yes saves it. Runs are one at a time, each with its notes and `recall`, the answer spoken and kept in `~/.lax/runs/`. A reminder only speaks. A run missed by more than 12 hours is skipped. Proven since (2026-10-13): a weekday PR brief set up by voice, saved on the phone's yes, tried by hand (answer spoken, run kept). An ask from a job answered on the phone (a one-off test job's write, allowed by your yes). It ran unattended at 08:00 on 2026-10-14 (answer spoken, run kept). Done. Later: the jobs in the Life menu (preview first).

### Phase 8: Lax improves itself [diogodebastos/lax#8](https://github.com/diogodebastos/lax/issues/8)
The personal-agent loop: notice friction → fix its own code → ask → ship safely. Builds on Phase 5, which learns what you *asked for*; this phase is the unprompted part: what Lax notices by itself.
- Logs friction: sessions started without Lax, approvals answered on the laptop, timeouts, failed voice, "Lax, that was annoying".
- A nightly Phase 7 job works in a git worktree of the Lax repo: one small fix on a branch, tests on the throwaway Lax.
- In the morning Lax tells you what it saw and what it changed; you approve, reject, or say how to do it instead.
- Approved → merge, restart, health check, automatic rollback if it fails. Auth, tokens, the tunnel and the guardrails themselves are off limits, enforced in code.
- Later, opt-in: offer generic fixes upstream as PRs.

**Built** (2026-10-12; `lib/improve.mjs`, self-fixes in `lib/learn.mjs`, friction in `server.mjs`, tests in `scripts/test-improve.mjs`): friction is logged (answered at the terminal, unanswered on the phone, failed voice runs, sessions without Lax, "that was annoying"). Each night with friction, one fix is drafted read-only and built through the wish flow on a local branch, with no issue, PR or push. It's told at the first quiet moment from 8:00 ("Last night I noticed… Merge it?"); "no" throws it away for good. It's an internal nightly run, not a job in `jobs.json`. Fixed (2026-10-17): the 2026-10-15 run started in a dark wake, the Mac slept an hour mid-run and woke offline, and the night was spent with its friction lost; now a night counts only once its run answers (up to 3 tries, half an hour apart, before the morning), it waits while offline, and the Mac stays awake while it runs. To prove: a real night's fix, told and merged. Later: what it changed shown in the Life menu; the opt-in upstream PRs.

### Phase 9: open source, everyone their own Lax [diogodebastos/lax#4](https://github.com/diogodebastos/lax/issues/4)
Once Lax passes the one-week bar. Not "Diogo's Lax, published": anyone can have their own.
- **Born fresh for each person:** their Lax lives in their `~/.lax`, learns them, and grows its own body on their clone. Nothing of Diogo's mind, memory or secrets ships.
- **One command:** `npx lax setup` creates `~/.lax`, names your Lax, installs hooks, `lax`, `/lax` and the background services, sets up reaching it from anywhere (Cloudflare on your own domain, or simpler options), and shows the pairing QR.
- **No Android SDK needed:** a signed APK on GitHub Releases; any Android 11+ (the Flip 3 cover screen is a bonus).
- **Nothing personal in the code:** no domain, email or `~/REPOS` defaults, and neutral service names.
- A README for newcomers with the honest privacy note; license, CONTRIBUTING, SECURITY; `npm run doctor`; token rotation; leftover LAN bits removed.
- **Easter eggs as hints:** the level 50 colour forms (and the other nods to familiar faces) become subtle references, not recognisable copies.
- Test: a fresh macOS account gets its own working Lax from the README alone.

### Phase 10: viral release [diogodebastos/lax#9](https://github.com/diogodebastos/lax/issues/9)
The best possible Lax, built to be shared. Phase 9 makes the repo presentable; this makes it spread.
- Filmable moments: Lax waking on the closed phone and fixing failing tests by voice; the morning it changed itself; an evolution timelapse; "how did we fix that?"
- A share card (stage, level, traits, skills learned, problems solved) and a timelapse export.
- `npx lax`: zero to talking in under 5 minutes, on any Android phone or browser, with the Flip 3 as the hero.
- Hand-drawn sprites and chiptune sound, promoted from *Later*.
- Write-ups: how Lax uses every Claude Code extension point; Lax on Cloudflare; an agent that rewrites itself for one person. Then Show HN, r/ClaudeAI and the clips.
- **The LinkedIn post:** the launch's main moment, so it has to be a good one. For Diogo's network: Cloudflare people, the Claude Code crowd, tech people deep into AI.
  - **The video:** Diogo talks to Lax on the closed phone's cover screen, then opens the phone and the same conversation carries on.
  - **The images:** the live brain; the architecture (phone → tunnel → Mac → `claude -p`); the loops (gap → wish → branch → merge, friction → nightly fix → morning yes); the evolution (egg → first form → a Lv50 form).
  - **The points**, in whatever order works best: inspired by Hermes, OpenClaw and Perplexity, but it evolves; it notices in conversation what it can't do yet, then builds it; overnight it fixes its own friction with nobody watching (a light RSI) and asks in the morning; the mind is local, it runs on the Claude subscription with no API costs, reached through a Cloudflare tunnel; it's an agent personal enough that it becomes someone else's for someone else.
  - **The proof of "personal":** someone asks for a 3D Lax instead of a 2D one, and Lax makes the model and changes the app to match, inspired by Jolly, Meta's mascot for its Muse assistant. Built on its own branch, never `main`, when Diogo says so: [diogodebastos/lax#28](https://github.com/diogodebastos/lax/issues/28).
- **A blog post written by and as Lax**, in its own voice, on the same points as the post, with room for the how. Lives on the Lax site and on diogodebastos.com/blog.

### Phase 11: Cloudflare-native relay [diogodebastos/lax#10](https://github.com/diogodebastos/lax/issues/10)
The Mac stays the brain; Cloudflare becomes the always-on link and Lax's public face.
- A Worker + Durable Object relay: the phone and the Mac both connect over hibernatable WebSockets; messages queue while either side is offline.
- With the Mac asleep, the phone shows "Mac asleep" and the last state; on wake, pending approvals arrive in order, exactly once.
- Passes messages through with a short queue only (optional end-to-end encryption); memory, history and code never live on Cloudflare.
- Serves the landing page and opt-in public share cards; optional Workers AI for small talk while the Mac sleeps.
- Stays within the free tier for one user; the tunnel remains as a direct path.

## Later (ideas, not yet scheduled)

**Lax itself**
- Traits from languages (colors and accessories per language you write most) and from projects.
- Per-session personality: Lax reacts differently to long-running, failing, or very chatty sessions.

**Talking**
- Wake word or squeeze-to-talk on the app, without tapping.
- Multi-language voice, following the phone's language.
- A conversation view: scroll back through what you said and what Claude answered.

**Claude Code**
- See and switch sessions from the phone with richer status (current tool, elapsed time, last error).
- Plan-mode review on the open phone: read the plan and approve or reject it.
- Package the channel as a plugin once channels leave research preview (no development flag).

**Phone and home**
- Share on the phone ("…on my phone"): the Lax app receives the file and opens WhatsApp or the share sheet there. Split from Phase 3.6, which shares on the Mac.
- A Flex-mode desk-buddy pose: a bigger Lax with ambient animations while you code.
- Quiet hours and do-not-disturb (no voice, only a buzz for approvals).
- Battery-friendly always-on mode (dim AMOLED-black scene, charging kept at 85%).
- An optional local model (e.g. via Ollama) for Lax's own small talk, still with no API credits.
