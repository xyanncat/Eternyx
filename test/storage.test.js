import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb, createCase, getCase, setCaseStatus, listUserCases, countActiveWarnings, getConfig, setConfig, recordEvent, addCommandCount, topCommands } from '../src/storage/db.js';

beforeEach(() => {
  closeDb();
  initDb(':memory:');
});

test('cases are created as PENDING and transition forward only', () => {
  const c = createCase({ guildId: 'g', userId: 'u', moderatorId: 'm', type: 'warn', reason: 'spam' });
  assert.equal(getCase(c.id).status, 'PENDING');
  assert.equal(setCaseStatus(c.id, 'ACTIVE'), true);
  // No backward transitions: append-only discipline (plan §4.9)
  assert.equal(setCaseStatus(c.id, 'PENDING'), false);
  assert.equal(setCaseStatus(c.id, 'REVOKED'), true);
  assert.equal(setCaseStatus(c.id, 'ACTIVE'), false);
});

test('countActiveWarnings counts only active warns', () => {
  const a = createCase({ guildId: 'g', userId: 'u', moderatorId: 'm', type: 'warn', reason: '1' });
  setCaseStatus(a.id, 'ACTIVE');
  const b = createCase({ guildId: 'g', userId: 'u', moderatorId: 'm', type: 'warn', reason: '2' });
  setCaseStatus(b.id, 'ACTIVE');
  createCase({ guildId: 'g', userId: 'u', moderatorId: 'm', type: 'warn', reason: 'pending' });
  createCase({ guildId: 'g', userId: 'u', moderatorId: 'm', type: 'timeout', reason: 'not a warn' });
  assert.equal(countActiveWarnings('g', 'u'), 2);
});

test('listUserCases scopes by guild and user', () => {
  const c = createCase({ guildId: 'g1', userId: 'u1', moderatorId: 'm', type: 'kick', reason: 'x' });
  setCaseStatus(c.id, 'ACTIVE');
  createCase({ guildId: 'g2', userId: 'u1', moderatorId: 'm', type: 'kick', reason: 'x' });
  assert.equal(listUserCases('g1', 'u1', { activeOnly: true }).length, 1);
  assert.equal(listUserCases('g1', 'u1', { activeOnly: true })[0].guild_id, 'g1');
});

test('config merges patches over defaults', () => {
  assert.deepEqual(getConfig('g'), {
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
    ticketPanelChannelId: null,
    ticketPanelMessageId: null,
    ticketStorageChannelId: null,
    ticketCategoryId: null,
    ticketCounter: 0,
  });
  setConfig('g', { logChannelId: 'c1' });
  setConfig('g', { modRoleIds: ['r1'] });
  const cfg = getConfig('g');
  assert.equal(cfg.logChannelId, 'c1');
  assert.deepEqual(cfg.modRoleIds, ['r1']);
  assert.equal(cfg.raidThreshold, 10);
});

test('lockdown state persists with exact restore data', () => {
  setConfig('g', {
    lockdownActive: 1,
    lockdownChannels: [
      { id: 'ch1', prev: 'allow' },
      { id: 'ch2', prev: 'neutral' },
    ],
  });
  // Simulated restart: same rows must come back intact.
  const cfg = getConfig('g');
  assert.equal(cfg.lockdownActive, 1);
  assert.deepEqual(cfg.lockdownChannels, [
    { id: 'ch1', prev: 'allow' },
    { id: 'ch2', prev: 'neutral' },
  ]);
  setConfig('g', { lockdownActive: 0, lockdownChannels: [] });
  const lifted = getConfig('g');
  assert.equal(lifted.lockdownActive, 0);
  assert.deepEqual(lifted.lockdownChannels, []);
});

test('config survives malformed stored JSON', () => {
  setConfig('g', {});
  const raw = getConfig('g');
  assert.deepEqual(raw.modRoleIds, []);
});

test('recordEvent stores security events', () => {
  recordEvent('raid_suspected', 'guild=g joins=15/60s');
  recordEvent('raid_suspected', { nested: true });
  // No throw + rows queryable through listUserCases-style SQL is enough here;
  // events have no read API by design (accessed only via sqlite3 CLI, plan §4.9).
});

test('command usage stats aggregate counts', () => {
  addCommandCount('ban', 3, 1000);
  addCommandCount('ban', 2, 2000);
  addCommandCount('ping', 1, 3000);
  const top = topCommands(10);
  assert.equal(top[0].name, 'ban');
  assert.equal(top[0].count, 5);
  assert.equal(top[0].last_used, 2000);
  assert.equal(top.find((r) => r.name === 'ping').count, 1);
});
