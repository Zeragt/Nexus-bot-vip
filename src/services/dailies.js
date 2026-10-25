import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { dailies as D } from '../config/game.js';
import { nextReset, periodKey, previousDailyKey, rollContracts } from '../engine/dailies.js';
import { requireByUser } from './characters.js';
import { debit } from './economy.js';
import { ensureContracts, chaptersDone, reachablePlaces } from './progress.js';

function mapContract(r) {
  return {
    slot: r.slot,
    template: r.template,
    event: r.event,
    target: r.target,
    targetName: r.target_name,
    title: r.title,
    tier: r.tier,
    required: r.required,
    progress: r.progress,
    done: Boolean(r.claimed_at),
    xp: r.xp_reward,
    nx: r.nx_reward,
  };
}

/** Everything the contracts board shows: today's and this week's contracts, streak and timers. */
export async function contractBoard(userId, now = new Date()) {
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const { daily, weekly } = await tx((t) => ensureContracts(t, ch.id, now));
  const rows = (
    await db.query('SELECT * FROM character_contracts WHERE character_id = $1 AND period = ANY($2::text[]) ORDER BY period, slot', [ch.id, [daily, weekly]])
  ).rows;
  const state = (await db.query('SELECT * FROM contract_state WHERE character_id = $1', [ch.id])).rows[0] ?? null;
  const streakAlive = state && (state.last_clear === daily || state.last_clear === previousDailyKey(now));
  const rerollsUsed = state?.reroll_period === daily ? state.rerolls : 0;
  return {
    character: ch,
    daily: rows.filter((r) => r.period === daily).map(mapContract),
    weekly: rows.filter((r) => r.period === weekly).map(mapContract),
    streak: streakAlive ? state.streak : 0,
    bestStreak: state?.best_streak ?? 0,
    clearedToday: state?.bonus_claimed === daily,
    dailyReset: nextReset('daily', now),
    weeklyReset: nextReset('weekly', now),
    rerollsUsed,
    nextRerollCost: rerollsUsed < D.freeRerolls ? 0 : D.rerollCost(rerollsUsed - D.freeRerolls + 1),
  };
}

/** Swaps one unfinished daily contract for a new one. The first reroll each day is free. */
export async function rerollContract(userId, slot, now = new Date()) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const { daily } = await ensureContracts(db, ch.id, now);
    const rows = (await db.query('SELECT * FROM character_contracts WHERE character_id = $1 AND period = $2 ORDER BY slot FOR UPDATE', [ch.id, daily])).rows;
    const target = rows.find((r) => r.slot === slot);
    if (!target) throw new UserError('لا يوجد عقد بهذا الرقم اليوم');
    if (target.claimed_at) throw new UserError('هذا العقد منجز بالفعل');
    if (target.progress > 0) throw new UserError('لا يمكنك تبديل عقد بدأت فيه');
    await db.query('INSERT INTO contract_state (character_id) VALUES ($1) ON CONFLICT DO NOTHING', [ch.id]);
    const state = (await db.query('SELECT * FROM contract_state WHERE character_id = $1 FOR UPDATE', [ch.id])).rows[0];
    const used = state.reroll_period === daily ? state.rerolls : 0;
    const cost = used < D.freeRerolls ? 0 : D.rerollCost(used - D.freeRerolls + 1);
    if (cost) await debit(db, ch.id, cost, 'contract_reroll', 'تبديل عقد يومي');
    const chapter = await chaptersDone(db, ch.id);
    const places = await reachablePlaces(db, { level: ch.level, chapter });
    const [fresh] = rollContracts({
      characterId: ch.id,
      period: daily,
      scope: 'daily',
      slots: 1,
      level: ch.level,
      chapter,
      places,
      salt: `reroll-${used + 1}-${slot}`,
      exclude: rows.map((r) => r.template),
    });
    if (!fresh) throw new UserError('لا توجد عقود بديلة متاحة الآن');
    await db.query(
      `UPDATE character_contracts SET template = $4, event = $5, target = $6, target_name = $7, title = $8, tier = $9, required = $10,
         xp_reward = $11, nx_reward = $12, progress = 0 WHERE character_id = $1 AND period = $2 AND slot = $3`,
      [
        ch.id,
        daily,
        slot,
        fresh.template,
        fresh.event,
        fresh.target,
        fresh.targetName,
        fresh.title,
        fresh.tier,
        fresh.required,
        fresh.rewards.xp,
        fresh.rewards.nx,
      ],
    );
    await db.query('UPDATE contract_state SET reroll_period = $2, rerolls = $3 WHERE character_id = $1', [ch.id, daily, used + 1]);
    return { old: target.title, fresh, cost };
  });
}

/** Server-wide: who cleared the most contracts. */
export async function contractLeaders(limit = 10) {
  const { rows } = await getPool().query(
    'SELECT c.name, c.contracts_completed AS n, s.best_streak FROM characters c LEFT JOIN contract_state s ON s.character_id = c.id WHERE c.contracts_completed > 0 ORDER BY c.contracts_completed DESC LIMIT $1',
    [limit],
  );
  return rows;
}

export { periodKey };
