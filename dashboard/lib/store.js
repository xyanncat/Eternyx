// Storage dispatcher — same API, two backends:
// - blob (default): Vercel Blob, for the Vercel-hosted site.
// - file: local encrypted files under DATA_DIR, for the phone-hosted site
//   (bot and web share the device; no usage meters, no round-trip).
// Set STORE_BACKEND=file + DATA_DIR on the phone. Nothing else changes —
// all routes import from '@/lib/store' as before.
const backend =
  process.env.STORE_BACKEND === 'file'
    ? await import('./store-file.js')
    : await import('./store-blob.js');

export const {
  readSnapshot,
  writeSnapshot,
  readQueue,
  enqueueCommand,
  acknowledgeCommands,
  readResults,
} = backend;
