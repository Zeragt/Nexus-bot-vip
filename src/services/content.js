import { allGeneratedSkills, contentFingerprint as skillsFingerprint } from '../content/classGen.js';
import { CONTENT_ITEMS } from '../content/items.js';
import { SHOP_STOCK } from '../content/shops.js';
import { logger } from '../core/logger.js';

const LOCK_KEY = 74_221_338;
const BATCH = 1000;

/** One fingerprint for every piece of synced content, so a boot only writes when something changed. */
export function contentFingerprint() {
  let h = 2166136261;
  const str = JSON.stringify([CONTENT_ITEMS, SHOP_STOCK]);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return `${skillsFingerprint()}+items-${CONTENT_ITEMS.length}-${(h >>> 0).toString(16)}`;
}

/** Upserts the content items (materials, gear, trophies, secrets, chests). */
async function syncItems(client) {
  const col = (f) => CONTENT_ITEMS.map(f);
  await client.query(
    `INSERT INTO items (key, name, name_ar, description, type, rarity, value, weight, stats, use_effect, usable, equippable, slot, tradeable, created_by)
     SELECT k, n, na, d, t, r, v, w, st::jsonb, ue::jsonb, u, e, sl, tr, 'content'
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::numeric[], $9::text[], $10::text[],
                 $11::bool[], $12::bool[], $13::text[], $14::bool[]) AS u(k, n, na, d, t, r, v, w, st, ue, u, e, sl, tr)
     ON CONFLICT (key) DO UPDATE SET
       name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, description = EXCLUDED.description, type = EXCLUDED.type,
       rarity = EXCLUDED.rarity, value = EXCLUDED.value, weight = EXCLUDED.weight, stats = EXCLUDED.stats,
       use_effect = EXCLUDED.use_effect, usable = EXCLUDED.usable, equippable = EXCLUDED.equippable, slot = EXCLUDED.slot,
       tradeable = EXCLUDED.tradeable`,
    [
      col((i) => i.key),
      col((i) => i.name),
      col((i) => i.nameAr),
      col((i) => i.description ?? ''),
      col((i) => i.type),
      col((i) => i.rarity),
      col((i) => i.value),
      col((i) => i.weight),
      col((i) => JSON.stringify(i.stats ?? {})),
      col((i) => (i.useEffect ? JSON.stringify(i.useEffect) : null)),
      col((i) => Boolean(i.usable)),
      col((i) => Boolean(i.equippable)),
      col((i) => i.slot ?? null),
      col((i) => i.tradeable !== false),
    ],
  );
  // Shop stock is only added: staff may have changed prices or stock since.
  for (const [npcKey, entries] of Object.entries(SHOP_STOCK)) {
    for (const [itemKey, price, stock] of entries) {
      await client.query(
        `INSERT INTO npc_shop_items (npc_id, item_id, price, stock)
         SELECT n.id, i.id, $3, $4 FROM npcs n, items i WHERE n.key = $1 AND i.key = $2
         ON CONFLICT DO NOTHING`,
        [npcKey, itemKey, price, stock ?? null],
      );
    }
  }
}

/**
 * Upserts the generated class and path skills (about 10k rows). Runs on boot, but only
 * does work when the content fingerprint differs from the one stored in `settings`,
 * so normal restarts cost a single query.
 */
export async function syncContent(pool, { force = false, log = logger } = {}) {
  const fingerprint = contentFingerprint();
  if (!force) {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'content_hash'");
    if (rows[0]?.value === fingerprint) return { skipped: true, fingerprint, skills: 0 };
  }
  const skills = allGeneratedSkills();
  const started = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    await syncItems(client);
    for (let i = 0; i < skills.length; i += BATCH) {
      const chunk = skills.slice(i, i + BATCH);
      const col = (f) => chunk.map(f);
      await client.query(
        `INSERT INTO skills (key, name, name_ar, description, type, discipline, cooldown_turns, energy_cost, power, scaling_stat,
                             effect_key, effect_chance, effect_turns, target, required_level, starter, class_key, subclass_key, tier, element, extra)
         SELECT k, n, na, d, t, dis, cd, ec, pw, ss, ek, ech, et, tg, rl, FALSE, ck, sk, ti, el, ex::jsonb
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::int[], $9::int[], $10::text[],
                     $11::text[], $12::real[], $13::int[], $14::text[], $15::int[], $16::text[], $17::text[], $18::smallint[], $19::text[], $20::text[])
              AS u(k, n, na, d, t, dis, cd, ec, pw, ss, ek, ech, et, tg, rl, ck, sk, ti, el, ex)
         ON CONFLICT (key) DO UPDATE SET
           name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, description = EXCLUDED.description, type = EXCLUDED.type,
           discipline = EXCLUDED.discipline, cooldown_turns = EXCLUDED.cooldown_turns, energy_cost = EXCLUDED.energy_cost,
           power = EXCLUDED.power, scaling_stat = EXCLUDED.scaling_stat, effect_key = EXCLUDED.effect_key,
           effect_chance = EXCLUDED.effect_chance, effect_turns = EXCLUDED.effect_turns, target = EXCLUDED.target,
           required_level = EXCLUDED.required_level, class_key = EXCLUDED.class_key, subclass_key = EXCLUDED.subclass_key,
           tier = EXCLUDED.tier, element = EXCLUDED.element, extra = EXCLUDED.extra`,
        [
          col((s) => s.key),
          col((s) => s.name),
          col((s) => s.nameAr),
          col((s) => s.description),
          col((s) => s.type),
          col((s) => s.discipline),
          col((s) => s.cooldownTurns),
          col((s) => s.energyCost),
          col((s) => s.power),
          col((s) => s.scalingStat),
          col((s) => s.effectKey),
          col((s) => s.effectChance),
          col((s) => s.effectTurns),
          col((s) => s.target),
          col((s) => s.requiredLevel),
          col((s) => s.classKey),
          col((s) => s.subclassKey),
          col((s) => s.tier),
          col((s) => s.element),
          col((s) => JSON.stringify(s.extra ?? {})),
        ],
      );
    }
    await client.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('content_hash', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(fingerprint)],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  log.info({ skills: skills.length, items: CONTENT_ITEMS.length, ms: Date.now() - started }, 'Game content synced');
  return { skipped: false, fingerprint, skills: skills.length, items: CONTENT_ITEMS.length };
}
