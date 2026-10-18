// /ticket — staff management of the ticket system.
//   /ticket panel [channel]  — post/refresh the ticket panel (sets config)
//   /ticket storage [channel] — set the transcript archive channel
//   /ticket close [reason]   — close the ticket channel it runs in
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { buildEmbed, errorEmbed, EPHEMERAL } from '../../lib/embeds.js';
import { getConfig, setConfig } from '../../storage/db.js';
import { postTicketPanel, closeTicket } from '../../lib/tickets.js';

export const meta = { modOnly: true, cooldown: 5 };

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Manage the ticket system (staff)')
  .addSubcommand((s) =>
    s
      .setName('panel')
      .setDescription('Post or refresh the ticket panel')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Panel channel (defaults to the configured one)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('storage')
      .setDescription('Set the transcript archive channel')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel that receives closed-ticket transcripts')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('close')
      .setDescription('Close the ticket this command runs in')
      .addStringOption((o) => o.setName('reason').setDescription('Closing reason').setMaxLength(512))
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand(true);
  const guild = interaction.guild;
  const cfg = getConfig(guild.id);

  if (sub === 'panel') {
    const chosen = interaction.options.getChannel('channel');
    const destination = chosen ?? (cfg.ticketPanelChannelId ? guild.channels.cache.get(cfg.ticketPanelChannelId) : null);
    if (!destination?.isTextBased()) {
      return interaction.reply({ embeds: [errorEmbed('No ticket channel configured — pass one: `/ticket panel channel:#channel`.', interaction.user)], flags: EPHEMERAL });
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    if (chosen) setConfig(guild.id, { ticketPanelChannelId: chosen.id });
    await postTicketPanel(guild, destination);
    return interaction.editReply({
      embeds: [buildEmbed({ kind: 'success', title: 'Ticket panel live', description: `Panel posted to <#${destination.id}>. Members can open tickets with the button.`, moderator: interaction.user })],
    });
  }

  if (sub === 'storage') {
    const channel = interaction.options.getChannel('channel', true);
    setConfig(guild.id, { ticketStorageChannelId: channel.id });
    return interaction.reply({
      embeds: [buildEmbed({ kind: 'success', title: 'Ticket storage set', description: `Closed-ticket transcripts now go to <#${channel.id}>.`, moderator: interaction.user })],
      flags: EPHEMERAL,
    });
  }

  // close
  const reason = interaction.options.getString('reason')?.trim() || 'No reason provided';
  await interaction.deferReply({ flags: EPHEMERAL });
  const result = await closeTicket(guild, interaction.channel, interaction.user, reason);
  if (!result.ok) {
    return interaction.editReply({ embeds: [errorEmbed(result.detail, interaction.user)] });
  }
  // Channel deleted on success.
}
