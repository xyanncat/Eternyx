import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';

const LOG_FILE = path.join(ROOT, 'logs', 'bot.log');

// Token-shaped secrets never reach disk or console (plan §4.1).
const SECRET_RE = /[\w-]{24,}\.[\w-]{6,}\.[\w-]{27,}/g;

function redact(text) {
  return String(text).replace(SECRET_RE, '[REDACTED]');
}

export function log(level, message) {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${redact(message)}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch {
    /* logging must never crash the bot */
  }
}

export const logger = {
  info: (m) => log('info', m),
  warn: (m) => log('warn', m),
  error: (m) => log('error', m),
};
