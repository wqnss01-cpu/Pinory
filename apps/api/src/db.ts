import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ...(env.DATABASE_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

export type DbClient = pg.PoolClient;

export async function tx<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function encodeCursor(value: string | Date): string {
  return Buffer.from(new Date(value).toISOString()).toString('base64url');
}

export function decodeCursor(value?: string): string | null {
  if (!value) return null;
  try {
    const parsed = new Date(Buffer.from(value, 'base64url').toString());
    return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
  } catch {
    return null;
  }
}
