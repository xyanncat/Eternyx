// Vercel Blob backend: one encrypted snapshot + command queue + results,
// pushed by the phone every 60s. Falls back to demo seed data when nothing
// has been pushed yet so the UI always works.
//
// The snapshot and queue both contain moderation metadata, so they are
// encrypted at rest with AES-256-GCM (see ./vault) — public blob URLs hold
// ciphertext only. All blob IO goes through the @vercel/blob SDK.
import { put, get } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import { deriveKey, encrypt, decrypt } from './vault';
import { seedSnapshot } from './seed';

const SNAPSHOT_PATH = 'snapshot.bin';
const QUEUE_PATH = 'commands.bin';
const RESULTS_PATH = 'command-results.bin';
const MAX_QUEUE = 25;
const MAX_RESULTS = 50;

async function readEncryptedJson(path, fallback) {
  if (!deriveKey()) return fallback;
  try {
    // useCache:false bypasses the CDN — the phone overwrites these same
    // pathnames every 60s, and a cached read would serve a stale (e.g.
    // empty) queue forever, so setup commands would never execute.
    const res = await get(path, { access: 'public', useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return fallback;
    const text = await new Response(res.stream).text();
    return JSON.parse(decrypt(text));
  } catch {
    return fallback;
  }
}

export async function readSnapshot() {
  return readEncryptedJson(SNAPSHOT_PATH, seedSnapshot());
}

export async function writeSnapshot(data) {
  if (!deriveKey()) throw new Error('DASHBOARD_INGEST_KEY not configured');
  await put(SNAPSHOT_PATH, encrypt(JSON.stringify(data)), {
    access: 'public', // holds ciphertext only — public URL is meaningless without the key
    addRandomSuffix: false, // overwrite in place: the store must hold exactly this one object
    allowOverwrite: true,
    contentType: 'text/plain',
    cacheControlMaxAge: 60, // floor: phone overwrites this every 60s, don't let the CDN sit on it
  });
}

/* ── setup-command queue (site writes, phone pulls+acks) ── */

export async function readQueue() {
  return readEncryptedJson(QUEUE_PATH, []);
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
  await put(QUEUE_PATH, encrypt(JSON.stringify(queue)), {
    access: 'public',
    addRandomSuffix: false, // overwrite in place — see writeSnapshot
    allowOverwrite: true,
    contentType: 'text/plain',
    cacheControlMaxAge: 60, // floor: queue changes on every dispatch/ack, keep CDN copies fresh
  });
  return command;
}

export async function acknowledgeCommands(acks = []) {
  if (acks.length === 0) return { queue: await readQueue(), results: null };
  if (!deriveKey()) throw new Error('DASHBOARD_INGEST_KEY not configured');
  const ackIds = new Set(acks.map((a) => a.id));
  const queue = (await readQueue()).filter((c) => !ackIds.has(c.id));
  await put(QUEUE_PATH, encrypt(JSON.stringify(queue)), {
    access: 'public',
    addRandomSuffix: false, // overwrite in place — see writeSnapshot
    allowOverwrite: true,
    contentType: 'text/plain',
    cacheControlMaxAge: 60,
  });
  const byId = new Map(acks.map((a) => [a.id, a]));
  const existing = await readEncryptedJson(RESULTS_PATH, []);
  const results = [
    ...existing,
    ...acks.map((a) => ({
      ...a,
      createdBy: byId.get(a.id)?.createdBy ?? 'dashboard',
      at: Date.now(),
    })),
  ].slice(-MAX_RESULTS);
  await put(RESULTS_PATH, encrypt(JSON.stringify(results)), {
    access: 'public',
    addRandomSuffix: false, // overwrite in place — see writeSnapshot
    allowOverwrite: true,
    contentType: 'text/plain',
    cacheControlMaxAge: 60,
  });
  return { queue, results };
}

export async function readResults() {
  return readEncryptedJson(RESULTS_PATH, []);
}
