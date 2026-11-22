import { sha256Hex } from './crypto.js';
import type { Env } from './env.js';

interface MemoryBucket {
  windowStart: number;
  hits: number;
}

// Fast isolate-level cache so read-heavy abuse drops before hitting D1
const localBuckets = new Map<string, MemoryBucket>();

export function getClientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function buildClientFingerprints(request: Request, env: Env): Promise<{
  ipHash: string;
  uaHash: string;
}> {
  const salt = env.SESSION_JWT_SECRET || 'dollarino-fp-salt';
  const ip = getClientIp(request);
  const ua = (request.headers.get('User-Agent') || 'unknown').slice(0, 180);
  const [ipHash, uaHash] = await Promise.all([
    sha256Hex(`${salt}:ip:${ip}`),
    sha256Hex(`${salt}:ua:${ua}`),
  ]);
  return {
    ipHash: ipHash.slice(0, 32),
    uaHash: uaHash.slice(0, 32),
  };
}

/**
 * Dual-layer (in-memory + D1) sliding-window rate limiter to protect sensitive routes
 * against brute force, AI credit drain, and referral/payment abuse.
 */
export async function enforceRateLimit(
  env: Env,
  bucketKey: string,
  maxHits: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSec / windowSeconds) * windowSeconds;
  const memKey = `${bucketKey}:${windowStart}`;

  const cached = localBuckets.get(memKey);
  if (cached && cached.hits >= maxHits) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, windowStart + windowSeconds - nowSec),
    };
  }

  try {
    await env.DB.prepare(
      `INSERT INTO rate_limits (k, window_start, hits)
       VALUES (?, ?, 1)
       ON CONFLICT(k) DO UPDATE SET
         hits = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.hits + 1 ELSE 1 END,
         window_start = excluded.window_start`
    )
      .bind(bucketKey, windowStart)
      .run();

    const row = await env.DB.prepare(`SELECT hits, window_start FROM rate_limits WHERE k = ?`)
      .bind(bucketKey)
      .first<{ hits: number; window_start: number }>();

    const hits = Number(row?.hits ?? 1);
    localBuckets.set(memKey, { windowStart, hits });
    if (localBuckets.size > 2000) {
      for (const [k, v] of localBuckets.entries()) {
        if (v.windowStart < windowStart - windowSeconds) localBuckets.delete(k);
      }
    }

    if (hits > maxHits) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, windowStart + windowSeconds - nowSec),
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, maxHits - hits),
      retryAfterSec: 0,
    };
  } catch {
    // Fallback to memory-only counting if table is not yet migrated
    const nextHits = (cached?.hits ?? 0) + 1;
    localBuckets.set(memKey, { windowStart, hits: nextHits });
    return {
      allowed: nextHits <= maxHits,
      remaining: Math.max(0, maxHits - nextHits),
      retryAfterSec: nextHits <= maxHits ? 0 : Math.max(1, windowStart + windowSeconds - nowSec),
    };
  }
}

export function maskUsernameForReferral(name: string): string {
  const clean = (name || 'user').trim();
  if (clean.length <= 2) return `${clean[0] || '*'}*`;
  if (clean.length <= 5) return `${clean.slice(0, 2)}***`;
  return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
}
