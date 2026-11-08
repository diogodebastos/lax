# Setting up Lax

You're setting up Lax for the person in front of you: a pixel companion for Claude Code that lives on their computer and
their phone, watches their sessions, and learns them. This folder (the clone) is Lax's body; `~/.lax` will be Lax itself.
Each person's Lax is born fresh: it knows nothing about them yet, and that's how it should be.

## How

- Start with `node scripts/setup.mjs status --json` to see what's done. Skip what already is.
- Go one step at a time, in the order below. Before each, say in one or two short sentences what it does and why; then run
  `node scripts/setup.mjs <step>` and say what happened. Plain words, no emoji, no walls of text.
- Ask only the practical things (a folder, yes or no). Don't ask their name, Lax's name or colour, or anything about
  them: Lax asks that itself, in their first conversation.
- Only run the setup steps. Don't edit files by hand, and never read `~/.lax/secrets`.
- If a step fails, say what went wrong in a sentence and what to do, then offer to run it again.
- If a step says a tool is missing, give them the one install command it printed.

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
4. **service**: Lax runs in the background from login (a background service: launchd on macOS, a systemd user service
   on Linux), and restarts if it crashes. It listens only on this computer. This is when `~/.lax` is created and their Lax is born.
5. **relay**: to reach Lax from their phone, anywhere. It needs a free Cloudflare account (no domain): a browser window
   opens once to log in, and a small Worker is deployed to their own account, at `lax-relay.<their-account>.workers.dev`.
   Nothing is kept there; it only passes messages between the phone and their computer. If they only want to try Lax on
   this computer for now, skip it: they can run `node scripts/setup.mjs relay` any time later.
6. **whisper** (optional): better hearing, on this computer (whisper.cpp, about 600 MB, a few minutes to build). Free, and
   nothing leaves this computer. Ask; it can come later too.
7. **android** (optional): only if they want the Android app (a background link, approvals that wake the phone, the
   cover screen); Chrome on Android, or Safari on an iPhone, works without it. It fetches what building it needs into `~/.lax-tools`
   (about 1 GB, no Homebrew). Google's Android SDK licenses come with it: tell them, and on a yes run
   `node scripts/setup.mjs android --accept-licenses`. Then, with the phone plugged in (USB debugging on),
   `npm run android -- --pair` builds it from this clone and pairs it.
8. **domain** (optional, advanced; only if they ask or have a domain on Cloudflare): a tunnel to `lax.<their domain>`
   behind Cloudflare Access (an email PIN in the browser), next to the relay. It needs Zero Trust turned on in the
   dashboard (free: pick a team name) and an API token: `node scripts/setup.mjs domain link` prints a link that pre-fills
   it. They create it, copy it, and you run `node scripts/setup.mjs domain <host> <email> --token-from-clipboard`: the
   token goes from the clipboard to `~/.lax/secrets` without you seeing it. Never ask them to paste it to you.
9. **pair**: opens the pairing page. With the relay, they scan the QR with the phone: Chrome on Android, Safari on an iPhone (or the Android
   app, built from this clone with `npm run android`). Without it, Lax is right there on this computer: the page links to it.

## At the end

Say, in a few lines: Lax is awake and starts as an egg that hatches from how they work; tap Lax to talk (or hold space on
this computer); everything it learns stays in `~/.lax` on this computer, and only what goes into a request as context reaches
Anthropic, through their own Claude Code. It also improves itself: when it can't do something it offers to learn it,
and on a night after something got in their way it fixes one small thing in its own code on a branch, then tells them
in the morning; nothing reaches `main` without their yes, and "learns" in the Life menu turns both off.
`node scripts/setup.mjs status` shows where things stand, any time.
