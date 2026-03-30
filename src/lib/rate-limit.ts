/**
 * Simple in-memory rate limiter for API routes.
 * Tracks requests per IP within a sliding window.
 *
 * Note: In-memory storage resets on cold start (acceptable for Netlify
 * serverless). For more robust rate limiting, use Upstash or Redis.
 */

const requests = new Map<string, number[]>();

const CLEANUP_INTERVAL = 60_000; // cleanup old entries every 60s
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  requests.forEach((timestamps, key) => {
    const filtered = timestamps.filter((t: number) => t > cutoff);
    if (filtered.length === 0) {
      requests.delete(key);
    } else {
      requests.set(key, filtered);
    }
  });
}

export function rateLimit(
  ip: string,
  { maxRequests = 10, windowMs = 60_000 } = {}
): { allowed: boolean; remaining: number } {
  cleanup(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = requests.get(ip) || [];
  const recent = timestamps.filter((t) => t > cutoff);

  if (recent.length >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  recent.push(now);
  requests.set(ip, recent);
  return { allowed: true, remaining: maxRequests - recent.length };
}
