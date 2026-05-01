const cooldowns = new Map();

/**
 * Simple per-user cooldown gate.
 * Returns { allowed: true } or { allowed: false, remainingSeconds: number }.
 * Prunes stale entries automatically to prevent unbounded memory growth.
 */
export function checkRateLimit(userId, key, cooldownMs) {
  const mapKey = `${userId}:${key}`;
  const now = Date.now();
  const last = cooldowns.get(mapKey) ?? 0;

  if (now - last < cooldownMs) {
    return { allowed: false, remainingSeconds: Math.ceil((cooldownMs - (now - last)) / 1000) };
  }

  cooldowns.set(mapKey, now);

  if (cooldowns.size > 5000) {
    const cutoff = now - cooldownMs * 2;
    for (const [k, v] of cooldowns) {
      if (v < cutoff) cooldowns.delete(k);
    }
  }

  return { allowed: true };
}
