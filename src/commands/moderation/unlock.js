import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { runChannelAction } from '../../lib/actions.js';
import { cleanReason } from '../../lib/validate.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('unlock')
  .setDescription('Unlock a channel (remove the lock on SendMessages)')
  .addChannelOption((o) => o.setName('channel').setDescription('Channel (default: here)'))
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(512))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  const reason = cleanReason(interaction.options.getString('reason'));

  await runChannelAction(interaction, {
    type: 'unlock',
    reason,
    description: `**Channel:** <#${channel.id}>\nThe @everyone SendMessages override was removed — previous state restored.`,
    // null removes OUR override rather than forcing allow — restores whatever was there before.
    apply: () =>
      channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        { SendMessages: null },
        { reason: `unlock — ${reason} — by ${interaction.user.username}` }
      ),
  });
}
