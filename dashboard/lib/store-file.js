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
