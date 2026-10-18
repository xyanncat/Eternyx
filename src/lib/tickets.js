// Ticket system: button-driven support tickets with private channels,
// modal subject intake, chat-by-chat transcripts posted to the storage
// channel AND saved to the phone's disk (device storage) on close.
//
// customIds (handled in events/interactionCreate.js):
//   ticket:open    (panel button, any member) -> subject modal
//   ticket:subject (modal submit)              -> create ticket channel
//   ticket:close   (in-channel button)         -> transcript + delete
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
} from 'discord.js';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../config.js';
import { getConfig, setConfig, createTicketRow, getTicketByChannel, closeTicketRow, recordEvent } from '../storage/db.js';
import { buildEmbed } from './embeds.js';
import { sendAuditLog } from './audit.js';
import { applyBrand } from './brand.js';
import { logger } from './log.js';

const STAFF_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

export function ticketPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:open').setLabel('Open a Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
  );
}

export function ticketPanelEmbed() {
  return buildEmbed({
    kind: 'info',
    title: '🎫 Support Tickets',
    description: [
      '**Need help from the staff? Open a private ticket.**',
      '',
      '› Press **Open a Ticket** below',
      '› Describe what you need — only you and the staff can read it',
      '› When it is resolved, staff closes it and the full chat is archived to ticket storage',
    ].join('\n'),
  });
}

export function ticketSubjectModal() {
  const input = new TextInputBuilder()
    .setCustomId('subject')
    .setLabel('What do you need help with?')
    .setStyle(TextInputStyle.Short)
    .setMinLength(3)
    .setMaxLength(200)
    .setRequired(true);
  return new ModalBuilder().setCustomId('ticket:subject').setTitle('Open a Ticket').addComponents(
    new ActionRowBuilder().addComponents(input)
  );
}

// Reuse (or create) the TICKETS category so ticket channels stay tidy.
async function ensureCategory(guild) {
  const cfg = getConfig(guild.id);
  if (cfg.ticketCategoryId) {
    const existing = guild.channels.cache.get(cfg.ticketCategoryId);
    if (existing) return existing;
  }
  const found = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'tickets');
  const category = found ?? (await guild.channels.create({ name: 'TICKETS', type: ChannelType.GuildCategory, reason: 'Eternyx ticket system' }));
  setConfig(guild.id, { ticketCategoryId: category.id });
  return category;
}

// Reuse (or create) the transcript storage channel under BOT LOGS.
async function ensureStorageChannel(guild) {
  const cfg = getConfig(guild.id);
  if (cfg.ticketStorageChannelId) {
    const existing = guild.channels.cache.get(cfg.ticketStorageChannelId);
    if (existing) return existing;
  }
  const found = guild.channels.cache.find((c) => c.isTextBased() && c.name.toLowerCase() === 'ticket-storage');
  if (found) {
    setConfig(guild.id, { ticketStorageChannelId: found.id });
    return found;
  }
  const botLogs = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toUpperCase().includes('BOT LOGS'));
  const created = await guild.channels.create({
    name: 'ticket-storage',
    type: ChannelType.GuildText,
    parent: botLogs?.id ?? undefined,
    reason: 'Eternyx ticket system — transcripts archive',
  });
  setConfig(guild.id, { ticketStorageChannelId: created.id });
  logger.info(`ticket storage channel created: ${created.id}`);
  return created;
}

// Post (or refresh) the ticket panel in the configured channel.
export async function postTicketPanel(guild, channel) {
  const cfg = getConfig(guild.id);
  if (cfg.ticketPanelChannelId && cfg.ticketPanelMessageId) {
    const oldChannel = guild.channels.cache.get(cfg.ticketPanelChannelId);
    const old = await oldChannel?.messages.fetch(cfg.ticketPanelMessageId).catch(() => null);
    await old?.delete().catch(() => {});
  }
  await ensureStorageChannel(guild); // bootstraps the archive target on first setup
  const message = await channel.send(applyBrand({ embeds: [ticketPanelEmbed()], components: [ticketPanelButtons()] }));
  setConfig(guild.id, { ticketPanelChannelId: channel.id, ticketPanelMessageId: message.id });
  logger.info(`ticket panel posted in ${channel.id} (${message.id})`);
  return message;
}

export async function createTicket(guild, member, subject) {
  const cfg = getConfig(guild.id);
  const number = (cfg.ticketCounter ?? 0) + 1;
  const category = await ensureCategory(guild);

  const overwrites = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: STAFF_PERMS },
    { id: guild.members.me.id, allow: [...STAFF_PERMS, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] },
    ...cfg.modRoleIds.map((roleId) => ({ id: roleId, allow: STAFF_PERMS })),
  ];

  const channel = await guild.channels.create({
    name: `ticket-${number}`,
    type: ChannelType.GuildText,
    parent: category?.id ?? undefined,
    permissionOverwrites: overwrites,
    topic: `Ticket #${number} — ${subject} (by ${member.user.username})`.slice(0, 1024),
    reason: `Eternyx ticket #${number} by ${member.user.username}`,
  });

  const row = createTicketRow({ guildId: guild.id, number, openerId: member.id, channelId: channel.id, subject });
  setConfig(guild.id, { ticketCounter: number });
  recordEvent('ticket_opened', JSON.stringify({ guild: guild.id, number, opener: member.id, channel: channel.id }));

  await channel.send(
    applyBrand({
      embeds: [
        buildEmbed({
          kind: 'info',
          title: `🎫 Ticket #${number}`,
          description: [
            `**Opened by:** <@${member.id}>`,
            `**Subject:** ${subject}`,
            '',
            'Staff will be with you shortly. Everything said here is archived when the ticket closes.',
          ].join('\n'),
        }),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket:close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
        ),
      ],
    })
  );

  const audit = buildEmbed({
    kind: 'action',
    title: `Ticket #${number} opened`,
    description: `<@${member.id}> opened ticket #${number} — **${subject}** → <#${channel.id}>`,
  });
  await sendAuditLog(guild, audit);
  return { channel, row };
}

export function buildTranscript(messages) {
  const lines = messages.map((m) => {
    const who = `${m.author?.username ?? 'unknown'}#${m.author?.discriminator ?? '0000'} (${m.author?.id ?? '?'})`;
    const parts = [`${new Date(m.createdTimestamp).toISOString()} | ${who}: ${m.content ?? ''}`];
    for (const att of m.attachments?.values?.() ?? []) parts.push(`    [attachment] ${att.name ?? 'file'} ${att.url ?? ''}`);
    return parts.join('\n');
  });
  return lines.join('\n');
}

export async function closeTicket(guild, channel, closer, reason = 'No reason provided') {
  const row = getTicketByChannel(channel.id);
  if (!row) return { ok: false, detail: 'this channel is not an open ticket' };

  // Chat-by-chat transcript: Discord archive + device-storage copy.
  const fetched = await channel.messages.fetch({ limit: 500 }).catch(() => null);
  const ordered = fetched ? [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp) : [];
  const header = `ETERNYX TICKET #${row.number} TRANSCRIPT\nSubject: ${row.subject}\nOpened by: ${row.opener_id}\nOpened at: ${new Date(row.created_at).toISOString()}\nClosed by: ${closer.username} (${closer.id})\nReason: ${reason}\nMessages: ${ordered.length}\n${'='.repeat(60)}\n`;
  const transcript = header + buildTranscript(ordered);

  // Device storage (phone disk) copy.
  try {
    const dir = path.join(ROOT, 'data', 'tickets');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `ticket-${row.number}.txt`), transcript, 'utf8');
  } catch (err) {
    logger.warn(`ticket transcript disk write failed: ${err.message}`);
  }

  // Discord archive channel copy.
  const storage = await ensureStorageChannel(guild);
  const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: `ticket-${row.number}-transcript.txt` });
  await storage.send({
    embeds: [
      buildEmbed({
        kind: 'warn',
        title: `📁 Ticket #${row.number} archived`,
        description: [
          `**Opened by:** <@${row.opener_id}>`,
          `**Closed by:** ${closer.username ?? closer.id}`,
          `**Reason:** ${reason}`,
          `**Messages:** ${ordered.length}`,
          `**Subject:** ${row.subject}`,
        ].join('\n'),
      }),
    ],
    files: [file],
  }).catch((err) => logger.warn(`ticket archive send failed: ${err.message}`));

  closeTicketRow(row.id);
  recordEvent('ticket_closed', JSON.stringify({ guild: guild.id, number: row.number, closer: closer.id }));

  const audit = buildEmbed({
    kind: 'action',
    title: `Ticket #${row.number} closed`,
    description: `Closed by **${closer.username ?? closer.id}** — ${reason}. Transcript archived.`,
  });
  await sendAuditLog(guild, audit);

  await channel.delete(`Ticket #${row.number} closed by ${closer.username ?? closer.id}`).catch(() => {});
  return { ok: true, detail: `ticket #${row.number} closed and archived` };
}
