import { Events, ActivityType } from 'discord.js';
import { logger } from '../lib/log.js';
import { clearShutdownFlag, wasLastShutdownClean } from '../lib/runtime.js';

export const name = Events.ClientReady;
export function execute(client) {
  logger.info(`logged in as ${client.user.username} — guild ${env(client)}`);
  logger.info(`previous shutdown was clean: ${wasLastShutdownClean()}`);
  clearShutdownFlag();
  client.user.setPresence({
    activities: [{ name: 'the dev server', type: ActivityType.Watching }],
    status: 'online',
  });
}

function env(client) {
  return client.guilds.cache.map((g) => g.name).join(', ') || 'none';
}
