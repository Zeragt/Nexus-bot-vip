import { allGeneratedSkills, contentFingerprint } from '../content/classGen.js';
import { V3_ITEMS, SHOP_STOCK } from '../content/items.js';
import { logger } from '../core/logger.js';

const LOCK_KEY = 74_221_338;
const BATCH = 1000;

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
  log.info({ skills: skills.length, ms: Date.now() - started }, 'Class content synced');
  return { skipped: false, fingerprint, skills: skills.length };
}

function hashOf(value) {
  let h = 2166136261;
  const str = JSON.stringify(value);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

/**
 * v3 world content: the item catalogue (materials, region gear, secret relics, boxes) and the
 * extra shop stock. Upserted by key, only when the content changed. Items made by admins
 * (created_by set) are never overwritten.
 */
export async function syncWorldContent(pool, { force = false, log = logger } = {}) {
  const fingerprint = `w1-${hashOf([V3_ITEMS, SHOP_STOCK])}`;
  if (!force) {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'world_content_hash'");
    if (rows[0]?.value === fingerprint) return { skipped: true, items: 0 };
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY + 1]);
    for (const it of V3_ITEMS) {
      await client.query(
        `INSERT INTO items (key, name, name_ar, description, type, rarity, value, weight, stats, use_effect, usable, equippable, slot, tradeable)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,TRUE)
         ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, description = EXCLUDED.description,
           type = EXCLUDED.type, rarity = EXCLUDED.rarity, value = EXCLUDED.value, weight = EXCLUDED.weight, stats = EXCLUDED.stats,
           use_effect = EXCLUDED.use_effect, usable = EXCLUDED.usable, equippable = EXCLUDED.equippable, slot = EXCLUDED.slot
         WHERE items.created_by IS NULL`,
        [
          it.key,
          it.name,
          it.nameAr,
          it.description,
          it.type,
          it.rarity,
          it.value,
          it.weight,
          JSON.stringify(it.stats ?? {}),
          it.use ? JSON.stringify(it.use) : null,
          it.usable,
          it.equippable,
          it.slot,
        ],
      );
    }
    for (const [npcKey, stock] of Object.entries(SHOP_STOCK)) {
      for (const [itemKey, price, qty] of stock) {
        await client.query(
          `INSERT INTO npc_shop_items (npc_id, item_id, price, stock)
           SELECT n.id, i.id, $3, $4 FROM npcs n, items i WHERE n.key = $1 AND i.key = $2
           ON CONFLICT (npc_id, item_id) DO NOTHING`,
          [npcKey, itemKey, price, qty],
        );
      }
    }
    await client.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('world_content_hash', $1::jsonb, now())
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
  log.info({ items: V3_ITEMS.length }, 'World content synced');
  return { skipped: false, items: V3_ITEMS.length };
}
