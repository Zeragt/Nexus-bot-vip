import { tx } from '../db/pool.js';
import { dailies as D } from '../config/game.js';
import { periodKey, previousDailyKey, rollContracts, progressFor } from '../engine/dailies.js';
import { ENEMIES } from '../engine/enemies.js';
import { REGIONS } from '../content/regions.js';
import { grantRewards } from './rewards.js';
import { getSetting } from './settings.js';

/**
 * Every game event that contracts can count goes through `track()` here: hunts, bosses,
 * duels, gathering, exploring, work, travel, crafting, RP, trades, shopping and reading.
 * It runs inside the caller's transaction, creates today's contracts on first use,
 * pays contracts the moment they are done, and pays the all-clear bonuses and streaks.
 */

/** Story chapters a character has completed (0 when the story was never opened). */
export async function chaptersDone(db, characterId) {
  const { rows } = await db.query('SELECT chapter FROM character_story WHERE character_id = $1', [characterId]);
  return rows[0]?.chapter ?? 0;
}

/** Places a character may go to right now (level, story and admin locks), with what each offers. */
export async function reachablePlaces(db, { level, chapter }) {
  const { rows } = await db.query(
    `SELECT key, name_ar FROM locations
     WHERE NOT locked AND NOT requires_permission AND min_level <= $1 AND required_chapter <= $2 ORDER BY id`,
    [level, chapter],
  );
  const places = rows.map((r) => ({ key: r.key, nameAr: r.name_ar }));
  const unlocked = (list) => list?.some((x) => (x[2] ?? x.chapter ?? 0) <= chapter);
  return {
    all: places,
    hunt: places.filter((p) => (ENEMIES[p.key] ?? []).length),
    gather: places.filter((p) => unlocked(REGIONS[p.key]?.gather)),
    explore: places.filter((p) => REGIONS[p.key]?.events?.length),
  };
}

const ensured = new Map();

/** Creates the contracts of the current day and week for a character, once. */
export async function ensureContracts(db, characterId, now = new Date()) {
  const daily = periodKey('daily', now);
  const weekly = periodKey('weekly', now);
  const memo = `${daily}|${weekly}`;
  if (ensured.get(characterId) === memo) return { daily, weekly };
  const have = (
    await db.query('SELECT DISTINCT period FROM character_contracts WHERE character_id = $1 AND period = ANY($2::text[])', [characterId, [daily, weekly]])
  ).rows.map((r) => r.period);
  if (have.length < 2) {
    const ch = (await db.query('SELECT level FROM characters WHERE id = $1', [characterId])).rows[0];
    if (!ch) return { daily, weekly };
    const chapter = await chaptersDone(db, characterId);
    const places = await reachablePlaces(db, { level: ch.level, chapter });
    for (const [scope, period, slots] of [
      ['daily', daily, D.dailySlots],
      ['weekly', weekly, D.weeklySlots],
    ]) {
      if (have.includes(period)) continue;
      const contracts = rollContracts({ characterId, period, scope, slots, level: ch.level, chapter, places });
      await insertContracts(db, characterId, period, contracts);
    }
  }
  if (ensured.size > 5000) ensured.clear();
  ensured.set(characterId, memo);
  return { daily, weekly };
}

export async function insertContracts(db, characterId, period, contracts) {
  for (const c of contracts) {
    await db.query(
      `INSERT INTO character_contracts (character_id, period, slot, template, event, target, target_name, title, tier, required, xp_reward, nx_reward)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
      [characterId, period, c.slot, c.template, c.event, c.target, c.targetName, c.title, c.tier, c.required, c.rewards.xp, c.rewards.nx],
    );
  }
}

/** Forget the "already created" memo (tests, rerolls). */
export function resetContractMemo(characterId = null) {
  if (characterId == null) ensured.clear();
  else ensured.delete(characterId);
}

async function itemRef(db, key, quantity = 1) {
  const it = (await db.query('SELECT id, name_ar, rarity FROM items WHERE key = $1', [key])).rows[0];
  return it ? { itemId: it.id, name: it.name_ar, rarity: it.rarity, quantity } : null;
}

/**
 * Records a game event for a character. Returns { completed: [...contracts], bonuses: [...] }
 * so the caller can announce finished contracts.
 * opts: { key, location, amount }
 */
export async function track(db, characterId, event, opts = {}, now = new Date()) {
  const out = { completed: [], bonuses: [] };
  if (typeof characterId !== 'number') return out;
  if (!(await getSetting('contracts_enabled', true))) return out;
  const { daily, weekly } = await ensureContracts(db, characterId, now);
  const { rows } = await db.query(
    `SELECT * FROM character_contracts WHERE character_id = $1 AND period = ANY($2::text[]) AND event = $3 AND claimed_at IS NULL FOR UPDATE`,
    [characterId, [daily, weekly], event],
  );
  for (const c of rows) {
    const add = progressFor(c, event, opts);
    if (!add) continue;
    const progress = Math.min(c.required, c.progress + add);
    const done = progress >= c.required;
    await db.query(
      `UPDATE character_contracts SET progress = $4, claimed_at = CASE WHEN $5 THEN now() ELSE claimed_at END
       WHERE character_id = $1 AND period = $2 AND slot = $3`,
      [characterId, c.period, c.slot, progress, done],
    );
    if (!done) continue;
    const rewards = await grantRewards(db, characterId, { xp: c.xp_reward, nx: c.nx_reward, kind: 'contract', note: `عقد: ${c.title}` });
    await db.query('UPDATE characters SET contracts_completed = contracts_completed + 1 WHERE id = $1', [characterId]);
    out.completed.push({ title: c.title, tier: c.tier, weekly: c.period.startsWith('w:'), rewards });
  }
  if (out.completed.length) out.bonuses = await payClearBonuses(db, characterId, { daily, weekly }, now);
  return out;
}

/** All-clear bonus for the day (with streak and the 7-day chest) and for the week. */
export async function payClearBonuses(db, characterId, { daily, weekly }, now = new Date()) {
  const bonuses = [];
  await db.query('INSERT INTO contract_state (character_id) VALUES ($1) ON CONFLICT DO NOTHING', [characterId]);
  const state = (await db.query('SELECT * FROM contract_state WHERE character_id = $1 FOR UPDATE', [characterId])).rows[0];
  const open = async (period) =>
    (
      await db.query(
        'SELECT count(*) FILTER (WHERE claimed_at IS NULL)::int AS open, count(*)::int AS total FROM character_contracts WHERE character_id = $1 AND period = $2',
        [characterId, period],
      )
    ).rows[0];

  const d = await open(daily);
  if (d.total > 0 && d.open === 0 && state.bonus_claimed !== daily) {
    const streak = state.last_clear === previousDailyKey(now) ? state.streak + 1 : 1;
    const bonus = D.allClearBonus(streak);
    const items = [await itemRef(db, 'contract_chest')];
    if (streak % D.streakChestEvery === 0) items.push(await itemRef(db, 'streak_chest'));
    const rewards = await grantRewards(db, characterId, { ...bonus, items: items.filter(Boolean), kind: 'contract', note: 'إنهاء كل عقود اليوم' });
    await db.query(
      `UPDATE contract_state SET streak = $2, best_streak = GREATEST(best_streak, $2), last_clear = $3, bonus_claimed = $3 WHERE character_id = $1`,
      [characterId, streak, daily],
    );
    bonuses.push({ kind: 'daily', streak, rewards });
  }
  const w = await open(weekly);
  if (w.total > 0 && w.open === 0 && state.weekly_bonus !== weekly) {
    const level = (await db.query('SELECT level FROM characters WHERE id = $1', [characterId])).rows[0].level;
    const rewards = await grantRewards(db, characterId, {
      xp: 800 + level * 60,
      nx: 1000 + level * 40,
      items: [await itemRef(db, 'weekly_chest')].filter(Boolean),
      kind: 'contract',
      note: 'إنهاء عقود الأسبوع',
    });
    await db.query('UPDATE contract_state SET weekly_bonus = $2 WHERE character_id = $1', [characterId, weekly]);
    bonuses.push({ kind: 'weekly', rewards });
  }
  return bonuses;
}

/** Same as track(), but opens its own connection: for events that happen outside a transaction. */
export async function trackNow(characterId, event, opts = {}) {
  return tx((db) => track(db, characterId, event, opts));
}

/** One line per finished contract, for follow-up messages. */
export function describeContracts(result) {
  if (!result) return null;
  const lines = result.completed.map((c) => `📜 أنجزت ${c.weekly ? 'عقداً أسبوعياً' : 'عقداً'}: **${c.title}** (+${c.rewards.xp} XP، +${c.rewards.nx} NX)`);
  for (const b of result.bonuses) {
    if (b.kind === 'daily')
      lines.push(`🏆 أنهيت كل عقود اليوم! سلسلتك: **${b.streak}** يوم. حصلت على صندوق العقود${b.streak % D.streakChestEvery === 0 ? ' وصندوق المواظبة' : ''}.`);
    else lines.push('🏆 أنهيت كل عقود الأسبوع! حصلت على صندوق الأسبوع.');
  }
  return lines.length ? lines.join('\n') : null;
}

export function mergeTracks(...results) {
  return results
    .filter(Boolean)
    .reduce((a, r) => ({ completed: [...a.completed, ...r.completed], bonuses: [...a.bonuses, ...r.bonuses] }), { completed: [], bonuses: [] });
}
