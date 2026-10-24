import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { economy } from '../config/game.js';
import { requireByUser, loadCharacter } from './characters.js';
import { checkAchievements } from './achievements.js';
import { audit } from './audit.js';
import { getSetting } from './settings.js';

/** Adds NX inside a transaction and records it. */
export async function credit(db, characterId, amount, kind, note = null, idempotencyKey = null) {
  if (!Number.isInteger(amount) || amount <= 0) return 0;
  if (idempotencyKey) {
    const ins = await db.query(
      `INSERT INTO transactions (to_character_id, amount, kind, note, idempotency_key) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [characterId, amount, kind, note, idempotencyKey],
    );
    if (!ins.rowCount) return 0;
  } else {
    await db.query('INSERT INTO transactions (to_character_id, amount, kind, note) VALUES ($1,$2,$3,$4)', [characterId, amount, kind, note]);
  }
  await db.query('UPDATE characters SET nx = nx + $2 WHERE id = $1', [characterId, amount]);
  return amount;
}

/**
 * Removes NX inside a transaction. The conditional UPDATE makes overdrafts impossible even
 * under concurrency; the CHECK (nx >= 0) constraint is the final safety net.
 */
export async function debit(db, characterId, amount, kind, note = null) {
  if (!Number.isInteger(amount) || amount <= 0) throw new UserError('مبلغ غير صالح');
  const res = await db.query('UPDATE characters SET nx = nx - $2 WHERE id = $1 AND nx >= $2 RETURNING nx', [characterId, amount]);
  if (!res.rowCount) throw new UserError('رصيدك من NX لا يكفي');
  await db.query('INSERT INTO transactions (from_character_id, amount, kind, note) VALUES ($1,$2,$3,$4)', [characterId, amount, kind, note]);
  return Number(res.rows[0].nx);
}

/**
 * Player-to-player transfer. Locks both rows in id order (no deadlocks), uses the
 * interaction id as an idempotency key (a retried interaction can't pay twice).
 */
export async function pay(fromUserId, toUserId, amount, { note = null, idempotencyKey } = {}) {
  if (fromUserId === toUserId) throw new UserError('لا يمكنك تحويل NX لنفسك');
  if (!Number.isInteger(amount) || amount <= 0) throw new UserError('مبلغ غير صالح');
  if (amount > economy.maxTransfer) throw new UserError(`الحد الأقصى للتحويل ${economy.maxTransfer.toLocaleString('en-US')} NX`);
  return tx(async (db) => {
    const ids = (await db.query('SELECT id, user_id FROM characters WHERE user_id = ANY($1::text[]) ORDER BY id FOR UPDATE', [[fromUserId, toUserId]])).rows;
    const from = ids.find((r) => r.user_id === fromUserId);
    const to = ids.find((r) => r.user_id === toUserId);
    if (!from) throw new UserError('ليس لديك شخصية بعد. ابدأ رحلتك عبر /character create');
    if (!to) throw new UserError('هذا المستخدم لا يملك شخصية في نكسس');
    const dup = idempotencyKey && (await db.query('SELECT 1 FROM transactions WHERE idempotency_key = $1', [idempotencyKey])).rowCount;
    if (dup) throw new UserError('تمت معالجة هذا التحويل بالفعل');
    const tax = Math.floor(amount * economy.payTaxRate);
    const res = await db.query('UPDATE characters SET nx = nx - $2 WHERE id = $1 AND nx >= $2 RETURNING nx', [from.id, amount]);
    if (!res.rowCount) throw new UserError('رصيدك من NX لا يكفي');
    await db.query('UPDATE characters SET nx = nx + $2 WHERE id = $1', [to.id, amount - tax]);
    await db.query(`INSERT INTO transactions (from_character_id, to_character_id, amount, kind, note, idempotency_key) VALUES ($1,$2,$3,'transfer',$4,$5)`, [
      from.id,
      to.id,
      amount,
      note,
      idempotencyKey ?? null,
    ]);
    await checkAchievements(db, to.id);
    return { balance: Number(res.rows[0].nx), received: amount - tax, toCharacterId: to.id, fromCharacterId: from.id };
  });
}

export async function daily(userId, now = new Date()) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const user = (await db.query('SELECT daily_streak, last_daily_at FROM users WHERE discord_id = $1 FOR UPDATE', [userId])).rows[0];
    const last = user.last_daily_at ? new Date(user.last_daily_at) : null;
    const hours = last ? (now - last) / 3.6e6 : Infinity;
    if (hours < 24) {
      const err = new UserError('استلمت مكافأتك اليومية بالفعل');
      err.retryAt = new Date(last.getTime() + 24 * 3.6e6);
      throw err;
    }
    const streak = hours <= economy.daily.streakWindowHours ? Math.min(user.daily_streak + 1, economy.daily.maxStreak) : 1;
    const mult = Number(await getSetting('nx_multiplier', 1)) || 1;
    const amount = Math.floor((economy.daily.base + (streak - 1) * economy.daily.streakBonus) * mult);
    await db.query('UPDATE users SET daily_streak = $2, last_daily_at = $3 WHERE discord_id = $1', [userId, streak, now]);
    await credit(db, ch.id, amount, 'daily', `المكافأة اليومية (سلسلة ${streak})`);
    const unlocked = await checkAchievements(db, ch.id);
    return { amount, streak, character: await loadCharacter(db, ch.id), unlocked };
  });
}

export async function history(characterId, limit = 6) {
  const { rows } = await getPool().query(
    `SELECT t.*, fc.name AS from_name, tc.name AS to_name FROM transactions t
     LEFT JOIN characters fc ON fc.id = t.from_character_id
     LEFT JOIN characters tc ON tc.id = t.to_character_id
     WHERE t.from_character_id = $1 OR t.to_character_id = $1
     ORDER BY t.created_at DESC, t.id DESC LIMIT $2`,
    [characterId, limit],
  );
  return rows.map((t) => {
    const inbound = t.to_character_id === characterId;
    let label = t.note;
    if (t.kind === 'transfer') label = inbound ? `تحويل من ${t.from_name ?? 'مجهول'}` : `تحويل إلى ${t.to_name ?? 'مجهول'}`;
    return { direction: inbound ? 'in' : 'out', amount: Number(t.amount), label: label ?? t.kind, createdAt: t.created_at };
  });
}

export async function wealthRank(characterId) {
  const { rows } = await getPool().query('SELECT 1 + count(*)::int AS rank FROM characters WHERE nx > (SELECT nx FROM characters WHERE id = $1)', [
    characterId,
  ]);
  return rows[0]?.rank ?? null;
}

/** Admin money adjustment with audit trail. */
export async function adminAdjust(characterId, delta, { actorId, reason }) {
  return tx(async (db) => {
    const before = (await db.query('SELECT nx FROM characters WHERE id = $1 FOR UPDATE', [characterId])).rows[0];
    if (!before) throw new UserError('الشخصية غير موجودة');
    if (delta > 0) await credit(db, characterId, delta, 'admin_grant', reason);
    else await debit(db, characterId, -delta, 'admin_remove', reason);
    const after = (await db.query('SELECT nx FROM characters WHERE id = $1', [characterId])).rows[0];
    await audit({ actorId, action: delta > 0 ? 'money_added' : 'money_removed', targetType: 'character', targetId: characterId, before, after, reason }, db);
    await checkAchievements(db, characterId);
    return Number(after.nx);
  });
}
