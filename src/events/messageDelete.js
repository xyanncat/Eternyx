import { Events } from 'discord.js';
import { logMessageDelete } from '../lib/messageLog.js';

export const name = Events.MessageDelete;
export function execute(message) {
  return logMessageDelete(message);
}
