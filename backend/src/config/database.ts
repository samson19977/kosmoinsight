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
  // Was 2000ms — genuinely too aggressive for a real network hop to a
  // remote Postgres instance (Supabase, over the internet, from Rwanda).
  // A brief network hiccup or a cold connection pool taking slightly
  // longer than 2 seconds to establish would fail outright with
  // "Connection terminated due to connection timeout" — not just for
  // one-off scripts like the location seed, but potentially for real
  // production requests too. 10 seconds is a much more realistic timeout
  // for establishing a connection, while still failing fast enough to
  // notice a genuinely broken connection string or unreachable database.
  connectionTimeoutMillis: 10000,
  keepAlive: true,
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
