import { many, query } from '../db/pool.js';

const cache = new Map();
let loadedAt = 0;
const TTL = 60_000;

async function refresh() {
  const rows = await many('SELECT key, value FROM settings');
  cache.clear();
  for (const r of rows) cache.set(r.key, r.value);
  loadedAt = Date.now();
}

/** Server-wide tunables stored in the `settings` table, cached for a minute. */
export async function getSetting(key, fallback = null) {
  if (Date.now() - loadedAt > TTL) await refresh();
  return cache.has(key) ? cache.get(key) : fallback;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
  cache.set(key, value);
}

export async function allSettings() {
  await refresh();
  return Object.fromEntries(cache);
}

export function invalidateSettings() {
  loadedAt = 0;
}
