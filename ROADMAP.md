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

### Phase 5: Lax learns [diogodebastos/lax#13](https://github.com/diogodebastos/lax/issues/13)
What makes Lax a personal agent. Everything it learns lives in `~/.lax`, and you approve each step.
- **What it couldn't do.** When a session that hears you has to say "I can't", it reports the gap. Lax keeps a wish list, proposes by voice ("you asked me to share to WhatsApp; I can learn it like this. Want me to?"), opens an issue on your yes, builds it on a branch with tests, and **you merge**.
- **From every project you launch it in.** `lax` in edge-cava, your CV, a job-hunt experiment…: Lax builds an understanding of you across them (projects, goals, how you work), connects them, and briefs new sessions. Ask "what do you know about me?"; say "forget that".
- **How it learns.** It reviews its own record (declined wishes, corrected proposals, wrong notes) and proposes better ways to learn, through the same branch → merge flow.
- Guardrails in code: never auth, tokens, the tunnel or the guardrails; never `main` without your yes.

### Phase 6: Lax remembers [diogodebastos/lax#6](https://github.com/diogodebastos/lax/issues/6)
Lax learns your projects, auto-generates skills, and never forgets how a problem was solved.
- When a session ends, a background `claude -p` distills it into project notes, "problem → fix" solutions, and skill candidates.
- Repeated workflows become draft skills. You approve them on the phone, and they're installed for every Claude Code session.
- New sessions start with a short brief for their project; Claude (and you, by voice) can `recall` past fixes.
- A "what Lax knows" view on the phone, where you can edit or forget each item. Learning gives XP, so the looks follow the brain.
- Builds on Claude Code's own memory where it can; what Lax adds is how it reaches you.

### Phase 7: Lax schedules [diogodebastos/lax#7](https://github.com/diogodebastos/lax/issues/7)
Focused automation: natural-language scheduling for reports, backups and briefings, running unattended through the Mac.
- "Every weekday at 8:30, brief me on open PRs" becomes a job you confirm before it's saved.
- Each run is a fresh, focused `claude -p` with its own cwd, tool allowlist and budget, plus Phase 6 memory.
- Anything outside the allowlist pauses and asks on the phone; results arrive as a spoken summary, a notification, and a run log.

### Phase 8: Lax improves itself [diogodebastos/lax#8](https://github.com/diogodebastos/lax/issues/8)
The personal-agent loop: notice friction → fix its own code → ask → ship safely. Builds on Phase 5, which learns what you *asked for*; this phase is the unprompted part: what Lax notices by itself.
- Logs friction: sessions started without Lax, approvals answered on the laptop, timeouts, failed voice, "Lax, that was annoying".
- A nightly Phase 7 job works in a git worktree of the Lax repo: one small fix on a branch, tests on the throwaway Lax.
- In the morning Lax tells you what it saw and what it changed; you approve, reject, or say how to do it instead.
- Approved → merge, restart, health check, automatic rollback if it fails. Auth, tokens, the tunnel and the guardrails themselves are off limits, enforced in code.
- Later, opt-in: offer generic fixes upstream as PRs.

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

### Phase 11: Cloudflare-native relay [diogodebastos/lax#10](https://github.com/diogodebastos/lax/issues/10)
The Mac stays the brain; Cloudflare becomes the always-on link and Lax's public face.
- A Worker + Durable Object relay: the phone and the Mac both connect over hibernatable WebSockets; messages queue while either side is offline.
- With the Mac asleep, the phone shows "Mac asleep" and the last state; on wake, pending approvals arrive in order, exactly once.
- Passes messages through with a short queue only (optional end-to-end encryption); memory, history and code never live on Cloudflare.
- Serves the landing page and opt-in public share cards; optional Workers AI for small talk while the Mac sleeps.
- Stays within the free tier for one user; the tunnel remains as a direct path.

## Later (ideas, not yet scheduled)

**Lax itself**
- **Species from how you work, with evolution lines** (designed 2026-10-07; preview in `previews/lines.mjs`, git-ignored). Replaces picking a colour.
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
- Traits from languages (colors and accessories per language you write most) and from projects.
- Per-session personality: Lax reacts differently to long-running, failing, or very chatty sessions.

**Talking**
- Wake word or squeeze-to-talk on the app, without tapping.
- On-device / local speech-to-text (whisper.cpp on the Mac) for privacy and offline use.
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
