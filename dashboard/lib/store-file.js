// Phone backend: same encrypted payloads as the Blob backend, stored as
// local files. No usage meters, no network round-trip — the bot and the web
// run on the same device. Writes are atomic (tmp + rename) so a reboot
// mid-write can never leave a torn file.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { deriveKey, encrypt, decrypt } from './vault';
import { seedSnapshot } from './seed';
const DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data-web');
const SNAPSHOT_FILE = 'snapshot.bin';
const QUEUE_FILE = 'commands.bin';
const RESULTS_FILE = 'command-results.bin';
const MAX_QUEUE = 25;
const MAX_RESULTS = 50;

// Wake the on-phone bot the instant a command is queued, so dispatches apply
// in seconds instead of waiting for its 60s poll. Fire-and-forget by design:
// a stale pidfile, a restarting bot, or a non-Linux host all fall through
// silently and the poll loop remains the backstop. Safety: the pid is only
// signalled when /proc proves it is the bot process (pid reuse would
// otherwise SIGUSR1-kill an unrelated process, whose default action is death).
async function wakeBot() {
  // Outcome is logged to stderr (phone: ~/eternyx-web/err.log) — a silent
  // skip here would be indistinguishable from a working wake.
  const note = (m) => {
    try {
      console.error(`[wake] ${m}`);
    } catch {
      /* logging must never break the dispatch */
    }
  };
  try {
    if (process.platform !== 'linux') return note('skip: not linux');
    const pidFile = process.env.BOT_PID_FILE;
    if (!pidFile) return note('skip: BOT_PID_FILE unset');
    const pid = Number((await readFile(pidFile, 'utf8')).trim());
    if (!Number.isInteger(pid) || pid <= 0) return note('skip: bad pidfile');
    const cmdline = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '');
    if (!cmdline.includes('eternyx-bot') && !cmdline.includes('src/index')) {
      return note(`skip: pid ${pid} is not the bot`);
    }
    process.kill(pid, 'SIGUSR1');
    note(`signalled bot pid ${pid}`);
  } catch (err) {
    note(`failed: ${err.message}`);
  }
}

async function readJson(file, fallback) {
  if (!deriveKey()) return fallback;
  try {
    await mkdir(DIR, { recursive: true });
    const text = await readFile(path.join(DIR, file), 'utf8');
    return JSON.parse(decrypt(text));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  if (!deriveKey()) throw new Error('DASHBOARD_INGEST_KEY not configured');
  await mkdir(DIR, { recursive: true });
  const full = path.join(DIR, file);
  const tmp = `${full}.${process.pid}.tmp`;
  await writeFile(tmp, encrypt(JSON.stringify(value)), 'utf8');
  await rename(tmp, full);
}

export async function readSnapshot() {
  return readJson(SNAPSHOT_FILE, seedSnapshot());
}

export async function writeSnapshot(data) {
  await writeJson(SNAPSHOT_FILE, data);
}

export async function readQueue() {
  return readJson(QUEUE_FILE, []);
}

export async function enqueueCommand({ action, params, createdBy }) {
  if (!deriveKey()) throw new Error('DASHBOARD_INGEST_KEY not configured');
  const queue = await readQueue();
  const command = {
    id: randomUUID(),
    action,
    params: params ?? {},
    createdBy: createdBy ?? 'dashboard',
    createdAt: Date.now(),
  };
  queue.push(command);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  await writeJson(QUEUE_FILE, queue);
  await wakeBot();
  return command;
}

export async function acknowledgeCommands(acks = []) {
  if (acks.length === 0) return { queue: await readQueue(), results: null };
  if (!deriveKey()) throw new Error('DASHBOARD_INGEST_KEY not configured');
  const ackIds = new Set(acks.map((a) => a.id));
  const queue = (await readQueue()).filter((c) => !ackIds.has(c.id));
  await writeJson(QUEUE_FILE, queue);
  const byId = new Map(acks.map((a) => [a.id, a]));
  const existing = await readJson(RESULTS_FILE, []);
  const results = [
    ...existing,
    ...acks.map((a) => ({
      ...a,
      createdBy: byId.get(a.id)?.createdBy ?? 'dashboard',
      at: Date.now(),
    })),
  ].slice(-MAX_RESULTS);
  await writeJson(RESULTS_FILE, results);
  return { queue, results };
}

export async function readResults() {
  return readJson(RESULTS_FILE, []);
}
