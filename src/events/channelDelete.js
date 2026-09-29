import { Events } from 'discord.js';
import { onChannelDelete } from '../engines/nukeGuard.js';

export const name = Events.ChannelDelete;
export function execute(channel) {
  return onChannelDelete(channel);
}
