import { Events } from 'discord.js';
import { onAuditEntry } from '../engines/selfGuard.js';
import { onDangerousAuditEntry } from '../engines/dangerWatch.js';

export const name = Events.GuildAuditLogEntryCreate;
export async function execute(auditLogEntry, guild) {
  await onAuditEntry(auditLogEntry, guild);
  await onDangerousAuditEntry(auditLogEntry, guild);
}
