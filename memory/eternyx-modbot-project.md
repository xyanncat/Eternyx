---
name: eternyx-modbot-project
description: Eternyx Discord moderation bot — COMPLETE and live on the user's
  Xiaomi phone (Termux); 24 slash commands, full guard suite, button control
  panel, auto-roles, announcement mentions, phone-hosted web dashboard with
  instant ~3s command dispatch
metadata:
  node_type: memory
  type: project
  originSessionId: sess_cd7540c2-fee4-4261-80ec-d146b3aa0780
  memoryDir: memory/
  updated: 2026-10-06
---

> Read this before touching Eternyx. It records the complete architecture,
> every decision that matters, all verified state, and the gotchas that must
> never be relearned. If a fact here conflicts with the code, trust the code
> and update this file.
>
> **This is THE single memory file (user directive 2026-10-03).** All other
> memory files (MEMORY.md index, legacy `Project Memory/` folder) were removed.
> Keep it updated in place, time to time, as facts change.

# Eternyx — project memory (complete record, 2026-10-03)

## 1. What it is

Discord **moderation bot** for the dev server "Eternity | ROYAL'S PARADISE | Dev"
(guild `1444582621417046071`). Hard requirements: **slash commands only**,
**embed-only responses** (including errors), security-first. Hosted 24/7 on the
user's **Xiaomi Redmi Note 10S "selene", Android 13, 6 GB RAM** via Termux +
termux-services. Repo: `E:\github\Eternyx` → GitHub `xyanncat/Eternyx`, branch
`main` (HEAD 2026-10-03: 12507ca + memory commits). Bot token in phone
`~/eternyx-bot/.env`; never in git.

**Final status: complete and live** — 24 slash commands registered, full guard
suite active, control panel posted, auto-roles configured, dashboard hosted on
the phone with ~3 s command dispatch, 29/29 tests passing, `npm audit` 0 vulns.

## 2. Architecture

```
PC (controls, git, builds) --adb/ssh--> Xiaomi phone (Termux)
                                          ├─ runit: bot    → node src/index.js (heap cap 256MB)
                                          ├─ runit: web    → standalone Next.js :3000
                                          ├─ runit: tunnel → cloudflared quick-tunnel (public URL)
                                          └─ runit: crond  → nightly DB backup
```

- **Bot runtime:** Node ≥ 22.5, discord.js 14.27.0 (pinned), `node:sqlite`
  (stdlib — zero native deps), dotenv. Intents: Guilds + GuildMembers +
  GuildModeration + **GuildMessages + MessageContent** (the last two exist for
  message edit/delete audit logging; the app flag is enabled). Content is never
  processed — original stance was content OFF, changed by user request for
  full message logging. Caches slimmed (presence/thread/voice 0; **messages
  100/channel** — backs before/after content; members capped 500) + hourly
  sweepers for low RAM.
- **Storage:** `data/eternyx.db` (node:sqlite). Tables: `cases` (append-only,
  write-ahead PENDING→ACTIVE/REVOKED), `config` (per-guild; all fields in §5),
  `events` (security log), `command_stats` (usage). Schema migrations are
  additive in `initDb` (`migrate()` adds missing columns by constant name).
- **Web dashboard:** Next.js 16.3.7 standalone in `~/eternyx-web`; storage
  backend switchable: `STORE_BACKEND=file` (phone, local encrypted files under
  `data-web/`) or default blob (Vercel). Same AES-256-GCM payloads either way
  (key = sha256(DASHBOARD_INGEST_KEY), see `lib/vault.js`).
- **Command loop:** site POST `/api/setup` → encrypted queue → bot pulls every
  60 s **and instantly on SIGUSR1** (web signals pidfile `/proc`-verified) →
  `src/lib/commands.js` executes allowlisted actions → acks via `/api/ingest` →
  results shown in Logs tab. Outbound-only; no inbound ports on the bot.

## 3. Slash commands (24, all embed responses)

- **Moderation:** /ban /softban /unban /kick /timeout /untimeout /warn
  /warnings /case /clear /slowmode /lock /unlock
- **Security:** /panel (post control panel), /lockdown on|off (owner)
- **Config (owner):** /config set log-channel|control-channel|mod-role|
  auto-role|raid-threshold|nuke-auto-action, /config add mod-role, /config show,
  /automod (keyword|invite|preset|mention-spam|remove|list), /dbbackup
- **Info/system:** /userinfo /serverinfo /avatar /ping /botstatus /help

Key decisions: server owner is an implicit bot owner (OWNER_IDS not required
for rights — but §6 pinning uses OWNER_IDS for DMs); required slash options must
precede optional ones (Discord 50035).

## 4. Guards & engines (the protection core)

- **raidGuard** (`engines/raidGuard.js`): join-burst detection ≥ raidThreshold/min
  → raises verification level to High + alerts. Also: **account-age screening**
  (<7 d joined → log; <24 h → owner DM) and **bot-join alerts**.
- **nukeGuard**: mass bans (per-actor AND guild-wide ≥5/min → alert; optional
  auto-timeout 1 h when `nuke_auto_action` on) and mass channel deletes (≥3/min).
- **selfGuard**: alerts when the bot's role loses any REQUIRED permission
  (includes ManageRoles for auto-role), when its role is deleted or changed, when
  **@everyone gains dangerous permissions**, and on audit entries targeting the bot.
- **dangerWatch**: AuditLogEvent-based — BotAdd, WebhookCreate, kick bursts
  (≥3/min/actor), role-delete bursts (≥3/min) → log channel + owner DMs.
- **guildUpdate**: name/icon/banner/owner/verification-level changes → alert
  (owner change & verification drop also DM owners).
- **autoRole** (`engines/autoRole.js`): on join, humans → autoRoleUserId, bots →
  autoRoleBotId. Failure-proofed: checks ManageRoles + hierarchy + managed;
  alerts once/hour with the exact fix. Runs BEFORE raidGuard in guildMemberAdd.
- **lockdown** (`lib/lockdown.js`): locks all public text channels; **persists
  state** (lockdown_active + per-channel previous SendMessages value in
  lockdown_channels) → unlock does an **exact restore**; `ready.js` reconciles
  on boot so a restart never silently lifts protection. Verified byte-identical
  overwrite masks end to end.
- **Alerts** (`lib/alerts.js`): `alertRecipients` = OWNER_IDS when set (pins the
  list exactly — currently the master `1479589523426902208` ONLY), else
  configured owners + guild owner. `alertOwners` returns delivered count.

## 5. Message audit logging (edits & deletes)

**Everything that happens to a message is mirrored to the log channel**
(user directive 2026-10-03): `messageUpdate`, `messageDelete`,
`messageBulkDelete` → `lib/messageLog.js` → `sendAuditLog`.

- **Edit logs** show Before/After content (+ attachment diff) with a jump
  link. Cached edits log only real content/attachment changes; uncached edits
  still log with Before = *not cached*; link-preview unfurls and the bot's own
  embed-only refreshes are filtered out.
- **Delete logs** show author, content, attachments (name/type/size/URL) and
  embeds/links. Uncached deletes degrade to a *not cached* note.
- **Attribution:** resolved from the audit log (target = message AUTHOR,
  `options.channel_id`, with a short retry for lag). **Discord creates NO
  audit entry when an account deletes its own message** — attribution appears
  when a mod deletes someone else's message (verified audit-entry shape:
  action 72, user_id = executor). Self-deletes log content without a name.
- Intents: message events need **GuildMessages** (unprivileged — the missing
  piece that made handlers silent); MessageContent (app flag already ON,
  LIMITED) gates content visibility. Message cache (100/channel) is required
  for before/after content.

## 6. Config model (per guild, in `config` table)

logChannelId · modRoleIds · ownerIds · raidThreshold (default 10) ·
nukeAutoAction (0/1) · controlPanelChannelId · controlPanelMessageId ·
lockdownActive (0/1) · lockdownChannels (JSON `[{id,prev}]`) ·
autoRoleUserId · autoRoleBotId.
Live values: log `1555862906397270047` (#eternyx-logs), mod role
`1472934739034767453` (@Yonko), raid 4/min, nuke auto-action on, control
`1555862852940865647` (#eternyx-control), auto-role user `1472935152421306603`
(@New Worlder), auto-role bot `1544560111865827338` (@Pirates).

## 7. Control panel + DM pinning

- **/panel** posts a persistent button panel to #eternyx-control (live message
  `1555871244078030859`): **Lockdown ON/OFF** (owner-only) + **Status** (mods).
  Buttons re-authorize per click, reuse the exact /lockdown lib, refresh the
  panel embed after every toggle, and every action is audit-logged.
- **Security DMs go ONLY to the master** (`1479589523426902208`) — via
  `OWNER_IDS` pin in the phone `.env`. Verified delivery 1/1.
- **test-alert** dashboard action: proof embed → log channel + DMs, reports
  `N/M DM(s) delivered`. Use it after any alert-config change.
- Moderation target DMs (ban/kick notices) are separate and only fire when a
  moderator opts in on that action.

## 8. Announcements

- Dashboard Announcements tab: channel + title + message, **role picker** and
  **user picker** (members list in snapshot — humans only, cap 200, refreshed by
  throttled `guild.members.fetch()` every 10 min because cache holds online only).
- Mentions ride in message content (`<@&id>`/`<@id>`) with an **explicit
  allowedMentions allowlist** and `parse: []` — nothing else can ping; stale IDs
  dropped at resolve time. Validation: ≤5 snowflake IDs per list.
- Live #world-news / #eternyx logos etc.: images are NOT wired into the
  dashboard UI; image embeds were done one-off via phone REST scripts using
  `attachment://` with the PNG uploaded as a real attachment (pattern lives in
  this file; re-use it if needed).
- **Role must be `mentionable:true`** for a role ping to fire — @New Worlder was
  un-mentionable and got flipped (PATCH role) before the announcement pinged.

## 9. Brand image (fixed embed image)

Every bot message **outside the log channel** carries the Kafka artwork
(`assets/kafka.png`, 1200×675) as its embed image — including owner DMs.
Log-channel audit embeds stay clean. Mechanics: Discord CDN URLs are signed and
expire, so the PNG ships with the bot and is attached per send as
`attachment://kafka.png` (`lib/brand.js` → `applyBrand`).

Wiring: `interactionCreate.execute` wraps each interaction's
`reply`/`followUp`/`editReply` (covers ALL slash commands and panel buttons),
`alertOwners` brands owner DMs, `postPanel` brands the control panel,
`lib/commands.js` announce brands announcements. `applyBrand` is non-mutating,
respects embeds that already have an image, and degrades to plain embeds if the
asset is missing (branding must never break a send).

Verified live 2026-10-03: #test announcement embed image = uploaded CDN
`kafka.png` attachment; log-channel test alert has no image; owner DM delivered
1/1 with the branded payload. Tests: test/brand.test.js (32 total).

## 10. Dashboard (SIGNAL design v3)

- **Design:** ink/lime brutalist — dot-grid base, acid-lime/magenta/cyan/amber,
  hazard strips, hard offset shadows; Syne + Archivo + JetBrains Mono; lucide
  icons; NumberFlow animated stats; `app/icon.svg`. Theme tokens live in BOTH
  `lib/site-config.js` and `app/globals.css` — change together. (v1 neon-glass →
  v2 blurple ops-console → v3 SIGNAL, commits 988372d/5ddff99/40a2215.)
- **Tabs:** Overview / Server setup (log channel, mod roles, auto-roles) /
  Announcements / Guards & channels (raid threshold, nuke action, per-channel
  lock+slowmode, **Server lockdown card**) / AutoMod / Logs & results (dispatch
  results, cases, security events, phone log tail).
- **Dashboard actions (20, bot dispatcher `src/lib/commands.js`):** set-log-channel,
  set-mod-role, add-mod-role, set-raid-threshold, set-nuke-auto-action,
  set-control-channel, post-panel, lockdown-on/off, test-alert, set-auto-role,
  announce, set-slowmode, lock-channel, unlock-channel, automod-keyword,
  automod-invite, automod-preset, automod-mention-spam, automod-remove. All
  param-validated (snowflakes/ranges), fail closed, every cmd →
  `dashboard_cmd` event row. **The site route (`dashboard/app/api/setup/route.js`)
  has its own action allowlist — adding a bot action requires updating BOTH.**
- **Realtime:** instant dispatch (~3 s) via SIGUSR1 wake; otherwise 60 s poll.
  Web reports every 60 s (snapshot: bot stats, channels, roles, members,
  automodRules, config — all encrypted).
- **Ticket system (2026-10-18, commit 2afb91b):** button-driven, fully on-phone.
  Panel live in #📩┃den-den-mushi (`1472933470581031101`, message `1561402466879152200`)
  with `ticket:open` button → subject modal → private channel `ticket-<n>` (created
  under an auto-made TICKETS category; @everyone denied View, opener + mod roles
  allowed) → close via `ticket:close` button or `/ticket close` → chat-by-chat
  transcript posted as .txt to the auto-created **#ticket-storage** channel
  (`1561402462013755413`, under BOT LOGS) AND saved to phone disk
  `~/eternyx-bot/data/tickets/ticket-<n>.txt` (the "device storage" copy).
  DB: `tickets` table + 5 config cols (panel/storage/category ids, counter).
  Staff cmds: /ticket panel|storage|close (mod-gated); dashboard action
  `post-ticket-panel` for remote setup. 40 tests pass. Panel + storage channel
  verified live via REST.
- **Quick-tunnel rot (2026-10-18):** dashboard "down" = Cloudflare revoked the
  12-day-old quick tunnel (`Unauthorized: Tunnel not found` in tunnel.log while
  web stayed healthy locally). Fix: `sv restart tunnel` + hand out the NEW URL.
  Current URL: `https://prepare-bargains-too-trinity.trycloudflare.com`.
  Quick tunnels die eventually — if the dashboard 404s/000s again, first check
  tunnel.log for that error and restart the tunnel; URL rotates every restart.
- **UI refresh (2026-10-07, commit 1cb6305):** Ribbon 3D-tilt hero art
  (`public/images/eternyx-ribbon.png`) + new Overview section, restyled login/
  board/globals. `ship-web.sh` now ships `public/` (standalone server does NOT
  bundle it — without this the hero 404s). Phone-side health check
  `deploy/termux/verify-web.cjs` (login → overview, asserts fresh live
  snapshot; lives at `~/eternyx-web/verify-web.cjs`). Verified live on phone:
  home 200, ribbon image 200, snapshot 14 s old, queue 0.
- Access flow: login key (`DASHBOARD_ACCESS_KEY`, user-fixed value, phone-only)
  → httpOnly cookie → proxy.js gates /dashboard + /api/overview + /api/setup.

## 11. Deployment & ops

- **Phone access (working):** `adb forward tcp:8022 tcp:8022` (adb at
  `%LOCALAPPDATA%\platform-tools-tmp\platform-tools\adb.exe`, serial
  005302500508) then `ssh -i ~/.ssh/eternyx_phone -p 8022 **127.0.0.1**`.
- **Bot update:** tar+scp **`src/` AND `assets/`** (the brand image lives in
  assets/) → extract into `~/eternyx-bot` → `SVDIR=$PREFIX/var/service sv restart bot`.
  New commands also need `npm run deploy-commands` ON THE PHONE.
- **Web update:** build on PC (`npm run build`) → stage
  `.next/standalone/*` + `.next/static` → tar+scp → extract to `~/eternyx-web`
  → `sv restart web`. Scripts: `deploy/termux/ship-web.sh` /
  `deploy/termux/setup-web.sh` (runit services bot/web/tunnel, boot hook,
  nightly backup).
- **Public URL:** `grep -o 'https://[^ ]*trycloudflare.com' ~/eternyx-web/tunnel.log | tail -1`
  (rotates on tunnel restart; the bot always uses 127.0.0.1:3000).
- **Local bring-online, no PC (2026-10-06, commit 6999ae6):**
  `sh ~/start-eternyx.sh` — canonical starter, installed by setup.sh and
  refreshed by setup-web.sh. Does wake-lock → runsvdir self-heal → sshd →
  `sv up` bot/web/tunnel/crond → 10 s settle → verifies (sv status, bot-log
  tail, snapshot freshness <180 s, local web HTTP 200, tunnel URL) and prints
  next steps. Verified live 2026-10-06: supervisor self-heal fired correctly
  in a fresh context, all services run, snapshot 55 s old, web 200, tunnel URL
  printed. Boot hook `~/.termux/boot/start-services.sh` is now a 3-line
  delegate to the starter (boot context is fragile; all logic lives in the
  starter). One-tap widget button at `~/.shortcuts/eternyx-online.sh` (lights
  up if the Termux:Widget app is installed).
- **Usage panel:** `sh ~/eternyx-bot/deploy/termux/panel.sh` (--once flag).
- Repo history is PC-only; the phone has no git — syncs are tar/scp.

## 12. Gotchas — NEVER relearn

**Termux/phone:** SSH needs 127.0.0.1 not localhost (IPv6 quirk) · `/tmp` does
not exist (use $HOME) · no `which` (use `command -v`) · avoid nested quotes in
ssh one-liners — ship a .sh and run it · `sv` needs explicit
`SVDIR=$PREFIX/var/service` (boot/SSH skip profile.d) · `termux-wake-lock` must
never be exec'd in runit run scripts · runit sshd service fails — use plain
daemon; boot script self-heals runsvdir · `input text` eats `%s`; screen off
blocks adb input · `termux-battery-status` hangs without Termux:API (guard with
`timeout 3`) · cronie needed for crond · transient DNS ENOTFOUND for discord.com
happens; runit retry self-heals (bot snapshots keep flowing — HTTP to 127.0.0.1
doesn't need DNS).

**Next.js 16:** `middleware.js` renamed to `proxy.js` + `export function proxy`
— a proxy.js exporting `middleware` is silently inert and auth gating vanishes
with NO error · never gate on `process.platform` in server code — the bundler
folds it to the BUILD machine's OS (win32 shipped; /proc read is the real Linux
check) · @vercel/blob: `get` needs `{access:'public'}` + `res.stream`; reads
need `useCache:false` (CDN serves stale queue → commands never execute); writes
need `addRandomSuffix:false` + `allowOverwrite:true` (otherwise thousands of
orphan blobs) + `cacheControlMaxAge:60` · never `vercel --prod` from dashboard/
(root-directory guard).

**discord.js:** AutoMod alert action metadata wants `channel` (resolvable), NOT
`channelId` — wrong key → `metadata.channel_id[BASE_TYPE_REQUIRED]` · one rule
per trigger type (preset 4, spam 5) → make creates idempotent (find by name,
edit in place) · role pings require the role be `mentionable` · member cache is
online-only → throttle `members.fetch()` for pickers · 50035: required options
first · **message events need the GuildMessages intent — MessageContent alone
delivers nothing (handlers were silently dead until GuildMessages was added);
self-deletes never appear in the audit log (no attribution possible), and
audit entries can lag a couple of seconds (resolveDeleter retries).**

**Misc:** Vercel 402 account-wide disable (2026-10-03) took all 7 projects down
— phone hosting is now canonical and needs no Vercel; if Vercel returns, delete
orphan blobs manually in the Storage tab. Mimosa PreToolUse hook false-positives
on interaction→storage dataflow — count/wrap at load time (local modules only).

## 13. Outstanding items

1. **Rotate secrets** — bot token + dashboard keys were pasted in plaintext
   chat historically. Rotate via portal → edit phone `.env` → `sv restart bot`.
   Phone `DASHBOARD_ACCESS_KEY` is user-fixed now (do not rotate without asking).
2. **MIUI Autostart for Termux:Boot** still NOT enabled by the user (Security
   app → Autostart) — real reboots won't auto-start Termux until done. Until
   then the drill is one command, no PC: open Termux → `sh ~/start-eternyx.sh`
   (or tap the widget button). Boot hook already delegates to the starter, so
   enabling Autostart later makes reboots fully zero-touch with no other change.
3. Full Mimosa deep scan never completed (library-source limits) — do not claim
   "security-certified".
4. Vercel account still disabled; dashboard lives on the phone tunnel.

## 14. Why / How to apply

**Why:** the SSH/adb workflow, guard semantics, and gotchas above recur every
session; hosting is stable by user decree (phone always online, ample
resources) — never engineer for disconnects or add keepalives.
**How to apply:** remote ops = the ssh command in §9; updates = tar+scp +
`sv restart`; keep the slash-only, embed-only, fail-closed disciplines; never
introduce prefix commands, servers, or committed secrets; update this file when
verified facts change.
