// autoRole — grant the configured roles to every new join:
// humans get autoRoleUserId, bots get autoRoleBotId. Failures (missing
// Manage Roles, role above the bot in hierarchy, managed integration role)
// are alert-deduped and surfaced to the log channel + owner DMs, because a
// silently broken auto-role is worse than none.
import { getConfig, recordEvent } from '../storage/db.js';
import { buildEmbed } from '../lib/embeds.js';
import { sendAuditLog } from '../lib/audit.js';
import { alertOwners } from '../lib/alerts.js';
import { logger } from '../lib/log.js';

const FAILURE_ALERT_COOLDOWN_MS = 60 * 60_000;
const lastFailureAlert = new Map(); // guildId -> ts

async function reportFailure(guild, member, roleId, reason) {
  logger.warn(`auto-role failed for ${member.id} (role ${roleId}): ${reason}`);
  recordEvent('auto_role_failed', `guild=${guild.id} user=${member.id} role=${roleId} reason=${reason}`);
  const now = Date.now();
  if (now - (lastFailureAlert.get(guild.id) ?? 0) < FAILURE_ALERT_COOLDOWN_MS) return;
  lastFailureAlert.set(guild.id, now);
  const embed = buildEmbed({
    kind: 'error',
    title: '🚨 Auto-role could not be applied',
    description: `Tried to give <@&${roleId}> to ${member.user.bot ? 'bot' : 'member'} <@${member.id}> but failed: **${reason}**.\nFix: give my role **Manage Roles** and make sure it sits **above** both auto roles in Server Settings → Roles.`,
  });
  await sendAuditLog(guild, embed);
  await alertOwners(guild, embed);
}

export async function onJoin(member) {
  const guild = member.guild;
  const cfg = getConfig(guild.id);
  const roleId = member.user.bot ? cfg.autoRoleBotId : cfg.autoRoleUserId;
  if (!roleId) return;

  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return reportFailure(guild, member, roleId, 'role does not exist');
  if (role.managed) return reportFailure(guild, member, roleId, 'role is managed by an integration');
  if (role.id === guild.id) return reportFailure(guild, member, roleId, 'role is @everyone');
  if (member.roles.cache.has(role.id)) return; // already has it (e.g. restored member)

  const me = guild.members.me;
  if (!me.permissions.has('ManageRoles')) {
    return reportFailure(guild, member, roleId, 'I do not have the Manage Roles permission');
  }
  if (me.roles.highest.comparePositionTo(role) <= 0) {
    return reportFailure(guild, member, roleId, 'my highest role is not above the auto role');
  }

  try {
    await member.roles.add(role, 'Eternyx auto-role');
    logger.info(`auto-role: gave ${role.name} to ${member.user.username} (${member.id})`);
  } catch (err) {
    await reportFailure(guild, member, roleId, err.message);
  }
}
