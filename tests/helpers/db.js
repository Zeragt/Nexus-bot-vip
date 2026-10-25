import { createPool, setPool, closeDb } from '../../src/db/pool.js';
import { migrate } from '../../src/db/migrate.js';
import { app } from '../../src/core/context.js';
import { CooldownManager, pgCooldownStore, RateLimiter } from '../../src/core/cooldowns.js';
import { invalidateSettings } from '../../src/services/settings.js';
import { syncWorldContent } from '../../src/services/content.js';

export const TEST_DB = process.env.TEST_DATABASE_URL;

/** Fresh schema on the test database, wired into the app singletons. */
export async function setupTestDb() {
  const pool = createPool(TEST_DB, { ssl: 'disable', max: 8 });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await migrate(pool, { log: { info() {}, warn() {} } });
  await syncWorldContent(pool, { force: true, log: { info() {} } });
  setPool(pool);
  app.cooldowns = new CooldownManager({ store: pgCooldownStore(pool) });
  app.commandLimiter = new RateLimiter({ limit: 10_000, windowMs: 1000 });
  app.buttonLimiter = new RateLimiter({ limit: 10_000, windowMs: 1000 });
  app.client = null;
  invalidateSettings();
  return pool;
}

export const teardownTestDb = () => closeDb();
