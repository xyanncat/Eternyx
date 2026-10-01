// Dashboard command dispatcher. The remote setup board enqueues commands; the
// phone pulls and executes them here. Security model:
// - actions are a fixed allowlist — unknown actions are rejected before anything runs
// - params are validated server-side (snowflakes, lengths, ranges) — fail closed
// - every execution is recorded as a security event (plan §4.9 audit trail)
import { setConfig, recordEvent, createCase, getConfig } from '../storage/db.js';
import { buildEmbed } from './embeds.js';
import { isSnowflake } from './validate.js';
import { logger } from './log.js';

export const KNOWN_ACTIONS = [
  'set-log-channel',
  'set-mod-role',
  'add-mod-role',
  'set-raid-threshold',
  'set-nuke-auto-action',
  'announce',
  'set-slowmode',
  'lock-channel',
  'unlock-channel',
  'automod-keyword',
  'automod-invite',
  'automod-preset',
  'automod-mention-spam',
  'automod-remove',
];

function guildOf(client) {
  return client.guilds.cache.first() ?? null;
}

function channelOf(guild, id) {
  return guild?.channels.cache.get(id) ?? null;
}

export function validateCommand({ action, params = {} }) {
  if (!KNOWN_ACTIONS.includes(action)) return { ok: false, reason: `unknown action: ${action}` };
  const p = params ?? {};
  switch (action) {
    case 'set-log-channel':
    case 'set-mod-role':
    case 'add-mod-role':
      if (!isSnowflake(p.id ?? '')) return { ok: false, reason: 'missing/invalid id' };
      return { ok: true };
    case 'set-raid-threshold': {
      const n = Number(p.joins);
      if (!Number.isInteger(n) || n < 3 || n > 60) return { ok: false, reason: 'joins must be 3–60' };
      return { ok: true };
    }
    case 'set-nuke-auto-action':
      if (typeof p.enabled !== 'boolean') return { ok: false, reason: 'enabled must be boolean' };
      return { ok: true };
    case 'announce':
      if (!isSnowflake(p.channelId ?? '')) return { ok: false, reason: 'missing/invalid channelId' };
      if (typeof p.message !== 'string' || p.message.trim().length === 0 || p.message.length > 2000) {
        return { ok: false, reason: 'message must be 1–2000 chars' };
      }
      if (p.title != null && (typeof p.title !== 'string' || p.title.length > 256)) {
        return { ok: false, reason: 'title must be ≤256 chars' };
      }
      return { ok: true };
    case 'set-slowmode': {
      if (!isSnowflake(p.channelId ?? '')) return { ok: false, reason: 'missing/invalid channelId' };
      const s = Number(p.seconds);
      if (!Number.isInteger(s) || s < 0 || s > 21600) return { ok: false, reason: 'seconds must be 0–21600' };
      return { ok: true };
    }
    case 'lock-channel':
    case 'unlock-channel':
      if (!isSnowflake(p.channelId ?? '')) return { ok: false, reason: 'missing/invalid channelId' };
      return { ok: true };
    case 'automod-keyword': {
      if (typeof p.name !== 'string' || p.name.trim().length < 2 || p.name.length > 60) {
        return { ok: false, reason: 'name must be 2–60 chars' };
      }
      if (!Array.isArray(p.words) || p.words.length === 0 || p.words.length > 50 ||
          !p.words.every((w) => typeof w === 'string' && w.length > 0 && w.length <= 60)) {
        return { ok: false, reason: 'words must be 1–50 strings (≤60 chars each)' };
      }
      return { ok: true };
    }
    case 'automod-mention-spam': {
      const n = Number(p.limit);
      if (!Number.isInteger(n) || n < 5 || n > 50) return { ok: false, reason: 'limit must be 5–50' };
      return { ok: true };
    }
    case 'automod-invite':
    case 'automod-preset':
      return { ok: true };
    case 'automod-remove':
      if (typeof p.name !== 'string' || p.name.trim().length < 2) return { ok: false, reason: 'missing name' };
      return { ok: true };
    default:
      return { ok: false, reason: 'unhandled action' };
  }
}

async function buildAutomodActions(guild) {
  const cfg = (await import('../storage/db.js')).getConfig(guild.id);
  const actions = [{ type: 1 }]; // AutoModerationActionType.BlockMessage
  if (cfg.logChannelId) {
    actions.push({ type: 2, metadata: { channelId: cfg.logChannelId } }); // SendAlertMessage
  }
  return actions;
}

export async function executeCommand(client, { action, params = {}, createdBy = 'dashboard' }) {
  const guild = guildOf(client);
  if (!guild) return { ok: false, detail: 'bot is not in a guild' };
  const check = validateCommand({ action, params });
  if (!check.ok) return { ok: false, detail: check.reason };
  const auditReason = `dashboard setup by ${createdBy}`;

  try {
    switch (action) {
      case 'set-log-channel': {
        const ch = channelOf(guild, params.id);
        if (!ch?.isTextBased()) return { ok: false, detail: 'channel not found or not text-based' };
        setConfig(guild.id, { logChannelId: ch.id });
        return { ok: true, detail: `log channel → <#${ch.id}>` };
      }
      case 'set-mod-role': {
        if (!guild.roles.cache.has(params.id)) return { ok: false, detail: 'role not found' };
        setConfig(guild.id, { modRoleIds: [params.id] });
        return { ok: true, detail: 'moderator role list replaced' };
      }
      case 'add-mod-role': {
        if (!guild.roles.cache.has(params.id)) return { ok: false, detail: 'role not found' };
        const cfg = getConfig(guild.id);
        const next = [...new Set([...cfg.modRoleIds, params.id])];
        setConfig(guild.id, { modRoleIds: next });
        return { ok: true, detail: `moderator roles: ${next.length}` };
      }
      case 'set-raid-threshold':
        setConfig(guild.id, { raidThreshold: Number(params.joins) });
        return { ok: true, detail: `raid threshold → ${params.joins}/min` };
      case 'set-nuke-auto-action':
        setConfig(guild.id, { nukeAutoAction: params.enabled ? 1 : 0 });
        return { ok: true, detail: `nuke auto-action ${params.enabled ? 'on' : 'off'}` };
      case 'announce': {
        const ch = channelOf(guild, params.channelId);
        if (!ch?.isTextBased()) return { ok: false, detail: 'channel not found or not text-based' };
        const embed = buildEmbed({
          kind: 'info',
          title: params.title || 'Announcement',
          description: params.message,
          moderator: client.user,
        });
        await ch.send({ embeds: [embed] });
        return { ok: true, detail: `announced in <#${ch.id}>` };
      }
      case 'set-slowmode': {
        const ch = channelOf(guild, params.channelId);
        if (!ch?.isTextBased()) return { ok: false, detail: 'channel not found or not text-based' };
        await ch.setRateLimitPerUser(Number(params.seconds), auditReason);
        return { ok: true, detail: `slowmode ${params.seconds}s in <#${ch.id}>` };
      }
      case 'lock-channel':
      case 'unlock-channel': {
        const ch = channelOf(guild, params.channelId);
        if (!ch?.isTextBased()) return { ok: false, detail: 'channel not found or not text-based' };
        await ch.permissionOverwrites.edit(
          guild.roles.everyone,
          { SendMessages: action === 'lock-channel' ? false : null },
          { reason: auditReason }
        );
        createCase({
          guildId: guild.id,
          userId: '0',
          moderatorId: client.user.id,
          type: action === 'lock-channel' ? 'lock' : 'unlock',
          reason: auditReason,
        });
        return { ok: true, detail: `${action === 'lock-channel' ? 'locked' : 'unlocked'} <#${ch.id}>` };
      }
      case 'automod-keyword': {
        const rule = await guild.autoModerationRules.create({
          name: `eternyx-keyword: ${params.name}`.slice(0, 80),
          eventType: 1, // MessageSend
          triggerType: 1, // Keyword
          triggerMetadata: { keywordFilter: params.words },
          actions: await buildAutomodActions(guild),
          enabled: true,
          reason: auditReason,
        });
        return { ok: true, detail: `keyword rule "${rule.name}" created` };
      }
      case 'automod-invite': {
        const rule = await guild.autoModerationRules.create({
          name: 'eternyx-invite-block',
          eventType: 1,
          triggerType: 1,
          triggerMetadata: { keywordFilter: ['*discord.gg/*', '*discord.com/invite/*'] },
          actions: await buildAutomodActions(guild),
          enabled: true,
          reason: auditReason,
        });
        return { ok: true, detail: `invite blocking "${rule.name}" active` };
      }
      case 'automod-preset': {
        const rule = await guild.autoModerationRules.create({
          name: 'eternyx-presets',
          eventType: 1,
          triggerType: 4, // KeywordPreset
          triggerMetadata: { presets: [1, 2, 3] }, // profanity, sexual content, slurs
          actions: await buildAutomodActions(guild),
          enabled: true,
          reason: auditReason,
        });
        return { ok: true, detail: `preset filters "${rule.name}" active` };
      }
      case 'automod-mention-spam': {
        const rule = await guild.autoModerationRules.create({
          name: 'eternyx-mention-spam',
          eventType: 1,
          triggerType: 5, // Spam
          triggerMetadata: { mentionTotalLimit: Number(params.limit) },
          actions: await buildAutomodActions(guild),
          enabled: true,
          reason: auditReason,
        });
        return { ok: true, detail: `mention-spam limit ${params.limit}` };
      }
      case 'automod-remove': {
        await guild.autoModerationRules.fetch();
        const rule = guild.autoModerationRules.cache.find(
          (r) => r.name === params.name || r.name === `eternyx-keyword: ${params.name}`
        );
        if (!rule) return { ok: false, detail: `no rule named "${params.name}"` };
        const ruleName = rule.name;
        await rule.delete(auditReason);
        return { ok: true, detail: `rule "${ruleName}" removed` };
      }
      default:
        return { ok: false, detail: 'unhandled action' };
    }
  } catch (err) {
    logger.warn(`dashboard command ${action} failed: ${err.message}`);
    return { ok: false, detail: err.message };
  } finally {
    recordEvent('dashboard_cmd', JSON.stringify({ action, by: createdBy, params }));
  }
}
