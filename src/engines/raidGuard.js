// raidGuard — join-burst detection (plan §5 automatic behaviors).
// Discord native AutoMod handles content; this handles mass joins.
import { GuildVerificationLevel } from 'discord.js';
import { getConfig, recordEvent } from '../storage/db.js';
import { buildEmbed } from '../lib/embeds.js';
import { sendAuditLog } from '../lib/audit.js';
import { alertOwners } from '../lib/alerts.js';
import { logger } from '../lib/log.js';

const WINDOW_MS = 60_000;
const TRIGGER_COOLDOWN_MS = 10 * 60_000;

const joins = new Map(); // guildId -> timestamps[]
const lastTrigger = new Map(); // guildId -> ts

export async function onJoin(member) {
  if (member.user.bot) return;
  const guild = member.guild;
  const now = Date.now();
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
