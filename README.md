# Lax

A pixel companion for Claude Code that lives on an old phone (designed for the Galaxy Z Flip 3 cover screen, 260×512).

- **Top half:** Lax, plus a speech bubble showing the one thing that needs you, with ✓/✗ for permission prompts.
- **Bottom half:** a terminal-style live feed of what your Claude Code sessions are doing.
- **Voice:** hold the top half to talk. What you say goes to Claude Code, and Lax reads the answer aloud.
- **Evolves:** XP, stages (sprout → blob → cube → brick → legend) and traits come from how you actually use Claude Code. It's all rules, with no model calls.

No API credits. Voice runs `claude -p` with your normal Claude Code login. Speech recognition and the voice are the phone browser's built-in Web Speech features.

## How it fits together

```
Claude Code (Mac) ──hooks──▶ server.mjs (Mac, :7777) ──SSE──▶ phone browser (Lax's body)
                     ◀─allow/deny─┘   │  SQLite memory: data/lax.db      │
                                      └──── claude -p ◀── /api/talk ◀────┘ (voice)
```

All of Lax's memory stays in `data/` on your Mac. The phone stores nothing except the access token.

## Run

```bash
npm start              # prints the Mac + phone URLs (with token)
npm run install-hooks  # wire Claude Code → Lax (backup: ~/.claude/settings.json.bak-lax)
npm run remove-hooks   # undo
```

- `http://localhost:7777/pair`: a QR code to open Lax on the phone (only works from the Mac itself)
- `http://localhost:7777/?demo`: every state, without Claude Code
- `http://localhost:7777/preview.html`: a Flip 3 mockup (closed cover screen, open, Flex mode)

## Bodies

One URL. The layout follows the screen, and `?layout=wide|tall|big` forces one:
- **wide** (closed phone, 512×260 cover strip): Lax on the left, bubble and terminal on the right
- **tall** (cover screen held sideways, 260×512): Lax on top, terminal below
- **big** (open / Flex mode): Lax above the fold; session chips, terminal and buttons below it

## Life menu

Tap **LAX ≡** (or **♥ life** when the phone is open) to:
- rename Lax and pick its color (8 presets or a custom color)
- change voice on/off and pitch, and choose whether it reads every "done"
- turn phone approvals on/off and set the wait time
- browse its memory (stats, favorite tools, milestones)
- **rebirth** it: hold for 2s to wipe its memory and start over

## Reaching Lax from anywhere (Cloudflare Tunnel + Access)

Lax only listens on `127.0.0.1`. The phone reaches it through a Cloudflare Tunnel at `https://lax.diogodebastos.com`, behind Cloudflare Access (an email-PIN login). Lax's token is a second lock. The tunnel's real HTTPS is also what lets Chrome use the mic, with no flags.

```bash
brew install cloudflared
cloudflared tunnel login                      # browser: pick diogodebastos.com
cloudflared tunnel create lax
cloudflared tunnel route dns lax lax.diogodebastos.com
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: lax
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: lax.diogodebastos.com
    service: http://127.0.0.1:7777
  - service: http_status:404
```

`data/env.json` (gitignored):

```json
{ "LAX_PUBLIC_URL": "https://lax.diogodebastos.com", "CF_ACCESS_CLIENT_ID": "…", "CF_ACCESS_CLIENT_SECRET": "…" }
```

**Access (Zero Trust dashboard):** create a self-hosted app for `lax.diogodebastos.com` with:
- an **Allow** policy for your email (one-time PIN, 1-month session)
- a **Service Auth** policy for the `lax-android` service token, which the Android app uses for its background connection

`/pair` only answers requests from the Mac itself. Anything that arrives through the tunnel gets a 403.

## Always on (launchd)

```bash
npm run install-service   # server (+ tunnel once configured): starts at login, restarts on crash
npm run remove-service
npm run logs
```

On power, turn on System Settings → Battery → Options → *Prevent automatic sleeping when the display is off*.

## Phone

1. Open `http://localhost:7777/pair` on the Mac and scan the QR code with the phone. Open it in **Chrome**; Brave has no speech recognition.
2. Log in once with the email PIN. Tap "wake", then tap Lax to talk.
3. Cover screen and background notifications: see the Android app (phase 2) and the cover-screen setup (phase 3) issues.

## Talk into your running session (channel)

Lax is also a Claude Code **channel**: what you say to Lax goes into a running terminal session, and Claude answers back through Lax.

```bash
npm run install-channel   # user-level MCP server `lax` + `claude-lax` alias (remove-channel undoes)
claude-lax                # = claude --dangerously-load-development-channels server:lax
```

- The first time, accept the development-channel warning and the MCP prompt. The startup notice reads "Channels (experimental) … server:lax".
- Tap Lax and speak. It arrives in that session as `← lax: …`. Claude does the work and calls the `reply` tool, and Lax reads the first sentence aloud.
- Tool approvals in that session are **relayed** to the phone (✓/✗, plus ⋯ for the full command), in parallel with the terminal dialog; whichever answers first wins. Questions (`AskUserQuestion`) still use the options UI.
- **Life menu → talk goes to** picks the target: *auto* (most recently active live session), a specific `🔗 project`, or *☁ background* (a separate `claude -p` session, the fallback when no live session is open).
- The lax MCP server starts in every session but stays dormant (no tools, no link) unless the session was launched with the lax channel.
- Research preview: terminal sessions only (not the Desktop app), and the flag may change.
- `node scripts/test-channel.mjs` runs an end-to-end check with a fake Claude Code.

## Behaviour notes

- **Permission prompts** go to the phone first, but only while a Lax page is connected. If you don't answer within `LAX_ASK_TIMEOUT` seconds (default 30), the normal terminal prompt takes over.
- **Voice runs** use their own Claude session per project (resumed each time). The project is the one where Claude Code was active most recently. Read-only tools run freely. Anything else (edits, Bash) needs ✓ on the phone, and silence counts as a no.
- When the server is down, the hook exits in milliseconds, so Claude Code is never slowed down.

Env (or `data/env.json`): `LAX_PORT` (7777), `LAX_HOST` (127.0.0.1), `LAX_PUBLIC_URL`, `LAX_ASK_TIMEOUT` (30), `LAX_WORKDIR` (fallback voice project, `~/REPOS`).
