// Message event logging: edits, deletes, bulk deletes → log channel.
// Everything a member does to a message becomes visible, including content,
// links, embeds and attachments (MessageContent intent required — enabled
// on the application). A small message cache backs the "before" content for
// edits and the content for deletes; uncached events degrade gracefully.
import { AuditLogEvent } from 'discord.js';
import { buildEmbed } from './embeds.js';
import { sendAuditLog } from './audit.js';
import { logger } from './log.js';

const SNIPPET = 900;
const MAX_LIST = 5;

function clip(text, cap = SNIPPET) {
  if (text == null || text === '') return '*empty*';
  const t = String(text);
  return t.length > cap ? `${t.slice(0, cap)}…` : t;
}

function jumpLink(message) {
  return `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
}

function authorLine(message) {
  const a = message.author;
  if (!a) return 'unknown author';
  return `<@${a.id}> (${a.username ?? a.tag ?? 'unknown'})${a.bot ? ' 🤖' : ''}`;
}

function attachmentLines(message) {
  const list = [...(message.attachments?.values?.() ?? [])];
  if (list.length === 0) return null;
  return list
    .slice(0, MAX_LIST)
    .map((at) => {
      const kb = Math.round((at.size ?? 0) / 1024);
      const url = at.url ?? at.proxyURL ?? '';
      return `📎 **${at.name ?? 'file'}** (${at.contentType ?? 'unknown'}, ${kb} KB)${url ? `\n${url}` : ''}`;
    })
    .join('\n');
}

function embedLinkLines(message) {
  const urls = [...(message.embeds?.values?.() ?? [])].map((e) => e.url).filter(Boolean);
  if (urls.length === 0) return null;
  return urls.slice(0, MAX_LIST).map((u) => `<${u}>`).join('\n');
}

// Best-effort attribution: who executed the deletion (audit log).
// Discord's MessageDelete audit target is the message AUTHOR, not the
// message — so match on channel + recency, and on author when known.
// Audit entries can lag a couple of seconds; retry briefly before giving up.
async function resolveDeleter(guild, { messageId = null, channelId = null, authorId = null } = {}, auditType = AuditLogEvent.MessageDelete) {
  const attempts = 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((s) => setTimeout(s, 1200));
    try {
      const logs = await guild.fetchAuditLogs({ type: auditType, limit: 8 });
      const now = Date.now();
      const entry = logs.entries.find((e) => {
        if (now - (e.createdTimestamp ?? 0) > 15_000) return false;
        const entryChannel = e.extra?.channel?.id ?? null;
        if (channelId && entryChannel && entryChannel !== channelId) return false;
        if (messageId && e.target?.id === messageId) return true;
        if (authorId && e.target?.id === authorId) return true;
        return e.target?.id === channelId; // bulk delete: target is the channel
      });
      if (entry?.executor) return entry.executor;
    } catch {
      return null;
    }
  }
  return null;
}

export function buildEditEmbed(oldMessage, newMessage) {
  const beforeUnknown = Boolean(oldMessage?.partial) || typeof oldMessage?.content !== 'string';
  const contentChanged = !beforeUnknown && oldMessage.content !== newMessage.content;
  const attachmentChanged =
    !oldMessage?.partial && (oldMessage?.attachments?.size ?? 0) !== (newMessage.attachments?.size ?? 0);
  // Uncached edits still log (an update event fired; before = *not cached*).
  // Cached edits log only for real content/attachment changes — that filters
  // link-preview unfurls and the bot's own embed-only refreshes.
  if (!contentChanged && !attachmentChanged && !beforeUnknown) return null;

  const fields = [
    { name: 'Author', value: authorLine(newMessage), inline: true },
    { name: 'Channel', value: `<#${newMessage.channelId}>`, inline: true },
    { name: 'Message', value: jumpLink(newMessage) },
    { name: 'Before', value: beforeUnknown ? '*not cached*' : clip(oldMessage.content) },
    { name: 'After', value: clip(newMessage.content) },
  ];
  const attachments = attachmentLines(newMessage);
  if (attachments) fields.push({ name: 'Attachments', value: attachments });

  return buildEmbed({
    kind: 'warn',
    title: '✏️ Message edited',
    fields,
  });
}

export function buildDeleteEmbed(message, deleter = null, { partial = false } = {}) {
  const fields = [];
  if (partial) {
    fields.push({ name: 'Details', value: '*Content not cached — the message was deleted before I could read it.*' });
  } else {
    fields.push({ name: 'Author', value: authorLine(message), inline: true });
    fields.push({ name: 'Content', value: clip(message.content) });
    const attachments = attachmentLines(message);
    if (attachments) fields.push({ name: 'Attachments', value: attachments });
    const links = embedLinkLines(message);
    if (links) fields.push({ name: 'Embeds / links', value: links });
  }
  return buildEmbed({
    kind: 'error',
    title: '🗑️ Message deleted',
    description: deleter ? `Deleted by **${deleter.username ?? deleter.id}**${deleter.bot ? ' 🤖' : ''}` : undefined,
    fields,
  });
}

export function buildBulkDeleteEmbed(channelId, count, deleter = null) {
  return buildEmbed({
    kind: 'error',
    title: '🗑️ Bulk delete',
    description: `**${count}** messages were deleted in <#${channelId}>${deleter ? ` by **${deleter.username}**` : ''}.\nContent is listed per message only when deletion happens one at a time.`,
  });
}

export async function logMessageEdit(oldMessage, newMessage) {
  try {
    const message = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
    if (!message?.guild) return;
    const embed = buildEditEmbed(oldMessage, message);
    if (!embed) return;
    await sendAuditLog(message.guild, embed);
    logger.info(`message edit logged (${message.id} in ${message.channelId})`);
  } catch (err) {
    logger.warn(`message edit log failed: ${err.message}`);
  }
}

export async function logMessageDelete(message) {
  try {
    if (!message.guild) return;
    const ctx = { messageId: message.id, channelId: message.channelId, authorId: message.author?.id ?? null };
    if (message.partial) {
      const deleter = await resolveDeleter(message.guild, ctx);
      await sendAuditLog(message.guild, buildDeleteEmbed({ guildId: message.guildId, channelId: message.channelId, id: message.id }, deleter, { partial: true }));
      return;
    }
    const deleter = await resolveDeleter(message.guild, ctx);
    await sendAuditLog(message.guild, buildDeleteEmbed(message, deleter));
    logger.info(`message delete logged (${message.id} in ${message.channelId})`);
  } catch (err) {
    logger.warn(`message delete log failed: ${err.message}`);
  }
}

export async function logMessageBulkDelete(messages, channel) {
  try {
    const guild = channel?.guild;
    if (!guild) return;
    const deleter = await resolveDeleter(guild, { channelId: channel.id }, AuditLogEvent.MessageBulkDelete);
    await sendAuditLog(guild, buildBulkDeleteEmbed(channel.id, messages.size, deleter));
    logger.info(`bulk delete logged (${messages.size} in ${channel.id})`);
  } catch (err) {
    logger.warn(`bulk delete log failed: ${err.message}`);
  }
}
