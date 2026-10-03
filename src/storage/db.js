// Storage layer — node:sqlite (stdlib, no native dep: compiles nowhere, works on Termux ARM64).
// `cases` is append-only: corrections create linked cases, nothing is ever deleted (plan §4.9).
// Every statement — schema, backup paths included — goes through bound parameters;
// no SQL text is ever assembled from variables.
import { DatabaseSync } from 'node:sqlite';

let db = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    type TEXT NOT NULL,
    reason TEXT NOT NULL,
    duration INTEGER,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
  )`,
  'CREATE INDEX IF NOT EXISTS idx_cases_user ON cases(guild_id, user_id)',
  `CREATE TABLE IF NOT EXISTS config (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    mod_role_ids TEXT NOT NULL DEFAULT '[]',
    owner_ids TEXT NOT NULL DEFAULT '[]',
    raid_threshold INTEGER NOT NULL DEFAULT 10,
    nuke_auto_action INTEGER NOT NULL DEFAULT 0,
    control_panel_channel_id TEXT,
    control_panel_message_id TEXT,
    lockdown_active INTEGER NOT NULL DEFAULT 0,
    lockdown_channels TEXT NOT NULL DEFAULT '[]',
    auto_role_user_id TEXT,
    auto_role_bot_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS command_stats (
    name TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    last_used INTEGER NOT NULL DEFAULT 0
  )`,
];

export function initDb(dbPath) {
  db = new DatabaseSync(dbPath);
  db.prepare('PRAGMA journal_mode = WAL').get();
  for (const statement of SCHEMA) db.prepare(statement).run();
  migrate();
  return db;
}

// Additive migrations for databases created before a column existed.
// Column names/types are compile-time constants — never built from input.
function migrate() {
  const cols = new Set(db.prepare('PRAGMA table_info(config)').all().map((r) => r.name));
  const ADDITIONS = [
    ['control_panel_channel_id', 'TEXT'],
    ['control_panel_message_id', 'TEXT'],
    ['lockdown_active', 'INTEGER NOT NULL DEFAULT 0'],
    ['lockdown_channels', "TEXT NOT NULL DEFAULT '[]'"],
    ['auto_role_user_id', 'TEXT'],
    ['auto_role_bot_id', 'TEXT'],
  ];
  for (const [name, type] of ADDITIONS) {
    if (!cols.has(name)) db.prepare(`ALTER TABLE config ADD COLUMN ${name} ${type}`).run();
  }
}

export function closeDb() {
  db?.close();
  db = null;
}

/* ---------- cases (append-only) ---------- */

const ALLOWED_TRANSITIONS = { PENDING: new Set(['ACTIVE', 'REVOKED']), ACTIVE: new Set(['REVOKED']) };

export function createCase({ guildId, userId, moderatorId, type, reason, duration = null }) {
  const created = Date.now();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO cases (guild_id, user_id, moderator_id, type, reason, duration, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`
    )
    .run(guildId, userId, moderatorId, type, reason, duration, created);
  return {
    id: Number(lastInsertRowid),
    guild_id: guildId,
    user_id: userId,
    moderator_id: moderatorId,
    type,
    reason,
    duration,
    created_at: created,
    status: 'PENDING',
  };
}

export function setCaseStatus(id, status) {
  const row = getCase(id);
  if (!row) return false;
  if (!ALLOWED_TRANSITIONS[row.status]?.has(status)) return false;
  db.prepare('UPDATE cases SET status = ? WHERE id = ?').run(status, id);
  return true;
}

export function getCase(id) {
  return db.prepare('SELECT * FROM cases WHERE id = ?').get(id) ?? null;
}

export function listUserCases(guildId, userId, { activeOnly = false, limit = 10 } = {}) {
  const sql = `SELECT * FROM cases WHERE guild_id = ? AND user_id = ? ${
    activeOnly ? "AND status = 'ACTIVE'" : ''
  } ORDER BY id DESC LIMIT ?`;
  return db.prepare(sql).all(guildId, userId, limit);
}

export function countActiveWarnings(guildId, userId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM cases WHERE guild_id = ? AND user_id = ? AND type = 'warn' AND status = 'ACTIVE'")
    .get(guildId, userId).n;
}

/* ---------- per-guild config ---------- */

const DEFAULTS = {
  logChannelId: null,
  modRoleIds: [],
  ownerIds: [],
  raidThreshold: 10,
  nukeAutoAction: 0,
  controlPanelChannelId: null,
  controlPanelMessageId: null,
  lockdownActive: 0,
  lockdownChannels: [],
  autoRoleUserId: null,
  autoRoleBotId: null,
};

function parseJsonArray(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function getConfig(guildId) {
  const row = db.prepare('SELECT * FROM config WHERE guild_id = ?').get(guildId);
  if (!row) return { ...DEFAULTS };
  return {
    logChannelId: row.log_channel_id,
    modRoleIds: parseJsonArray(row.mod_role_ids),
    ownerIds: parseJsonArray(row.owner_ids),
    raidThreshold: row.raid_threshold,
    nukeAutoAction: row.nuke_auto_action,
    controlPanelChannelId: row.control_panel_channel_id ?? null,
    controlPanelMessageId: row.control_panel_message_id ?? null,
    lockdownActive: row.lockdown_active ?? 0,
    lockdownChannels: parseJsonArray(row.lockdown_channels ?? '[]'),
    autoRoleUserId: row.auto_role_user_id ?? null,
    autoRoleBotId: row.auto_role_bot_id ?? null,
  };
}

export function setConfig(guildId, patch) {
  const merged = { ...getConfig(guildId), ...patch };
  db.prepare(
    `INSERT OR REPLACE INTO config (guild_id, log_channel_id, mod_role_ids, owner_ids, raid_threshold, nuke_auto_action,
       control_panel_channel_id, control_panel_message_id, lockdown_active, lockdown_channels,
       auto_role_user_id, auto_role_bot_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    guildId,
    merged.logChannelId,
    JSON.stringify(merged.modRoleIds),
    JSON.stringify(merged.ownerIds),
    merged.raidThreshold,
    merged.nukeAutoAction,
    merged.controlPanelChannelId,
    merged.controlPanelMessageId,
    merged.lockdownActive,
    JSON.stringify(merged.lockdownChannels),
    merged.autoRoleUserId,
    merged.autoRoleBotId
  );
  return merged;
}

/* ---------- security event log ---------- */

export function recordEvent(kind, detail) {
  db.prepare('INSERT INTO events (kind, detail, created_at) VALUES (?, ?, ?)').run(
    kind,
    String(detail).slice(0, 4000),
    Date.now()
  );
}

/* ---------- command usage stats (drives the phone panel) ---------- */

export function addCommandCount(name, count, lastUsed) {
  db.prepare(
    `INSERT INTO command_stats (name, count, last_used) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET count = count + ?, last_used = ?`
  ).run(name, count, lastUsed, count, lastUsed);
}

export function topCommands(limit = 10) {
  return db
    .prepare('SELECT name, count, last_used FROM command_stats ORDER BY count DESC LIMIT ?')
    .all(limit);
}

export function recentCases(limit = 20) {
  return db
    .prepare('SELECT id, user_id, moderator_id, type, reason, status, created_at FROM cases ORDER BY id DESC LIMIT ?')
    .all(limit);
}

export function recentEvents(limit = 20) {
  return db
    .prepare('SELECT kind, detail, created_at FROM events ORDER BY id DESC LIMIT ?')
    .all(limit);
}

/* ---------- backup ---------- */

export function backupTo(filePath) {
  // Bound parameter — the path never becomes part of the SQL text.
  db.prepare('VACUUM INTO ?').run(filePath);
}
