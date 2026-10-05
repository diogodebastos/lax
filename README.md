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

## Phone (no reset needed)

1. The phone and Mac must be on the same Wi-Fi. Open the **Phone** URL printed by `npm start` in Chrome.
2. **Mic needs a secure origin.** Over plain LAN http, enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://<mac-ip>:7777`, and relaunch. Later we can switch to Tailscale HTTPS instead.
3. Tap "wake" to unlock sound and the mic. Lax goes fullscreen and keeps the screen awake.
4. Cover screen: use Good Lock → MultiStar (or a cover-screen launcher) to run Chrome there.

## Behaviour notes

- **Permission prompts** go to the phone first, but only while a Lax page is connected. If you don't answer within `LAX_ASK_TIMEOUT` seconds (default 30), the normal terminal prompt takes over.
- **Voice runs** use their own Claude session per project (resumed each time). The project is the one where Claude Code was active most recently. Read-only tools run freely. Anything else (edits, Bash) needs ✓ on the phone, and silence counts as a no.
- When the server is down, the hook exits in milliseconds, so Claude Code is never slowed down.

Env: `LAX_PORT` (7777), `LAX_ASK_TIMEOUT` (30), `LAX_WORKDIR` (fallback voice project, `~/REPOS`).
