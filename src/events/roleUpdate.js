import { Events } from 'discord.js';
import { onRoleUpdate } from '../engines/selfGuard.js';

export const name = Events.GuildRoleUpdate;
export function execute(oldRole, newRole) {
  return onRoleUpdate(oldRole, newRole);
}
