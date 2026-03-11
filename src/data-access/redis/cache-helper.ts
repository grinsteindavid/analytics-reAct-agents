import { getRedis } from './connection';
import crypto from 'crypto';

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

/**
 * Simple Redis cache helper for AI tool results
 */
export class CacheHelper {
  static async withCache<T>(
    prefix: string,
    params: Record<string, any>,
    fetchFn: () => Promise<T>,
    ttl: number = DEFAULT_TTL_SECONDS
  ): Promise<{ result: T; cached: boolean }> {
    const redis = getRedis();
    const key = `${prefix}:${CacheHelper.hashParams(params)}`;

    try {
      const cached = await redis.get(key);
      if (cached) {
        return { result: JSON.parse(cached) as T, cached: true };
      }
    } catch {
      // Cache miss or error — proceed to fetch
    }

    const result = await fetchFn();

    try {
      await redis.set(key, JSON.stringify(result), 'EX', ttl);
    } catch {
      // Non-fatal cache write error
    }

    return { result, cached: false };
  }

  private static hashParams(params: Record<string, any>): string {
    return crypto
      .createHash('md5')
      .update(JSON.stringify(params))
      .digest('hex')
      .slice(0, 16);
  }
}
