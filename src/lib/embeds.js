// Shared response + audit-log embed builder (plan §6).
// Nothing else in the codebase constructs embeds.
import { EmbedBuilder, MessageFlags } from 'discord.js';

export const EPHEMERAL = MessageFlags.Ephemeral;

export const COLORS = {
  success: 0x2ecc71,
  action: 0xe67e22,
  error: 0xe74c3c,
  warn: 0xf1c40f,
  info: 0x5865f2,
};

export function buildEmbed({
  kind = 'info',
  title,
  description,
  moderator,
  target,
  caseId,
  fields = [],
} = {}) {
  const embed = new EmbedBuilder().setColor(COLORS[kind] ?? COLORS.info).setTimestamp();

  if (title) embed.setTitle(title.slice(0, 256));
  if (description) embed.setDescription(String(description).slice(0, 4096));

  const parts = [];
  if (caseId != null) parts.push(`Case #${caseId}`);
  if (moderator) parts.push(`by @${moderator.username ?? moderator}`);
  parts.push('Eternyx');
  embed.setFooter({ text: parts.join(' · ').slice(0, 2048) });

  if (target) {
    embed.addFields({ name: 'User', value: `<@${target.id ?? target}>` });
  }
  for (const field of fields.slice(0, 25)) {
    embed.addFields({
      name: String(field.name).slice(0, 256),
      value: String(field.value).slice(0, 1024) || '\u200b',
      inline: Boolean(field.inline),
    });
  }
  return embed;
}

export function errorEmbed(description, moderator = null) {
  return buildEmbed({ kind: 'error', title: 'Error', description, moderator });
}

export function successEmbed(description, { moderator, caseId } = {}) {
  return buildEmbed({ kind: 'success', title: 'Done', description, moderator, caseId });
}
