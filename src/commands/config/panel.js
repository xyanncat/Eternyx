// /panel — post (or refresh) the button-driven security control panel.
// Owner-only: the buttons act on the whole guild.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { buildEmbed, errorEmbed, EPHEMERAL } from '../../lib/embeds.js';
import { postPanel } from '../../lib/panel.js';
import { setConfig } from '../../storage/db.js';

export const meta = { ownerOnly: true, cooldown: 10 };

export const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Post the security control panel (owner only)')
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Where to post it (defaults to the configured control channel)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const guild = interaction.guild;
  const chosen = interaction.options.getChannel('channel');

  await interaction.deferReply({ flags: EPHEMERAL });

  if (chosen) setConfig(guild.id, { controlPanelChannelId: chosen.id });

  const { getConfig } = await import('../../storage/db.js');
  const cfg = getConfig(guild.id);
  const destination = chosen ?? (cfg.controlPanelChannelId ? guild.channels.cache.get(cfg.controlPanelChannelId) : null);
  if (!destination?.isTextBased()) {
    return interaction.editReply({
      embeds: [errorEmbed('No control channel configured — pass one: `/panel channel:#channel`.', interaction.user)],
    });
  }

  const perms = destination.permissionsFor(guild.members.me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return interaction.editReply({
      embeds: [errorEmbed(`I need View Channel, Send Messages and Embed Links in <#${destination.id}>.`, interaction.user)],
    });
  }

  const message = await postPanel(guild, destination);
  return interaction.editReply({
    embeds: [
      buildEmbed({
        kind: 'success',
        title: 'Control panel posted',
        description: `Panel is live in <#${destination.id}>. Buttons: **Lockdown ON/OFF** (owner), **Status** (mods).`,
        moderator: interaction.user,
      }),
    ],
  });
}
