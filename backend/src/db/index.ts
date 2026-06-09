import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Standard pg connection pool.
//
// Scale note: this pool is appropriate for a single-process Node.js backend.
// In a serverless or multi-replica deployment (Railway autoscale, Render
// horizontal scaling) each instance opens its own pool, which can exhaust
// Postgres's connection limit fast.
//
// The production-safe upgrade path:
//   1. Point DATABASE_URL at the *pooler* endpoint Neon/Supabase provides
//      (their PgBouncer layer, e.g. pg-pooler.neon.tech). The pooler
//      multiplexes all backend instances over a small set of real server
//      connections in transaction mode.
//   2. Keep max: 5 here so each replica is conservative; the pooler absorbs
//      the multiplexing.
//
// Connection timeout is set explicitly so slow DB starts at deploy time
// surface as a clear error rather than a silent hang.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err);
  process.exit(1);
});

export const db = drizzle(pool, { schema });
