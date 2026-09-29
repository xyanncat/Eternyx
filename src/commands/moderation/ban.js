import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { runModAction } from '../../lib/actions.js';
import { cleanReason } from '../../lib/validate.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user from the server')
  .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(512))
  .addIntegerOption((o) =>
    o
      .setName('delete_days')
      .setDescription('Delete their messages from the last N days (0–7)')
      .setMinValue(0)
      .setMaxValue(7)
  )
  .addBooleanOption((o) =>
    o.setName('dm_notify').setDescription('DM the user the reason before banning (default: yes)')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user', true);
  const reason = cleanReason(interaction.options.getString('reason'));
  const days = interaction.options.getInteger('delete_days') ?? 0;
  const dm = interaction.options.getBoolean('dm_notify') ?? true;
  const guild = interaction.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);

  await runModAction(interaction, {
    type: 'ban',
    targetUser: user,
    targetMember: member,
    reason,
    apply: () =>
      guild.members.ban(user.id, {
        deleteMessageSeconds: days * 86_400,
        reason: `${reason} — by ${interaction.user.username}`,
      }),
    dmTitle: dm ? `You were banned from ${guild.name}` : null,
  });
}
