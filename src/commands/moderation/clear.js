import { PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { runChannelAction, refuse } from '../../lib/actions.js';
import { cleanReason } from '../../lib/validate.js';
import { buildEmbed } from '../../lib/embeds.js';

export const meta = { modOnly: true };

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Bulk-delete recent messages in a channel')
  .addIntegerOption((o) =>
    o.setName('count').setDescription('How many messages to scan (1–100)').setRequired(true).setMinValue(1).setMaxValue(100)
  )
  .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user'))
  .addChannelOption((o) => o.setName('channel').setDescription('Channel (default: here)'))
  .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(512))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const count = interaction.options.getInteger('count', true);
  const user = interaction.options.getUser('user');
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  const reason = cleanReason(interaction.options.getString('reason'));

  if (!channel?.isTextBased()) return refuse(interaction, 'That channel is not text-based.');
  const perms = channel.permissionsFor(interaction.guild.members.me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages])) {
    return refuse(interaction, `I need View Channel, Read History and Manage Messages in <#${channel.id}>.`);
  }

  await interaction.deferReply(); // defer first — message fetches can outlive the 3s interaction window
  const fetched = await channel.messages.fetch({ limit: count }).catch(() => null);
  if (!fetched) {
    return interaction.editReply({ embeds: [buildEmbed({ kind: 'error', title: 'Failed', description: `Could not fetch messages in <#${channel.id}>.` })] });
  }
  const targets = fetched.filter((m) => !user || m.author.id === user.id);

  await runChannelAction(interaction, {
    type: 'clear',
    reason,
    description: `**Channel:** <#${channel.id}>\n**Scanned:** ${targets.size} matching message${targets.size === 1 ? '' : 's'}${user ? ` from <@${user.id}>` : ''} (older than 14 days are skipped by Discord)`,
    apply: () => channel.bulkDelete(targets, true),
  });
}
