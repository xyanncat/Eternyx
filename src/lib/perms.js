// Authorization engine (plan §4.4–§4.5): Discord-level default permissions are the
// first gate; every mod/owner command is re-checked here on every interaction.
import { PermissionFlagsBits } from 'discord.js';
import { env } from '../config.js';

export function isOwner(userId, guildConfig) {
  return env.OWNER_IDS.includes(userId) || guildConfig.ownerIds.includes(userId);
}

export function isMod(member, guildConfig) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (isOwner(member.id, guildConfig)) return true;
  return member.roles?.cache?.some((role) => guildConfig.modRoleIds.includes(role.id)) ?? false;
}

// Target safety for any moderation action. Fails closed (plan §4.11).
export function moderationAllowed({
  guild,
  moderator,
  targetUser,
  targetMember,
  botMember,
  moderatorIsOwner,
  targetIsMod,
  allowOwnerTarget = false,
}) {
  if (targetUser.id === botMember.id) return { ok: false, reason: "I can't take moderation action on myself." };
  if (targetUser.id === moderator.id) return { ok: false, reason: "You can't take moderation action on yourself." };
  // Undo-actions like /unban legitimately target anyone, including the owner.
  if (!allowOwnerTarget && targetUser.id === guild.ownerId) {
    return { ok: false, reason: 'The server owner cannot be moderated.' };
  }

  if (targetMember) {
    if (targetMember.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) {
      return { ok: false, reason: 'That member has a role equal to or above my highest role — I cannot act on them.' };
    }
    if (!moderatorIsOwner && targetIsMod && moderator.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
      return { ok: false, reason: 'That member is a moderator at or above your role level — you cannot act on them.' };
    }
  }
  return { ok: true, reason: null };
}
