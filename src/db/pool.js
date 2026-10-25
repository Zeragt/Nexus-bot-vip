import pg from 'pg';
import { logger, scrub } from '../core/logger.js';

// BIGINT columns (xp, nx...) come back as strings by default; our values stay far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
// DATE columns (day keys) stay 'YYYY-MM-DD' strings, so they never shift with the host's timezone.
pg.types.setTypeParser(1082, (v) => v);

/**
 * Builds pg options from a URL. Neon needs TLS; sslmode/channel_binding query params are
 * stripped and replaced by explicit options so behaviour doesn't depend on pg version quirks.
 */
export function buildPoolConfig(url, { ssl = 'auto', max = 5 } = {}) {
  const u = new URL(url);
  const sslmode = u.searchParams.get('sslmode');
  const channelBinding = u.searchParams.get('channel_binding');
  for (const p of ['sslmode', 'channel_binding', 'uselibpqcompat']) u.searchParams.delete(p);
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  const useSsl = ssl === 'require' || (ssl === 'auto' && (sslmode ? sslmode !== 'disable' : !local));
  return {
    connectionString: u.toString(),
    ssl: useSsl ? { rejectUnauthorized: true } : false,
    enableChannelBinding: useSsl && channelBinding === 'require',
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 20_000, // Neon computes can take a few seconds to wake up.
    keepAlive: true,
    application_name: 'nexus-bot',
  };
}

export function createPool(url, opts) {
  const pool = new pg.Pool(buildPoolConfig(url, opts));
  // Neon closes idle connections; without this listener an idle-client error would crash the process.
  pool.on('error', (err) => logger.warn({ err: scrub(err.message) }, 'Idle database client error (ignored)'));
  return pool;
}

let pool;
export function initDb(url, opts) {
  pool = createPool(url, opts);
  return pool;
}
export function getPool() {
  if (!pool) throw new Error('Database not initialised');
  return pool;
}
export function setPool(p) {
  pool = p;
}
export async function closeDb() {
  if (pool) await pool.end().catch(() => {});
  pool = undefined;
}

/** Shorthand query on the shared pool. */
export function query(text, params) {
  return getPool().query(text, params);
}
export async function one(text, params) {
  const { rows } = await getPool().query(text, params);
  return rows[0] ?? null;
}
export async function many(text, params) {
  const { rows } = await getPool().query(text, params);
  return rows;
}

const RETRYABLE = new Set(['40001', '40P01']); // serialization failure, deadlock

/**
 * Runs `fn(client)` inside a transaction. Rolls back on any error and retries a few times on
 * serialization failures/deadlocks so concurrent money and item operations stay correct.
 */
export async function tx(fn, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (RETRYABLE.has(err.code) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 25 * 2 ** attempt + Math.random() * 25));
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

/** Waits until the database answers, retrying while a Neon compute wakes up. */
export async function waitForDb(p = getPool(), attempts = 6) {
  for (let i = 1; ; i++) {
    try {
      await p.query('SELECT 1');
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      logger.warn({ attempt: i, err: scrub(err.message) }, 'Database not reachable yet, retrying');
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}
