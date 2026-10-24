import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { logger } from '../core/logger.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const LOCK_KEY = 74_221_337; // arbitrary constant shared by every Nexus instance

export async function listMigrations(dir = DIR) {
  const files = (await fs.readdir(dir)).filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f)).sort();
  return Promise.all(
    files.map(async (name) => {
      const sql = await fs.readFile(path.join(dir, name), 'utf8');
      return { name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16) };
    }),
  );
}

/**
 * Applies pending migrations. Each file runs in its own transaction guarded by a
 * transaction-scoped advisory lock, which (unlike session locks) also works through
 * Neon's PgBouncer pooler, so two bot instances starting together cannot race.
 */
export async function migrate(pool, { dir = DIR, log = logger } = {}) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const migrations = await listMigrations(dir);
  const applied = [];
  for (const m of migrations) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
      const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [m.name]);
      if (rows.length) {
        if (rows[0].checksum !== m.checksum) log.warn({ migration: m.name }, 'Applied migration was modified afterwards');
        await client.query('COMMIT');
        continue;
      }
      await client.query(m.sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [m.name, m.checksum]);
      await client.query('COMMIT');
      applied.push(m.name);
      log.info({ migration: m.name }, 'Migration applied');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      err.message = `Migration ${m.name} failed: ${err.message}`;
      throw err;
    } finally {
      client.release();
    }
  }
  return applied;
}

export async function migrationStatus(pool, dir = DIR) {
  const migrations = await listMigrations(dir);
  const { rows } = await pool.query('SELECT name, applied_at FROM schema_migrations').catch(() => ({ rows: [] }));
  const done = new Map(rows.map((r) => [r.name, r.applied_at]));
  return migrations.map((m) => ({ name: m.name, appliedAt: done.get(m.name) ?? null }));
}
