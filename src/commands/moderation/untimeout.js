import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { runModAction, refuse } from '../../lib/actions.js';
import { cleanReason } from '../../lib/validate.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('untimeout')
  .setDescription("Remove a member's timeout")
  .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(512))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user', true);
  const reason = cleanReason(interaction.options.getString('reason'));
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return refuse(interaction, 'That user is not in this server.');

  await runModAction(interaction, {
    type: 'untimeout',
    targetUser: user,
    targetMember: member,
    reason,
    apply: () => member.timeout(null, `${reason} — by ${interaction.user.username}`),
  });
}
