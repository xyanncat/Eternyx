// Audit trail: every moderation action and security event lands in the
// configured log channel (embed) and, for security events, the events table.
import { getConfig, recordEvent } from '../storage/db.js';
import { logger } from './log.js';

export async function sendAuditLog(guild, embed) {
  const cfg = getConfig(guild.id);
  if (!cfg.logChannelId) return false;
  const channel = await guild.channels.fetch(cfg.logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return false;
  try {
    await channel.send({ embeds: [embed] });
    return true;
  } catch (err) {
    logger.warn(`audit log send failed in ${guild.id}: ${err.message}`);
    recordEvent('audit_log_failed', `guild=${guild.id} channel=${cfg.logChannelId} err=${err.message}`);
    return false;
  }
}
