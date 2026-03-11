import Redis from 'ioredis';
import { connectRedis, getRedis } from '../data-access/redis/connection';
import { CacheHelper } from '../data-access/redis/cache-helper';

const REDIS_URL = 'redis://localhost:6379';
const TEST_PREFIX = 'integration_test';

describe('Integration: Redis Cache', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = connectRedis(REDIS_URL);
    // Wait for connection to be ready
    if (redis.status !== 'ready') {
      await new Promise<void>((resolve) => redis.once('ready', resolve));
    }
  });

  afterAll(async () => {
    // Clean up test keys
    const keys = await redis.keys(`${TEST_PREFIX}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  afterEach(async () => {
    const keys = await redis.keys(`${TEST_PREFIX}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  it('should connect to Redis', () => {
    expect(getRedis()).toBe(redis);
    expect(redis.status).toBe('ready');
  });

  it('should return cache miss then cache hit', async () => {
    let fetchCount = 0;
    const fetchFn = async () => {
      fetchCount++;
      return { value: 42 };
    };

    // First call — cache miss
    const first = await CacheHelper.withCache(TEST_PREFIX, { key: 'miss_hit' }, fetchFn, 60);
    expect(first.cached).toBe(false);
    expect(first.result).toEqual({ value: 42 });
    expect(fetchCount).toBe(1);

    // Second call — cache hit
    const second = await CacheHelper.withCache(TEST_PREFIX, { key: 'miss_hit' }, fetchFn, 60);
    expect(second.cached).toBe(true);
    expect(second.result).toEqual({ value: 42 });
    expect(fetchCount).toBe(1); // Not called again
  });

  it('should expire cache entries based on TTL', async () => {
    const fetchFn = async () => ({ ttl_test: true });

    await CacheHelper.withCache(TEST_PREFIX, { key: 'ttl' }, fetchFn, 1);

    // Immediately should be cached
    const cached = await CacheHelper.withCache(TEST_PREFIX, { key: 'ttl' }, fetchFn, 1);
    expect(cached.cached).toBe(true);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 1500));

    const expired = await CacheHelper.withCache(TEST_PREFIX, { key: 'ttl' }, fetchFn, 1);
    expect(expired.cached).toBe(false);
  });

  it('should cache different params independently', async () => {
    const fetchA = async () => ({ id: 'A' });
    const fetchB = async () => ({ id: 'B' });

    await CacheHelper.withCache(TEST_PREFIX, { key: 'a' }, fetchA, 60);
    await CacheHelper.withCache(TEST_PREFIX, { key: 'b' }, fetchB, 60);

    const hitA = await CacheHelper.withCache(TEST_PREFIX, { key: 'a' }, fetchA, 60);
    const hitB = await CacheHelper.withCache(TEST_PREFIX, { key: 'b' }, fetchB, 60);

    expect(hitA.result).toEqual({ id: 'A' });
    expect(hitB.result).toEqual({ id: 'B' });
  });
});
