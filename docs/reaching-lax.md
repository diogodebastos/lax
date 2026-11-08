# Reaching Lax from anywhere

Lax listens only on your Mac. These are the ways your phone reaches it, and how to keep it running. How the relay is built: [Lax on Cloudflare](write-ups/lax-on-cloudflare.md). Back to the [README](../README.md).

## Reaching Lax from the phone: the relay

Lax listens only on `127.0.0.1`. The phone reaches it through a Worker on your own free Cloudflare account (`relay/`, at `lax-relay.<account>.workers.dev`): the Mac holds one WebSocket out to it, and the phone talks to the Worker over HTTPS (which is also what lets Chrome use the mic). Every request is replayed against Lax on the Mac and streamed back, so the page, the app and the token work the same as anywhere. With the Mac asleep, the phone shows Lax asleep, and what you say to it then (and your yeses and noes) is held for up to 12 hours and reaches the Mac in order when it wakes, each once. What the phone and the Mac say is sealed end to end (AES-256-GCM, with a key that reaches the phone only after the `#` of its pairing link), so Cloudflare sees paths and the token, never what's said; the app also checks that its page was signed by your Mac. Wrong tokens are limited per address (20 in 10 minutes). How it's built: [docs/write-ups/lax-on-cloudflare.md](write-ups/lax-on-cloudflare.md).

`node scripts/setup.mjs relay` does it all: the browser login, the deploy, a relay key on both ends (`~/.lax/secrets/relay-key` and the Worker's `RELAY_KEY`), `LAX_RELAY_URL` (and `LAX_PUBLIC_URL`, for pairing) in `~/.lax/secrets/env.json`, and a restart; `[relay] linked` in the log. By hand:

```bash
npx wrangler@4 deploy --config relay/wrangler.jsonc             # prints its workers.dev URL
openssl rand -hex 24 > ~/.lax/secrets/relay-key && chmod 600 ~/.lax/secrets/relay-key
npx wrangler@4 secret put RELAY_KEY --config relay/wrangler.jsonc < ~/.lax/secrets/relay-key
```

## Or: your own domain (Cloudflare Tunnel + Access)

If you have a domain on Cloudflare, the phone can also reach Lax through a tunnel on it (here `https://lax.example.com`), behind Cloudflare Access (an email-PIN login in the browser, a service token for the app). Lax's token is a second lock. It can run next to the relay.

The quick way (Zero Trust turned on in the dashboard first, free):

```bash
node scripts/setup.mjs domain link                                            # a link that pre-fills the API token
node scripts/setup.mjs domain lax.example.com you@example.com --token-from-clipboard
```

Create the token from the link and copy it; the second command takes it from the clipboard (and clears it), installs `cloudflared` into `~/.lax-tools` (no Homebrew), sets up the tunnel, Access, DNS and the tunnel's background service, checks that Lax answers there, and deletes the token file (delete the token in the dashboard too). By hand:

```bash
brew install cloudflared
cloudflared tunnel login                      # browser: pick example.com
cloudflared tunnel create lax
cloudflared tunnel route dns lax lax.example.com
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: lax
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: lax.example.com
    service: http://127.0.0.1:7777
  - service: http_status:404
```

`~/.lax/secrets/env.json`:

```json
{ "LAX_PUBLIC_URL": "https://lax.example.com", "CF_ACCESS_CLIENT_ID": "…", "CF_ACCESS_CLIENT_SECRET": "…" }
```

**Access (Zero Trust dashboard):** create a self-hosted app for `lax.example.com` with:
- an **Allow** policy for your email (one-time PIN, 1-month session)
- a **Service Auth** policy for the `lax-android` service token, which the Android app uses for its background connection

`/pair` only answers requests from the computer itself. Anything that arrives through the tunnel gets a 403.

## Always on (launchd, or systemd on Linux)

```bash
npm run install-service   # server (+ tunnel once configured): starts at login, restarts on crash (setup does this)
npm run remove-service
npm run logs
```

On a Mac these are launchd agents in `~/Library/LaunchAgents`. On power, turn on System Settings → Battery → Options →
*Prevent automatic sleeping when the display is off*.

On Linux they're systemd user services in `~/.config/systemd/user` (`digi-lax.server.service`, `digi-lax.tunnel.service`):

```bash
systemctl --user status digi-lax.server     # or start | stop | restart
loginctl enable-linger $USER                # optional: keeps Lax running while you're logged out, and from boot
```

Without lingering, Lax runs while you're logged in, like a LaunchAgent. To keep it reachable on power: GNOME Settings →
Power → *Automatic Suspend* off, or KDE's Power Management; for a closed lid, `HandleLidSwitchExternalPower=ignore` in
`/etc/systemd/logind.conf`. cloudflared comes from Cloudflare's .deb/.rpm (`/usr/bin/cloudflared`) or, with your own
domain, from `scripts/domain.mjs` into `~/.lax-tools`. With no systemd user session (WSL without systemd, a container),
run `npm start` in a terminal instead.
