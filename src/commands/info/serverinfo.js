import { SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { buildEmbed } from '../../lib/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('Show info about this server')
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const g = interaction.guild;
  const channels = [...g.channels.cache.values()];
  const embed = buildEmbed({
    kind: 'info',
    title: g.name,
    description: g.description ?? undefined,
    moderator: interaction.user,
    fields: [
      { name: 'ID', value: g.id, inline: true },
      { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
      { name: 'Members', value: String(g.memberCount), inline: true },
      { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:F>`, inline: false },
      {
        name: 'Channels',
        value: `${channels.filter((c) => c.isTextBased()).length} text · ${channels.filter((c) => c.isVoiceBased()).length} voice`,
        inline: true,
      },
      { name: 'Roles', value: String(g.roles.cache.size), inline: true },
      { name: 'Boosts', value: `Level ${g.premiumTier} (${g.premiumSubscriptionCount ?? 0})`, inline: true },
    ],
  });
  if (g.iconURL()) embed.setThumbnail(g.iconURL({ size: 256 }));
  await interaction.reply({ embeds: [embed] });
}
