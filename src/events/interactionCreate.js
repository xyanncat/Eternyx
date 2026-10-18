// Slash-command + control-panel router — the app-level authorization gate
// (plan §4.4). Discord's default member permissions hide commands; this
// re-checks every interaction so in-server permission edits are honored
// immediately. Panel buttons are authorized here too (owner/mod re-check).
import { Events } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { errorEmbed, buildEmbed, EPHEMERAL } from '../lib/embeds.js';
import { checkCooldown } from '../lib/cooldowns.js';
import { isMod, isOwner } from '../lib/perms.js';
import { getConfig } from '../storage/db.js';
import { logger } from '../lib/log.js';
import { applyBrand } from '../lib/brand.js';
import { ticketSubjectModal, createTicket, closeTicket, claimTicket, snapshotTranscript } from '../lib/tickets.js';
import { getTicketByChannel } from '../storage/db.js';

export const name = Events.InteractionCreate;

// Every interaction response (slash replies, buttons) carries the fixed brand
// image. deferReply is deliberately not wrapped (no content yet).
function brandInteraction(interaction) {
  for (const method of ['reply', 'followUp', 'editReply']) {
    const original = interaction[method]?.bind(interaction);
    if (!original) continue;
    interaction[method] = (options) => original(applyBrand(options));
  }
}

async function handleButton(interaction, cfg) {
  const [ns, action, arg] = interaction.customId.split(':');
  if (ns === 'ticket') return handleTicketButton(interaction, cfg, action, arg);
  if (ns !== 'panel') return;

  const wait = checkCooldown(`${interaction.user.id}:panel:${action}`, 5);
  if (wait > 0) {
    return interaction.reply({
      embeds: [errorEmbed(`Slow down — try again in ${Math.ceil(wait)}s.`, interaction.user)],
      flags: EPHEMERAL,
    });
  }

  const guild = interaction.guild;
  const guildOwnerId = guild?.ownerId ?? null;

  if (action === 'status') {
    if (!isMod(interaction.member, cfg)) {
      return interaction.reply({ embeds: [errorEmbed('Moderators only.', interaction.user)], flags: EPHEMERAL });
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    const { panelState, panelStatusEmbed } = await import('../lib/panel.js');
    const state = await panelState(guild);
    return interaction.editReply({ embeds: [panelStatusEmbed(state)] });
  }

  if (action === 'lockdown') {
    if (!isOwner(interaction.user.id, cfg, guildOwnerId)) {
      return interaction.reply({ embeds: [errorEmbed('Only bot owners can toggle lockdown.', interaction.user)], flags: EPHEMERAL });
    }
    await interaction.deferUpdate();
    const { activateLockdown, deactivateLockdown } = await import('../lib/lockdown.js');
    const { sendAuditLog } = await import('../lib/audit.js');
    const reason = `control deck by ${interaction.user.username}`;
    const result = arg === 'on'
      ? await activateLockdown(guild, interaction.user.username, reason)
      : await deactivateLockdown(guild, interaction.user.username, reason);

    const embed = buildEmbed({
      kind: arg === 'on' ? 'warn' : 'success',
      title: arg === 'on' ? '🔒 Lockdown active' : '🔓 Lockdown lifted',
      description: result.ok ? result.detail : `No change — ${result.detail}.`,
      moderator: interaction.user,
    });
    await sendAuditLog(guild, embed);
    if (!result.ok) {
      await interaction.followUp({ embeds: [embed], flags: EPHEMERAL }).catch(() => {});
    }
    // Refresh the panel card with the new state (Components V2 rebuild).
    const { panelState, panelContainer } = await import('../lib/panel.js');
    const { MessageFlags } = await import('discord.js');
    const state = await panelState(guild);
    await interaction
      .editReply({ components: [panelContainer(state)], flags: MessageFlags.IsComponentsV2 })
      .catch(() => {});
    return;
  }

  // Control-deck command buttons: defer first (10062 lesson), then run the
  // same validated dispatcher the dashboard uses — one code path.
  const DECK_ACTIONS = { alert: 'test-alert', shield: 'automod-invite', presets: 'automod-preset', guard: null };
  if (action === 'alert' || action === 'shield' || action === 'presets' || action === 'guard' || action === 'refresh') {
    if (!isMod(interaction.member, cfg)) {
      return interaction.reply({ embeds: [errorEmbed('Moderators only.', interaction.user)], flags: EPHEMERAL });
    }
    await interaction.deferUpdate();
    try {
      if (action === 'refresh') {
        const { postPanel } = await import('../lib/panel.js');
        await postPanel(guild, interaction.channel);
        return; // postPanel deletes this very message — nothing to edit
      }
      const { executeCommand } = await import('../lib/commands.js');
      const params = action === 'guard' ? { limit: 10 } : {};
      const result = await executeCommand(interaction.client, {
        action: DECK_ACTIONS[action] ?? (action === 'guard' ? 'automod-mention-spam' : null),
        params,
        createdBy: `control deck by ${interaction.user.username}`,
      });
      const embed = buildEmbed({
        kind: result.ok ? 'success' : 'error',
        title: result.ok ? '✅ Done' : '❌ Failed',
        description: result.detail,
        moderator: interaction.user,
      });
      await interaction.followUp({ embeds: [embed], flags: EPHEMERAL }).catch(() => {});
    } catch (err) {
      logger.error(`deck button ${action} failed: ${err?.stack ?? err}`);
      await interaction.followUp({ embeds: [errorEmbed('That action failed. The incident has been logged.', interaction.user)], flags: EPHEMERAL }).catch(() => {});
    }
    return;
  }
}

// Ticket flow: panel button (per-category) -> subject modal -> private channel;
// in-channel close button -> transcript archive + channel delete (staff/opener).
async function handleTicketButton(interaction, cfg, action, arg) {
  const guild = interaction.guild;
  if (action === 'open') {
    const wait = checkCooldown(`${interaction.user.id}:ticket:open`, 10);
    if (wait > 0) {
      return interaction.reply({
        embeds: [errorEmbed(`Slow down — try again in ${Math.ceil(wait)}s.`, interaction.user)],
        flags: EPHEMERAL,
      });
    }
    return interaction.showModal(ticketSubjectModal(arg ?? 'other'));
  }
  if (action === 'close') {
    const row = getTicketByChannel(interaction.channel.id);
    if (!row) {
      return interaction.reply({ embeds: [errorEmbed('This channel is not an open ticket.', interaction.user)], flags: EPHEMERAL });
    }
    const isStaff = isMod(interaction.member, cfg) || row.opener_id === interaction.user.id;
    if (!isStaff) {
      return interaction.reply({ embeds: [errorEmbed('Only the ticket opener or staff can close this ticket.', interaction.user)], flags: EPHEMERAL });
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    const result = await closeTicket(guild, interaction.channel, interaction.user, 'closed via ticket button');
    if (!result.ok) {
      return interaction.editReply({ embeds: [errorEmbed(result.detail, interaction.user)] });
    }
    // Channel is deleted on success; nothing left to edit.
    return;
  }
  if (action === 'claim') {
    if (!isMod(interaction.member, cfg)) {
      return interaction.reply({ embeds: [errorEmbed('Only staff can claim a ticket.', interaction.user)], flags: EPHEMERAL });
    }
    const row = getTicketByChannel(interaction.channel.id);
    if (!row) {
      return interaction.reply({ embeds: [errorEmbed('This channel is not an open ticket.', interaction.user)], flags: EPHEMERAL });
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    const result = await claimTicket(guild, interaction.channel, interaction.user, row);
    return interaction.editReply({ embeds: [buildEmbed({ kind: 'success', title: 'Ticket claimed', description: result.detail, moderator: interaction.user })] });
  }
  if (action === 'transcript') {
    const row = getTicketByChannel(interaction.channel.id);
    if (!row) {
      return interaction.reply({ embeds: [errorEmbed('This channel is not an open ticket.', interaction.user)], flags: EPHEMERAL });
    }
    const isStaff = isMod(interaction.member, cfg) || row.opener_id === interaction.user.id;
    if (!isStaff) {
      return interaction.reply({ embeds: [errorEmbed('Only the ticket opener or staff can request a transcript.', interaction.user)], flags: EPHEMERAL });
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    const result = await snapshotTranscript(guild, interaction.channel, interaction.user, row);
    return interaction.editReply({ embeds: [buildEmbed({ kind: 'success', title: 'Transcript archived', description: result.detail, moderator: interaction.user })] });
  }
}

export async function execute(interaction) {
  brandInteraction(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket:subject')) {
    const categoryKey = interaction.customId.split(':')[2] ?? 'other';
    const subject = interaction.fields.getTextInputValue('subject').trim().slice(0, 200);
    // DEFER FIRST (the 10062 bug): channel creation + welcome + audit can
    // exceed Discord's 3s interaction window on the phone — acknowledge
    // immediately, then take as long as needed.
    await interaction.deferReply({ flags: EPHEMERAL });
    try {
      const { channel } = await createTicket(interaction.guild, interaction.member, subject, categoryKey);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setURL(channel.url).setLabel('Go to your ticket').setStyle(ButtonStyle.Link)
      );
      return await interaction.editReply({
        embeds: [buildEmbed({ kind: 'success', title: 'Ticket created', description: `Your private ticket is ready — only you and staff can see it.`, moderator: interaction.user })],
        components: [row],
      });
    } catch (err) {
      logger.error(`ticket create failed: ${err?.stack ?? err}`);
      return await interaction.editReply({
        embeds: [errorEmbed(`Could not create the ticket (${err.message}). It has been logged.`, interaction.user)],
      });
    }
  }
  if (interaction.isButton()) {
    const cfg = getConfig(interaction.guildId);
    try {
      await handleButton(interaction, cfg);
    } catch (err) {
      logger.error(`panel button failed: ${err?.stack ?? err}`);
      const embed = errorEmbed('That action failed. The incident has been logged.', interaction.user);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [embed], flags: EPHEMERAL }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [embed], flags: EPHEMERAL }).catch(() => {});
      }
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) return;

  const meta = command.meta ?? {};
  const wait = checkCooldown(`${interaction.user.id}:${interaction.commandName}`, meta.cooldown ?? 3);
  if (wait > 0) {
    return interaction.reply({
      embeds: [errorEmbed(`Slow down — try again in ${Math.ceil(wait)}s.`, interaction.user)],
      flags: EPHEMERAL,
    });
  }

  if (meta.ownerOnly || meta.modOnly) {
    const cfg = getConfig(interaction.guildId);
    const guildOwnerId = interaction.guild?.ownerId ?? null;
    if (meta.ownerOnly && !isOwner(interaction.user.id, cfg, guildOwnerId)) {
      return interaction.reply({
        embeds: [errorEmbed('This command is restricted to bot owners.', interaction.user)],
        flags: EPHEMERAL,
      });
    }
    if (meta.modOnly && !isMod(interaction.member, cfg)) {
      return interaction.reply({
        embeds: [errorEmbed('You need the moderator role to use this command.', interaction.user)],
        flags: EPHEMERAL,
      });
    }
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error(`command /${interaction.commandName} failed: ${err?.stack ?? err}`);
    const embed = errorEmbed('Something went wrong running that command. The incident has been logged.', interaction.user);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ embeds: [embed], flags: EPHEMERAL }).catch(() => {});
    } else {
      await interaction.reply({ embeds: [embed], flags: EPHEMERAL }).catch(() => {});
    }
  }
}
