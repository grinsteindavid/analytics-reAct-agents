import { Mongoose } from 'mongoose';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { connectMongo } from './mongodb/connection';
import { connectPostgres } from './postgres/connection';
import { connectRedis } from './redis/connection';

export interface DataSourceConfig {
  postgresUrl: string;
  mongoUri: string;
  redisUrl: string;
}

export interface DataSources {
  mongoose: Mongoose;
  postgres: Pool;
  redis: Redis;
}

/**
 * Initialize all data sources — call once at startup
 */
export async function initDataSources(config: DataSourceConfig): Promise<DataSources> {
  const [mongooseInstance, postgres, redis] = await Promise.all([
    connectMongo(config.mongoUri),
    Promise.resolve(connectPostgres(config.postgresUrl)),
    Promise.resolve(connectRedis(config.redisUrl)),
  ]);

  console.log('[DataSources] All connections initialized');

  return {
    mongoose: mongooseInstance,
    postgres,
    redis,
  };
}

// Re-export everything
export * from './mongodb';
export * from './postgres';
export * from './redis';
