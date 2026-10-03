// Server identity changes (name, icon, banner, vanity, owner) are rare and
// high-signal — alert owners + log channel so a compromise cannot quietly
// rebrand or transfer the server.
import { Events } from 'discord.js';
import { recordEvent } from '../storage/db.js';
import { buildEmbed } from '../lib/embeds.js';
import { sendAuditLog } from '../lib/audit.js';
import { alertOwners } from '../lib/alerts.js';

export const name = Events.GuildUpdate;

export async function execute(oldGuild, newGuild) {
  const changes = [];
  if (oldGuild.name !== newGuild.name) changes.push(`**Name:** \`${oldGuild.name}\` → \`${newGuild.name}\``);
  if (oldGuild.icon !== newGuild.icon) changes.push('**Icon changed**');
  if (oldGuild.banner !== newGuild.banner) changes.push('**Banner changed**');
  if (oldGuild.ownerId !== newGuild.ownerId) changes.push(`**Owner:** <@${oldGuild.ownerId}> → <@${newGuild.ownerId}>`);
  if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
    changes.push(`**Verification level:** ${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`);
  }
  if (changes.length === 0) return;

  recordEvent('guild_update', JSON.stringify({ guild: newGuild.id, changes: changes.length }));
  const embed = buildEmbed({
    kind: 'warn',
    title: '⚠ Server settings changed',
    description: `${changes.join('\n')}\n\nIf this wasn't you, check who has Manage Server.`,
  });
  await sendAuditLog(newGuild, embed);

  // Owner transfer / verification drops are escalated to owner DMs.
  if (oldGuild.ownerId !== newGuild.ownerId || oldGuild.verificationLevel > newGuild.verificationLevel) {
    await alertOwners(newGuild, embed);
  }
}
