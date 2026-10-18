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
