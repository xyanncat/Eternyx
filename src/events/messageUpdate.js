import { Events } from 'discord.js';
import { logMessageEdit } from '../lib/messageLog.js';

export const name = Events.MessageUpdate;
export function execute(oldMessage, newMessage) {
  return logMessageEdit(oldMessage, newMessage);
}
