import { Events } from 'discord.js';
import { onJoin } from '../engines/raidGuard.js';

export const name = Events.GuildMemberAdd;
export function execute(member) {
  return onJoin(member);
}
