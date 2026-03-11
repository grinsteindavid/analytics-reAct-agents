import { Pool } from 'pg';

let pool: Pool | null = null;

export function connectPostgres(connectionString: string): Pool {
  if (pool) return pool;

  pool = new Pool({ connectionString });

  pool.on('connect', () => {
    console.log('[Postgres] Client connected');
  });

  pool.on('error', (err: Error) => {
    console.error('[Postgres] Pool error:', err.message);
  });

  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error('[Postgres] Not connected');
  return pool;
}
