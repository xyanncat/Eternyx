// raidGuard — join-burst detection + new-account screening (plan §5).
// Discord native AutoMod handles content; this handles mass joins, brand-new
// accounts, and bots being added to the server.
import { GuildVerificationLevel } from 'discord.js';
import { getConfig, recordEvent } from '../storage/db.js';
import { buildEmbed } from '../lib/embeds.js';
import { sendAuditLog } from '../lib/audit.js';
import { alertOwners } from '../lib/alerts.js';
import { logger } from '../lib/log.js';

const WINDOW_MS = 60_000;
const TRIGGER_COOLDOWN_MS = 10 * 60_000;
const NEW_ACCOUNT_DAYS = 7; // accounts younger than this get flagged
const VERY_NEW_ACCOUNT_HOURS = 24; // younger than this also pings owners

const joins = new Map(); // guildId -> timestamps[]
const lastTrigger = new Map(); // guildId -> ts

function humanAge(ms) {
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} minute(s)`;
  if (hours < 48) return `${hours} hour(s)`;
  return `${Math.floor(hours / 24)} day(s)`;
}

export async function onJoin(member) {
  const guild = member.guild;
  const now = Date.now();

  // Bots joining are always security-relevant — someone authorized a bot.
  if (member.user.bot) {
    recordEvent('bot_joined', `guild=${guild.id} bot=${member.id} name=${member.user.username}`);
    const embed = buildEmbed({
      kind: 'warn',
      title: '🤖 A bot was added to the server',
      description: `<@${member.id}> (**${member.user.username}**) was added. If this wasn't you, remove it immediately and rotate the adder's token — bots bypass AutoMod and can read channels.`,
    });
    await sendAuditLog(guild, embed);
    await alertOwners(guild, embed);
    return;
  }

  // New-account screening: young accounts are the classic raid munition.
  const accountAge = now - member.user.createdTimestamp;
  if (accountAge < NEW_ACCOUNT_DAYS * 86_400_000) {
    recordEvent('new_account_join', `guild=${guild.id} user=${member.id} age_h=${Math.round(accountAge / 3_600_000)}`);
    const embed = buildEmbed({
      kind: 'info',
      title: '🆕 New account joined',
      description: `<@${member.id}> — account is **${humanAge(accountAge)}** old (threshold: ${NEW_ACCOUNT_DAYS} days). Watch for follow-up activity.`,
    });
    await sendAuditLog(guild, embed);
    if (accountAge < VERY_NEW_ACCOUNT_HOURS * 3_600_000) await alertOwners(guild, embed);
  }

  const recent = (joins.get(guild.id) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  joins.set(guild.id, recent);

  const cfg = getConfig(guild.id);
  if (recent.length < cfg.raidThreshold) return;
  if (now - (lastTrigger.get(guild.id) ?? 0) < TRIGGER_COOLDOWN_MS) return;
  lastTrigger.set(guild.id, now);

  recordEvent('raid_suspected', `guild=${guild.id} joins=${recent.length}/${WINDOW_MS / 1000}s`);

  // Join gate: raise the verification level if it is lower (needs ManageGuild).
  let gate;
  try {
    if (guild.verificationLevel < GuildVerificationLevel.High) {
      await guild.setVerificationLevel(GuildVerificationLevel.High, 'Eternyx raidGuard: join burst');
      gate = 'verification level raised to High';
    } else {
      gate = `already High or above (level ${guild.verificationLevel})`;
    }
  } catch (err) {
    gate = `could not raise verification (${err.message})`;
    logger.warn(`raidGuard gate failed in ${guild.id}: ${err.message}`);
  }

  const embed = buildEmbed({
    kind: 'warn',
    title: '⚠ Possible join raid detected',
    description: `**${recent.length}** members joined within ${WINDOW_MS / 1000}s.\n**Join gate:** ${gate}\nUse \`/lockdown on\` for a full response.`,
  });
  await sendAuditLog(guild, embed);
  await alertOwners(guild, embed);
}
