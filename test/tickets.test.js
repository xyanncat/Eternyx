import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb, createTicketRow, getTicketByChannel, closeTicketRow } from '../src/storage/db.js';
import { ticketChannelName, ticketWelcomeButtons, ticketWelcomeContainer } from '../src/lib/tickets.js';

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

test('ticket channel names use the user name + ticket type', () => {
  assert.equal(ticketChannelName('support', 'Cattrix.ez'), 'support-cattrix-ez');
  assert.equal(ticketChannelName('report', 'Weird Name!! 99'), 'report-weird-name-99');
  assert.equal(ticketChannelName('bogus', 'ok_user'), 'other-ok-user'); // unknown type falls back
  assert.ok(ticketChannelName('appeal', 'x'.repeat(80)).length <= 100);
});

test('welcome card carries claim + transcript + close INSIDE the container', () => {
  const row = createTicketRow({ guildId: 'g', number: 7, openerId: 'u', channelId: 'c9', subject: 'test', category: 'report' });
  const json = ticketWelcomeContainer(row).toJSON();
  assert.equal(json.type, 17, 'container card');
  const inner = json.components.map((c) => c.type);
  assert.ok(inner.includes(10), 'text display inside');
  assert.ok(inner.includes(12), 'banner gallery inside');
  const rows = json.components.filter((c) => c.type === 1);
  assert.equal(rows.length, 1, 'button row inside the container');
  const labels = rows[0].components.map((b) => b.label);
  assert.deepEqual(labels, ['Close', 'Claim', 'Transcript']);
  assert.equal(ticketWelcomeButtons().toJSON().components.length, 3);
});
