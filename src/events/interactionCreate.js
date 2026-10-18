// Slash-command + control-panel router — the app-level authorization gate
// (plan §4.4). Discord's default member permissions hide commands; this
// re-checks every interaction so in-server permission edits are honored
// immediately. Panel buttons are authorized here too (owner/mod re-check).
import { Events } from 'discord.js';
import { errorEmbed, buildEmbed, EPHEMERAL } from '../lib/embeds.js';
import { checkCooldown } from '../lib/cooldowns.js';
import { isMod, isOwner } from '../lib/perms.js';
import { getConfig } from '../storage/db.js';
import { logger } from '../lib/log.js';
import { applyBrand } from '../lib/brand.js';

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
    const { panelState, panelEmbed } = await import('../lib/panel.js');
    const state = await panelState(guild);
    return interaction.reply({ embeds: [panelEmbed(guild, state)], flags: EPHEMERAL });
  }

  if (action === 'lockdown') {
    if (!isOwner(interaction.user.id, cfg, guildOwnerId)) {
      return interaction.reply({ embeds: [errorEmbed('Only bot owners can toggle lockdown.', interaction.user)], flags: EPHEMERAL });
    }
    await interaction.deferUpdate();
    const { activateLockdown, deactivateLockdown } = await import('../lib/lockdown.js');
    const { sendAuditLog } = await import('../lib/audit.js');
    const reason = `control panel by ${interaction.user.username}`;
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
    // Refresh the panel message with the new state.
    const { panelState, panelEmbed, panelButtons } = await import('../lib/panel.js');
    const state = await panelState(guild);
    await interaction.editReply({ embeds: [panelEmbed(guild, state)], components: [panelButtons()] }).catch(() => {});
    return;
  }
}

// Ticket flow: panel button -> subject modal -> private channel; in-channel
// close button -> transcript archive + channel delete (staff or opener only).
async function handleTicketButton(interaction, cfg, action) {
  const guild = interaction.guild;
  if (action === 'open') {
    const wait = checkCooldown(`${interaction.user.id}:ticket:open`, 10);
    if (wait > 0) {
      return interaction.reply({
        embeds: [errorEmbed(`Slow down — try again in ${Math.ceil(wait)}s.`, interaction.user)],
        flags: EPHEMERAL,
      });
    }
    const { ticketSubjectModal } = await import('../lib/tickets.js');
    return interaction.showModal(ticketSubjectModal());
  }
  if (action === 'close') {
    const row = (await import('../storage/db.js')).getTicketByChannel(interaction.channel.id);
    if (!row) {
      return interaction.reply({ embeds: [errorEmbed('This channel is not an open ticket.', interaction.user)], flags: EPHEMERAL });
    }
    const isStaff = isMod(interaction.member, cfg) || row.opener_id === interaction.user.id;
    if (!isStaff) {
      return interaction.reply({ embeds: [errorEmbed('Only the ticket opener or staff can close this ticket.', interaction.user)], flags: EPHEMERAL });
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    const { closeTicket } = await import('../lib/tickets.js');
    const result = await closeTicket(guild, interaction.channel, interaction.user, 'closed via ticket button');
    if (!result.ok) {
      return interaction.editReply({ embeds: [errorEmbed(result.detail, interaction.user)] });
    }
    // Channel is deleted on success; nothing left to edit.
    return;
  }
}

export async function execute(interaction) {
  brandInteraction(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'ticket:subject') {
    const subject = interaction.fields.getTextInputValue('subject').trim().slice(0, 200);
    const { createTicket } = await import('../lib/tickets.js');
    const { channel } = await createTicket(interaction.guild, interaction.member, subject);
    return interaction.reply({
      embeds: [buildEmbed({ kind: 'success', title: 'Ticket created', description: `Your ticket is ready: <#${channel.id}>`, moderator: interaction.user })],
      flags: EPHEMERAL,
    });
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
