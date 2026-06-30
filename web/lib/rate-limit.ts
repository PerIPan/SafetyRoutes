// Minimal in-memory fixed-window rate limiter (per-process; state resets on restart). POC-grade —
// enough to blunt a loop of abusive POSTs at the public ingest endpoint. For multi-instance/prod,
// back this with Redis or a `rate_limit` table. Keyed by an arbitrary string (token id, IP, …).
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export interface RateResult {
  ok: boolean;
  retryAfterSec: number;
}

// Drop expired buckets when the map grows — bounds memory under high-cardinality (e.g. forged IP)
// traffic so the limiter itself can't be turned into a memory-exhaustion vector.
const SWEEP_THRESHOLD = 10_000;
function sweep(now: number) {
  if (buckets.size < SWEEP_THRESHOLD) return;
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}

/** Allow up to `limit` hits per `windowMs` for `key`. Returns ok=false (+ retry-after) when over. */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count++;
  return { ok: true, retryAfterSec: 0 };
}
