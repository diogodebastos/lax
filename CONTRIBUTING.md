# Contributing

Lax is a personal agent: everyone's Lax is a clone of this repo that grows on its own. This repo is what they all start
from, so a change here is a change to every new Lax. Thanks for helping.

## The shape of it

- **The body and the mind are apart.** This repo is the body (code). Each Lax itself lives in `~/.lax` (its mind, life,
  settings, secrets), which never goes in the repo. Nothing personal goes in the code: no names, emails, domains or paths
  of anyone's (`git grep -i -E "your-name|your-email"` should find nothing).
- **Plain on purpose:** Node 22.13+, ES modules, vanilla JS in the browser, Kotlin with framework APIs only on Android.
  A new dependency needs a good reason.
- **Comments say why**, in plain words, at the top of each file and where something isn't obvious. Match the file you're in.
- **What Lax says** is read aloud: short, plain sentences, no markdown, no emoji. Feed markers are plain text (`> clear`).

## Development

```bash
npm start              # Lax in the foreground: prints the Mac and phone URLs (with the token)
npm test               # everything, on a throwaway Lax (never your own ~/.lax)
npm run test-relay     # the relay, under wrangler dev
node scripts/setup.mjs status   # what setup did, step by step (each step runs on its own: hooks, channel, service, relay…)
```

- `http://localhost:7777/pair`: the pairing page (only from the Mac itself)
- `http://localhost:7777/demo/app?demo`: every state, without Claude Code
- `http://localhost:7777/demo`: the shareable demo (portrait / landscape / cover), live from the working folder. Optionally a public one on Cloudflare that works with the Mac off: set `LAX_DEMO_ROUTE` (e.g. `"lax.example.com/demo*"`) in `~/.lax/secrets/env.json`, and `git config core.hooksPath scripts/git-hooks` redeploys it on every push to main (by hand: `node scripts/demo.mjs --deploy`). Without it, nothing is deployed.
- `http://localhost:7777/preview.html`: a Flip 3 mockup (closed cover screen, open, Flex mode)


How each part works: [docs/how-it-works.md](docs/how-it-works.md).

## Before a pull request

```bash
npm test               # everything, on a throwaway Lax (it never touches your own ~/.lax)
npm run test-relay     # the relay, under wrangler dev (needs wrangler; not in npm test)
```

- A new ability gets a test file (`scripts/test-<name>.mjs`) added to `npm test`.
- Bump `lax.js?v=N` in `public/index.html` when you change `public/lax.js`.
- One change per pull request, with a commit message that says what it does for the person using Lax.

## Careful ground

The files in `OFF_LIMITS` (`lib/guard.mjs`) are the ones no Lax may change by itself: how it's reached and protected,
what it may do without asking, its hooks, its guardrails, setup and updating. Changes there are welcome, but get a
closer review; say in the pull request what it changes for safety. See [SECURITY.md](SECURITY.md), and report
vulnerabilities privately, not in an issue.

## Your Lax's own changes

Your Lax changes its own body on branches of your clone. Some of those may be good for everyone: offering them here, opt
in, is on the roadmap (Phase 8). Until then, if your Lax made something worth sharing, open a pull request from your fork
like any other.
