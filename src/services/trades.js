import crypto from 'node:crypto';
import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { validateOffer, setOfferItem, setOfferNx, isEmptyOffer } from '../engine/trade.js';
import { requireByUser, loadCharacter } from './characters.js';
import { addItem, removeItem, carriedWeight, capacityOf } from './inventory.js';
import { checkAchievements } from './achievements.js';
import { audit } from './audit.js';
import { track } from './progress.js';

const TRADE_MINUTES = 10;

function mapTrade(r) {
  return {
    id: r.id,
    initiatorId: r.initiator_id,
    partnerId: r.partner_id,
    status: r.status,
    offers: { initiator: r.offer_initiator, partner: r.offer_partner },
    confirmed: { initiator: r.confirmed_initiator, partner: r.confirmed_partner },
    channelId: r.channel_id,
    messageId: r.message_id,
    expiresAt: r.expires_at,
  };
}

export async function getTrade(id, db = getPool()) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await db.query('SELECT * FROM trades WHERE id = $1', [id]);
  return rows[0] ? mapTrade(rows[0]) : null;
}

export async function openTrade(userId, partnerUserId) {
  if (userId === partnerUserId) throw new UserError('لا يمكنك التداول مع نفسك');
  return tx(async (db) => {
    const a = await requireByUser(userId, db);
    const b = await requireByUser(partnerUserId, db).catch(() => {
      throw new UserError('هذا المستخدم لا يملك شخصية في نكسس');
    });
    const open = await db.query(
      "SELECT 1 FROM trades WHERE status = 'open' AND expires_at > now() AND (initiator_id = ANY($1::int[]) OR partner_id = ANY($1::int[]))",
      [[a.id, b.id]],
    );
    if (open.rowCount) throw new UserError('أحد الطرفين لديه صفقة مفتوحة بالفعل');
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO trades (id, initiator_id, partner_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`, [
      id,
      a.id,
      b.id,
      TRADE_MINUTES,
    ]);
    return { trade: await getTrade(id, db), initiator: a, partner: b };
  });
}

async function sideOf(db, trade, userId) {
  const ch = await requireByUser(userId, db);
  if (ch.id === trade.initiatorId) return { side: 'initiator', ch };
  if (ch.id === trade.partnerId) return { side: 'partner', ch };
  throw new UserError('هذه الصفقة ليست لك');
}

async function ownerSnapshot(db, characterId) {
  const nx = (await db.query('SELECT nx FROM characters WHERE id = $1', [characterId])).rows[0]?.nx ?? 0;
  const inv = (
    await db.query('SELECT ii.item_id, ii.quantity, i.tradeable FROM inventory_items ii JOIN items i ON i.id = ii.item_id WHERE ii.character_id = $1', [
      characterId,
    ])
  ).rows;
  return {
    nx: Number(nx),
    inventory: Object.fromEntries(inv.map((r) => [r.item_id, r.quantity])),
    tradeable: Object.fromEntries(inv.map((r) => [r.item_id, r.tradeable])),
  };
}

async function lockOpenTrade(db, tradeId) {
  const row = (await db.query('SELECT * FROM trades WHERE id = $1 FOR UPDATE', [tradeId])).rows[0];
  if (!row || row.status !== 'open') throw new UserError('هذه الصفقة لم تعد مفتوحة');
  if (new Date(row.expires_at) < new Date()) {
    await db.query("UPDATE trades SET status = 'expired' WHERE id = $1", [tradeId]);
    throw new UserError('انتهت مهلة الصفقة');
  }
  return mapTrade(row);
}

/** Any change to an offer resets both confirmations, so nobody can be baited by a late swap. */
async function writeOffer(db, trade, side, offer) {
  const col = side === 'initiator' ? 'offer_initiator' : 'offer_partner';
  await db.query(`UPDATE trades SET ${col} = $2, confirmed_initiator = FALSE, confirmed_partner = FALSE, version = version + 1 WHERE id = $1`, [
    trade.id,
    JSON.stringify(offer),
  ]);
}

export async function setItem(tradeId, userId, itemKey, qty) {
  return tx(async (db) => {
    const trade = await lockOpenTrade(db, tradeId);
    const { side, ch } = await sideOf(db, trade, userId);
    const item = (await db.query('SELECT id, name_ar, tradeable FROM items WHERE key = $1', [itemKey])).rows[0];
    if (!item) throw new UserError('الغرض غير موجود');
    if (!item.tradeable) throw new UserError('هذا الغرض غير قابل للتداول');
    const offer = setOfferItem(trade.offers[side], item.id, qty);
    const check = validateOffer(offer, await ownerSnapshot(db, ch.id));
    if (!check.ok) throw new UserError(check.problems.join('\n'));
    await writeOffer(db, trade, side, offer);
    return getTrade(tradeId, db);
  });
}

export async function setNx(tradeId, userId, amount) {
  return tx(async (db) => {
    const trade = await lockOpenTrade(db, tradeId);
    const { side, ch } = await sideOf(db, trade, userId);
    const offer = setOfferNx(trade.offers[side], amount);
    const check = validateOffer(offer, await ownerSnapshot(db, ch.id));
    if (!check.ok) throw new UserError(check.problems.join('\n'));
    await writeOffer(db, trade, side, offer);
    return getTrade(tradeId, db);
  });
}

export async function cancel(tradeId, userId) {
  return tx(async (db) => {
    const trade = await lockOpenTrade(db, tradeId);
    await sideOf(db, trade, userId);
    await db.query("UPDATE trades SET status = 'cancelled' WHERE id = $1", [tradeId]);
    return getTrade(tradeId, db);
  });
}

/**
 * Confirms one side; when both have confirmed the swap executes atomically:
 * lock both characters (id order), re-validate both offers against locked state,
 * move NX and items, then mark the trade completed. Any failure rolls everything back.
 */
export async function confirm(tradeId, userId) {
  return tx(async (db) => {
    const trade = await lockOpenTrade(db, tradeId);
    const { side } = await sideOf(db, trade, userId);
    if (isEmptyOffer(trade.offers.initiator) && isEmptyOffer(trade.offers.partner)) throw new UserError('الصفقة فارغة. أضف شيئاً أولاً');
    const col = side === 'initiator' ? 'confirmed_initiator' : 'confirmed_partner';
    await db.query(`UPDATE trades SET ${col} = TRUE WHERE id = $1`, [tradeId]);
    const other = side === 'initiator' ? trade.confirmed.partner : trade.confirmed.initiator;
    if (!other) return { trade: await getTrade(tradeId, db), executed: false };

    const [firstId, secondId] = [trade.initiatorId, trade.partnerId].sort((x, y) => x - y);
    const first = await loadCharacter(db, firstId, { lock: true });
    const second = await loadCharacter(db, secondId, { lock: true });
    const byId = { [first.id]: first, [second.id]: second };
    const A = byId[trade.initiatorId];
    const B = byId[trade.partnerId];
    for (const [ch, offer] of [
      [A, trade.offers.initiator],
      [B, trade.offers.partner],
    ]) {
      const check = validateOffer(offer, await ownerSnapshot(db, ch.id));
      if (!check.ok) throw new UserError(`لا يمكن إتمام الصفقة: ${ch.name} — ${check.problems.join('، ')}`);
    }
    const weightOf = async (offer) => {
      let w = 0;
      for (const [itemId, qty] of Object.entries(offer.items)) {
        const it = (await db.query('SELECT weight FROM items WHERE id = $1', [itemId])).rows[0];
        w += Number(it?.weight ?? 0) * qty;
      }
      return w;
    };
    for (const [receiver, incoming, outgoing] of [
      [A, trade.offers.partner, trade.offers.initiator],
      [B, trade.offers.initiator, trade.offers.partner],
    ]) {
      const after = (await carriedWeight(db, receiver.id)) - (await weightOf(outgoing)) + (await weightOf(incoming));
      if (after > capacityOf(receiver)) throw new UserError(`${receiver.name} لا يستطيع حمل هذه الأغراض (الوزن ${after.toFixed(1)}/${capacityOf(receiver)})`);
    }
    const move = async (from, to, offer) => {
      if (offer.nx > 0) {
        const res = await db.query('UPDATE characters SET nx = nx - $2 WHERE id = $1 AND nx >= $2', [from.id, offer.nx]);
        if (!res.rowCount) throw new UserError(`${from.name} لا يملك NX كافياً`);
        await db.query('UPDATE characters SET nx = nx + $2 WHERE id = $1', [to.id, offer.nx]);
        await db.query("INSERT INTO transactions (from_character_id, to_character_id, amount, kind, note) VALUES ($1,$2,$3,'trade',$4)", [
          from.id,
          to.id,
          offer.nx,
          `صفقة تداول`,
        ]);
      }
      for (const [itemId, qty] of Object.entries(offer.items)) {
        await removeItem(db, from.id, Number(itemId), qty);
        await addItem(db, to.id, Number(itemId), qty);
      }
    };
    await move(A, B, trade.offers.initiator);
    await move(B, A, trade.offers.partner);
    await db.query("UPDATE trades SET status = 'completed', confirmed_initiator = TRUE, confirmed_partner = TRUE WHERE id = $1", [tradeId]);
    await db.query('UPDATE characters SET trades_completed = trades_completed + 1 WHERE id = ANY($1::int[])', [[A.id, B.id]]);
    await checkAchievements(db, A.id);
    await checkAchievements(db, B.id);
    await track(db, A.id, 'trade');
    await track(db, B.id, 'trade');
    await audit(
      { actorId: userId, action: 'trade_completed', targetType: 'trade', targetId: tradeId, after: { a: A.code, b: B.code, offers: trade.offers } },
      db,
    );
    return { trade: await getTrade(tradeId, db), executed: true };
  });
}

export async function setTradeMessage(tradeId, channelId, messageId) {
  await getPool().query('UPDATE trades SET channel_id = $2, message_id = $3 WHERE id = $1', [tradeId, channelId, messageId]);
}

/** Builds the render model: names + resolved item rows for both sides. */
export async function tradeView(trade) {
  const db = getPool();
  const side = async (characterId, offer, confirmed) => {
    const ch = await loadCharacter(db, characterId);
    const ids = Object.keys(offer.items).map(Number);
    const items = ids.length
      ? (await db.query('SELECT id, name_ar, rarity, type FROM items WHERE id = ANY($1::int[])', [ids])).rows.map((r) => ({
          name: r.name_ar,
          rarity: r.rarity,
          type: r.type,
          quantity: offer.items[r.id],
        }))
      : [];
    return { name: ch?.name ?? '؟', userId: ch?.userId, characterId, nx: offer.nx, items, confirmed };
  };
  return {
    right: await side(trade.initiatorId, trade.offers.initiator, trade.confirmed.initiator),
    left: await side(trade.partnerId, trade.offers.partner, trade.confirmed.partner),
    status: trade.status,
  };
}

export async function expireTrades() {
  const { rows } = await getPool().query(
    "UPDATE trades SET status = 'expired' WHERE status = 'open' AND expires_at < now() RETURNING id, channel_id, message_id",
  );
  return rows;
}
