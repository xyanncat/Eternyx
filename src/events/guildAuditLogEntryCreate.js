import { Events } from 'discord.js';
import { onAuditEntry } from '../engines/selfGuard.js';

export const name = Events.GuildAuditLogEntryCreate;
export function execute(auditLogEntry, guild) {
  return onAuditEntry(auditLogEntry, guild);
}
