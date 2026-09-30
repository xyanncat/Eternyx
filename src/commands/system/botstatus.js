import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SlashCommandBuilder } from 'discord.js';
import { ROOT } from '../../config.js';
import { buildEmbed } from '../../lib/embeds.js';
import { formatDuration } from '../../lib/validate.js';
import { wasLastShutdownClean } from '../../lib/runtime.js';

const run = promisify(execFile);

function readJsonSafe(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Host telemetry without leaking anything sensitive (plan §4.8):
// uptime, memory, ping, battery — never config, DB contents, or paths with usernames.
async function batteryStatus() {
  try {
    const { stdout } = await run('termux-battery-status', { timeout: 3000 });
    const b = JSON.parse(stdout);
    return `${b.percentage}% (${b.status ?? 'unknown'})`;
  } catch {
    return 'unavailable (termux-api not installed)';
  }
}

// The dashboard sibling process reports itself via data/dashboard-status.json.
function dashboardLine() {
  const dash = readJsonSafe(path.join(ROOT, 'data', 'dashboard-status.json'));
  if (!dash) return 'not running';
  const ageSec = Math.round((Date.now() - dash.at) / 1000);
  const fresh = ageSec < 90; // heartbeat is 30s — stale means the process died
  return `${fresh ? 'running' : 'stale'} · http://${dash.lanIp}:${dash.port} · ${dash.rssMb} MB · up ${formatDuration(dash.uptimeMs)}`;
}

export const data = new SlashCommandBuilder().setName('botstatus').setDescription('Bot health: uptime, memory, dashboard, battery');

export async function execute(interaction) {
  const client = interaction.client;
  const rssMb = (process.memoryUsage().rss / 1_048_576).toFixed(1);
  const startedAt = Date.now() - (client.uptime ?? 0);

  const embed = buildEmbed({
    kind: 'info',
    title: 'Bot status',
    fields: [
      { name: 'Uptime', value: formatDuration(client.uptime ?? 0), inline: true },
      { name: 'Memory (RSS)', value: `${rssMb} MB`, inline: true },
      { name: 'WebSocket ping', value: `${Math.max(0, client.ws.ping)}ms`, inline: true },
      { name: 'Session started', value: `<t:${Math.floor(startedAt / 1000)}:R>`, inline: false },
      { name: 'Dashboard', value: dashboardLine(), inline: false },
      { name: 'Battery', value: await batteryStatus(), inline: true },
      { name: 'Previous shutdown', value: wasLastShutdownClean() ? 'Clean' : 'Unclean / first boot', inline: true },
    ],
  });
  await interaction.reply({ embeds: [embed] });
}
