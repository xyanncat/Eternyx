// Control panel — a persistent, button-driven security dashboard posted to
// the configured control channel. State lives in the DB (no in-memory state),
// so the panel and its buttons survive restarts.
//
// Buttons (customId -> handled in events/interactionCreate):
//   panel:lockdown:on   owner-only — activate lockdown
//   panel:lockdown:off  owner-only — lift lockdown (exact restore)
//   panel:status        mod+       — fresh protection status, ephemeral
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getConfig, setConfig } from '../storage/db.js';
import { buildEmbed } from './embeds.js';
import { applyBrand } from './brand.js';
import { logger } from './log.js';
import { ROOT } from '../config.js';

export const PANEL_PREFIX = 'panel';
export const KAFKA_COLOR = 0x6b21a8; // kafka violet

// Control-deck banner (drawn programmatically, kafka-themed).
function banner(file) {
  const full = path.join(ROOT, 'assets', file);
  if (!existsSync(full)) return null;
  return new AttachmentBuilder(full, { name: file });
}

export function panelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:lockdown:on`).setLabel('Lockdown').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:lockdown:off`).setLabel('Unlock').setEmoji('🔓').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:status`).setLabel('Status').setEmoji('📊').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:alert`).setLabel('Test Alert').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:shield`).setLabel('Invite Shield').setEmoji('🛡').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:presets`).setLabel('Profanity Guard').setEmoji('🍇').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:guard`).setLabel('Mention Guard').setEmoji('🕸').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:refresh`).setLabel('Refresh').setEmoji('♻️').setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function yesNo(v) {
  return v ? '✅' : '❌';
}

export async function panelState(guild) {
  const cfg = getConfig(guild.id);
  const automod = await guild.autoModerationRules.fetch().catch(() => null);
  const rules = automod ?? guild.autoModerationRules.cache;
  const enabledRules = [...rules.values()].filter((r) => r.enabled);
  const enabled = enabledRules.length;
  const total = rules.size;
  const textChannels = [...guild.channels.cache.values()].filter((c) => c.isTextBased() && !c.isThread() && !c.isVoiceBased()).length;

  return {
    lockdownActive: Boolean(cfg.lockdownActive),
    logChannelId: cfg.logChannelId,
    modRoleIds: cfg.modRoleIds,
    raidThreshold: cfg.raidThreshold,
    nukeAutoAction: cfg.nukeAutoAction,
    verificationLevel: guild.verificationLevel,
    automodEnabled: enabled,
    automodTotal: total,
    textChannels,
    memberCount: guild.memberCount,
  };
}

export function panelEmbed(guild, state) {
  const lock = state.lockdownActive;
  const embed = buildEmbed({
    kind: lock ? 'error' : 'info',
    title: lock ? '🚨 Control deck — LOCKDOWN ACTIVE' : '🕸 Eternyx control deck',
    description: lock
      ? 'All public channels are locked. Everyone can still read; nobody below staff can write. Press **Unlock** to restore the previous channel permissions.'
      : 'Every guard, one deck. Each button is a command — every action is logged.',
    fields: [
      {
        name: 'Lockdown',
        value: lock ? '🔒 ACTIVE — press Unlock to lift' : '🔓 off',
        inline: true,
      },
      { name: 'Raid guard', value: `trigger at ${state.raidThreshold} joins/min`, inline: true },
      { name: 'Nuke auto-action', value: yesNo(state.nukeAutoAction) + (state.nukeAutoAction ? ' auto-timeout on mass bans' : ' alert only'), inline: true },
      { name: 'Verification level', value: String(state.verificationLevel), inline: true },
      { name: 'AutoMod rules', value: `${state.automodEnabled} enabled / ${state.automodTotal} total`, inline: true },
      { name: 'Moderator roles', value: state.modRoleIds.length ? `${state.modRoleIds.length} configured` : '⚠ none — set one in Server setup', inline: true },
      { name: 'Audit log channel', value: state.logChannelId ? `<#${state.logChannelId}>` : '⚠ not set', inline: true },
      { name: 'Channels watched', value: `${state.textChannels} text channels`, inline: true },
    ],
  });
  embed.setColor(KAFKA_COLOR);
  const art = banner('kafka-panel-control.png');
  if (art) embed.setImage('attachment://kafka-panel-control.png');
  return { embed, art };
}

// Post a fresh panel message; if an old panel is known, delete it first so the
// channel never accumulates stale panels.
export async function postPanel(guild, channel) {
  const cfg = getConfig(guild.id);
  if (cfg.controlPanelChannelId && cfg.controlPanelMessageId) {
    const oldChannel = guild.channels.cache.get(cfg.controlPanelChannelId);
    const old = await oldChannel?.messages.fetch(cfg.controlPanelMessageId).catch(() => null);
    await old?.delete().catch(() => {});
  }
  const state = await panelState(guild);
  const { embed, art } = panelEmbed(guild, state);
  // The banner IS the brand image for the panel — build the payload manually
  // so applyBrand doesn't double-attach kafka.png (it respects existing image).
  const payload = { embeds: [embed], components: panelButtons() };
  if (art) payload.files = [art];
  const message = await channel.send(payload);
  setConfig(guild.id, { controlPanelChannelId: channel.id, controlPanelMessageId: message.id });
  logger.info(`control panel posted in ${channel.id} (${message.id})`);
  return message;
}
