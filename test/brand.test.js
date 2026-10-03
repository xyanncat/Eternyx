import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmbed } from '../src/lib/embeds.js';
import { applyBrand, BRAND_NAME } from '../src/lib/brand.js';

test('applyBrand attaches the file and sets the embed image', () => {
  const embed = buildEmbed({ kind: 'info', title: 'x', description: 'y' });
  const payload = applyBrand({ embeds: [embed] });
  assert.equal(payload.files.length, 1);
  assert.equal(payload.embeds[0].data.image.url, `attachment://${BRAND_NAME}`);
  // Non-mutating: the original embed is untouched.
  assert.equal(embed.data.image, undefined);
});

test('applyBrand respects an existing image', () => {
  const embed = buildEmbed({ kind: 'info', title: 'x' }).setImage('https://example.com/a.png');
  const payload = applyBrand({ embeds: [embed] });
  assert.equal(payload.embeds[0].data.image.url, 'https://example.com/a.png');
  assert.equal(payload.files.length, 1);
});

test('applyBrand leaves non-embed payloads alone', () => {
  const payload = applyBrand({ content: 'hi' });
  assert.equal(payload.files, undefined);
  assert.equal(payload.content, 'hi');
});
