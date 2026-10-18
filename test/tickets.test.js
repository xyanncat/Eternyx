import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb, createTicketRow, getTicketByChannel, closeTicketRow } from '../src/storage/db.js';

beforeEach(() => {
  closeDb();
  initDb(':memory:');
});

test('tickets create, find by channel, and close exactly once', () => {
  const row = createTicketRow({ guildId: 'g', number: 1, openerId: 'u', channelId: 'c1', subject: 'need help' });
  assert.equal(row.number, 1);
  assert.equal(row.status, 'OPEN');
  const found = getTicketByChannel('c1');
  assert.equal(found.id, row.id);
  assert.equal(found.subject, 'need help');
  assert.equal(closeTicketRow(row.id), undefined);
  assert.equal(getTicketByChannel('c1'), null, 'closed tickets are not returned');
  closeTicketRow(row.id); // double-close is a no-op, never throws
  assert.ok(true);
});

test('multiple tickets in one channel resolve to the newest open one', () => {
  createTicketRow({ guildId: 'g', number: 1, openerId: 'u', channelId: 'c2', subject: 'a' });
  const second = createTicketRow({ guildId: 'g', number: 2, openerId: 'u', channelId: 'c2', subject: 'b' });
  assert.equal(getTicketByChannel('c2').id, second.id);
});
