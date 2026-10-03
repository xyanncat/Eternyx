// Shared encryption for snapshot/queue/results payloads (AES-256-GCM,
// key = sha256(DASHBOARD_INGEST_KEY)). Ciphertext-only at rest whether the
// bytes land in Vercel Blob or in local files on the phone.
import { createHash, createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';

export function deriveKey() {
  const secret = process.env.DASHBOARD_INGEST_KEY;
  if (!secret) return null; // demo mode — nothing to encrypt/decrypt with
  return createHash('sha256').update(secret).digest();
}

export function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
