import { SlashCommandBuilder } from 'discord.js';
import { buildEmbed } from '../../lib/embeds.js';

export const data = new SlashCommandBuilder().setName('ping').setDescription('Check that the bot is alive');

export async function execute(interaction) {
  await interaction.deferReply();
  const msg = await interaction.fetchReply();
  const embed = buildEmbed({
    kind: 'success',
    title: 'Pong',
    description: `**Roundtrip:** ${msg.createdTimestamp - interaction.createdTimestamp}ms\n**WebSocket:** ${Math.max(0, interaction.client.ws.ping)}ms`,
  });
  await interaction.editReply({ embeds: [embed] });
}
