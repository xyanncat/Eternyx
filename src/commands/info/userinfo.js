import { SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { buildEmbed } from '../../lib/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('Show info about a user')
  .addUserOption((o) => o.setName('user').setDescription('User (default: you)'))
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user') ?? interaction.user;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  const roles = member
    ? member.roles.cache
        .filter((r) => r.id !== interaction.guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => `<@&${r.id}>`)
        .slice(0, 15)
    : [];

  const timedOut = member?.communicationDisabledUntilTimestamp;
  const embed = buildEmbed({
    kind: 'info',
    title: user.username,
    target: user,
    fields: [
      { name: 'ID', value: user.id, inline: true },
      { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
      { name: 'Account created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: false },
      {
        name: 'Joined server',
        value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Not a member',
        inline: false,
      },
      { name: 'Roles', value: roles.length > 0 ? roles.join(' ') : 'None', inline: false },
      {
        name: 'Timeout',
        value: timedOut ? `Until <t:${Math.floor(timedOut / 1000)}:F>` : 'None',
        inline: true,
      },
    ],
  }).setThumbnail(user.displayAvatarURL({ size: 256 }));

  await interaction.reply({ embeds: [embed] });
}
