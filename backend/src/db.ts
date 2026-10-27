import { Pool, types } from 'pg';
import { config } from './config';

// Keep Postgres `date` columns as plain 'YYYY-MM-DD' strings (no timezone shifting).
types.setTypeParser(1082, (v: string) => v);

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => console.error('Unexpected Postgres pool error', err));
