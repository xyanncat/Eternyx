// lockdown — lock/unlock every public text channel with exact restore.
// State persists in config (lockdown_active + lockdown_channels), so:
//  - the control panel reflects the real state,
//  - lifting lockdown restores each channel's PREVIOUS @everyone SendMessages
//    value (allow / deny / neutral) instead of blanket-unlocking,
//  - a crash mid-lockdown can be recovered.
import { setConfig, getConfig, recordEvent } from '../storage/db.js';
import { logger } from './log.js';

function lockableChannels(guild) {
  return [...guild.channels.cache.values()].filter(
    (ch) => ch.isTextBased() && !ch.isThread() && !ch.isVoiceBased()
  );
}

function previousValue(channel, everyoneId) {
  const overwrite = channel.permissionOverwrites.cache.get(everyoneId);
  if (!overwrite) return 'neutral';
  if (overwrite.allow.has('SendMessages')) return 'allow';
  if (overwrite.deny.has('SendMessages')) return 'deny';
  return 'neutral';
}

export async function activateLockdown(guild, by, reason) {
  const cfg = getConfig(guild.id);
  if (cfg.lockdownActive) return { ok: false, detail: 'lockdown is already active' };

  const channels = lockableChannels(guild);
  const previous = [];
  let ok = 0;
  let failed = 0;
  for (const ch of channels) {
    try {
      previous.push({ id: ch.id, prev: previousValue(ch, guild.roles.everyone.id) });
      await ch.permissionOverwrites.edit(
        guild.roles.everyone,
        { SendMessages: false },
        { reason: `lockdown on — ${reason} — by ${by}` }
      );
      ok += 1;
    } catch (err) {
      failed += 1;
      logger.warn(`lockdown: could not lock ${ch.id}: ${err.message}`);
    }
  }
  setConfig(guild.id, { lockdownActive: 1, lockdownChannels: previous });
  recordEvent('lockdown_on', JSON.stringify({ guild: guild.id, ok, failed, by }));
  return { ok: true, detail: `${ok} channel(s) locked${failed ? `, ${failed} failed` : ''}`, locked: ok, failed };
}

export async function deactivateLockdown(guild, by, reason) {
  const cfg = getConfig(guild.id);
  if (!cfg.lockdownActive) return { ok: false, detail: 'lockdown is not active' };

  let ok = 0;
  let failed = 0;
  for (const entry of cfg.lockdownChannels) {
    const ch = guild.channels.cache.get(entry.id);
    if (!ch) continue;
    const sendMessages = entry.prev === 'allow' ? true : entry.prev === 'deny' ? false : null;
    try {
      await ch.permissionOverwrites.edit(
        guild.roles.everyone,
        { SendMessages: sendMessages },
        { reason: `lockdown off — ${reason} — by ${by}` }
      );
      ok += 1;
    } catch (err) {
      failed += 1;
      logger.warn(`lockdown: could not unlock ${ch.id}: ${err.message}`);
    }
  }
  setConfig(guild.id, { lockdownActive: 0, lockdownChannels: [] });
  recordEvent('lockdown_off', JSON.stringify({ guild: guild.id, ok, failed, by }));
  return { ok: true, detail: `${ok} channel(s) restored${failed ? `, ${failed} failed` : ''}`, unlocked: ok, failed };
}

// Boot-time recovery: if the DB says lockdown is active, make sure the
// channel overwrites still match (a restart between edits could leave a
// partial lockdown). Channels already locked are untouched.
export async function reconcileLockdown(guild) {
  const cfg = getConfig(guild.id);
  if (!cfg.lockdownActive) return;
  const chars = `${cfg.lockdownChannels.length}`;
  recordEvent('lockdown_recovered', `guild=${guild.id} channels=${chars}`);
  for (const entry of cfg.lockdownChannels) {
    const ch = guild.channels.cache.get(entry.id);
    if (!ch) continue;
    try {
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: 'Eternyx lockdown recovery (bot restart)' });
    } catch {
      /* best effort — the flag stays active regardless */
    }
  }
  logger.info(`lockdown state recovered (${chars} channels)`);
}
