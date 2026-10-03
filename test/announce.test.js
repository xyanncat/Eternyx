import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand } from '../src/lib/commands.js';

const base = { channelId: '1444582621417046074', message: 'hello' };

test('announce accepts optional role/user mention lists', () => {
  assert.equal(validateCommand({ action: 'announce', params: base }).ok, true);
  assert.equal(
    validateCommand({ action: 'announce', params: { ...base, mentionRoleIds: ['1444582621417046075'], mentionUserIds: ['216039405824204800'] } }).ok,
    true
  );
});

test('announce rejects malformed mention lists', () => {
  assert.equal(validateCommand({ action: 'announce', params: { ...base, mentionRoleIds: ['not-an-id'] } }).ok, false);
  assert.equal(validateCommand({ action: 'announce', params: { ...base, mentionUserIds: '123' } }).ok, false);
  assert.equal(
    validateCommand({ action: 'announce', params: { ...base, mentionRoleIds: ['1444582621417046075', '1444582621417046075', '1444582621417046075', '1444582621417046075', '1444582621417046075', '1444582621417046075'] } }).ok,
    false
  );
});

test('announce still requires channel and message', () => {
  assert.equal(validateCommand({ action: 'announce', params: { message: 'x' } }).ok, false);
  assert.equal(validateCommand({ action: 'announce', params: { channelId: '1444582621417046074', message: '   ' } }).ok, false);
});
