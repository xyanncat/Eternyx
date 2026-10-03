import { Events } from 'discord.js';
import { logMessageBulkDelete } from '../lib/messageLog.js';

export const name = Events.MessageBulkDelete;
export function execute(messages, channel) {
  return logMessageBulkDelete(messages, channel);
}
