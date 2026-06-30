const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120);
// Hard cap on tracked keys so the bucket map can never grow without bound, even
// if a flood of distinct keys gets through.
const RATE_LIMIT_MAX_BUCKETS = Math.max(64, Number(process.env.RATE_LIMIT_MAX_BUCKETS || 10_000));
const buckets = new Map();

function now() {
  return Date.now();
}

function cleanupExpired() {
  const cutoff = now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, bucket] of buckets.entries()) {
    bucket.hits = bucket.hits.filter((ts) => ts > cutoff);
    if (bucket.hits.length === 0) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(key, { maxRequests = RATE_LIMIT_MAX_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS } = {}) {
  cleanupExpired();
  const safeKey = String(key || 'anonymous');
  const bucket = buckets.get(safeKey) || { hits: [] };
  const cutoff = now() - windowMs;
  bucket.hits = bucket.hits.filter((ts) => ts > cutoff);
  if (bucket.hits.length >= maxRequests) {
    const retryAfterMs = Math.max(1_000, windowMs - (now() - bucket.hits[0]));
    buckets.set(safeKey, bucket);
    return {
      allowed: false,
      retryAfterMs,
      remaining: 0,
      limit: maxRequests,
      windowMs
    };
  }
  bucket.hits.push(now());
  // Re-insert last so the key becomes the most-recently-used; evict the oldest
  // keys if we are over the cap (Map preserves insertion order).
  buckets.delete(safeKey);
  buckets.set(safeKey, bucket);
  while (buckets.size > RATE_LIMIT_MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    buckets.delete(oldestKey);
  }
  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: Math.max(0, maxRequests - bucket.hits.length),
    limit: maxRequests,
    windowMs
  };
}
