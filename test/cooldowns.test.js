import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCooldown } from '../src/lib/cooldowns.js';

test('first call passes, immediate repeat is throttled', () => {
  assert.equal(checkCooldown('a:cmd', 3), 0);
  const wait = checkCooldown('a:cmd', 3);
  assert.ok(wait > 0 && wait <= 3);
});

test('different keys do not interfere', () => {
  assert.equal(checkCooldown('a:other', 3), 0);
});
