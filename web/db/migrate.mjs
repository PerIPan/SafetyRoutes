// Apply db/schema.sql to DATABASE_URL. Idempotent. Run: npm run db:migrate
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from 'dotenv';
config({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set (check web/.env.local)');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' ORDER BY table_name`,
  );
  console.log('Migration OK. Tables:', rows.map((r) => r.table_name).join(', '));
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
