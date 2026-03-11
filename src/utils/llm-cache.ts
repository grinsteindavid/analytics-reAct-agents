import { getRedis } from '../data-access/redis/connection';
import { RedisCache } from '@langchain/community/caches/ioredis';
import type { BaseCache } from '@langchain/core/caches';

let llmCache: BaseCache | null = null;

/**
 * Initialize LLM response caching using existing Redis connection.
 * Call after initDataSources() to get the cache instance.
 * 
 * Note: LLM caching only helps for identical prompts. Since AI workflow
 * prompts include dynamic context, cache hits will be rare. Tool-level
 * caching via CacheHelper is more effective for analytics queries.
 */
export function initLLMCache(): BaseCache | null {
  if (llmCache) {
    console.log('[LLM Cache] Already initialized');
    return llmCache;
  }

  try {
    const redis = getRedis();
    llmCache = new RedisCache(redis);
    console.log('[LLM Cache] Redis LLM cache initialized');
    return llmCache;
  } catch {
    console.warn('[LLM Cache] Redis not available, skipping LLM cache setup');
    return null;
  }
}

/**
 * Get the LLM cache instance (must call initLLMCache first)
 */
export function getLLMCache(): BaseCache | null {
  return llmCache;
}

/**
 * Check if LLM cache is initialized
 */
export function isLLMCacheInitialized(): boolean {
  return llmCache !== null;
}
