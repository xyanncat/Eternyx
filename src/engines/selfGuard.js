// selfGuard — the bot watches itself (plan §4.8): permission or role changes
// targeting the bot produce an immediate owner alert. Never auto-responds
// beyond alerting; the human decides.
import { PermissionFlagsBits } from 'discord.js';
import { recordEvent } from '../storage/db.js';
import { buildEmbed } from '../lib/embeds.js';
import { sendAuditLog } from '../lib/audit.js';
import { alertOwners } from '../lib/alerts.js';

const REQUIRED = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.ManageRoles, // needed for auto-role on join
];

// Permissions that are catastrophic when granted to @everyone.
const DANGEROUS_FOR_EVERYONE = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ModerateMembers,
];

const DEDUPE_MS = 5 * 60_000;
const lastAlert = new Map(); // kind -> ts

function permName(bit) {
  return Object.entries(PermissionFlagsBits).find(([, v]) => v === bit)?.[0] ?? String(bit);
}

async function alertOnce(guild, kind, embed) {
  const now = Date.now();
  if (now - (lastAlert.get(kind) ?? 0) < DEDUPE_MS) return;
  lastAlert.set(kind, now);
  recordEvent(kind, `guild=${guild.id}`);
  await sendAuditLog(guild, embed);
  await alertOwners(guild, embed);
}

export async function onRoleUpdate(oldRole, newRole) {
  const guild = newRole.guild;

  // @everyone gaining dangerous permissions is the single worst change a
  // compromised admin can make — watch it independently of the bot's role.
  if (newRole.id === guild.id) {
    const gained = DANGEROUS_FOR_EVERYONE.filter(
      (p) => newRole.permissions.has(p) && !oldRole.permissions.has(p)
    );
    if (gained.length > 0) {
      await alertOnce(
        guild,
        'everyone_perm_escalation',
        buildEmbed({
          kind: 'error',
          title: '🚨 @everyone gained dangerous permissions',
          description: `${gained.map(permName).map((n) => `- ${n}`).join('\n')}\n\nEvery member now has these. If this wasn't you, revert immediately and check the audit log.`,
        })
      );
    }
    return;
  }

  const me = guild.members.me;
  if (!me.roles.cache.has(newRole.id)) return;

  const missing = REQUIRED.filter((p) => !newRole.permissions.has(p));
  if (missing.length === 0) return;

  await alertOnce(
    guild,
    'self_perm_reduced',
    buildEmbed({
      kind: 'error',
      title: '🚨 My permissions were reduced',
      description: `The bot role <@&${newRole.id}> lost:\n${missing.map(permName).map((n) => `- ${n}`).join('\n')}\n\nModeration features may fail until restored. If this wasn't you, check the audit log and rotate the bot token.`,
    })
  );
}

export async function onRoleDelete(role) {
  const guild = role.guild;
  if (!guild.members.me.roles.cache.has(role.id)) return;
  await alertOnce(
    guild,
    'self_role_deleted',
    buildEmbed({
      kind: 'error',
      title: '🚨 My role was deleted',
      description: 'The bot role was removed from the server. I can no longer moderate until a role is re-created and assigned. If this wasn\'t you, treat the token as compromised and reset it.',
    })
  );
}

export async function onMemberUpdate(oldMember, member) {
  if (member.id !== member.client.user.id) return;
  const added = member.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter((r) => !member.roles.cache.has(r.id));
  if (added.size === 0 && removed.size === 0) return;

  const lines = [
    ...[...added.values()].map((r) => `➕ <@&${r.id}>`),
    ...[...removed.values()].map((r) => `➖ <@&${r.id}>`),
  ];
  await alertOnce(
    member.guild,
    'self_roles_changed',
    buildEmbed({
      kind: 'warn',
      title: '⚠ My roles were changed',
      description: `${lines.join('\n')}\n\nIf this wasn't you, check the audit log — an account with role management is acting on the bot.`,
    })
  );
}

export async function onAuditEntry(auditLogEntry, guild) {
  if (auditLogEntry.target?.id !== guild.client.user.id) return;
  await alertOnce(
    guild,
    'self_audit_entry',
    buildEmbed({
      kind: 'warn',
      title: '⚠ Audit-log action against the bot',
      description: `Action: **${auditLogEntry.actionType}**\nExecutor: ${auditLogEntry.executor ? `<@${auditLogEntry.executor.id}>` : 'unknown'}\n\nIf this wasn't you, review the audit log and rotate the bot token.`,
    })
  );
}
