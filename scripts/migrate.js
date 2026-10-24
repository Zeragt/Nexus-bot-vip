// npm run db:migrate            → apply pending migrations
// npm run db:status             → list applied / pending migrations
import { loadDbEnv } from '../src/config/env.js';
import { createPool, waitForDb } from '../src/db/pool.js';
import { migrate, migrationStatus } from '../src/db/migrate.js';
import { scrub } from '../src/core/logger.js';

const env = loadDbEnv();
const url = process.env.MIGRATE_DIRECT === 'true' ? env.DIRECT_URL : env.DATABASE_URL;
const pool = createPool(url, { ssl: env.DATABASE_SSL, max: 1 });
try {
  await waitForDb(pool);
  if (process.argv.includes('--status')) {
    for (const m of await migrationStatus(pool))
      console.log(`${m.appliedAt ? '✔' : '…'} ${m.name}${m.appliedAt ? `  (${new Date(m.appliedAt).toISOString()})` : ''}`);
  } else {
    const applied = await migrate(pool);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
  }
} catch (err) {
  console.error(scrub(err.message));
  process.exitCode = 1;
} finally {
  await pool.end();
}
