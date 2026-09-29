import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { buildEmbed } from '../../lib/embeds.js';
import { listUserCases } from '../../storage/db.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription("List a user's active warnings")
  .addUserOption((o) => o.setName('user').setDescription('User to look up').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user', true);
  const rows = listUserCases(interaction.guildId, user.id, { activeOnly: true, limit: 10 });
  const warnings = rows.filter((r) => r.type === 'warn');

  const embed = buildEmbed({
    kind: warnings.length ? 'warn' : 'success',
    title: `Active warnings — ${user.username}`,
    target: user,
    description:
      warnings.length > 0
        ? warnings
            .map(
              (r) =>
                `**#${r.id}** · <t:${Math.floor(r.created_at / 1000)}:R> — ${r.reason}\nby <@${r.moderator_id}>`
            )
            .join('\n')
        : 'No active warnings on record.',
  });
  await interaction.reply({ embeds: [embed] });
}
