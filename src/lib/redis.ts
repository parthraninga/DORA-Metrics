/**
 * Lazy Redis client for fetch cache. Uses REDIS_URL when set; otherwise returns null (cache disabled).
 * Optional: REDIS_FETCH_CACHE_TTL (seconds, default 3600).
 */

import Redis from 'ioredis';

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (client !== null) return client;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times <= 2 ? 500 : null),
      lazyConnect: true,
    });
    return client;
  } catch {
    return null;
  }
}

/** Cache TTL for fetch responses (seconds). Default 1 hour. */
export const FETCH_CACHE_TTL = Number(process.env.REDIS_FETCH_CACHE_TTL) || 3600;

export function fetchCacheKey(repoId: string, fromTime: string, toTime: string): string {
  return `fetch:repo:${repoId}:${fromTime}:${toTime}`;
}

/** Status for monitoring: 'ok' = connected, 'down' = unreachable, 'not_configured' = REDIS_URL not set. */
export type RedisStatus = 'ok' | 'down' | 'not_configured';

export async function getRedisStatus(): Promise<RedisStatus> {
  const redis = getRedis();
  if (!redis) return 'not_configured';
  try {
    const pong = await redis.ping();
    return pong === 'PONG' ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}
