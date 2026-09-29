import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmbed, COLORS, errorEmbed, successEmbed } from '../src/lib/embeds.js';

test('kinds map to the plan palette', () => {
  for (const [kind, color] of Object.entries(COLORS)) {
    const embed = buildEmbed({ kind });
    assert.equal(embed.data.color, color);
  }
});

test('unknown kinds fall back to info color', () => {
  assert.equal(buildEmbed({ kind: 'bogus' }).data.color, COLORS.info);
});

test('footer carries case id, moderator and brand', () => {
  const embed = buildEmbed({ caseId: 42, moderator: { username: 'mod_user' } });
  assert.equal(embed.data.footer.text, 'Case #42 · by @mod_user · Eternyx');
});

test('fields are capped at 25 and values at 1024 chars', () => {
  const fields = Array.from({ length: 40 }, (_, i) => ({ name: `f${i}`, value: 'x'.repeat(2000) }));
  const embed = buildEmbed({ fields });
  assert.equal(embed.data.fields.length, 25);
  assert.equal(embed.data.fields[0].value.length, 1024);
});

test('description is capped at 4096 chars', () => {
  const embed = buildEmbed({ description: 'y'.repeat(9000) });
  assert.equal(embed.data.description.length, 4096);
});

test('error and success helpers set kind and ephemeral-ready shape', () => {
  assert.equal(errorEmbed('bad').data.color, COLORS.error);
  assert.equal(successEmbed('ok', { caseId: 1 }).data.color, COLORS.success);
});
