// Boot/shutdown bookkeeping shared by index.js and /botstatus.
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';

const FLAG = path.join(ROOT, 'data', '.clean-shutdown');

export function wasLastShutdownClean() {
  return existsSync(FLAG);
}

export function markCleanShutdown() {
  try {
    writeFileSync(FLAG, new Date().toISOString());
  } catch {
    /* non-fatal */
  }
}

export function clearShutdownFlag() {
  try {
    rmSync(FLAG, { force: true });
  } catch {
    /* non-fatal */
  }
}
