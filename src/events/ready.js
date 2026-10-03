import { Events, ActivityType } from 'discord.js';
import { logger } from '../lib/log.js';
import { clearShutdownFlag, wasLastShutdownClean } from '../lib/runtime.js';
import { reconcileLockdown } from '../lib/lockdown.js';

export const name = Events.ClientReady;
export async function execute(client) {
  logger.info(`logged in as ${client.user.username} — guild ${env(client)}`);
  logger.info(`previous shutdown was clean: ${wasLastShutdownClean()}`);
  clearShutdownFlag();
  client.user.setPresence({
    activities: [{ name: 'the dev server', type: ActivityType.Watching }],
    status: 'online',
  });
  // If the DB says lockdown is active, re-assert it — a restart must never
  // silently lift protection.
  for (const guild of client.guilds.cache.values()) {
    await reconcileLockdown(guild).catch((err) => logger.warn(`lockdown reconcile failed: ${err.message}`));
  }
}

function env(client) {
  return client.guilds.cache.map((g) => g.name).join(', ') || 'none';
}
