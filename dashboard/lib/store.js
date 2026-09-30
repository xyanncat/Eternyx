// Data layer: one snapshot key in Vercel KV, pushed by the phone every 60s.
// Falls back to demo seed data when KV isn't configured (local dev / preview)
// so the entire UI is previewable without any account.
import { kv } from '@vercel/kv';
import { seedSnapshot } from './seed';

const KEY = 'eternyx:snapshot';

export async function readSnapshot() {
  try {
    const snap = await kv.get(KEY);
    if (snap) return snap;
  } catch {
    /* KV not configured or unreachable — demo mode */
  }
  return seedSnapshot();
}

export async function writeSnapshot(data) {
  await kv.set(KEY, data);
}

export function isIngestConfigured() {
  return Boolean(process.env.DASHBOARD_INGEST_KEY);
}
