# Eternyx Moderation Bot — Design & Deployment Plan

Status: implemented & live (bot + Vercel setup board deployed 2026-09-30; see MEMORY.md).
Target host: secondary smartphone (Xiaomi, MIUI) via Termux
Hard requirements: **all interactions are slash commands** · **every response is an embed** · security-first

---

## 1. Goals & Constraints

| Goal | Implication |
|---|---|
| Very secure moderation | Least privilege, double authorization checks, full audit trail, anti-tamper alerts |
| Keeps itself safe | No inbound ports, watchdog auto-restart, tamper alerts, token hygiene, fail-closed logic |
| Runs on a phone | Low RAM footprint (<200 MB), no external DB daemon, no native compile pain, survives MIUI battery killer |
| Slash commands only | No prefix fallback, guild-scoped registration for instant updates during dev |
| Embed-only responses | One shared embed builder; success, error, and ephemeral acks all use it |

Non-goals: web dashboard, multi-server sharding, paid services. One guild (the dev server), one process.

---

## 2. Stack (decisions + why)

| Layer | Choice | Why (lazy-but-correct) |
|---|---|---|
| Runtime | Node.js LTS + **discord.js v14** | Native slash commands & intents, lowest-friction moderation API (timeouts, audit log), runs cleanly on ARM64 Termux, ~80–150 MB RSS |
| Storage | **SQLite via `node:sqlite` (stdlib)** | File-based, zero daemon, no native compile on Termux ARM64 |
| Secrets | `.env` via dotenv | Nothing in code, nothing in git |
| Content filtering | **Discord native AutoMod** (managed by the bot via API) | Don't reimplement keyword/invite/mention spam scanning on a phone — Discord does it for free at gateway level; bot only manages rules and logs escalation events |
| Join-raid / anti-nuke | Bot-side (own logic) | Not covered by native AutoMod |
| Process supervision | **termux-services (runit)** | Auto-restart on crash, starts on boot via Termux:Boot |
| Telemetry (optional) | Termux:API | Battery/temp for a `/botstatus` embed |

Rejected alternatives: Python/discord.py (fine, but d.js is the richer choice for guild moderation primitives), UserLAnd/proot Linux (heavier, more failure modes), any DB server (needs supervision ×2 and more RAM).

---

## 3. Architecture

```
                Xiaomi phone (Termux, app-private storage)
  ┌──────────────────────────────────────────────────────────┐
  │  Termux:Boot → termux-services (runit) → node index.js   │
  │                                                          │
  │  ┌───────────── Discord.js Client (outbound WSS only) ─┐ │
  │  │  events/        interactionCreate, guildMemberAdd,  │ │
  │  │                 messageDelete, guildBanAdd,         │ │
  │  │                 guildMemberRemove, roleUpdate…      │ │
  │  │  commands/      moderation/ info/ config/ system/   │ │
  │  │  lib/           embeds · perms · cases · audit      │ │
  │  │  engines/       raidGuard · nukeGuard · selfGuard   │ │
  │  │  storage/       node:sqlite (cases, config, log) │ │
  │  └──────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────┘
                    │ outbound HTTPS/WSS only — no inbound ports
                    ▼
              Discord Gateway + REST
```

One process, event-driven, no HTTP server, no open listening sockets — a phone is a bad inbound host, so the design never needs one.

---

## 4. Security Design (the core of this bot)

### 4.1 Credentials
- Token only in `.env` (Termux home, `chmod 700`), `.env` and `data/` in `.gitignore` from commit #1.
- Bot application: **public invite disabled** (only you can add it), MFA on the owning account.
- If the phone is lost/stolen: regenerate the token from the dev portal — nothing on the device is trusted.
- Crash logs must never dump env vars; the supervisor logs to a rotating file that excludes secrets.

### 4.2 Least privilege (bot role in Discord)
Request only: `Kick`, `Ban`, `ModerateMembers` (timeouts), `ManageMessages`, `ManageChannels` (lock/slowmode), `ManageGuild` (native AutoMod rules), `ViewAuditLog`, `ViewChannel`, `SendMessages`, `EmbedLinks`, `ReadMessageHistory`, `AttachFiles`.
Deliberately **not requested**: `Administrator`, `ManageRoles`, `ManageWebhooks`, `ManageServer`. Timeout-based muting means the bot never needs role management — an attacker who takes the bot can't rewrite the role hierarchy.

### 4.3 Privileged intents
- `GuildMembers` (join-raid detection) and `MessageContent` (only where we read message context for case reasons/logs) — enabled in the dev portal, justified there.
- Everything else non-privileged. No `Presences`.

### 4.4 Double authorization (Discord-level + app-level)
1. Slash commands declare `setDefaultMemberPermissions(...)` so Discord hides them from non-mods.
2. The app **re-checks on every interaction** against the configurable mod-role list from `config` — because in-server permission edits don't propagate to already-registered commands.
3. Owner-only commands (`/config`, `/lockdown`, `/dbbackup`) additionally verify a hardcoded owner ID list in `.env`.

### 4.5 Target safety (every mod action)
Refuse — with a red embed, no exception — when the target is: the bot itself, the command invoker, a server owner, a user with a role **equal or above the bot's highest role**, or (unless invoker outranks them) a fellow moderator. Check `guild.members.me.roles.highest` vs target every time; never trust cached hierarchy.

### 4.6 Input validation
- All user IDs validated as Discord snowflakes (`/^\d{17,20}$/`) before any API call.
- Reasons: trimmed, capped at 512 chars, defaulted to "No reason provided" (Discord requires one for audit log parity).
- `duration` via slash-command string options mapped to an allowlist (60s/5m/10m/1h/1d/1w) — never parsed free-form.
- No `eval`, no dynamic `require`, no shell-outs to user input. The only shell use is read-only `termux-battery-status`.

### 4.7 Anti-abuse of the bot itself
- Per-user cooldowns (in-memory Map, 3s default; 30s on `/lockdown`).
- Hard caps per command (e.g. `/clear max 100 messages`, ban batch ≤ 10) so a hijacked mod account can't nuke at API speed.
- Every write command is case-logged **before** the Discord API call executes (write-ahead), so even a crash mid-action leaves a trail.

### 4.8 Self-protection / anti-tamper (`selfGuard`)
- Watch `roleUpdate` / `guildUpdate`: if the bot's own role permissions are edited, or the bot loses a core permission → instant embed alert to owner DM + log channel.
- Watch `guildMemberUpdate`: if the **bot's** roles are changed → alert.
- Watch audit-log entries targeting the bot → alert.
- On gateway invalidation/reconnect storms (5 in 10 min) → assume token compromise, alert owner, keep retrying with backoff, never exit.
- The bot never self-reports its token, config, or DB contents through any command; `/botinfo` exposes uptime/memory/battery only.

### 4.9 Data security
- SQLite lives in Termux app-private storage (unreadable to other apps; Android FDE protects at rest). Phone itself must have a strong screen lock.
- `cases` table is append-only in code — no command can edit/delete old cases; corrections create linked cases.
- Daily DB backup (`sqlite3 .backup`) to `~/backups/`, 7-day rotation, run from the service script.

### 4.10 Dependency & supply chain
- `package-lock.json` committed; deps pinned to exact versions.
- `npm audit` before every deploy; runtime deps are `discord.js` + `dotenv` only (storage is `node:sqlite` stdlib).
- Updates are manual: pull, `npm ci`, restart via `sv restart bot`.

### 4.11 Failure policy — fail closed
Ambiguous permission check → deny with error embed. DB write fails → deny action, alert. Discord API error → report in embed with case marked `PENDING`, never silently succeed.

---

## 5. Feature Set & Slash Commands

All responses embeds (see §6). All guild-only (`setContexts(Guild)`).

### Moderation
| Command | Args | Default perm | Effect |
|---|---|---|---|
| `/ban` | user, reason, delete-days (0–7), dm-notify | Ban | Case + audit log + optional DM embed |
| `/softban` | user, reason | Ban | Ban + immediate unban (message purge) |
| `/unban` | user-id, reason | Ban | Case |
| `/kick` | user, reason | Kick | Case |
| `/timeout` | user, duration-preset, reason | ModerateMembers | Case |
| `/untimeout` | user, reason | ModerateMembers | Case |
| `/warn` | user, reason | ModerateMembers | Case; auto-escalation thresholds (3→timeout, 6→kick suggestion) |
| `/warnings` | user | Mod | Embed list of active cases |
| `/case view` / `case` | id | Mod | Single case embed |
| `/clear` | count (≤100), user?, channel | ManageMessages | Bulk delete + summary embed |
| `/slowmode` | seconds (≤21600) | ManageChannels | Channel slowmode |
| `/lock` / `/unlock` | channel?, reason | ManageChannels | Deny `SendMessages` via permission overwrite |

### Info & system
| Command | Notes |
|---|---|
| `/userinfo`, `/serverinfo`, `/avatar` | Read-only embeds |
| `/botstatus` | Uptime, RSS, ping, battery (Termux:API), last restart reason |
| `/help` | Self-describing command list embed |
| `/config set log-channel`, `config set mod-role`, `config show` | Owner-only |
| `/automod rule add/remove` | Manages **native** AutoMod rules (keyword, invite-link, mention-spam) |
| `/lockdown on/off` | Owner-only; locks all public channels at once (raid response) |
| `/dbbackup` | Owner-only; immediate backup + confirmation embed |

### Automatic behaviors (no commands)
- **raidGuard**: join burst (>10 joins/min) → auto-enable join gate + alert embed; `/lockdown` for full response.
- **nukeGuard**: >5 bans or >3 channel deletions in 60 s by one actor → alert owner DM + log channel + (optional, default **off**) auto-timeout of the actor. Alerting is default; auto-retaliation is opt-in because a false positive against an admin is worse than 30 lost seconds.
- **welcome/leave**: minimal embeds, off by default.

---

## 6. Embed Response Standard

One builder in `lib/embeds.js`; nothing else constructs embeds.

```js
embed({
  kind: 'success' | 'action' | 'error' | 'warn' | 'info',
  title, description,
  moderator, target, caseId,   // feeds the standard footer/fields
  fields?, ephemeral?          // errors & acks default ephemeral:true
})
```

- Palette: success `#2ECC71` · action `#E67E22` · error `#E74C3C` · warn `#F1C40F` · info `#5865F2`.
- Footer on every moderation embed: `Case #123 · by @mod · Eternyx`. Timestamp on every embed.
- Interaction acks: `deferReply({ ephemeral: true })` for slow actions; final reply always an embed — **no bare strings anywhere, including error paths**.
- Respect embed limits (25 fields / 1024 chars per field / 4096 description) in the builder, not per-command.

---

## 7. Data Model (SQLite)

```sql
CREATE TABLE cases (           -- append-only
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  type TEXT NOT NULL,          -- ban|kick|timeout|warn|unban|lock|clear|note
  reason TEXT NOT NULL,
  duration INTEGER,            -- seconds, nullable
  created_at INTEGER NOT NULL, -- unix ms
  status TEXT DEFAULT 'ACTIVE' -- ACTIVE|REVOKED|PENDING
);
CREATE INDEX idx_cases_user ON cases(guild_id, user_id);

CREATE TABLE config (
  guild_id TEXT PRIMARY KEY,
  log_channel_id TEXT,
  mod_role_ids TEXT,           -- JSON array
  owner_ids TEXT,              -- JSON array
  raid_threshold INTEGER DEFAULT 10,
  nuke_auto_action INTEGER DEFAULT 0
);

CREATE TABLE events (          -- security log: tamper alerts, raid/nuke events
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## 8. Project Layout

```
eternyx-bot/
├─ .env                  # DISCORD_TOKEN=, OWNER_IDS=   (gitignored)
├─ .gitignore            # .env, data/, backups/, logs/
├─ package.json          # exact-pinned deps
├─ src/
│  ├─ index.js           # bootstrap, login, graceful shutdown
│  ├─ deploy-commands.js # registers slash commands (guild-scoped)
│  ├─ commands/          # moderation/ info/ config/ system/
│  ├─ events/            # interactionCreate, guildMemberAdd, ...
│  ├─ engines/           # raidGuard.js nukeGuard.js selfGuard.js
│  └─ lib/               # embeds.js perms.js cases.js audit.js validate.js
└─ data/                 # eternyx.db (gitignored)
```

---

## 9. Phone Hosting Runbook (Xiaomi / MIUI)

### 9.1 One-time setup
1. Install **Termux from F-Droid or GitHub** (the Play Store build is dead — don't use it). Install the **Termux:Boot** and **Termux:API** companion apps from F-Droid.
2. `pkg update && pkg install nodejs-lts git termux-services termux-api`
3. Clone/copy the repo to `~/eternyx-bot`, `npm ci`, create `.env`.
4. MIUI settings (the part that actually kills bots):
   - Settings → Apps → Termux → **Battery saver: No restrictions**; **Autostart: ON**.
   - Recents screen: long-press Termux card → **lock** (pin it).
   - Security app → Boost speed → exclude Termux from acceleration/cleanup.
   - Wi-Fi → Advanced → keep Wi-Fi on during sleep; disable "optimize for battery" on the network.
   - Developer options: keep phone awake **not** needed (wake lock suffices), but verify MIUI's "Memory extension" isn't thrashing.
5. Physical: dedicated charger, decent ventilation, screen off is fine.

### 9.2 Service definition (auto-restart + boot)
`$PREFIX/var/service/bot/run` (termux-services picks it up, restarts on crash, `sv up/down/restart bot` to control):

```sh
#!/data/data/com.termux/files/usr/bin/sh
cd /data/data/com.termux/files/home/eternyx-bot
# wake-lock is a separate statement — NEVER `exec termux-wake-lock ...`
# (it ignores args and exits, so node would never start).
termux-wake-lock >/dev/null 2>&1 || true
exec node --max-old-space-size=256 src/index.js 2>> logs/err.log
```

`~/.termux/boot/start-services.sh`:
```sh
#!/data/data/com.termux/files/usr/bin/sh
# SVDIR is not exported in every boot context — set it explicitly.
export SVDIR="/data/data/com.termux/files/usr/var/service"
termux-wake-lock
# runsvdir may not be running yet in the boot context — ensure it is.
pgrep -x runsvdir >/dev/null 2>&1 || setsid runsvdir "$SVDIR" >/dev/null 2>&1 &
sleep 2
sv up bot
# The runit sshd service (sshd -D -e) fails on this phone — start the daemon directly.
pgrep -x sshd >/dev/null 2>&1 || sshd
```

### 9.3 Daily ops
- Health check: `/botstatus` from Discord — battery %, temp, uptime, RSS, last restart.
- Backups: nightly `sqlite3 data/eternyx.db ".backup backups/$(date +%F).db"` in the service script + 7-day retention.
- Token rotation drill: regenerate in dev portal, edit `.env`, `sv restart bot` — rehearse once so a lost phone is a 2-minute incident.
- Known MIUI gotcha: an MIUI update or aggressive cleanup can kill Termux — if `/botstatus` ping fails, check the phone; boot autostart recovers after reboot.

---

## 10. Build Phases

| Phase | Deliverable | Acceptance |
|---|---|---|
| 0. Foundations | Dev portal app, intents enabled, bot invited with §4.2 perms only, repo skeleton + `.gitignore` | Bot online, `/ping` replies with embed |
| 1. Command framework | Guild-scoped registration, `interactionCreate` router, `lib/embeds.js`, cooldowns, perm double-check | Every command errors/embeds correctly for non-mods |
| 2. Cases + mod core | SQLite layer, `/ban /kick /timeout /warn /warnings /case /clear`, audit channel embeds, write-ahead case log | Every action produces case + channel embed; hierarchy refusals verified |
| 3. Config & info | `/config`, `/userinfo`, `/serverinfo`, `/botstatus`, `/help` | Owner-gated config enforced |
| 4. Guards | raidGuard, nukeGuard, selfGuard, `/lockdown`, native-AutoMod management via `/automod` | Simulated join raid + role tamper trigger correct alerts |
| 5. Hardening & review | Dependency pin, `npm audit`, `coderabbit review --agent` on the full diff, strix security-skill pass over auth/permission surfaces (§4.3–4.7 especially), failure-path tests | Review findings triaged; fail-closed verified |
| 6. Deploy | Termux provisioning per §9, service installed, backup cron, token-rotation drill | Survives phone reboot; `/botstatus` green after reboot |

Security-relevant code review focus (per the standing toolchain): the permission double-check, hierarchy checks, input validation, and anything touching `.env`/DB paths get strix-skill scrutiny, not just style review.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| MIUI kills the process | No-restrictions battery + autostart + pinned recents + runit auto-restart; alert on missed heartbeat |
| Phone lost → token theft | Device encryption + screen lock; rehearsed token rotation (§9.3) |
| Mod account hijack | Hard caps, cooldowns, write-ahead cases, owner-gated lockdown — damage is bounded and traced |
| False nukeGuard trigger | Auto-retaliation opt-in (default alert-only), all events logged |
| Node < 22.5 without `node:sqlite` | Engine requires Node ≥ 22.5; Termux installs `nodejs-lts` per deploy script |
| Battery degradation from 24/7 charging | Acceptable on a secondary device; heat management in §9.1 |

---

*Implementation follows the standing quality workflow: ponytail restraint while coding, `coderabbit review --agent` before commits, strix skills on security-relevant surfaces.*
