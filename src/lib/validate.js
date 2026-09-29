// Input validation (plan §4.6). Every external value passes through here.

export const isSnowflake = (v) => typeof v === 'string' && /^\d{17,20}$/.test(v);

export const REASON_MAX = 512;

export function cleanReason(raw) {
  const trimmed = (raw ?? '').toString().trim().slice(0, REASON_MAX);
  return trimmed.length > 0 ? trimmed : 'No reason provided';
}

// Duration presets are an allowlist — never parsed free-form (plan §4.6).
export const DURATIONS = [
  { name: '60 seconds', value: '60s', seconds: 60 },
  { name: '5 minutes', value: '5m', seconds: 300 },
  { name: '10 minutes', value: '10m', seconds: 600 },
  { name: '30 minutes', value: '30m', seconds: 1800 },
  { name: '1 hour', value: '1h', seconds: 3600 },
  { name: '6 hours', value: '6h', seconds: 21600 },
  { name: '12 hours', value: '12h', seconds: 43200 },
  { name: '1 day', value: '1d', seconds: 86400 },
  { name: '1 week', value: '1w', seconds: 604800 },
];

export const DURATION_MAP = Object.fromEntries(DURATIONS.map((d) => [d.value, d.seconds]));

export function formatDuration(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const parts = [
    [Math.floor(s / 86400), 'd'],
    [Math.floor(s / 3600) % 24, 'h'],
    [Math.floor(s / 60) % 60, 'm'],
    [s % 60, 's'],
  ].filter(([n]) => n > 0);
  if (parts.length === 0) return '0s';
  return parts.map(([n, unit]) => `${n}${unit}`).join(' ');
}
