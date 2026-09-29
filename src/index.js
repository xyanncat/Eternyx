// Bootstrap: DB -> client + intents -> load commands/events -> login.
// No HTTP server, no inbound sockets — outbound WSS only (plan §3).
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { ROOT, env } from './config.js';
import { initDb, closeDb } from './storage/db.js';
import { logger } from './lib/log.js';
import { markCleanShutdown } from './lib/runtime.js';

initDb(path.join(ROOT, 'data', 'eternyx.db'));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration],
});
client.commands = new Collection();

async function loadModules(dir, register) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await loadModules(full, register);
    } else if (entry.name.endsWith('.js')) {
      register(await import(pathToFileURL(full).href), full);
    }
  }
}

await loadModules(path.join(ROOT, 'src', 'commands'), (mod, file) => {
  if (!mod.data?.name || typeof mod.execute !== 'function') {
    logger.warn(`skipping ${file}: no data/execute export`);
    return;
  }
  if (client.commands.has(mod.data.name)) {
    logger.warn(`skipping duplicate command name ${mod.data.name} in ${file}`);
    return;
  }
  client.commands.set(mod.data.name, { data: mod.data, execute: mod.execute, meta: mod.meta ?? {} });
});

await loadModules(path.join(ROOT, 'src', 'events'), (mod, file) => {
  if (typeof mod.name !== 'string' || typeof mod.execute !== 'function') {
    logger.warn(`skipping ${file}: no name/execute export`);
    return;
  }
  client.on(mod.name, (...args) => Promise.resolve(mod.execute(...args)).catch((err) => logger.error(`${mod.name} handler: ${err?.stack ?? err}`)));
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down cleanly`);
  try {
    await client.destroy();
  } catch {
    /* already down */
  }
  markCleanShutdown();
  closeDb();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Keep the process alive on unexpected errors; the runit supervisor restarts us
// only if we actually die. Secrets never appear in these logs (redacted in log.js).
process.on('unhandledRejection', (err) => logger.error(`unhandled rejection: ${err?.stack ?? err}`));
process.on('uncaughtException', (err) => logger.error(`uncaught exception: ${err?.stack ?? err}`));

try {
  await client.login(env.DISCORD_TOKEN);
  logger.info('login ok');
} catch (err) {
  logger.error(`login failed: ${err.message}`);
  closeDb();
  process.exit(1);
}
