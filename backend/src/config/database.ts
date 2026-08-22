import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema });

// Shared type for "either the global db, or a transaction handle passed
// down from db.transaction(async (tx) => ...)". Service methods that need
// to participate in a caller's transaction (instead of always using their
// own separate connection) accept this as an optional parameter, defaulting
// to the global `db` so existing standalone call sites are unaffected.
// Derived directly from db.transaction's own callback parameter type so it
// always matches whatever drizzle-orm actually produces, instead of hand
// re-declaring drizzle's internal transaction type here.
export type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Supabase PostgreSQL connected successfully!');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}
