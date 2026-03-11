import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function connectRedis(url: string): Redis {
  if (redisClient) return redisClient;

  redisClient = new Redis(url);

  redisClient.on('connect', () => {
    console.log('[Redis] Connected');
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  return redisClient;
}

export function getRedis(): Redis {
  if (!redisClient) throw new Error('[Redis] Not connected');
  return redisClient;
}
