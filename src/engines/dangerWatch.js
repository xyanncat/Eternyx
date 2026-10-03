// dangerWatch — audit-log based protections for destructive actions the
// event-level guards cannot attribute (plan §5 extensions):
//  - a bot or webhook being created (bypasses AutoMod; classic exfil vector)
//  - kick bursts by one actor
//  - role-deletion bursts
//  - channel-name/permission-scoped deletions are covered by nukeGuard.
// Alerts are always on; nothing is auto-reverted — the human decides.
import { AuditLogEvent } from 'discord.js';
import { recordEvent } from '../storage/db.js';
import { buildEmbed } from '../lib/embeds.js';
import { sendAuditLog } from '../lib/audit.js';
import { alertOwners } from '../lib/alerts.js';

const WINDOW_MS = 60_000;
const KICK_THRESHOLD = 3;
const ROLE_DELETE_THRESHOLD = 3;
const COOLDOWN_MS = 10 * 60_000;

const kickTimes = new Map(); // `${guildId}:${executorId}` -> ts[]
const roleDeleteTimes = new Map(); // guildId -> ts[]
const lastAlert = new Map(); // key -> ts

function burst(map, key, limit) {
  const now = Date.now();
  const recent = (map.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  map.set(key, recent);
  return recent.length >= limit;
}

function shouldAlert(key) {
  const now = Date.now();
  if (now - (lastAlert.get(key) ?? 0) < COOLDOWN_MS) return false;
  lastAlert.set(key, now);
  return true;
}

export async function onDangerousAuditEntry(entry, guild) {
  const executor = entry.executor ?? null;

  switch (entry.actionType) {
    case AuditLogEvent.BotAdd: {
      recordEvent('audit_bot_add', `guild=${guild.id} bot=${entry.target?.id ?? '?'} by=${executor?.id ?? '?'}`);
      const embed = buildEmbed({
        kind: 'error',
        title: '🚨 A bot was added to the server',
        description: `${executor ? `<@${executor.id}>` : 'Someone'} added ${entry.target ? `<@${entry.target.id}>` : 'a bot'}.\nBots bypass AutoMod and can read channels. If this wasn't authorized, remove the bot and the adder's access.`,
      });
      await sendAuditLog(guild, embed);
      await alertOwners(guild, embed);
      return;
    }
    case AuditLogEvent.WebhookCreate: {
      recordEvent('audit_webhook_create', `guild=${guild.id} by=${executor?.id ?? '?'}`);
      const embed = buildEmbed({
        kind: 'warn',
        title: '⚠ A webhook was created',
        description: `${executor ? `<@${executor.id}>` : 'Someone'} created a webhook${entry.target ? ` (**${entry.target.name}**)` : ''}.\nWebhooks post under the server's name and bypass AutoMod entirely. Verify it is expected.`,
      });
      await sendAuditLog(guild, embed);
      await alertOwners(guild, embed);
      return;
    }
    case AuditLogEvent.MemberKick: {
      if (!executor) return;
      if (!burst(kickTimes, `${guild.id}:${executor.id}`, KICK_THRESHOLD)) return;
      if (!shouldAlert(`kicks:${guild.id}`)) return;
      recordEvent('kick_burst', `guild=${guild.id} executor=${executor.id}`);
      const embed = buildEmbed({
        kind: 'error',
        title: '🚨 Kick burst detected',
        description: `<@${executor.id}> kicked **≥${KICK_THRESHOLD} members in ${WINDOW_MS / 1000}s**. If this account is compromised, consider a timeout and a token reset.`,
      });
      await sendAuditLog(guild, embed);
      await alertOwners(guild, embed);
      return;
    }
    case AuditLogEvent.RoleDelete: {
      if (!burst(roleDeleteTimes, guild.id, ROLE_DELETE_THRESHOLD)) return;
      if (!shouldAlert(`roles:${guild.id}`)) return;
      recordEvent('role_delete_burst', `guild=${guild.id} last=${entry.target?.id ?? '?'} by=${executor?.id ?? '?'}`);
      const embed = buildEmbed({
        kind: 'error',
        title: '🚨 Role deletion burst detected',
        description: `**≥${ROLE_DELETE_THRESHOLD} roles deleted in ${WINDOW_MS / 1000}s**${executor ? ` — recent actor <@${executor.id}>` : ''}. Restore roles from server settings backups if this was not intended.`,
      });
      await sendAuditLog(guild, embed);
      await alertOwners(guild, embed);
      return;
    }
    default:
      return;
  }
}
