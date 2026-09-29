import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { runModAction, refuse } from '../../lib/actions.js';
import { cleanReason, isSnowflake } from '../../lib/validate.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban a user by ID')
  .addStringOption((o) => o.setName('user_id').setDescription('User ID to unban').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(512))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const userId = interaction.options.getString('user_id', true).trim();
  if (!isSnowflake(userId)) {
    return refuse(interaction, 'That is not a valid user ID (expected a 17–20 digit snowflake).');
  }
  const reason = cleanReason(interaction.options.getString('reason'));

  await runModAction(interaction, {
    type: 'unban',
    targetUser: { id: userId },
    reason,
    allowOwnerTarget: true, // unbanning is an undo, not an action on the person
    apply: () => interaction.guild.members.unban(userId, `${reason} — by ${interaction.user.username}`),
  });
}
