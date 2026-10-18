# Security

Lax watches every Claude Code session on your Mac, can act on your behalf when you say yes on the phone, and changes
its own code. This page says how it's protected, what it can and can't do by itself, and what it doesn't protect
against.

## Reporting a vulnerability

Please don't open a public issue. Use GitHub's private vulnerability reporting on this repository (**Security → Report a
vulnerability**).

## How Lax is reached

- **Lax listens only on the Mac** (`127.0.0.1:7777`). Nothing on your Wi-Fi can reach it, and there's no LAN mode.
- **The phone reaches it in one of two ways**, both over HTTPS:
  - **The relay** (`relay/`): a Worker on your own Cloudflare account. The Mac holds one WebSocket out to it,
    authenticated with a relay key (`~/.lax/secrets/relay-key`, also the Worker's secret `RELAY_KEY`). Every request
    from the phone is passed down and replayed against Lax on `127.0.0.1`. Nothing is stored on Cloudflare.
  - **A tunnel on your own domain** (`cloudflared`), behind Cloudflare Access (an email PIN for the browser, a service
    token for the Android app).
- **The Lax token** is checked on every API call, whichever way the request came in. It lives in `~/.lax/secrets/token`
  and in the phone's pairing link. `npm run rotate-token` replaces it, and every old link then gets 401.
- **Wrong tokens through the relay** are limited by the caller's address: after 20 in 10 minutes, that address is
  refused until the 10 minutes are up, even with the right token.
- **"Only from this Mac"** (the pairing page, the health check, the hooks' and channel's own endpoints) means a loopback
  connection that came neither through the tunnel (`cf-*` headers) nor through the relay (`x-lax-relay`).

## What Lax keeps, and what leaves the Mac

- **Everything Lax knows stays in `~/.lax`** on your Mac: its mind (a git repo of notes), its life (`life.db`), settings,
  logs, and an archive of your Claude Code transcripts with secrets scrubbed (`lib/scrub.mjs`: known token shapes,
  credentials in URLs, `SECRET=…` assignments, Lax's own secrets). The scrubbing is best effort, not a guarantee.
- **Secrets** (`~/.lax/secrets`) are only yours: the folder is 0700 and every file 0600. `npm run doctor` checks it, and
  `npm run doctor -- --fix` tightens it. Lax's assistant is denied access to them, and so is anything it builds.
- **What reaches Anthropic:** Lax runs on your own Claude Code login (`claude -p`), so whatever goes into a request as
  context reaches Anthropic, as with any Claude Code session. Lax keeps that small, but it's not nothing: a voice
  request includes what you said and the notes it needs to answer.
- **What reaches Cloudflare:** with the relay, your requests pass through your own Worker. TLS ends at Cloudflare, so
  the relay could read them; it doesn't store them. End-to-end encryption between the phone and the Mac isn't built
  yet.
- **Optional, off by default:** a public demo and a public page with the shape of Lax's mind (counts and times, never
  what's in it), only if you set `LAX_DEMO_ROUTE` and a mind key.

## What Lax does on its own, and what asks you

- **Lax's assistant runs headless**, so the phone is its terminal: anything that changes something asks you there first.
  Looking (`ls`, `cat`, `git status`…) and small local steps you can undo (`npm test`, `git commit` in a repo) don't ask.
  Pushing, deleting, sending, `curl`, `ssh`, `osascript`, `sudo`, `launchctl` and anything outside your repos always ask
  (`lib/allow.mjs`).
- **The development-channel warning:** talking into a live session needs Claude Code's research-preview channels, which
  `lax` starts with `--dangerously-load-development-channels`. Lax answers that warning for you only after you've answered
  it yourself once (`~/.lax/consent.json`; delete it to be asked again).

## Lax changing its own code

Lax learns new abilities (wishes) and fixes its own friction overnight by changing its body, this repo. That's guarded
in code, not only in prompts:

- **Off limits** (`lib/guard.mjs`), checked before a pull request and again before every merge: how it's reached and
  protected (`lib/auth.mjs`, the pairing page and the app's pairing, the relay and its Mac end), its home's layout, what
  it may do without asking (`lib/allow.mjs`), the hooks, the guardrails themselves, setup, updating, token rotation, the
  consent in `lax`, and which GitHub it may use. A change of more than 800 lines is refused. `package.json` may only
  gain tests.
- **The build fence** (`hooks/lax-hook.mjs`, `LAX_BUILD`): while it builds, it may edit only its own worktree, never
  what's off limits, never its secrets, and it never pushes.
- **Your yes:** nothing reaches `main` until you say "merge it". The tests must pass, Lax restarts, and if it doesn't come
  back healthy within 30 seconds, `main` goes back to where it was (`scripts/after-merge.mjs`).
- **GitHub only for your own repo** (`lib/upstream.mjs`): issues, pull requests and pushes happen only when you can push
  to `origin`. A clone of this project keeps everything on your Mac, so no one's Lax files issues or pushes here.
- **Updates** (`npm run update`): a conflict between the project's changes and your Lax's own is resolved inside the same
  fence, so a conflict in anything off limits is left for you.

## What this doesn't protect against

- **Someone with your Mac account.** Lax trusts the Mac it runs on.
- **A leaked pairing link** (it holds the token): rotate the token. Through the relay, the token is the only lock; through
  a tunnel, Access is a second one.
- **What you approve.** A yes on the phone is a yes.
- **Claude Code itself**, and the permissions you've given it in `~/.claude/settings.json`.
- **macOS only** for now: the background services, sharing and text recognition use macOS.
