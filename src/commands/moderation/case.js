import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { buildEmbed } from '../../lib/embeds.js';
import { getCase } from '../../storage/db.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('case')
  .setDescription('View a moderation case')
  .addIntegerOption((o) =>
    o.setName('id').setDescription('Case number').setRequired(true).setMinValue(1)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const id = interaction.options.getInteger('id', true);
  const row = getCase(id);
  // Guild scoping: never show another guild's cases (plan §4.9).
  if (!row || row.guild_id !== interaction.guildId) {
    await interaction.reply({
      embeds: [buildEmbed({ kind: 'error', title: 'Not found', description: `No case #${id} in this server.` })],
    });
    return;
  }

  const embed = buildEmbed({
    kind: row.status === 'ACTIVE' ? 'action' : 'info',
    title: `Case #${row.id} — ${row.type}`,
    moderator: row.moderator_id,
    target: row.user_id === '0' ? null : { id: row.user_id },
    fields: [
      { name: 'Status', value: row.status },
      { name: 'Reason', value: row.reason },
      { name: 'Issued', value: `<t:${Math.floor(row.created_at / 1000)}:F>` },
      ...(row.duration ? [{ name: 'Duration', value: `${row.duration}s` }] : []),
    ],
  });
  await interaction.reply({ embeds: [embed] });
}
