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

## Next

### Phase 3: Lax Android app [diogodebastos/lax#2](https://github.com/diogodebastos/lax/issues/2)
Trimmed to what the ambient Lax needs. The Claude app already covers remote control and approval pushes, so this doesn't grow in that direction.
- A background link to the Mac that survives the phone sleeping.
- Android's own speech recognition and text-to-speech, with no browser quirks.
- QR pairing, start on boot, and the battery-killer exemptions One UI needs.
- The Approve / Deny notifications already built stay, as the bridge to the cover screen.

### Phase 4: Lax on the cover screen [diogodebastos/lax#3](https://github.com/diogodebastos/lax/issues/3)
This is the product: glance, don't open.
- Run the app full-screen on the Flip 3's cover strip, through Good Lock MultiStar or CoverScreen OS.
- Tune the `wide` layout at the real density.
- Survive fold ↔ unfold without losing the link.

### Phase 5: Lax remembers [diogodebastos/lax#6](https://github.com/diogodebastos/lax/issues/6)
Lax learns your projects, auto-generates skills, and never forgets how a problem was solved.
- When a session ends, a background `claude -p` distills it into project notes, "problem → fix" solutions, and skill candidates.
- Repeated workflows become draft skills. You approve them on the phone, and they're installed for every Claude Code session.
- New sessions start with a short brief for their project; Claude (and you, by voice) can `recall` past fixes.
- A "what Lax knows" view on the phone, where you can edit or forget each item. Learning gives XP, so the looks follow the brain.
- Builds on Claude Code's own memory where it can; what Lax adds is how it reaches you.

### Phase 6: Lax schedules [diogodebastos/lax#7](https://github.com/diogodebastos/lax/issues/7)
Focused automation: natural-language scheduling for reports, backups and briefings, running unattended through the Mac.
- "Every weekday at 8:30, brief me on open PRs" becomes a job you confirm before it's saved.
- Each run is a fresh, focused `claude -p` with its own cwd, tool allowlist and budget, plus Phase 5 memory.
- Anything outside the allowlist pauses and asks on the phone; results arrive as a spoken summary, a notification, and a run log.

### Phase 7: Lax improves itself [diogodebastos/lax#8](https://github.com/diogodebastos/lax/issues/8)
The personal-agent loop: notice friction → fix its own code → ask → ship safely.
- Logs friction: sessions started without Lax, approvals answered on the laptop, timeouts, failed voice, "Lax, that was annoying".
- A nightly Phase 6 job works in a git worktree of the Lax repo: one small fix on a branch, tests on the throwaway Lax.
- In the morning Lax tells you what it saw and what it changed; you approve, reject, or say how to do it instead.
- Approved → merge, restart, health check, automatic rollback if it fails. Auth, tokens, the tunnel and the guardrails themselves are off limits, enforced in code.
- Later, opt-in: offer generic fixes upstream as PRs.

### Phase 8: open-source release [diogodebastos/lax#4](https://github.com/diogodebastos/lax/issues/4)
Once Lax passes the one-week bar.
- A README from zero, led by the personal-agent story and the honest privacy note.
- `npm run doctor` health check (also used by Phase 7's rollback).
- Token rotation with re-pairing.
- Remove the leftover LAN bits.
- Tag `v0.2.0`.

## Later (ideas, not yet scheduled)

**Lax itself**
- Hand-drawn sprite sheets per stage, replacing the procedural drawing (Aseprite), with more poses and a proper "evolution" animation.
- Traits from languages (colors and accessories per language you write most) and from projects.
- Per-session personality: Lax reacts differently to long-running, failing, or very chatty sessions.
- Sound design: a small chiptune palette per state; a "done" jingle that grows with level.

**Talking**
- Wake word or squeeze-to-talk on the app, without tapping.
- On-device / local speech-to-text (whisper.cpp on the Mac) for privacy and offline use.
- Multi-language voice, following the phone's language.
- A conversation view: scroll back through what you said and what Claude answered.

**Claude Code**
- See and switch sessions from the phone with richer status (current tool, elapsed time, last error).
- Quick actions from the phone: interrupt, "continue", "run the tests", compact.
- Plan-mode review on the open phone: read the plan and approve or reject it.
- Package the channel as a plugin once channels leave research preview (no development flag).

**Phone and home**
- A Flex-mode desk-buddy pose: a bigger Lax with ambient animations while you code.
- Quiet hours and do-not-disturb (no voice, only a buzz for approvals).
- Battery-friendly always-on mode (dim AMOLED-black scene, charging kept at 85%).
- An optional local model (e.g. via Ollama) for Lax's own small talk, still with no API credits.
