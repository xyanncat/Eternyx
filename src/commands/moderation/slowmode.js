import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { runChannelAction } from '../../lib/actions.js';
import { cleanReason } from '../../lib/validate.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('slowmode')
  .setDescription('Set channel slowmode')
  .addIntegerOption((o) =>
    o
      .setName('seconds')
      .setDescription('Seconds between messages per user (0 = off, max 6h)')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(21600)
  )
  .addChannelOption((o) => o.setName('channel').setDescription('Channel (default: here)'))
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(512))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const seconds = interaction.options.getInteger('seconds', true);
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  const reason = cleanReason(interaction.options.getString('reason'));

  await runChannelAction(interaction, {
    type: 'slowmode',
    reason,
    description: `**Channel:** <#${channel.id}>\n**Slowmode:** ${seconds === 0 ? 'off' : `${seconds}s`}`,
    apply: () => channel.setRateLimitPerUser(seconds, `${reason} — by ${interaction.user.username}`),
  });
}
