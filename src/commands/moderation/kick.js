import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { runModAction, refuse } from '../../lib/actions.js';
import { cleanReason } from '../../lib/validate.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a member from the server')
  .addUserOption((o) => o.setName('user').setDescription('Member to kick').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(512))
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user', true);
  const reason = cleanReason(interaction.options.getString('reason'));
  const guild = interaction.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return refuse(interaction, 'That user is not in this server.');

  await runModAction(interaction, {
    type: 'kick',
    targetUser: user,
    targetMember: member,
    reason,
    apply: () => member.kick(`${reason} — by ${interaction.user.username}`),
    dmTitle: `You were kicked from ${guild.name}`,
  });
}
