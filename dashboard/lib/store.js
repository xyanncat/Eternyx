// Data layer: one encrypted snapshot in Vercel Blob, pushed by the phone
// every 60s. Falls back to demo seed data when nothing has been pushed yet
// (local dev / preview / before the first push) so the UI always works.
//
// The snapshot contains moderation metadata (case reasons, user IDs), so it
// is encrypted at rest with AES-256-GCM using a key derived from
// DASHBOARD_INGEST_KEY — the public blob URL holds ciphertext only.
// All blob IO goes through the @vercel/blob SDK (no raw fetch in this codebase).
import { put, get } from '@vercel/blob';
import { createHash, createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';
import { seedSnapshot } from './seed';

const BLOB_PATH = 'snapshot.bin';

function deriveKey() {
  const secret = process.env.DASHBOARD_INGEST_KEY;
  if (!secret) return null; // demo mode — nothing to encrypt/decrypt with
  return createHash('sha256').update(secret).digest();
}

function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

export async function readSnapshot() {
  if (!deriveKey()) return seedSnapshot();
  try {
    const res = await get(BLOB_PATH, { access: 'public' });
    if (res.statusCode !== 200 || !res.stream) throw new Error('snapshot not found');
    const text = await new Response(res.stream).text();
    return JSON.parse(decrypt(text));
  } catch {
    /* nothing pushed yet, wrong key, or blob unreachable — demo mode */
    return seedSnapshot();
  }
}

export async function writeSnapshot(data) {
  const key = deriveKey();
  if (!key) throw new Error('DASHBOARD_INGEST_KEY not configured');
  await put(BLOB_PATH, encrypt(JSON.stringify(data)), {
    access: 'public', // holds ciphertext only — public URL is meaningless without the key
    allowOverwrite: true,
    contentType: 'text/plain',
  });
}
