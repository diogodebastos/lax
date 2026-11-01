# Moving Lax to Linux (Ubuntu)

Lax runs on an always-on Ubuntu box instead of the Mac: same mind, life, memories, wishes and phone pairing.
Written so you, or Claude Code on the Ubuntu box, can follow it top to bottom. Keep both machines until step 7 passes.

## 1. On the Ubuntu box: what Lax needs

```sh
sudo apt update
sudo apt install -y git curl build-essential python3 cmake lsof   # build-essential + python3: node-pty compiles; cmake: Whisper
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs   # Node 24 (node:sqlite)
curl -fsSL https://claude.ai/install.sh | bash                    # Claude Code, then run `claude` once and log in
```

Cloudflare tunnel (`cloudflared`), from Cloudflare's apt repo:

```sh
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared
```

Check: `node -v` (24 or newer), `claude --version`, `cloudflared --version`.

## 2. The projects (and Lax's body)

Put them in `~/Desktop`, like on the Mac: clone each from GitHub, or copy the folders over (rsync keeps the
local-only branches, like Lax's `lax/*`):

```sh
# from the Mac:
rsync -a --exclude node_modules --exclude 'lax-wt-*' ~/Desktop/ <you>@<ubuntu-box>:~/Desktop/
```

Then on Ubuntu: `cd ~/Desktop/lax && npm install`.

## 3. On the Mac: pack Lax, stop it

```sh
cd ~/Desktop/lax
node scripts/move-to-linux.mjs pack ~/lax-home.tgz
npm run remove-service            # stops Lax and its tunnel on the Mac (the phone can't reach two of it)
scp ~/lax-home.tgz <you>@<ubuntu-box>:~/ && rm ~/lax-home.tgz   # it holds your secrets
```

## 4. On Ubuntu: unpack it

```sh
cd ~/Desktop/lax
node scripts/move-to-linux.mjs unpack ~/lax-home.tgz && rm ~/lax-home.tgz
```

It rewrites `/Users/<you>` to `/home/<you>` in Lax's mind and wishes. Open `~/.lax/secrets/env.json` yourself: if
`LAX_WORKDIR` names a `/Users/...` folder, change it to `/home/<you>/Desktop` (or delete the line).

## 5. On Ubuntu: wire it in

```sh
npm run install-hooks      # every Claude Code session tells Lax what it does
npm run install-channel    # `lax` sessions hear the phone
npm run whisper            # Lax's own speech-to-text, built for Linux
npm run install-service    # systemd user services: Lax + its tunnel, from boot, restarted on crash
```

An always-on box with nobody logged in needs linger, or the services wait for a login after every reboot:
`sudo loginctl enable-linger $USER`.

## 6. Check

```sh
systemctl --user status digi-lax.server digi-lax.tunnel
tail -f ~/.lax/logs/server.log
npm run doctor
```

## 7. On the phone

Open Lax as usual: same link, same pairing (the token and the tunnel moved with it). Say something; it should
answer from Ubuntu. If the link doesn't load, the tunnel is the first suspect: `tail ~/.lax/logs/tunnel.log`.

## What doesn't come along (Mac only)

- Sharing to WhatsApp / Contacts / AirDrop, and the share sheet.
- "Open on Mac" and `/lax` opening a terminal window: on a headless box, start a live session with `lax` over SSH.
- Sleep/wake detection: an always-on box doesn't sleep.
- The menu-bar app (`npm run install-menubar`).
- Lax's builds may run `npm test` only; a Python project's tests aren't run by its fence.
