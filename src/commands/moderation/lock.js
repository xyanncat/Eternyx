import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { runChannelAction } from '../../lib/actions.js';
import { cleanReason } from '../../lib/validate.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('lock')
  .setDescription('Lock a channel (deny SendMessages for @everyone)')
  .addChannelOption((o) => o.setName('channel').setDescription('Channel (default: here)'))
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(512))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  const reason = cleanReason(interaction.options.getString('reason', true));

  await runChannelAction(interaction, {
    type: 'lock',
    reason,
    description: `**Channel:** <#${channel.id}>\n@everyone can no longer send messages there.`,
    apply: () =>
      channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        { SendMessages: false },
        { reason: `lock — ${reason} — by ${interaction.user.username}` }
      ),
  });
}
