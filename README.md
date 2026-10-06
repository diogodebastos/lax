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
                     ◀─allow/deny─┘   │  SQLite life:   ~/.lax/life.db   │
                                      └──── claude -p ◀── /api/talk ◀────┘ (voice)
```

The repo is Lax's **body** (code only). **Lax itself** lives in `~/.lax` on your Mac (`LAX_HOME` moves it):

```
~/.lax/
  mind/          what Lax knows: where the assistant works. CLAUDE.md (who it is, its body, notes about you). Git-tracked.
  life.db        what Lax has lived: XP, level, stats, milestones, a journal of every session it saw (rebirth wipes it)
  settings.json  your preferences for it: name, colour, voice, theme… (rebirth keeps them)
  secrets/       token, env.json, tunnel-token (0700, never readable by the assistant)
  logs/          server.log, tunnel.log   (npm run logs)
```

The phone stores nothing except the access token. Coming from an older Lax with a `data/` folder? `npm run move-home` moves it, once.

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

## Lax's mind (`~/.lax/mind`)

Talking from **Lax's own tab** (the first one, named after it) goes to Lax itself: an assistant you can ask anything. It runs Claude Code in its mind, `~/.lax/mind`:
- `CLAUDE.md` holds who Lax is, **its body** (this repo: what each part does, and how it may change it: on a `lax/<slug>` branch in a worktree, tests, then you merge), and **Notes** it keeps about you. It adds notes on its own, you can edit them, and it reads them to you when you ask what it remembers. Every change is committed to the mind's own git history.
- `.claude/settings.json`: it reads your repos (`LAX_WORKDIR`, default `~/REPOS`) and its body freely; editing outside its mind needs your approval on the phone; its secrets and `life.db` are denied (and Lax's hook refuses them too).
- Each message also carries a short summary of your Claude Code sessions, so "what's my cli session doing?" works.

These files are created on first use and never overwritten.

## Life menu

Tap **LAX ≡** to open the menu. It reads top to bottom:
- **Settings**: name, color, theme (system / light / dark), voice and pitch, whether it reads every "done", where talk goes, phone approvals and the wait time
- **♥ Lax's life** (read-only): stats (level, stage, XP, streak, mood, traits…), favorite tools, milestones
- **Rebirth**: hold for 2s to start a new life. Its life (`life.db`) is wiped; your settings stay

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

`~/.lax/secrets/env.json`:

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
npm run install-channel   # user-level MCP server `lax` + a `lax` command in ~/.local/bin (also `claude-lax`; remove-channel undoes)
lax                       # = claude --dangerously-load-development-channels server:lax, from any folder; takes the same flags as claude
```

Already in a session that wasn't started with `lax` (the desktop app, or plain `claude`)? Type **`/lax`**: it reopens the same conversation in a new terminal window (Ghostty, else iTerm, else Terminal; `LAX_TERMINAL` picks one) as a live `lax` session. Then close the old one. Claude Code only loads the channel at startup, so a running session can't switch on by itself.

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

Env (or `~/.lax/secrets/env.json`): `LAX_PORT` (7777), `LAX_HOST` (127.0.0.1), `LAX_PUBLIC_URL`, `LAX_ASK_TIMEOUT` (30), `LAX_WORKDIR` (fallback voice project, `~/REPOS`).
