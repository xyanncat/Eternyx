import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panelButtons } from '../src/lib/panel.js';
import { ticketPanelButtons, TICKET_CATEGORIES } from '../src/lib/tickets.js';

test('control deck exposes every stateless command as a button', () => {
  const rows = panelButtons();
  const ids = rows.flatMap((row) => row.toJSON().components.map((b) => b.custom_id));
  for (const expected of [
    'panel:lockdown:on',
    'panel:lockdown:off',
    'panel:status',
    'panel:alert',
    'panel:shield',
    'panel:presets',
    'panel:guard',
    'panel:refresh',
  ]) {
    assert.ok(ids.includes(expected), `missing ${expected}`);
  }
  // Discord hard limits: 5 buttons per row, 5 rows per message.
  for (const row of rows) assert.ok(row.toJSON().components.length <= 5);
  assert.ok(rows.length <= 5);
});

test('ticket panel has one kafka-themed button per category', () => {
  const row = ticketPanelButtons().toJSON();
  assert.equal(row.components.length, Object.keys(TICKET_CATEGORIES).length);
  for (const [key, cat] of Object.entries(TICKET_CATEGORIES)) {
    const btn = row.components.find((b) => b.custom_id === `ticket:open:${key}`);
    assert.ok(btn, `missing ${key}`);
    assert.equal(btn.label, cat.label);
  }
});
