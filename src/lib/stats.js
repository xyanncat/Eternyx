// Usage telemetry queue: command executions are counted in memory and flushed
// to SQLite in batches (one write per interval — kinder to phone flash storage
// than a write per command). Up to one interval of stats is lost on a crash,
// which is acceptable for telemetry.
import { addCommandCount } from '../storage/db.js';
import { logger } from './log.js';

const pending = new Map(); // name -> count

export function recordUsage(name) {
  pending.set(name, (pending.get(name) ?? 0) + 1);
}

export function flushUsage() {
  if (pending.size === 0) return;
  const now = Date.now();
  for (const [name, count] of pending) {
    try {
      addCommandCount(name, count, now);
    } catch (err) {
      logger.warn(`usage flush failed for ${name}: ${err.message}`);
    }
  }
  pending.clear();
}

export function startUsageFlush(intervalMs = 30_000) {
  setInterval(flushUsage, intervalMs).unref();
}
