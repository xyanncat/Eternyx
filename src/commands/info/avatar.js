import { SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { buildEmbed } from '../../lib/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription("Show a user's avatar")
  .addUserOption((o) => o.setName('user').setDescription('User (default: you)'))
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user') ?? interaction.user;
  const embed = buildEmbed({
    kind: 'info',
    title: `${user.username}'s avatar`,
    target: user,
  }).setImage(user.displayAvatarURL({ size: 1024 }));
  await interaction.reply({ embeds: [embed] });
}
