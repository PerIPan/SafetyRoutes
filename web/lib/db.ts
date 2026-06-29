import { Pool, type QueryResultRow } from 'pg';

// Singleton pool — survives Next dev hot-reloads via globalThis.
const globalForDb = globalThis as unknown as { _srPool?: Pool };

export const pool: Pool =
  globalForDb._srPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== 'production') globalForDb._srPool = pool;

/** Parameterized query helper (all queries go through here — never interpolate). */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
