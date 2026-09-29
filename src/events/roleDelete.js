import { Events } from 'discord.js';
import { onRoleDelete } from '../engines/selfGuard.js';

export const name = Events.GuildRoleDelete;
export function execute(role) {
  return onRoleDelete(role);
}
