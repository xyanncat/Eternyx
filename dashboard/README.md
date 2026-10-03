# Eternyx Dashboard (Vercel)

Elegant, animated web dashboard for the Eternyx moderation bot. The bot (on the
phone) **pushes** a full snapshot — command usage, moderation cases, security
events, log tail — to this site every 60s. The site never contacts the phone
(the phone has no inbound ports, by design).

## Pages

- `/` — animated login (key-gated)
- `/dashboard` — live overview: bot status, uptime, memory vs 256MB cap, gateway
  ping, command usage bars, recent cases, security events, log tail
- custom animated `404` and `500` pages

## Customize

Everything visual lives in **`lib/site-config.js`** — name, tagline, colors
(accent, background, danger), footer, and which sections are visible
(`features.usage / cases / events / logs`). Edit, redeploy, done.

## Run locally

```sh
cd dashboard
npm install
cp .env.example .env.local   # can stay empty — demo mode with seed data
npm run dev                  # http://localhost:3000 (demo badge, any key opens)
```

## Deploy to Vercel

```sh
npm i -g vercel
cd dashboard
vercel login
vercel link
# generate two random keys:
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # ×2
vercel env add DASHBOARD_ACCESS_KEY      # paste key #1  (your login)
vercel env add DASHBOARD_INGEST_KEY      # paste key #2  (the phone's push key)
vercel --prod
```

Then create a KV store: Vercel dashboard → your project → Storage → Create
**KV** → connect. The `KV_REST_API_*` env vars are injected automatically.
(The site runs without KV too — it shows clearly-badged demo data.)

## Connect the phone (Vercel hosting)

On the phone's `~/eternyx-bot/.env`, add:

```
DASHBOARD_URL=https://<your-project>.vercel.app
DASHBOARD_INGEST_KEY=<key #2 — the ingest key>
```

then `SVDIR=$PREFIX/var/service sv restart bot`. Within a minute the dashboard
badge flips from **DEMO DATA** to **LIVE**.

## Host the web on the phone (no Vercel)

The bot and the web share the device: storage switches from Vercel Blob to
local encrypted files (`STORE_BACKEND=file`), so there are no usage meters.
Public access comes from a free Cloudflare quick-tunnel (no port forwarding).

```
# 1. PC: build + ship the bundle (phone USB-connected, Termux sshd up)
sh deploy/termux/ship-web.sh            # git-bash / WSL / Linux

# 2. Phone: install services
sh ~/eternyx-bot/deploy/termux/setup-web.sh

# 3. Phone: fill in ~/eternyx-web/.env.web (ingest key MUST match the bot's),
#    point the bot at it, start everything:
#      ~/eternyx-bot/.env → DASHBOARD_URL=http://127.0.0.1:3000
#      SVDIR=$PREFIX/var/service sv restart bot
#      SVDIR=$PREFIX/var/service sv up web tunnel

# 4. Phone: read the public URL
grep -o 'https://[^ ]*trycloudflare.com' ~/eternyx-web/tunnel.log | tail -1
```

Notes: the quick-tunnel URL changes on every tunnel restart; the bot always
talks to `127.0.0.1:3000` regardless. Storage lives in `~/eternyx-web/data/`
(encrypted with the ingest key, same as Blob). To update: re-run `ship-web.sh`
then `sv restart web`.

## Security model

- Login: `DASHBOARD_ACCESS_KEY`, httpOnly cookie, guarded by middleware.
- Ingest: `DASHBOARD_INGEST_KEY` as a Bearer token on `/api/ingest` — the only
  write endpoint. Both keys live in Vercel env vars, never in the repo.
- The payload contains moderation metadata (case reasons, user IDs) — treat the
  URL + access key accordingly.
