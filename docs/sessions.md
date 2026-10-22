# Talking to your sessions

Talking into a running Claude Code session, carrying Lax's own conversation over to the Mac, how long things wait for you, and the settings. Back to the [README](../README.md).

## Talk into your running session (channel)

Lax is also a Claude Code **channel**: what you say to Lax goes into a running terminal session, and Claude answers back through Lax.

```bash
npm run install-channel   # user-level MCP server `lax` + a `lax` command in ~/.local/bin (also `claude-lax`; remove-channel undoes; setup does this)
lax                       # = claude --dangerously-load-development-channels server:lax, from any folder; takes the same flags as claude
lax watch                 # follow what Lax sees, live: your sessions, and the commands Lax itself runs with their output
lax watch lax             # only Lax (or `lax watch <project>`); --no-history starts from now
```

Already in a session that wasn't started with `lax` (the desktop app, or plain `claude`)? Type **`/lax`**: it reopens the same conversation in a new terminal window (Ghostty, else iTerm, else Terminal; `LAX_TERMINAL` picks one) as a live `lax` session. Then close the old one. Claude Code only loads the channel at startup, so a running session can't switch on by itself.

- The first time, accept the development-channel warning and the MCP prompt yourself. Lax answers that warning for you only after you've answered it once (`~/.lax/consent.json`; delete it to be asked again). The startup notice reads "Channels (experimental) … server:lax".
- Tap Lax and speak. It arrives in that session as `← lax: …`. Claude does the work and calls the `reply` tool, and Lax reads the first sentence aloud.
- Tool approvals in that session are **relayed** to the phone (✓/✗, plus ⋯ for the full command), in parallel with the terminal dialog; whichever answers first wins. Questions (`AskUserQuestion`) still use the options UI.
- **Life menu → talk goes to** picks the target: *auto* (most recently active live session), a specific `🔗 project`, or *☁ background* (a separate `claude -p` session, the fallback when no live session is open).
- The lax MCP server starts in every session. Without the lax channel it only offers `recall` (Lax's long-term memory) and has no link to the phone.
- Research preview: terminal sessions only (not the Desktop app), and the flag may change.
- `node scripts/test-channel.mjs` runs an end-to-end check with a fake Claude Code.

## Lax's conversation on the Mac

Talking to Lax itself (its own tab, not a live session) runs headless: no terminal window. To carry on in a real terminal, say "open on the Mac" (or "continue this on my Mac"). It opens the same conversation (`claude --resume`, in Lax's mind folder, with your projects folder added) in Ghostty, iTerm or Terminal, like `/lax`. While it's open there, the phone waits: talking to Lax gets "quit there first". When you quit, the phone picks the conversation up again. To only look, without taking over, use `lax watch`.

## Behaviour notes

- **Permission prompts** go to the phone first, but only while a Lax page is connected. If you don't answer in time, the normal terminal prompt takes over. "In time" is the Life menu's **wait before terminal** (15 s, 30 s, 1 min or 2 min, kept in `settings.json`); a question you have to read gets 4 times as long. `LAX_ASK_TIMEOUT` only sets where that starts, for a Lax with no setting yet; once you pick one in the Life menu, that's what counts.
- **How long the rest waits for you:** Lax's own assistant waits as long as a terminal session would, then takes silence as a no; a scheduled job waits up to 10 minutes. Each hook outlasts the wait it's in, so a bubble never outlives what asked it (`hooks/timeouts.mjs`; `npm run doctor` says when the installed timeouts are old, and `npm run update` reinstalls them).
- **Voice runs** use their own Claude session per project (resumed each time). The project is the one where Claude Code was active most recently. Read-only tools run freely. Anything else (edits, Bash) needs ✓ on the phone, and silence counts as a no.
- When the server is down, the hook exits in milliseconds, so Claude Code is never slowed down.

Env (or `~/.lax/secrets/env.json`): `LAX_PORT` (7777), `LAX_HOST` (127.0.0.1), `LAX_PUBLIC_URL` (the way in the phone pairs through), `LAX_RELAY_URL`, `LAX_ASK_TIMEOUT` (30: the starting "wait before terminal", until you pick one in the Life menu), `LAX_WORKDIR` (your projects and the fallback voice project; default the folder Lax was cloned into), `LAX_DEMO_ROUTE` (a public demo, off by default).
