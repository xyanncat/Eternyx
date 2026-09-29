// In-memory per-user command cooldowns (plan §4.7).
const buckets = new Map();

export function checkCooldown(key, seconds) {
  const now = Date.now();
  const expiry = (buckets.get(key) ?? 0) + seconds * 1000;
  if (now < expiry) return (expiry - now) / 1000;
  buckets.set(key, now);
  return 0;
}
