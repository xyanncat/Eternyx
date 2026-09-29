import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { runModAction } from '../../lib/actions.js';
import { cleanReason } from '../../lib/validate.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('softban')
  .setDescription('Ban and immediately unban a user to purge their messages')
  .addUserOption((o) => o.setName('user').setDescription('User to soft-ban').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(512))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user', true);
  const reason = cleanReason(interaction.options.getString('reason'));
  const guild = interaction.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  const auditReason = `${reason} — by ${interaction.user.username}`;

  await runModAction(interaction, {
    type: 'softban',
    targetUser: user,
    targetMember: member,
    reason,
    apply: async () => {
      await guild.members.ban(user.id, { deleteMessageSeconds: 86_400, reason: auditReason });
      await guild.members.unban(user.id, 'softban auto-unban');
    },
    dmTitle: `You were soft-banned from ${guild.name} (message purge; you may rejoin)`,
  });
}
