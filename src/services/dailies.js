import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { dailies as D } from '../config/game.js';
import {
  generateBoard,
  generateQuest,
  periodKey,
  periodEndsAt,
  seedOf,
  nextStreak,
  worldGoalFor,
  DAILY_SLOTS,
  WEEKLY_SLOTS,
  dayKey,
} from '../engine/dailies.js';
import { enemiesFor } from '../engine/enemies.js';
import { ZONES, zonesOf, provinceOf, DEPTH_UNLOCK } from '../content/regions.js';
import { V3_ITEM_BY_KEY } from '../content/items.js';
import { progression } from '../config/game.js';
import { requireByUser } from './characters.js';
import { grantRewards } from './rewards.js';
import { debit } from './economy.js';
import { removeItem, ownedQuantity } from './inventory.js';
import { getSetting } from './settings.js';
import { audit } from './audit.js';

export async function offsetHours() {
  return Number(await getSetting('daily_reset_offset_hours', 3)) || 0;
}

/** Item names for gather targets (the v3 catalogue covers every zone resource; old items fall back to the DB). */
async function itemNames(db, keys) {
  const missing = keys.filter((k) => !V3_ITEM_BY_KEY[k]);
  const fromDb = missing.length ? (await db.query('SELECT key, name_ar FROM items WHERE key = ANY($1::text[])', [missing])).rows : [];
  const map = Object.fromEntries(fromDb.map((r) => [r.key, r.name_ar]));
  return keys.map((k) => ({ key: k, name: V3_ITEM_BY_KEY[k]?.nameAr ?? map[k] ?? k })).filter((x) => x.name);
}

/** What this character can reach today: the raw material a board is generated from. */
export async function boardContext(db, ch) {
  const locs = (await db.query('SELECT key, name_ar, min_level, locked, requires_permission, region FROM locations ORDER BY id')).rows;
  const points = Object.fromEntries(
    (await db.query('SELECT location_key, points FROM character_exploration WHERE character_id = $1', [ch.id])).rows.map((r) => [r.location_key, r.points]),
  );
  const open = locs.filter((l) => !l.locked && !l.requires_permission && l.min_level <= ch.level);
  const named = (l) => ({ key: l.key, name: l.name_ar });
  const hunt = open.filter((l) => enemiesFor(l.key).length).map(named);
  const explore = open.filter((l) => ZONES[l.key]).map(named);
  const resources = new Set();
  for (const l of open) {
    for (const z of zonesOf(l.key)) {
      if (z.minLevel > ch.level || (points[l.key] ?? 0) < DEPTH_UNLOCK[z.depth]) continue;
      for (const [key, w] of z.resources) {
        const rarity = V3_ITEM_BY_KEY[key]?.rarity ?? 'common';
        if (w >= 2 && ['common', 'uncommon'].includes(rarity)) resources.add(key);
      }
    }
  }
  const province = provinceOf(ch.location?.key) ?? provinceOf('nexus_city');
  const inProvince = (list) => list.filter((l) => province.locations.includes(l.key));
  return {
    hunt,
    explore,
    visit: open.filter((l) => l.key !== ch.location?.key).map(named),
    gather: await itemNames(db, [...resources]),
    province: { key: province.key, name: province.name, hunt: inProvince(hunt), explore: inProvince(explore) },
  };
}

function mapQuest(r) {
  return {
    id: Number(r.id),
    period: r.period,
    periodKey: r.period_key instanceof Date ? r.period_key.toISOString().slice(0, 10) : String(r.period_key),
    slot: r.slot,
    templateKey: r.template_key,
    tier: r.tier,
    kind: r.kind,
    target: r.target,
    required: r.required,
    progress: r.progress,
    title: r.title,
    description: r.description,
    rewards: r.rewards ?? {},
    status: r.status,
    rerolls: r.rerolls,
  };
}

async function insertQuest(db, characterId, period, key, q, rerolls = 0) {
  await db.query(
    `INSERT INTO daily_quests (character_id, period, period_key, slot, template_key, tier, kind, target, required, title, description, rewards, rerolls)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     ON CONFLICT (character_id, period, period_key, slot) WHERE status <> 'replaced' DO NOTHING`,
    [characterId, period, key, q.slot, q.templateKey, q.tier, q.kind, q.target, q.required, q.title, q.description, JSON.stringify(q.rewards), rerolls],
  );
}

/**
 * Creates the board for the current period if it doesn't exist yet. Boards are generated lazily
 * (first view or first tracked action of the day), so idle players cost nothing.
 * `ch` needs { id, level, location }.
 */
export async function ensureBoard(db, ch, period = 'daily', now = new Date()) {
  const key = periodKey(period, now, await offsetHours());
  const exists = await db.query("SELECT 1 FROM daily_quests WHERE character_id = $1 AND period = $2 AND period_key = $3 AND status <> 'replaced' LIMIT 1", [
    ch.id,
    period,
    key,
  ]);
  if (exists.rowCount) return key;
  const ctx = await boardContext(db, ch);
  for (const q of generateBoard({ period, characterId: ch.id, key, level: ch.level, ctx })) await insertQuest(db, ch.id, period, key, q);
  await db.query('INSERT INTO daily_meta (character_id, period, period_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [ch.id, period, key]);
  return key;
}

async function boardRows(db, characterId, period, key) {
  const { rows } = await db.query(
    "SELECT * FROM daily_quests WHERE character_id = $1 AND period = $2 AND period_key = $3 AND status <> 'replaced' ORDER BY slot",
    [characterId, period, key],
  );
  return rows.map(mapQuest);
}

async function metaOf(db, characterId, period, key) {
  const { rows } = await db.query('SELECT * FROM daily_meta WHERE character_id = $1 AND period = $2 AND period_key = $3', [characterId, period, key]);
  return { rerolls: rows[0]?.rerolls ?? 0, chestClaimed: rows[0]?.chest_claimed ?? false };
}

/** Deliver quests are checked against the bag (and consumed on claim). */
async function withDeliveries(db, characterId, quests) {
  for (const q of quests) {
    if (q.kind !== 'deliver' || q.status !== 'active') continue;
    const item = (await db.query('SELECT id FROM items WHERE key = $1', [q.target])).rows[0];
    q.progress = item ? Math.min(q.required, await ownedQuantity(db, characterId, item.id)) : 0;
    if (q.progress >= q.required) q.status = 'done';
  }
  return quests;
}

export async function getBoard(userId, now = new Date()) {
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const off = await offsetHours();
  const view = await tx(async (c) => {
    const dKey = await ensureBoard(c, ch, 'daily', now);
    const wKey = await ensureBoard(c, ch, 'weekly', now);
    const goal = (await getSetting('world_goal_enabled', true)) ? await ensureWorldGoal(c, dKey) : null;
    return { dKey, wKey, goal };
  });
  const daily = await withDeliveries(db, ch.id, await boardRows(db, ch.id, 'daily', view.dKey));
  const weekly = await boardRows(db, ch.id, 'weekly', view.wKey);
  const meta = await metaOf(db, ch.id, 'daily', view.dKey);
  const streakRow = (await db.query('SELECT quest_streak, quest_streak_best, quest_streak_day, dailies_completed FROM characters WHERE id = $1', [ch.id]))
    .rows[0];
  const lastDay = streakRow.quest_streak_day ? String(streakRow.quest_streak_day).slice(0, 10) : null;
  // A streak is alive while yesterday (or today) was completed.
  const alive = lastDay && (lastDay === view.dKey || nextStreak(1, lastDay, view.dKey) === 2);
  const freeRerolls = Number(await getSetting('daily_free_rerolls', 1)) || 0;
  const tokens = await ownedQuantityByKey(db, ch.id, 'reroll_token');
  return {
    character: ch,
    dayKey: view.dKey,
    weekKey: view.wKey,
    daily,
    weekly,
    chestClaimed: meta.chestClaimed,
    rerollsUsed: meta.rerolls,
    freeRerollsLeft: Math.max(0, freeRerolls - meta.rerolls),
    nextRerollCost: meta.rerolls >= freeRerolls ? D.rerollCost(meta.rerolls - freeRerolls + 1) : 0,
    rerollTokens: tokens,
    streak: alive ? streakRow.quest_streak : 0,
    bestStreak: streakRow.quest_streak_best,
    completedBoards: streakRow.dailies_completed,
    resetsAt: periodEndsAt('daily', now, off),
    weekResetsAt: periodEndsAt('weekly', now, off),
    goal: view.goal ? await goalView(db, view.goal.day, ch.id) : null,
  };
}

async function ownedQuantityByKey(db, characterId, key) {
  const it = (await db.query('SELECT id FROM items WHERE key = $1', [key])).rows[0];
  return it ? ownedQuantity(db, characterId, it.id) : 0;
}

/** XP/NX payout for one quest (weekly quests also give a chest). */
function payoutOf(q) {
  const items = [];
  if (q.period === 'weekly') items.push(['weekly_chest', 1]);
  return { xp: q.rewards.xp ?? 0, nx: q.rewards.nx ?? 0, items };
}

async function itemRefs(db, pairs) {
  const out = [];
  for (const [key, quantity] of pairs) {
    const it = (await db.query('SELECT id, name_ar, rarity FROM items WHERE key = $1', [key])).rows[0];
    if (it) out.push({ itemId: it.id, name: it.name_ar, rarity: it.rarity, quantity });
  }
  return out;
}

/**
 * Claims finished quests (one by id, or every finished one). When the whole daily board is
 * claimed, pays the daily chest and advances the streak (with milestone rewards).
 */
export async function claim(userId, questId = null, now = new Date()) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const dKey = await ensureBoard(db, ch, 'daily', now);
    const wKey = await ensureBoard(db, ch, 'weekly', now);
    const params = [ch.id, dKey, wKey];
    let filter = '';
    if (questId != null) {
      params.push(questId);
      filter = 'AND id = $4';
    }
    const rows = (
      await db.query(
        `SELECT * FROM daily_quests WHERE character_id = $1 AND status IN ('active','done')
           AND ((period = 'daily' AND period_key = $2) OR (period = 'weekly' AND period_key = $3)) ${filter}
         ORDER BY period, slot FOR UPDATE`,
        params,
      )
    ).rows.map(mapQuest);
    await withDeliveries(db, ch.id, rows);
    const ready = rows.filter((q) => q.status === 'done');
    if (!ready.length) throw new UserError(questId != null ? 'هذه المهمة لم تكتمل بعد' : 'لا توجد مهام مكتملة بانتظار الاستلام');
    let xp = 0;
    let nx = 0;
    const itemPairs = [];
    for (const q of ready) {
      if (q.kind === 'deliver') {
        const item = (await db.query('SELECT id FROM items WHERE key = $1', [q.target])).rows[0];
        if (!item) continue;
        await removeItem(db, ch.id, item.id, q.required);
      }
      await db.query("UPDATE daily_quests SET status = 'claimed', progress = required, claimed_at = now(), done_at = COALESCE(done_at, now()) WHERE id = $1", [
        q.id,
      ]);
      const p = payoutOf(q);
      xp += p.xp;
      nx += p.nx;
      itemPairs.push(...p.items);
    }
    // Whole daily board done?
    const board = await boardRows(db, ch.id, 'daily', dKey);
    const meta = await metaOf(db, ch.id, 'daily', dKey);
    let chest = null;
    if (!meta.chestClaimed && board.length >= DAILY_SLOTS.length && board.every((q) => q.status === 'claimed')) {
      const row = (await db.query('SELECT quest_streak, quest_streak_day FROM characters WHERE id = $1', [ch.id])).rows[0];
      const lastDay = row.quest_streak_day ? String(row.quest_streak_day).slice(0, 10) : null;
      const streak = nextStreak(row.quest_streak, lastDay, dKey);
      await db.query(
        `UPDATE characters SET quest_streak = $2, quest_streak_best = GREATEST(quest_streak_best, $2), quest_streak_day = $3,
           dailies_completed = dailies_completed + 1 WHERE id = $1`,
        [ch.id, streak, dKey],
      );
      await db.query("UPDATE daily_meta SET chest_claimed = TRUE WHERE character_id = $1 AND period = 'daily' AND period_key = $2", [ch.id, dKey]);
      itemPairs.push(['daily_chest', 1]);
      const milestone = D.streakRewards[streak] ?? null;
      if (milestone) {
        nx += milestone.nx ?? 0;
        itemPairs.push(...(milestone.items ?? []));
      }
      chest = { streak, milestone };
      const { track } = await import('./progress.js');
      await track(db, ch.id, 'daily_board');
    }
    const summary = await grantRewards(db, ch.id, { xp, nx, items: await itemRefs(db, itemPairs), kind: 'daily_quest', note: 'مكافآت المهام اليومية' });
    return { claimed: ready, rewards: summary, chest };
  });
}

/**
 * Swaps one unfinished daily quest for a new one. Free rerolls first, then a reroll token
 * from the bag, then NX (getting more expensive each time).
 */
export async function reroll(userId, slot, now = new Date()) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const key = await ensureBoard(db, ch, 'daily', now);
    const current = (
      await db.query(
        "SELECT * FROM daily_quests WHERE character_id = $1 AND period = 'daily' AND period_key = $2 AND slot = $3 AND status <> 'replaced' FOR UPDATE",
        [ch.id, key, slot],
      )
    ).rows.map(mapQuest)[0];
    if (!current) throw new UserError('لا توجد مهمة في هذه الخانة');
    if (current.status !== 'active') throw new UserError('لا يمكن تبديل مهمة مكتملة');
    const meta = await metaOf(db, ch.id, 'daily', key);
    if (meta.rerolls >= D.maxRerolls) throw new UserError(`وصلت إلى حد التبديل اليومي (${D.maxRerolls})`);
    const free = Number(await getSetting('daily_free_rerolls', 1)) || 0;
    let paid = { kind: 'free', cost: 0 };
    if (meta.rerolls >= free) {
      const token = (await db.query("SELECT id FROM items WHERE key = 'reroll_token'")).rows[0];
      if (token && (await ownedQuantity(db, ch.id, token.id)) > 0) {
        await removeItem(db, ch.id, token.id, 1);
        paid = { kind: 'token', cost: 1 };
      } else {
        const cost = D.rerollCost(meta.rerolls - free + 1);
        await debit(db, ch.id, cost, 'daily_reroll', 'تبديل مهمة يومية');
        paid = { kind: 'nx', cost };
      }
    }
    const board = await boardRows(db, ch.id, 'daily', key);
    const exclude = new Set(board.map((q) => `${q.kind}:${q.target}`));
    const avoid = new Set(board.map((q) => q.templateKey));
    const ctx = await boardContext(db, ch);
    const q = generateQuest({
      period: 'daily',
      slot,
      level: ch.level,
      ctx,
      seed: seedOf(ch.id, 'daily', key, slot, meta.rerolls + 1),
      exclude,
      avoidTemplates: avoid,
    });
    await db.query("UPDATE daily_quests SET status = 'replaced' WHERE id = $1", [current.id]);
    await insertQuest(db, ch.id, 'daily', key, q, current.rerolls + 1);
    await db.query("UPDATE daily_meta SET rerolls = rerolls + 1 WHERE character_id = $1 AND period = 'daily' AND period_key = $2", [ch.id, key]);
    return { old: current, quest: q, paid };
  });
}

// --- Progress ------------------------------------------------------------------------------

/** Advances matching active daily/weekly quests. Runs in the caller's transaction. */
export async function trackDaily(db, characterId, kind, target, amount, now = new Date()) {
  const off = await offsetHours();
  const dKey = periodKey('daily', now, off);
  const wKey = periodKey('weekly', now, off);
  const has = await db.query(
    `SELECT period FROM daily_quests WHERE character_id = $1 AND status <> 'replaced'
       AND ((period = 'daily' AND period_key = $2) OR (period = 'weekly' AND period_key = $3)) GROUP BY period`,
    [characterId, dKey, wKey],
  );
  if (has.rowCount < 2) {
    const ch = (
      await db.query('SELECT c.id, c.level, l.key AS loc_key FROM characters c LEFT JOIN locations l ON l.id = c.location_id WHERE c.id = $1', [characterId])
    ).rows[0];
    if (!ch) return [];
    const lite = { id: ch.id, level: ch.level, location: ch.loc_key ? { key: ch.loc_key } : null };
    await ensureBoard(db, lite, 'daily', now);
    await ensureBoard(db, lite, 'weekly', now);
  }
  const { rows } = await db.query(
    `UPDATE daily_quests SET progress = LEAST(required, progress + $5),
       status = CASE WHEN progress + $5 >= required THEN 'done' ELSE status END,
       done_at = CASE WHEN progress + $5 >= required THEN now() ELSE done_at END
     WHERE character_id = $1 AND status = 'active' AND kind = $4 AND kind <> 'deliver'
       AND (target = 'any' OR target IS NULL OR target = $6)
       AND ((period = 'daily' AND period_key = $2) OR (period = 'weekly' AND period_key = $3))
     RETURNING *`,
    [characterId, dKey, wKey, kind, amount, target ?? ''],
  );
  return rows.map(mapQuest).filter((q) => q.status === 'done');
}

// --- World goal ----------------------------------------------------------------------------

export async function ensureWorldGoal(db, day) {
  const existing = (await db.query('SELECT * FROM world_goals WHERE day = $1', [day])).rows[0];
  if (existing) return existing;
  const scale = Number(await getSetting('world_goal_scale', 1)) || 1;
  const g = worldGoalFor(day, scale);
  await db.query(
    `INSERT INTO world_goals (day, template_key, kind, target, title, description, required, rewards)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (day) DO NOTHING`,
    [day, g.templateKey, g.kind, g.target, g.title, g.description, g.required, JSON.stringify(g.rewards)],
  );
  return (await db.query('SELECT * FROM world_goals WHERE day = $1', [day])).rows[0];
}

export async function trackWorld(db, characterId, kind, amount, now = new Date()) {
  if (!(await getSetting('world_goal_enabled', true))) return null;
  const day = dayKey(now, await offsetHours());
  const goal = await ensureWorldGoal(db, day);
  if (goal.kind !== kind) return null;
  const upd = (
    await db.query(
      `UPDATE world_goals SET progress = LEAST(required, progress + $2),
         completed_at = CASE WHEN completed_at IS NULL AND progress + $2 >= required THEN now() ELSE completed_at END
       WHERE day = $1 AND progress < required RETURNING *, (completed_at IS NOT NULL AND completed_at >= now() - interval '1 second') AS just_done`,
      [day, amount],
    )
  ).rows[0];
  if (!upd) return null;
  await db.query(
    `INSERT INTO world_goal_contributions (day, character_id, amount) VALUES ($1,$2,$3)
     ON CONFLICT (day, character_id) DO UPDATE SET amount = world_goal_contributions.amount + EXCLUDED.amount`,
    [day, characterId, amount],
  );
  return upd;
}

async function goalView(db, day, characterId) {
  const g = (await db.query('SELECT * FROM world_goals WHERE day = $1', [day])).rows[0];
  if (!g) return null;
  const mine = (await db.query('SELECT amount, claimed FROM world_goal_contributions WHERE day = $1 AND character_id = $2', [day, characterId])).rows[0];
  const top = (
    await db.query(
      `SELECT c.name, w.amount FROM world_goal_contributions w JOIN characters c ON c.id = w.character_id
       WHERE w.day = $1 ORDER BY w.amount DESC LIMIT 5`,
      [day],
    )
  ).rows;
  const contributors = (await db.query('SELECT count(*)::int AS n FROM world_goal_contributions WHERE day = $1', [day])).rows[0].n;
  return {
    day,
    title: g.title,
    description: g.description,
    kind: g.kind,
    required: g.required,
    progress: g.progress,
    done: Boolean(g.completed_at),
    rewards: g.rewards,
    mine: mine?.amount ?? 0,
    claimed: mine?.claimed ?? false,
    contributors,
    top: top.map((t) => ({ name: t.name, amount: t.amount })),
  };
}

export async function worldGoal(userId, now = new Date()) {
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const day = dayKey(now, await offsetHours());
  await tx((c) => ensureWorldGoal(c, day));
  return { character: ch, goal: await goalView(db, day, ch.id) };
}

/** Contributors claim the world reward once the goal is reached (today or yesterday). */
export async function claimWorldGoal(userId, now = new Date()) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const off = await offsetHours();
    const today = dayKey(now, off);
    const yesterday = dayKey(new Date(now.getTime() - 86_400_000), off);
    const row = (
      await db.query(
        `SELECT g.*, w.amount, w.claimed FROM world_goals g JOIN world_goal_contributions w ON w.day = g.day AND w.character_id = $1
         WHERE g.day = ANY($2::date[]) AND g.completed_at IS NOT NULL AND NOT w.claimed AND w.amount > 0
         ORDER BY g.day DESC LIMIT 1 FOR UPDATE OF w`,
        [ch.id, [today, yesterday]],
      )
    ).rows[0];
    if (!row) throw new UserError('لا توجد مكافأة عالمية بانتظارك. ساهم في هدف اليوم، وحين يكتمل تستلم نصيبك');
    await db.query('UPDATE world_goal_contributions SET claimed = TRUE WHERE day = $1 AND character_id = $2', [row.day, ch.id]);
    const xp = Math.round(progression.xpToNext(ch.level) * (row.rewards.xpPct ?? 0.1));
    const summary = await grantRewards(db, ch.id, {
      xp,
      nx: row.rewards.nx ?? 0,
      items: await itemRefs(db, row.rewards.items ?? []),
      kind: 'world_goal',
      note: `هدف السيرفر: ${row.title}`,
    });
    return { goal: row, rewards: summary };
  });
}

/** Admin: wipe a character's current daily board so a fresh one is generated. */
export async function resetBoard(characterId, { actorId, now = new Date() } = {}) {
  return tx(async (db) => {
    const key = periodKey('daily', now, await offsetHours());
    await db.query("DELETE FROM daily_quests WHERE character_id = $1 AND period = 'daily' AND period_key = $2", [characterId, key]);
    await db.query("DELETE FROM daily_meta WHERE character_id = $1 AND period = 'daily' AND period_key = $2", [characterId, key]);
    await audit({ actorId, action: 'admin_action', targetType: 'character', targetId: characterId, reason: 'daily board reset' }, db);
  });
}

export async function questStats(characterId) {
  const { rows } = await getPool().query(
    `SELECT count(*) FILTER (WHERE status = 'claimed' AND period = 'daily')::int AS daily_claimed,
            count(*) FILTER (WHERE status = 'claimed' AND period = 'weekly')::int AS weekly_claimed
     FROM daily_quests WHERE character_id = $1`,
    [characterId],
  );
  return rows[0];
}

export { DAILY_SLOTS, WEEKLY_SLOTS };
