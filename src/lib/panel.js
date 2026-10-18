// Control panel — a persistent, button-driven security dashboard posted to
// the configured control channel. State lives in the DB (no in-memory state),
// so the panel and its buttons survive restarts.
//
// Buttons (customId -> handled in events/interactionCreate):
//   panel:lockdown:on   owner-only — activate lockdown
//   panel:lockdown:off  owner-only — lift lockdown (exact restore)
//   panel:status        mod+       — fresh protection status, ephemeral
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MessageFlags,
} from 'discord.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getConfig, setConfig } from '../storage/db.js';
import { buildEmbed } from './embeds.js';
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

export function panelStatusEmbed(state) {
  const lock = state.lockdownActive;
  const embed = buildEmbed({
    kind: lock ? 'error' : 'info',
    title: lock ? '🚨 Control deck — LOCKDOWN ACTIVE' : '🕸 Control deck status',
    description: 'Live snapshot of every guard.',
    fields: [
      { name: 'Lockdown', value: lock ? '🔒 ACTIVE — press Unlock to lift' : '🔓 off', inline: true },
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
  return embed;
}

// The panel message itself is IMAGE + BUTTONS with no embed in between —
// Discord always renders buttons outside embeds, so dropping the embed puts
// the buttons directly attached to the artwork (the closest possible
// "buttons inside the panel" look). Live state rides in a compact content
// line above the image instead.
export function panelContent(state) {
  const lock = state.lockdownActive ? '🔒 lockdown ACTIVE' : '🔓 lockdown off';
  return `🕸 **ETERNYX CONTROL DECK** — ${lock} · raid guard ${state.raidThreshold}/min · automod ${state.automodEnabled} on · nuke auto-action ${state.nukeAutoAction ? 'on' : 'off'}`;
}

// Components V2 card: ONE frame containing text, the banner art, and the
// buttons — the buttons render INSIDE the card (what classic embeds can
// never do). Kafka violet accent bar.
export function panelContainer(state) {
  return new ContainerBuilder()
    .setAccentColor(KAFKA_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(panelContent(state)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems({ media: { url: 'attachment://kafka-panel-control.png' }, description: 'Eternyx control deck' })
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(...panelButtons());
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
  const art = banner('kafka-panel-control.png');
  const payload = {
    components: [panelContainer(state)],
    flags: MessageFlags.IsComponentsV2,
  };
  if (art) payload.files = [art];
  const message = await channel.send(payload);
  setConfig(guild.id, { controlPanelChannelId: channel.id, controlPanelMessageId: message.id });
  logger.info(`control panel posted in ${channel.id} (${message.id})`);
  return message;
}
