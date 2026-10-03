import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEditEmbed, buildDeleteEmbed, buildBulkDeleteEmbed } from '../src/lib/messageLog.js';

function mockMessage(content, { attachments = [], embeds: embeds = [], partial = false, id = 'm1' } = {}) {
  return {
    id,
    guildId: 'g1',
    channelId: 'c1',
    content,
    partial,
    author: { id: 'u1', username: 'tester', bot: false },
    attachments: new Map(attachments.map((a, i) => [String(i), a])),
    embeds: new Map(embeds.map((e, i) => [String(i), e])),
  };
}

test('edit embed shows before/after content and the jump link', () => {
  const embed = buildEditEmbed(mockMessage('old text'), mockMessage('new text'));
  assert.ok(embed);
  const json = embed.data;
  assert.equal(json.title, '✏️ Message edited');
  const before = json.fields.find((f) => f.name === 'Before');
  const after = json.fields.find((f) => f.name === 'After');
  assert.equal(before.value, 'old text');
  assert.equal(after.value, 'new text');
  assert.ok(json.fields.some((f) => f.value.includes('discord.com/channels/g1/c1/m1')));
});

test('edit embed is skipped for embed-only changes (link previews, panel refresh)', () => {
  const embed = buildEditEmbed(mockMessage('same', { embeds: [] }), mockMessage('same', { embeds: [{ url: 'https://x.dev' }] }));
  assert.equal(embed, null);
});

test('edit embed marks uncached before content', () => {
  const embed = buildEditEmbed(mockMessage('', { partial: true }), mockMessage('new'));
  assert.ok(embed);
  assert.equal(embed.data.fields.find((f) => f.name === 'Before').value, '*not cached*');
});

test('delete embed lists content, attachments and links', () => {
  const embed = buildDeleteEmbed(
    mockMessage('look at this https://example.com/x', {
      attachments: [{ name: 'pic.png', contentType: 'image/png', size: 2048, url: 'https://cdn.example/pic.png' }],
      embeds: [{ url: 'https://example.com/link' }],
    }),
    { id: 'mod1', username: 'mod', bot: false }
  );
  const json = embed.data;
  assert.equal(json.title, '🗑️ Message deleted');
  assert.ok(json.description.includes('mod'));
  assert.ok(json.fields.find((f) => f.name === 'Content').value.includes('https://example.com/x'));
  assert.ok(json.fields.find((f) => f.name === 'Attachments').value.includes('pic.png'));
  assert.ok(json.fields.find((f) => f.name === 'Embeds / links').value.includes('example.com/link'));
});

test('partial delete embed degrades to a not-cached note', () => {
  const embed = buildDeleteEmbed({ guildId: 'g1', channelId: 'c1', id: 'm9' }, null, { partial: true });
  assert.equal(embed.data.fields[0].value.includes('not cached'), true);
});

test('bulk delete embed carries count and channel', () => {
  const embed = buildBulkDeleteEmbed('c1', 12, { username: 'mod', id: 'x' });
  assert.ok(embed.data.description.includes('**12**'));
  assert.ok(embed.data.description.includes('<#c1>'));
  assert.ok(embed.data.description.includes('mod'));
});
