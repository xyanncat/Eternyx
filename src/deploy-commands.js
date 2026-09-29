// Registers slash commands on the dev guild only — instant updates while developing (plan §2).
// Run: npm run deploy-commands
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { ROOT, env } from './config.js';

const seen = new Set();
const body = [];

async function collect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collect(full);
    } else if (entry.name.endsWith('.js')) {
      const mod = await import(pathToFileURL(full).href);
      if (!mod.data?.name || typeof mod.execute !== 'function') {
        console.warn(`skipping ${file(full)}: no data/execute export`);
        continue;
      }
      if (seen.has(mod.data.name)) {
        console.warn(`skipping duplicate command name ${mod.data.name} in ${file(full)}`);
        continue;
      }
      seen.add(mod.data.name);
      body.push(mod.data.toJSON());
    }
  }
}

function file(p) {
  return path.relative(ROOT, p);
}

if (!env.CLIENT_ID) {
  console.error('Missing CLIENT_ID in .env (Application ID from the Developer Portal).');
  process.exit(1);
}

await collect(path.join(ROOT, 'src', 'commands'));

const rest = new REST().setToken(env.DISCORD_TOKEN);
const data = await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID), { body });
console.log(`registered ${data.length} slash commands on guild ${env.GUILD_ID}`);
