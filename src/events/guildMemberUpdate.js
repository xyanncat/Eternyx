import { Events } from 'discord.js';
import { onMemberUpdate } from '../engines/selfGuard.js';

export const name = Events.GuildMemberUpdate;
export function execute(oldMember, newMember) {
  return onMemberUpdate(oldMember, newMember);
}
