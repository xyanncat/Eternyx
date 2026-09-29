import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanReason, isSnowflake, DURATION_MAP, formatDuration } from '../src/lib/validate.js';

test('isSnowflake accepts 17–20 digit numeric strings', () => {
  assert.equal(isSnowflake('123456789012345678'), true);
  assert.equal(isSnowflake('12345678901234567'), true); // 17
  assert.equal(isSnowflake('12345678901234567890'), true); // 20
});

test('isSnowflake rejects non-snowflakes', () => {
  assert.equal(isSnowflake('123'), false);
  assert.equal(isSnowflake('123456789012345678901'), false); // 21
  assert.equal(isSnowflake('abc123456789012345'), false);
  assert.equal(isSnowflake(''), false);
  assert.equal(isSnowflake(null), false);
  assert.equal(isSnowflake(123456789012345678n), false); // must be a string
});

test('cleanReason trims, caps and defaults', () => {
  assert.equal(cleanReason('  spam  '), 'spam');
  assert.equal(cleanReason(null), 'No reason provided');
  assert.equal(cleanReason(''), 'No reason provided');
  assert.equal(cleanReason('x'.repeat(600)).length, 512);
});

test('duration presets are an allowlist', () => {
  assert.equal(DURATION_MAP['1h'], 3600);
  assert.equal(DURATION_MAP['1w'], 604800);
  assert.equal(DURATION_MAP['13h'], undefined);
});

test('formatDuration renders readable output', () => {
  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(3_725_000), '1h 2m 5s');
  assert.equal(formatDuration(86_400_000), '1d');
});
