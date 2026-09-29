import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  InteractionContextType,
} from 'discord.js';
import { buildEmbed, errorEmbed, EPHEMERAL } from '../../lib/embeds.js';
import { setConfig, getConfig } from '../../storage/db.js';
import { env } from '../../config.js';

export const meta = { ownerOnly: true, cooldown: 5 };

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Bot configuration (owner only)')
  .addSubcommandGroup((g) =>
    g
      .setName('set')
      .setDescription('Set a value')
      .addSubcommand((s) =>
        s
          .setName('log-channel')
          .setDescription('Channel that receives audit/security embeds')
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Log channel')
              .setRequired(true)
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          )
      )
      .addSubcommand((s) =>
        s
          .setName('mod-role')
          .setDescription('Replace the moderator-role list with one role')
          .addRoleOption((o) => o.setName('role').setDescription('Moderator role').setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName('raid-threshold')
          .setDescription('Joins per minute that trigger raidGuard (default 10)')
          .addIntegerOption((o) => o.setName('joins').setDescription('3–60').setRequired(true).setMinValue(3).setMaxValue(60))
      )
      .addSubcommand((s) =>
        s
          .setName('nuke-auto-action')
          .setDescription('Auto-timeout a mass-banning admin (default: off, alert only)')
          .addBooleanOption((o) => o.setName('enabled').setDescription('on/off').setRequired(true))
      )
  )
  .addSubcommandGroup((g) =>
    g
      .setName('add')
      .setDescription('Add to a list')
      .addSubcommand((s) =>
        s
          .setName('mod-role')
          .setDescription('Add a moderator role')
          .addRoleOption((o) => o.setName('role').setDescription('Moderator role').setRequired(true))
      )
  )
  .addSubcommand((s) => s.setName('show').setDescription('Show current configuration'))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const guild = interaction.guild;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(true);
  const cfg = getConfig(guild.id);

  if (group === 'set' && sub === 'log-channel') {
    const channel = interaction.options.getChannel('channel', true);
    const perms = channel.permissionsFor(guild.members.me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      return interaction.reply({
        embeds: [errorEmbed(`I need View Channel, Send Messages and Embed Links in <#${channel.id}> first.`, interaction.user)],
        flags: EPHEMERAL,
      });
    }
    setConfig(guild.id, { logChannelId: channel.id });
    return interaction.reply({
      embeds: [buildEmbed({ kind: 'success', title: 'Log channel set', description: `Audit and security embeds now go to <#${channel.id}>.`, moderator: interaction.user })],
      flags: EPHEMERAL,
    });
  }

  if (group === 'set' && sub === 'mod-role') {
    const role = interaction.options.getRole('role', true);
    if (role.id === guild.id) {
      return interaction.reply({ embeds: [errorEmbed('@everyone cannot be a moderator role.', interaction.user)], flags: EPHEMERAL });
    }
    if (guild.members.me.roles.cache.has(role.id)) {
      return interaction.reply({
        embeds: [errorEmbed('That role belongs to the bot — it would let the bot moderate itself through the hierarchy check.', interaction.user)],
        flags: EPHEMERAL,
      });
    }
    setConfig(guild.id, { modRoleIds: [role.id] });
    return interaction.reply({
      embeds: [buildEmbed({ kind: 'success', title: 'Moderator role set', description: `Moderators: <@&${role.id}>`, moderator: interaction.user })],
      flags: EPHEMERAL,
    });
  }

  if (group === 'add' && sub === 'mod-role') {
    const role = interaction.options.getRole('role', true);
    if (role.id === guild.id || guild.members.me.roles.cache.has(role.id)) {
      return interaction.reply({ embeds: [errorEmbed('That role cannot be a moderator role.', interaction.user)], flags: EPHEMERAL });
    }
    const next = [...new Set([...cfg.modRoleIds, role.id])];
    setConfig(guild.id, { modRoleIds: next });
    return interaction.reply({
      embeds: [buildEmbed({ kind: 'success', title: 'Moderator role added', description: next.map((id) => `<@&${id}>`).join(', '), moderator: interaction.user })],
      flags: EPHEMERAL,
    });
  }

  if (group === 'set' && sub === 'raid-threshold') {
    const joins = interaction.options.getInteger('joins', true);
    setConfig(guild.id, { raidThreshold: joins });
    return interaction.reply({
      embeds: [buildEmbed({ kind: 'success', title: 'Raid threshold set', description: `raidGuard triggers at **${joins} joins/min**.`, moderator: interaction.user })],
      flags: EPHEMERAL,
    });
  }

  if (group === 'set' && sub === 'nuke-auto-action') {
    const enabled = interaction.options.getBoolean('enabled', true);
    setConfig(guild.id, { nukeAutoAction: enabled ? 1 : 0 });
    return interaction.reply({
      embeds: [buildEmbed({
        kind: 'success',
        title: `Nuke auto-action ${enabled ? 'enabled' : 'disabled'}`,
        description: enabled
          ? 'A mass-banning admin will be auto-timed-out for 1h (when within my hierarchy).'
          : 'Mass-ban bursts produce alerts only.',
        moderator: interaction.user,
      })],
      flags: EPHEMERAL,
    });
  }

  // show
  const lines = [
    `**Log channel:** ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'not set'}`,
    `**Moderator roles:** ${cfg.modRoleIds.length ? cfg.modRoleIds.map((id) => `<@&${id}>`).join(', ') : 'none'}`,
    `**Raid threshold:** ${cfg.raidThreshold} joins/min`,
    `**Nuke auto-action:** ${cfg.nukeAutoAction ? 'on' : 'off (alert only)'}`,
    `**Owners (env):** ${env.OWNER_IDS.length} configured`,
    `**Owners (guild):** ${cfg.ownerIds.length ? cfg.ownerIds.map((id) => `<@${id}>`).join(', ') : 'none'}`,
  ];
  return interaction.reply({
    embeds: [buildEmbed({ kind: 'info', title: 'Eternyx configuration', description: lines.join('\n'), moderator: interaction.user })],
    flags: EPHEMERAL,
  });
}
