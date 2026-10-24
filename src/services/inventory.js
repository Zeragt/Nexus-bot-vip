import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { economy, ui } from '../config/game.js';
import { EFFECTS } from '../engine/effects.js';
import { requireByUser, loadCharacter, saveVitals } from './characters.js';
import { audit } from './audit.js';

export function mapItem(r) {
  return {
    id: r.id,
    key: r.key,
    name: r.name_ar,
    nameEn: r.name,
    description: r.description,
    type: r.type,
    rarity: r.rarity,
    value: r.value,
    weight: Number(r.weight),
    stats: r.stats ?? {},
    useEffect: r.use_effect,
    usable: r.usable,
    equippable: r.equippable,
    slot: r.slot,
    tradeable: r.tradeable,
  };
}

export async function getItemByKey(key, db = getPool()) {
  const { rows } = await db.query('SELECT * FROM items WHERE key = $1', [key]);
  return rows[0] ? mapItem(rows[0]) : null;
}

/** Resolves user input (an item key from autocomplete, or a typed name) to an item. */
export async function resolveItem(input, db = getPool()) {
  const q = String(input ?? '').trim();
  if (!q) return null;
  const { rows } = await db.query(
    `SELECT * FROM items WHERE key = $1 OR lower(name) = lower($1) OR name_ar = $1
     ORDER BY (key = $1) DESC LIMIT 1`,
    [q],
  );
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function searchItems(query, limit = 25) {
  const q = `%${String(query ?? '').trim()}%`;
  const { rows } = await getPool().query(
    'SELECT key, name, name_ar, rarity FROM items WHERE name ILIKE $1 OR name_ar ILIKE $1 OR key ILIKE $1 ORDER BY value DESC LIMIT $2',
    [q, limit],
  );
  return rows;
}

/** Adds stackable quantity (inside a transaction). */
export async function addItem(db, characterId, itemId, qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new UserError('كمية غير صالحة');
  await db.query(
    `INSERT INTO inventory_items (character_id, item_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (character_id, item_id) DO UPDATE SET quantity = inventory_items.quantity + EXCLUDED.quantity`,
    [characterId, itemId, qty],
  );
}

/** Removes quantity atomically; fails if the character doesn't own enough. */
export async function removeItem(db, characterId, itemId, qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new UserError('كمية غير صالحة');
  // quantity has CHECK (> 0), so the last unit is deleted instead of decremented to zero.
  const res = await db.query(
    `WITH del AS (
       DELETE FROM inventory_items WHERE character_id = $1 AND item_id = $2 AND quantity = $3 RETURNING 0 AS quantity
     ), upd AS (
       UPDATE inventory_items SET quantity = quantity - $3 WHERE character_id = $1 AND item_id = $2 AND quantity > $3 RETURNING quantity
     )
     SELECT quantity FROM del UNION ALL SELECT quantity FROM upd`,
    [characterId, itemId, qty],
  );
  if (!res.rowCount) throw new UserError('لا تملك الكمية المطلوبة من هذا الغرض');
}

export async function ownedQuantity(db, characterId, itemId) {
  const { rows } = await db.query('SELECT quantity FROM inventory_items WHERE character_id = $1 AND item_id = $2', [characterId, itemId]);
  return rows[0]?.quantity ?? 0;
}

/** Inventory keyed by item key, for quest evaluation. */
export async function inventoryMap(db, characterId) {
  const { rows } = await db.query('SELECT i.key, ii.quantity FROM inventory_items ii JOIN items i ON i.id = ii.item_id WHERE ii.character_id = $1', [
    characterId,
  ]);
  return Object.fromEntries(rows.map((r) => [r.key, r.quantity]));
}

export async function carriedWeight(db, characterId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(i.weight * ii.quantity), 0) + COALESCE((SELECT SUM(i2.weight) FROM equipment e JOIN items i2 ON i2.id = e.item_id WHERE e.character_id = $1), 0) AS w
     FROM inventory_items ii JOIN items i ON i.id = ii.item_id WHERE ii.character_id = $1`,
    [characterId],
  );
  return Number(rows[0].w);
}

export function capacityOf(ch) {
  return economy.carryCapacity(ch.stats.strength);
}

/** Throws if adding `extraWeight` would exceed the carry capacity. */
export async function assertCapacity(db, ch, extraWeight) {
  const w = await carriedWeight(db, ch.id);
  const cap = capacityOf(ch);
  if (w + extraWeight > cap) throw new UserError(`الحمولة ستتجاوز قدرتك (${(w + extraWeight).toFixed(1)}/${cap}). تخلّص من بعض الأغراض أو ارفع قوتك.`);
}

const TYPE_ORDER =
  "CASE i.type WHEN 'weapon' THEN 1 WHEN 'armor' THEN 2 WHEN 'accessory' THEN 3 WHEN 'consumable' THEN 4 WHEN 'material' THEN 5 WHEN 'quest' THEN 6 ELSE 7 END";

/** Page of inventory entries, equipped items first. */
export async function listInventory(characterId, { page = 1, type = null } = {}) {
  const size = ui.pageSize.inventory;
  const db = getPool();
  const params = [characterId];
  let filter = '';
  if (type) {
    params.push(type);
    filter = `AND i.type = $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT * FROM (
        SELECT i.*, 1 AS quantity, TRUE AS equipped FROM equipment e JOIN items i ON i.id = e.item_id WHERE e.character_id = $1
        UNION ALL
        SELECT i.*, ii.quantity, FALSE AS equipped FROM inventory_items ii JOIN items i ON i.id = ii.item_id WHERE ii.character_id = $1
     ) i WHERE TRUE ${filter}
     ORDER BY i.equipped DESC, ${TYPE_ORDER}, i.value DESC, i.id`,
    params,
  );
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return {
    items: rows.slice((p - 1) * size, p * size).map((r) => ({ ...mapItem(r), quantity: r.quantity, equipped: r.equipped })),
    page: p,
    pages,
    total: rows.length,
  };
}

/** Autocomplete source: items the user owns (optionally filtered by a predicate column). */
export async function ownedForAutocomplete(userId, query, { only = null } = {}) {
  const cond = only === 'usable' ? 'AND i.usable' : only === 'equippable' ? 'AND i.equippable' : only === 'tradeable' ? 'AND i.tradeable' : '';
  const { rows } = await getPool().query(
    `SELECT i.key, i.name_ar, i.name, ii.quantity FROM inventory_items ii
     JOIN items i ON i.id = ii.item_id JOIN characters c ON c.id = ii.character_id
     WHERE c.user_id = $1 ${cond} AND (i.name_ar ILIKE $2 OR i.name ILIKE $2 OR i.key ILIKE $2)
     ORDER BY i.name_ar LIMIT 25`,
    [userId, `%${query ?? ''}%`],
  );
  return rows.map((r) => ({ name: `${r.name_ar} (${r.name}) x${r.quantity}`.slice(0, 100), value: r.key }));
}

async function ownedItemOrThrow(db, ch, input) {
  const item = await resolveItem(input, db);
  if (!item) throw new UserError('لم أجد هذا الغرض');
  const qty = await ownedQuantity(db, ch.id, item.id);
  if (qty <= 0) throw new UserError(`لا تملك «${item.name}» في حقيبتك`);
  return { item, qty };
}

/** Uses a consumable: heal, energy, cleanse or a timed buff. */
export async function useItem(userId, input) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const { item } = await ownedItemOrThrow(db, ch, input);
    if (!item.usable || !item.useEffect) throw new UserError('هذا الغرض لا يمكن استخدامه');
    const fx = item.useEffect;
    const result = { item, healed: 0, energy: 0, cleansed: false, buff: null };
    if (fx.heal || fx.energy) {
      if (fx.heal && ch.hp >= ch.maxHp && !fx.energy) throw new UserError('صحتك ممتلئة بالفعل');
      if (fx.energy && ch.energy >= ch.maxEnergy && !fx.heal) throw new UserError('طاقتك ممتلئة بالفعل');
      const hp = Math.min(ch.maxHp, ch.hp + (fx.heal || 0));
      const en = Math.min(ch.maxEnergy, ch.energy + (fx.energy || 0));
      result.healed = hp - ch.hp;
      result.energy = en - ch.energy;
      await saveVitals(db, ch, { hp, energy: en });
    }
    if (fx.cleanse) {
      const debuffs = Object.entries(EFFECTS)
        .filter(([, d]) => d.kind === 'debuff')
        .map(([k]) => k);
      await db.query('DELETE FROM character_status_effects WHERE character_id = $1 AND effect_key = ANY($2::text[])', [ch.id, debuffs]);
      result.cleansed = true;
    }
    if (fx.buff && EFFECTS[fx.buff]) {
      await db.query(
        `INSERT INTO character_status_effects (character_id, effect_key, expires_at, source) VALUES ($1, $2, now() + make_interval(mins => $3), $4)
         ON CONFLICT (character_id, effect_key) DO UPDATE SET expires_at = GREATEST(character_status_effects.expires_at, EXCLUDED.expires_at)`,
        [ch.id, fx.buff, fx.minutes ?? 30, item.key],
      );
      result.buff = { key: fx.buff, name: EFFECTS[fx.buff].name, minutes: fx.minutes ?? 30 };
    }
    await removeItem(db, ch.id, item.id, 1);
    result.character = await loadCharacter(db, ch.id);
    return result;
  });
}

export async function equipItem(userId, input) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const { item } = await ownedItemOrThrow(db, ch, input);
    if (!item.equippable || !item.slot) throw new UserError('هذا الغرض لا يمكن تجهيزه');
    const current = (await db.query('SELECT item_id FROM equipment WHERE character_id = $1 AND slot = $2', [ch.id, item.slot])).rows[0];
    await removeItem(db, ch.id, item.id, 1);
    if (current) await addItem(db, ch.id, current.item_id, 1);
    await db.query(
      `INSERT INTO equipment (character_id, slot, item_id) VALUES ($1, $2, $3)
       ON CONFLICT (character_id, slot) DO UPDATE SET item_id = EXCLUDED.item_id, equipped_at = now()`,
      [ch.id, item.slot, item.id],
    );
    const replaced = current ? (await db.query('SELECT name_ar FROM items WHERE id = $1', [current.item_id])).rows[0]?.name_ar : null;
    return { item, replaced, character: await loadCharacter(db, ch.id) };
  });
}

export async function unequipSlot(userId, slot) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const cur = (await db.query('DELETE FROM equipment WHERE character_id = $1 AND slot = $2 RETURNING item_id', [ch.id, slot])).rows[0];
    if (!cur) throw new UserError('لا يوجد شيء مجهّز في هذه الخانة');
    await addItem(db, ch.id, cur.item_id, 1);
    const item = mapItem((await db.query('SELECT * FROM items WHERE id = $1', [cur.item_id])).rows[0]);
    return { item, character: await loadCharacter(db, ch.id) };
  });
}

export async function dropItem(userId, input, qty) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const { item, qty: owned } = await ownedItemOrThrow(db, ch, input);
    if (item.type === 'quest') throw new UserError('لا يمكنك رمي غرض مهمة');
    const n = Math.min(qty, owned);
    await removeItem(db, ch.id, item.id, n);
    return { item, quantity: n };
  });
}

/** Admin give/take with audit. */
export async function adminGive(characterId, itemKey, qty, { actorId, reason }) {
  return tx(async (db) => {
    const item = await resolveItem(itemKey, db);
    if (!item) throw new UserError('الغرض غير موجود');
    if (qty > 0) await addItem(db, characterId, item.id, qty);
    else await removeItem(db, characterId, item.id, -qty);
    await audit(
      { actorId, action: qty > 0 ? 'item_added' : 'item_removed', targetType: 'character', targetId: characterId, after: { item: item.key, qty }, reason },
      db,
    );
    return item;
  });
}

const itemKeyRe = /^[a-z0-9_]{2,40}$/;
export async function createItem(data, { actorId }) {
  if (!itemKeyRe.test(data.key)) throw new UserError('مفتاح الغرض يجب أن يكون بالإنجليزية الصغيرة والأرقام و _ فقط');
  if (data.equippable && !data.slot) throw new UserError('الغرض القابل للتجهيز يحتاج خانة (سلاح/درع/إكسسوار)');
  return tx(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO items (key, name, name_ar, description, type, rarity, value, weight, stats, use_effect, usable, equippable, slot, tradeable, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        data.key,
        data.name,
        data.nameAr,
        data.description ?? '',
        data.type,
        data.rarity,
        data.value ?? 0,
        data.weight ?? 0,
        JSON.stringify(data.stats ?? {}),
        data.useEffect ? JSON.stringify(data.useEffect) : null,
        Boolean(data.useEffect),
        Boolean(data.slot),
        data.slot ?? null,
        data.type !== 'quest',
        actorId,
      ],
    );
    await audit({ actorId, action: 'item_created', targetType: 'item', targetId: data.key, after: data }, db);
    return mapItem(rows[0]);
  });
}

/** Active timed buffs/debuffs from consumables (fed into combat). */
export async function activeStatusEffects(db, characterId) {
  const { rows } = await db.query('SELECT effect_key, potency FROM character_status_effects WHERE character_id = $1 AND expires_at > now()', [characterId]);
  return rows.map((r) => ({ key: r.effect_key, potency: r.potency, turns: 3 }));
}
