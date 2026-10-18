# Setting up Lax

You're setting up Lax for the person in front of you: a pixel companion for Claude Code that lives on their Mac and their
phone, watches their sessions, and learns them. This folder (the clone) is Lax's body; `~/.lax` will be Lax itself.
Each person's Lax is born fresh: it knows nothing about them yet, and that's how it should be.

## How

- Start with `node scripts/setup.mjs status --json` to see what's done. Skip what already is.
- Go one step at a time, in the order below. Before each, say in one or two short sentences what it does and why; then run
  `node scripts/setup.mjs <step>` and say what happened. Plain words, no emoji, no walls of text.
- Ask only the practical things (a folder, yes or no). Don't ask their name, Lax's name or colour, or anything about
  them: Lax asks that itself, in their first conversation.
- Only run the setup steps. Don't edit files by hand, and never read `~/.lax/secrets`.
- If a step fails, say what went wrong in a sentence and what to do, then offer to run it again.

## The steps

1. **workdir**: where their projects live. Lax reads code there to answer questions; editing anything needs their yes on
   the phone. Suggest the folder this clone is in (the status shows it) and ask; `node scripts/setup.mjs workdir <folder>`.
2. **hooks**: Claude Code tells Lax what every session does (it's added to `~/.claude/settings.json`, with a backup; and
   Lax's status line, only if they have none of their own).
3. **channel**: installs `lax` (Claude Code with Lax's channel, so they can talk into a running session from the phone)
   and the `/lax` skill. Be honest before asking: channels are a research preview, so `lax` starts Claude Code with
   `--dangerously-load-development-channels server:lax`, and Claude Code shows a warning about it. The first time they
   start `lax`, they answer it themselves; only after that does Lax answer it for them (kept in `~/.lax/consent.json`).
   It's their call; Lax works without it (it just can't talk into a live session). Run it only on a yes.
4. **service**: Lax runs in the background from login (a launchd agent), and restarts if it crashes. It listens only on
   this Mac. This is when `~/.lax` is created and their Lax is born.
5. **relay**: to reach Lax from their phone, anywhere. It needs a free Cloudflare account (no domain): a browser window
   opens once to log in, and a small Worker is deployed to their own account, at `lax-relay.<their-account>.workers.dev`.
   Nothing is kept there; it only passes messages between the phone and the Mac. If they only want to try Lax on the Mac
   for now, skip it: they can run `node scripts/setup.mjs relay` any time later.
6. **whisper** (optional): better hearing, on the Mac (whisper.cpp, about 600 MB, a few minutes to build). Free, and
   nothing leaves the Mac. Ask; it can come later too.
7. **android** (optional): only if they want the Android app (a background link, approvals that wake the phone, the
   cover screen); Chrome on the phone works without it. It fetches what building it needs into `~/.lax-tools`
   (about 1 GB, no Homebrew). Google's Android SDK licenses come with it: tell them, and on a yes run
   `node scripts/setup.mjs android --accept-licenses`. Then, with the phone plugged in (USB debugging on),
   `npm run android -- --pair` builds it from this clone and pairs it.
8. **pair**: opens the pairing page. With the relay, they scan the QR with the phone and open it in Chrome (or the Android
   app, built from this clone with `npm run android`). Without it, Lax is right there on the Mac: the page links to it.

## At the end

Say, in a few lines: Lax is awake and starts as an egg that hatches from how they work; tap Lax to talk (or hold space on
the Mac); everything it learns stays in `~/.lax` on this Mac, and only what goes into a request as context reaches
Anthropic, through their own Claude Code. `node scripts/setup.mjs status` shows where things stand, any time.
