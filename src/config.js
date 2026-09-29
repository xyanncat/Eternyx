import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

mkdirSync(path.join(ROOT, 'logs'), { recursive: true });
mkdirSync(path.join(ROOT, 'data'), { recursive: true });

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

// Required values resolve lazily so importing this module (e.g. from tests)
// never exits the process — only actually logging in / registering does.
function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing ${name} in .env — copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

export const env = {
  get DISCORD_TOKEN() {
    return requireEnv('DISCORD_TOKEN', token);
  },
  CLIENT_ID: process.env.CLIENT_ID ?? null,
  get GUILD_ID() {
    return requireEnv('GUILD_ID', guildId);
  },
  OWNER_IDS: (process.env.OWNER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{17,20}$/.test(s)),
};
