import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moderationAllowed } from '../src/lib/perms.js';

// Minimal stubs mirroring the discord.js surface used by perms.js.
function role(pos) {
  return { position: pos, comparePositionTo(other) { return this.position - other.position; } };
}
function member(id, { pos = 0, roles = [] } = {}) {
  return { id, roles: { highest: role(pos), cache: new Map(roles.map((r) => [r, { id: r }])) } };
}

const guild = { id: 'g1', ownerId: 'owner' };
const bot = member('bot', { pos: 5 });

function check({ targetId, targetPos = 1, moderatorPos = 5, moderatorIsOwner = false, targetIsMod = false }) {
  return moderationAllowed({
    guild,
    moderator: member('mod', { pos: moderatorPos }),
    targetUser: { id: targetId },
    targetMember: member(targetId, { pos: targetPos }),
    botMember: bot,
    moderatorIsOwner,
    targetIsMod,
  });
}

test('refuses the bot itself, self-targets and the owner', () => {
  assert.equal(check({ targetId: 'bot' }).ok, false);
  assert.equal(check({ targetId: 'mod' }).ok, false);
  assert.equal(check({ targetId: 'owner' }).ok, false);
});

test('refuses targets at or above the bot hierarchy', () => {
  const result = check({ targetId: 'admin', targetPos: 5 });
  assert.equal(result.ok, false);
  assert.match(result.reason, /equal to or above/);
});

test('refuses fellow moderators at or above the invoker unless owner', () => {
  assert.equal(check({ targetId: 'mod2', targetPos: 3, targetIsMod: true, moderatorPos: 3 }).ok, false);
  assert.equal(check({ targetId: 'mod2', targetPos: 5, targetIsMod: true, moderatorPos: 5 }).ok, false);
  assert.equal(check({ targetId: 'mod2', targetPos: 3, targetIsMod: true, moderatorPos: 3, moderatorIsOwner: true }).ok, true);
  // a fellow mod strictly *below* the invoker is fair game
  assert.equal(check({ targetId: 'mod2', targetPos: 1, targetIsMod: true, moderatorPos: 5 }).ok, true);
});

test('allows a regular member below both hierarchies', () => {
  const result = check({ targetId: 'regular', targetPos: 1, moderatorPos: 5 });
  assert.deepEqual(result, { ok: true, reason: null });
});

test('allows users without a member object (banning by ID)', () => {
  const result = moderationAllowed({
    guild,
    moderator: member('mod'),
    targetUser: { id: '999' },
    targetMember: null,
    botMember: bot,
    moderatorIsOwner: false,
    targetIsMod: false,
  });
  assert.equal(result.ok, true);
});
