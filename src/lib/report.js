// Remote dashboard reporting (Vercel). Pushes a full snapshot every 60s —
// outbound only, the phone never exposes an inbound port (plan §3).
// Disabled silently unless DASHBOARD_URL + DASHBOARD_INGEST_KEY are set.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, env } from '../config.js';
import { topCommands, recentCases, recentEvents } from '../storage/db.js';
import { logger } from './log.js';

const INTERVAL_MS = 60_000;

export function startDashboardReporting(client) {
  if (!env.DASHBOARD_URL || !env.DASHBOARD_INGEST_KEY) {
    logger.info('dashboard reporting disabled (DASHBOARD_URL / DASHBOARD_INGEST_KEY not set)');
    return;
  }
  const push = async () => {
    try {
      await pushSnapshot(client);
      logger.info('dashboard snapshot pushed');
    } catch (err) {
      logger.warn(`dashboard push failed: ${err.message}`);
    }
  };
  push();
  setInterval(push, INTERVAL_MS).unref();
}

async function pushSnapshot(client) {
  const logText = await readFile(path.join(ROOT, 'logs', 'bot.log'), 'utf8').catch(() => '');
  const body = {
    bot: {
      username: client.user?.username ?? null,
      guild: client.guilds.cache.first()?.name ?? null,
      uptimeMs: client.uptime ?? 0,
      rssMb: Math.round(process.memoryUsage().rss / 1_048_576),
      wsPingMs: Math.max(0, client.ws?.ping ?? 0),
      startedAt: Date.now() - (client.uptime ?? 0),
    },
    usage: topCommands(20),
    cases: recentCases(20),
    events: recentEvents(20),
    logs: logText.length > 0 ? logText.split('\n').slice(-50) : [],
  };
  const res = await fetch(env.DASHBOARD_URL.replace(/\/+$/, '') + '/api/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.DASHBOARD_INGEST_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
