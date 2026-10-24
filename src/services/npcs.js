import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { requireByUser, loadCharacter } from './characters.js';
import { addItem, removeItem, assertCapacity, resolveItem, ownedQuantity, mapItem } from './inventory.js';
import { credit, debit } from './economy.js';
import { audit } from './audit.js';

function mapNpc(r) {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    title: r.title,
    description: r.description,
    color: r.color,
    hasShop: r.has_shop,
    sellRate: r.sell_rate,
    locationId: r.location_id,
    location: r.loc_name ?? null,
    locationKey: r.loc_key ?? null,
    factionId: r.faction_id,
    faction: r.faction_name ?? null,
  };
}

const SELECT = `SELECT n.*, l.name_ar AS loc_name, l.key AS loc_key, f.name_ar AS faction_name
  FROM npcs n LEFT JOIN locations l ON l.id = n.location_id LEFT JOIN factions f ON f.id = n.faction_id`;

export async function listNpcs({ locationId = null } = {}) {
  const { rows } = await getPool().query(
    `${SELECT} ${locationId ? 'WHERE n.location_id = $1' : ''} ORDER BY l.id NULLS LAST, n.name`,
    locationId ? [locationId] : [],
  );
  return rows.map(mapNpc);
}

export async function getNpc(input, db = getPool()) {
  const q = String(input ?? '').trim();
  const { rows } = await db.query(`${SELECT} WHERE n.key = $1 OR lower(n.name) = lower($1) LIMIT 1`, [q]);
  return rows[0] ? mapNpc(rows[0]) : null;
}

export async function npcAutocomplete(query) {
  const { rows } = await getPool().query(
    `SELECT n.key, n.name, n.title, l.name_ar AS loc FROM npcs n LEFT JOIN locations l ON l.id = n.location_id
     WHERE n.name ILIKE $1 OR n.title ILIKE $1 ORDER BY n.name LIMIT 25`,
    [`%${query ?? ''}%`],
  );
  return rows.map((r) => ({ name: `${r.name} — ${r.title}${r.loc ? ` (${r.loc})` : ''}`.slice(0, 100), value: r.key }));
}

/**
 * Picks a line the character's reputation unlocks. Prefers a greeting on first contact.
 * Players must be at the NPC's location to talk (keeps the world spatial).
 */
export async function talk(userId, npcKey) {
  const ch = await requireByUser(userId);
  const npc = await getNpc(npcKey);
  if (!npc) throw new UserError('لم أجد هذه الشخصية');
  if (npc.locationId && ch.location?.id !== npc.locationId) throw new UserError(`${npc.name} موجود في ${npc.location}. سافر إلى هناك أولاً عبر /travel`);
  let rep = ch.reputation;
  if (npc.factionId) {
    const fr = (await getPool().query('SELECT reputation FROM character_factions WHERE character_id = $1 AND faction_id = $2', [ch.id, npc.factionId])).rows[0];
    rep = Math.max(rep, fr?.reputation ?? 0);
  }
  const { rows } = await getPool().query('SELECT trigger, text FROM npc_dialogues WHERE npc_id = $1 AND min_reputation <= $2', [npc.id, rep]);
  const talkLines = rows.filter((r) => r.trigger === 'talk');
  const pool = talkLines.length ? talkLines : rows;
  const line = pool.length ? pool[Math.floor(Math.random() * pool.length)].text : '...';
  return { npc, line, character: ch };
}

export async function shopItems(npcId) {
  const { rows } = await getPool().query(
    `SELECT i.*, s.price, s.stock FROM npc_shop_items s JOIN items i ON i.id = s.item_id WHERE s.npc_id = $1 ORDER BY s.price`,
    [npcId],
  );
  return rows.map((r) => ({ ...mapItem(r), price: r.price, stock: r.stock }));
}

/** Shops the player can use right now: NPCs with a shop at the character's location. */
export async function shopsHere(ch) {
  if (!ch.location) return [];
  const { rows } = await getPool().query(`${SELECT} WHERE n.location_id = $1 AND n.has_shop ORDER BY n.name`, [ch.location.id]);
  return rows.map(mapNpc);
}

async function pickShop(ch, npcKey) {
  if (npcKey) {
    const npc = await getNpc(npcKey);
    if (!npc || !npc.hasShop) throw new UserError('لا يوجد متجر بهذا الاسم');
    if (npc.locationId && npc.locationId !== ch.location?.id) throw new UserError(`متجر ${npc.name} موجود في ${npc.location}`);
    return npc;
  }
  const here = await shopsHere(ch);
  if (!here.length) throw new UserError('لا يوجد متجر في موقعك الحالي. جرّب السوق أو الحداد أو المقهى.');
  return here[0];
}

export async function openShop(userId, npcKey) {
  const ch = await requireByUser(userId);
  const npc = await pickShop(ch, npcKey);
  return { npc, items: await shopItems(npc.id), character: ch };
}

export async function shopAutocomplete(userId, query) {
  const { rows } = await getPool().query(
    `SELECT DISTINCT i.key, i.name_ar, i.name, s.price, n.name AS npc FROM npc_shop_items s
     JOIN items i ON i.id = s.item_id JOIN npcs n ON n.id = s.npc_id
     JOIN characters c ON c.user_id = $1 AND c.location_id = n.location_id
     WHERE i.name_ar ILIKE $2 OR i.name ILIKE $2 ORDER BY s.price LIMIT 25`,
    [userId, `%${query ?? ''}%`],
  );
  return rows.map((r) => ({ name: `${r.name_ar} (${r.name}) — ${r.price} NX — ${r.npc}`.slice(0, 100), value: r.key }));
}

export async function buy(userId, itemKey, qty = 1, npcKey = null) {
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new UserError('الكمية يجب أن تكون بين 1 و 99');
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const item = await resolveItem(itemKey, db);
    if (!item) throw new UserError('لم أجد هذا الغرض');
    const params = [item.id, ch.location?.id ?? -1];
    let npcFilter = '';
    if (npcKey) {
      params.push(npcKey);
      npcFilter = 'AND n.key = $3';
    }
    const offer = (
      await db.query(
        `SELECT s.*, n.name AS npc_name, n.key AS npc_key FROM npc_shop_items s JOIN npcs n ON n.id = s.npc_id
         WHERE s.item_id = $1 AND n.location_id = $2 ${npcFilter} ORDER BY s.price LIMIT 1 FOR UPDATE OF s`,
        params,
      )
    ).rows[0];
    if (!offer) throw new UserError('هذا الغرض غير معروض في أي متجر بموقعك الحالي');
    if (offer.stock !== null && offer.stock < qty) throw new UserError(offer.stock === 0 ? 'نفدت الكمية' : `المتوفر ${offer.stock} فقط`);
    await assertCapacity(db, ch, item.weight * qty);
    const total = offer.price * qty;
    const balance = await debit(db, ch.id, total, 'shop_buy', `شراء: ${item.name} x${qty} من ${offer.npc_name}`);
    if (offer.stock !== null) await db.query('UPDATE npc_shop_items SET stock = stock - $3 WHERE npc_id = $1 AND item_id = $2', [offer.npc_id, item.id, qty]);
    await addItem(db, ch.id, item.id, qty);
    return { item, qty, total, balance, npc: offer.npc_name };
  });
}

/** Sells to any shopkeeper at the current location, at their sell rate of the item's base value. */
export async function sell(userId, itemKey, qty = 1) {
  if (!Number.isInteger(qty) || qty < 1) throw new UserError('كمية غير صالحة');
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const npc = (await db.query('SELECT * FROM npcs WHERE location_id = $1 AND has_shop ORDER BY sell_rate DESC LIMIT 1', [ch.location?.id ?? -1])).rows[0];
    if (!npc) throw new UserError('لا يوجد تاجر في موقعك ليشتري منك');
    const item = await resolveItem(itemKey, db);
    if (!item) throw new UserError('لم أجد هذا الغرض');
    if (item.type === 'quest') throw new UserError('أغراض المهام لا تُباع');
    const owned = await ownedQuantity(db, ch.id, item.id);
    if (owned < qty) throw new UserError(`تملك ${owned} فقط`);
    const unit = Math.floor(item.value * npc.sell_rate);
    if (unit <= 0) throw new UserError('لا أحد يريد شراء هذا الغرض');
    await removeItem(db, ch.id, item.id, qty);
    await credit(db, ch.id, unit * qty, 'shop_sell', `بيع: ${item.name} x${qty} إلى ${npc.name}`);
    const after = await loadCharacter(db, ch.id);
    return { item, qty, total: unit * qty, balance: after.nx, npc: npc.name };
  });
}

// Admin -------------------------------------------------------------------
export async function createNpc(data, { actorId }) {
  if (!/^[a-z0-9_]{2,40}$/.test(data.key)) throw new UserError('المفتاح يجب أن يكون بالإنجليزية الصغيرة والأرقام و _ فقط');
  const { rows } = await getPool().query(
    `INSERT INTO npcs (key, name, title, description, location_id, faction_id, color, has_shop, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      data.key,
      data.name,
      data.title ?? '',
      data.description ?? '',
      data.locationId ?? null,
      data.factionId ?? null,
      data.color ?? '#22d3ee',
      Boolean(data.hasShop),
      actorId,
    ],
  );
  if (data.greeting) await getPool().query("INSERT INTO npc_dialogues (npc_id, trigger, text) VALUES ($1, 'greet', $2)", [rows[0].id, data.greeting]);
  await audit({ actorId, action: 'admin_action', targetType: 'npc', targetId: data.key, after: rows[0], reason: 'npc created' });
  return mapNpc(rows[0]);
}

export async function addDialogue(npcKey, text, { trigger = 'talk', minReputation = -100000, actorId }) {
  const npc = await getNpc(npcKey);
  if (!npc) throw new UserError('الشخصية غير موجودة');
  await getPool().query('INSERT INTO npc_dialogues (npc_id, trigger, text, min_reputation) VALUES ($1,$2,$3,$4)', [npc.id, trigger, text, minReputation]);
  await audit({ actorId, action: 'admin_action', targetType: 'npc', targetId: npc.key, after: { text, trigger }, reason: 'dialogue added' });
  return npc;
}

export async function setShopItem(npcKey, itemKey, price, stock, { actorId }) {
  const npc = await getNpc(npcKey);
  if (!npc) throw new UserError('الشخصية غير موجودة');
  const item = await resolveItem(itemKey);
  if (!item) throw new UserError('الغرض غير موجود');
  await getPool().query('UPDATE npcs SET has_shop = TRUE WHERE id = $1', [npc.id]);
  if (price <= 0) {
    await getPool().query('DELETE FROM npc_shop_items WHERE npc_id = $1 AND item_id = $2', [npc.id, item.id]);
  } else {
    await getPool().query(
      `INSERT INTO npc_shop_items (npc_id, item_id, price, stock) VALUES ($1,$2,$3,$4)
       ON CONFLICT (npc_id, item_id) DO UPDATE SET price = EXCLUDED.price, stock = EXCLUDED.stock`,
      [npc.id, item.id, price, stock],
    );
  }
  await audit({ actorId, action: 'admin_action', targetType: 'npc', targetId: npc.key, after: { item: item.key, price, stock }, reason: 'shop item' });
  return { npc, item };
}
