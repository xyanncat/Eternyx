import { Events } from 'discord.js';
import { onBan } from '../engines/nukeGuard.js';

export const name = Events.GuildBanAdd;
export function execute(ban) {
  return onBan(ban);
}
