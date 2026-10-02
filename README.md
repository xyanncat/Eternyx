# Eternyx Moderation Bot

Security-first Discord moderation bot for the dev server. **Slash commands only**,
**every response is an embed**, designed to run 24/7 on a spare Android phone
(Termux). Design doc: [MODBOT_PLAN.md](./MODBOT_PLAN.md).

Stack: Node.js ≥ 22.5 · discord.js 14 (pinned) · `node:sqlite` (stdlib — zero
native dependencies to compile on the phone) · dotenv. No HTTP server, no inbound
ports; Discord's gateway is outbound-only.

## 1. Discord Developer Portal (one-time, requires your account)

1. <https://discord.com/developers/applications> → **New Application** → name it.
2. **Bot** tab:
   - Reset Token → copy it (goes into `.env` as `DISCORD_TOKEN`).
   - Enable **Server Members Intent** (needed for join-raid detection). Do **not**
     enable Message Content Intent — this bot never reads message text; content
     filtering is delegated to Discord's native AutoMod.
   - **Public bot: OFF** so only you can invite it.
3. **General Information** → copy the **Application ID** (`.env` → `CLIENT_ID`).
4. Invite with least privilege (plan §4.2 — deliberately no Administrator,
   no ManageRoles, no ManageWebhooks):
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268561590&scope=bot%20applications.commands
   ```
   That integer covers: View Channels, Send Messages, Embed Links, Attach Files,
   Read History, Kick, Ban, Timeout, Manage Messages, Manage Channels,
   Manage Guild (native AutoMod rules), View Audit Log.
5. In Discord: enable Developer Mode (Settings → Advanced), right-click your
   server → Copy Server ID (`.env` → `GUILD_ID`), and your own user → Copy User ID
   (`.env` → `OWNER_IDS`, comma-separated if several).

## 2. Install & register commands

```sh
cp .env.example .env      # fill in all four values
npm ci
npm run deploy-commands   # registers slash commands on the dev guild (instant)
npm start                 # local run (works on Windows/WSL too)
```

First thing in Discord: `/config set log-channel #mod-log` and
`/config set mod-role @Mods` (owner-only commands). Then check `/botstatus`.

## 3. Deploy to the Xiaomi phone (Termux)

1. Install **Termux from F-Droid or GitHub** — never the Play Store build.
   Also install the **Termux:API** add-on app from F-Droid.
2. Get the repo onto the phone (e.g. `git clone <url> ~/eternyx-bot`).
3. Run the provisioning script — it installs packages, creates the runit service
   (auto-restart on crash), the boot hook (starts after reboot), and a nightly
   03:15 DB backup with 7-day retention:
   ```sh
   cd ~/eternyx-bot
   sh deploy/termux/setup.sh
   ```
4. **MIUI checklist (the part that kills bots)** — printed at the end of setup.sh:
   battery saver → *No restrictions* for Termux, Autostart ON, pin Termux in
   Recents, exclude from Security-app cleanup, keep Wi-Fi on during sleep,
   dedicated charger with ventilation.
5. Control: `sv up bot` · `sv status bot` · `sv restart bot` · `sv down bot`.
   Verify with `/botstatus` (uptime, memory, battery, clean-shutdown flag).

## Operations

| Task | How |
|---|---|
| Health check | `/botstatus` from Discord — never touch the phone |
| Update | `git pull && npm ci && sv restart bot` (deps are exact-pinned) |
| Manual DB backup | `/dbbackup` (owner-only, uses `VACUUM INTO`) |
| Token rotation drill | Portal → Reset Token → edit `.env` → `sv restart bot`. Rehearse once; a lost phone is then a 2-minute incident |
| Inspect events/security log | `sqlite3 data/eternyx.db 'SELECT * FROM events ORDER BY id DESC LIMIT 20;'` |

## Security model (summary — full detail in MODBOT_PLAN.md §4)

- **Least privilege**: no Administrator/ManageRoles; timeouts replace mute roles.
- **Double authorization**: Discord default-member permissions hide commands;
  the app re-checks mod/owner status on every interaction (in-server role edits
  take effect immediately).
- **Hierarchy-safe**: refuses targets at/above the bot, the invoker, the owner,
  and fellow moderators at/above the invoker's level. Fails closed.
- **Write-ahead cases**: every action logs to SQLite (append-only) *before* the
  Discord API call; failures are recorded as PENDING, never silently succeed.
- **Tamper alerts**: permission/role changes touching the bot, and audit-log
  entries targeting the bot, trigger instant owner DMs + log-channel embeds.
- **Raid/nuke guards**: join bursts raise the verification gate; mass bans or
  mass channel deletions alert owners (auto-timeout of the actor is opt-in,
  default alert-only).
- **Hygiene**: token only in `.env` (redacted in logs), cooldowns on all commands,
  hard caps on destructive commands, snowflake validation on all IDs, no eval,
  no dynamic code paths, exact-pinned dependencies.

## Low-RAM tuning (6GB phone)

Storage is a non-issue on the 64GB model (DB is a few MB, backups ~MB-scale);
RAM is the constraint, and the bot is tuned for it at three layers:

1. **Node heap cap** — the service runs `node --max-old-space-size=256`, so a
   runaway heap kills only the bot process (runit restarts it in seconds),
   never the phone.
2. **Slim caches** (src/index.js): message/presence/thread/voice caches are
   disabled entirely (nothing reads message text), the member cache is capped
   at 500 with the bot's own member pinned, and sweepers evict stale
   members/users hourly. Expected steady-state: **~100–200 MB RSS** — check
   `/botstatus` (a `mem_pressure` event is recorded above 300 MB).
3. **MIUI RAM-side checklist** (in addition to the battery checklist in §3):
   - Recents → pin Termux (stops "clear all" from killing it).
   - Security app → Settings → disable *Clear memory when screen locks* (or
     add Termux to its exceptions).
   - Developer options → Background process limit → *Standard limit*.
   - *Memory extension* (virtual RAM) can stay **ON** — with 40GB free, swap
     on storage actually helps keep Termux resident on a 6GB device.

If you ever need more headroom: the guild is small, so lowering
`GuildMemberManager.maxSize` (e.g. 200) in `src/index.js` is safe.

## Tests

```sh
npm test
```

25 tests cover validation, embed caps, the hierarchy permission engine,
cooldowns, and the storage layer (append-only transitions, guild scoping,
config merging, usage stats) — run against an in-memory database.
