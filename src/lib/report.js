// Dashboard reporting + command execution. Every 60s — plus instantly when
// woken: the on-phone web sends SIGUSR1 the moment a command is queued, so
// dispatches apply in seconds instead of waiting for the next cycle.
// 1. pull the encrypted pending-command queue from the dashboard
// 2. execute each command (allowlisted, validated) and collect acks
// 3. push the full snapshot (incl. guild channels/roles + config) with acks
// Outbound only, the phone never exposes an inbound port (plan §3).
// Disabled silently unless DASHBOARD_URL + DASHBOARD_INGEST_KEY are set.
import { readFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, env } from '../config.js';
import { topCommands, recentCases, recentEvents, getConfig } from '../storage/db.js';
import { executeCommand } from './commands.js';
import { logger } from './log.js';

const INTERVAL_MS = 60_000;
const MAX_COMMANDS_PER_CYCLE = 10;

export function startDashboardReporting(client) {
  if (!env.DASHBOARD_URL || !env.DASHBOARD_INGEST_KEY) {
    logger.info('dashboard reporting disabled (DASHBOARD_URL / DASHBOARD_INGEST_KEY not set)');
    return;
  }
  // PID file so the on-phone web can wake us instantly on dispatch.
  // data/ is gitignored; a stale file is harmless (the web verifies the
  // process via /proc before signalling).
  try {
    writeFileSync(path.join(ROOT, 'data', 'bot.pid'), String(process.pid));
  } catch (err) {
    logger.warn(`dashboard wake unavailable (pidfile): ${err.message}`);
  }
  let cycling = false;
  let wakeQueued = false;
  const run = async () => {
    if (cycling) {
      wakeQueued = true; // a cycle is mid-flight; run again right after
      return;
    }
    cycling = true;
    try {
      await cycle(client);
    } finally {
      cycling = false;
    }
    if (wakeQueued) {
      wakeQueued = false;
      run();
    }
  };
  if (process.platform !== 'win32') {
    process.on('SIGUSR1', () => {
      logger.info('dashboard wake — pulling queue now');
      run();
    });
  }
  run();
  setInterval(run, INTERVAL_MS).unref();

  async function cycle(client) {
    try {
      const queue = await pullQueue();
      const acks = [];
      for (const cmd of queue.slice(0, MAX_COMMANDS_PER_CYCLE)) {
        const result = await executeCommand(client, cmd);
        acks.push({ id: cmd.id, action: cmd.action, ok: result.ok, detail: result.detail });
        logger.info(`dashboard cmd ${cmd.action}: ${result.ok ? 'ok' : 'failed'} — ${result.detail}`);
      }
      await pushSnapshot(client, acks);
      logger.info('dashboard snapshot pushed');
    } catch (err) {
      logger.warn(`dashboard cycle failed: ${err.message}`);
    }
  }
}

function api(path) {
  return env.DASHBOARD_URL.replace(/\/+$/, '') + path;
}

async function pullQueue() {
  const res = await fetch(api('/api/commands'), {
    headers: { authorization: `Bearer ${env.DASHBOARD_INGEST_KEY}` },
  });
  if (!res.ok) throw new Error(`queue fetch HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.commands) ? data.commands : [];
}

async function pushSnapshot(client, acks = []) {
  const guild = client.guilds.cache.first();
  const logText = await readFile(path.join(ROOT, 'logs', 'bot.log'), 'utf8').catch(() => '');
  const cfg = guild ? getConfig(guild.id) : {};
  const body = {
    bot: {
      username: client.user?.username ?? null,
      guild: guild?.name ?? null,
      uptimeMs: client.uptime ?? 0,
      rssMb: Math.round(process.memoryUsage().rss / 1_048_576),
      wsPingMs: Math.max(0, client.ws?.ping ?? 0),
      startedAt: Date.now() - (client.uptime ?? 0),
    },
    guild: guild
      ? {
          channels: [...guild.channels.cache.values()]
            .filter((c) => c.isTextBased() && !c.isThread())
            .slice(0, 60)
            .map((c) => ({ id: c.id, name: c.name })),
          roles: [...guild.roles.cache.values()]
            .filter((r) => r.id !== guild.id && !r.managed)
            .slice(0, 60)
            .map((r) => ({ id: r.id, name: r.name })),
          automodRules: (() => {
            try {
              return [...guild.autoModerationRules.cache.values()].slice(0, 30).map((r) => ({ id: r.id, name: r.name, enabled: r.enabled }));
            } catch {
              return [];
            }
          })(),
        }
      : null,
    config: guild
      ? {
          logChannelId: cfg.logChannelId ?? null,
          modRoleIds: cfg.modRoleIds ?? [],
          raidThreshold: cfg.raidThreshold ?? 10,
          nukeAutoAction: cfg.nukeAutoAction ?? 0,
          controlPanelChannelId: cfg.controlPanelChannelId ?? null,
          lockdownActive: cfg.lockdownActive ?? 0,
        }
      : null,
    usage: topCommands(20),
    cases: recentCases(20),
    events: recentEvents(20),
    logs: logText.length > 0 ? logText.split('\n').slice(-50) : [],
    acks,
  };
  const res = await fetch(api('/api/ingest'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.DASHBOARD_INGEST_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
