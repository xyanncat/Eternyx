// Bot heartbeat: writes a small status snapshot to disk every 30s so sibling
// processes (dashboard, panel) can report on the bot without IPC.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

const STATUS_FILE = path.join(ROOT, 'data', 'bot-status.json');

export function writeBotStatus(client) {
  const mem = process.memoryUsage();
  const payload = {
    pid: process.pid,
    rssMb: Math.round(mem.rss / 1_048_576),
    heapMb: Math.round(mem.heapUsed / 1_048_576),
    uptimeMs: client.uptime ?? 0,
    wsPingMs: Math.max(0, client.ws?.ping ?? 0),
    username: client.user?.username ?? null,
    guild: client.guilds.cache.first()?.name ?? null,
    at: Date.now(),
  };
  try {
    writeFileSync(STATUS_FILE, JSON.stringify(payload));
  } catch {
    /* status file must never crash the bot */
  }
}

export function startBotHeartbeat(client, intervalMs = 30_000) {
  writeBotStatus(client);
  setInterval(() => writeBotStatus(client), intervalMs).unref();
}
