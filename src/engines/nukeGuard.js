// nukeGuard — mass-ban and mass-channel-delete detection (plan §5).
// Alerting is always on; automatic retaliation is opt-in (nuke_auto_action),
// because a false positive against an admin is worse than 30 lost seconds.
import { AuditLogEvent } from 'discord.js';
import { getConfig, recordEvent } from '../storage/db.js';
import { buildEmbed } from '../lib/embeds.js';
import { sendAuditLog } from '../lib/audit.js';
import { alertOwners } from '../lib/alerts.js';
import { logger } from '../lib/log.js';

const WINDOW_MS = 60_000;
const BAN_THRESHOLD = 5;
const CHANNEL_THRESHOLD = 3;
const TRIGGER_COOLDOWN_MS = 10 * 60_000;

const banTimes = new Map(); // `${guildId}:${executorId|unknown}` -> ts[]
const guildBanTimes = new Map(); // guildId -> ts[] (catches bans split across several accounts)
const channelTimes = new Map(); // guildId -> ts[]
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
  if (now - (lastAlert.get(key) ?? 0) < TRIGGER_COOLDOWN_MS) return false;
  lastAlert.set(key, now);
  return true;
}

async function resolveExecutor(guild, auditType, targetId) {
  const logs = await guild.fetchAuditLogs({ type: auditType, limit: 10 }).catch(() => null);
  const entry = logs?.entries.find((e) => e.target?.id === targetId);
  return entry?.executor ?? null;
}

export async function onBan(ban) {
  const guild = ban.guild;
  const executor = await resolveExecutor(guild, AuditLogEvent.MemberBanAdd, ban.user.id);
  const executorId = executor?.id ?? 'unknown';
  // Trigger on EITHER a single actor bursting OR the guild-wide rate bursting,
  // so a nuke split across two mod accounts is still caught.
  const perExecutorHit = burst(banTimes, `${guild.id}:${executorId}`, BAN_THRESHOLD);
  const guildWideHit = burst(guildBanTimes, guild.id, BAN_THRESHOLD);
  if (!perExecutorHit && !guildWideHit) return;
  if (!shouldAlert(`bans:${guild.id}`)) return;

  recordEvent('nuke_suspected_bans', `guild=${guild.id} executor=${executorId} count>=${BAN_THRESHOLD}/${WINDOW_MS / 1000}s`);

  let autoNote = 'auto-action disabled (alert only)';
  if (getConfig(guild.id).nukeAutoAction && executor) {
    const member = await guild.members.fetch(executor.id).catch(() => null);
    if (member?.moderatable) {
      try {
        await member.timeout(3_600_000, 'Eternyx nukeGuard: mass-ban burst');
        autoNote = `<@${executorId}> auto-timed-out for 1h`;
        recordEvent('nuke_auto_timeout', `guild=${guild.id} executor=${executorId}`);
      } catch (err) {
        autoNote = `auto-timeout failed (${err.message})`;
      }
    }
  }

  const embed = buildEmbed({
    kind: 'error',
    title: '🚨 Mass-ban burst detected',
    description: `**≥${BAN_THRESHOLD} bans in ${WINDOW_MS / 1000}s** attributed to ${executor ? `<@${executorId}>` : 'an unidentifiable actor (no audit-log access)'}.\n**Auto-action:** ${autoNote}`,
  });
  await sendAuditLog(guild, embed);
  await alertOwners(guild, embed);
}

export async function onChannelDelete(channel) {
  const guild = channel.guild;
  if (!burst(channelTimes, guild.id, CHANNEL_THRESHOLD)) return;
  if (!shouldAlert(`channels:${guild.id}`)) return;

  const executor = await resolveExecutor(guild, AuditLogEvent.ChannelDelete, channel.id).catch(() => null);
  recordEvent('nuke_suspected_channels', `guild=${guild.id} last_deleted=${channel.id} executor=${executor?.id ?? 'unknown'}`);

  const embed = buildEmbed({
    kind: 'error',
    title: '🚨 Mass channel deletion detected',
    description: `**≥${CHANNEL_THRESHOLD} channels deleted in ${WINDOW_MS / 1000}s**${executor ? ` — recent executor: <@${executor.id}>` : ''}.\nCheck the audit log and restore from backups if needed.`,
  });
  await sendAuditLog(guild, embed);
  await alertOwners(guild, embed);
}
