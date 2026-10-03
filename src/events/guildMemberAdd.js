import { Events } from 'discord.js';
import { onJoin } from '../engines/raidGuard.js';
import { onJoin as autoRoleOnJoin } from '../engines/autoRole.js';

export const name = Events.GuildMemberAdd;
export async function execute(member) {
  await autoRoleOnJoin(member);
  return onJoin(member);
}
