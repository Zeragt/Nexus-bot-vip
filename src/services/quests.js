import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { ui } from '../config/game.js';
import { checkQuestRequirements, evaluateObjectives, needsReview, autoObjectivesDone } from '../engine/quests.js';
import { requireByUser, visitedKeys } from './characters.js';
import { inventoryMap, removeItem } from './inventory.js';
import { grantRewards } from './rewards.js';
import { audit } from './audit.js';

export const MAX_ACTIVE_QUESTS = 5;

function mapQuest(r) {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    description: r.description,
    difficulty: r.difficulty,
    locationId: r.location_id,
    location: r.loc_name ?? null,
    giver: r.giver_name ?? null,
    minLevel: r.min_level,
    requiredQuestId: r.required_quest_id,
    requiredQuestTitle: r.req_title ?? null,
    xpReward: r.xp_reward,
    nxReward: r.nx_reward,
    reputationReward: r.reputation_reward,
    factionId: r.faction_id,
    factionRepReward: r.faction_rep_reward,
    repeatable: r.repeatable,
    requiresReview: r.requires_review,
    timeLimitMinutes: r.time_limit_minutes,
    active: r.active,
    expiresAt: r.expires_at,
  };
}

const SELECT = `SELECT q.*, l.name_ar AS loc_name, n.name AS giver_name, rq.title AS req_title
  FROM quests q LEFT JOIN locations l ON l.id = q.location_id LEFT JOIN npcs n ON n.id = q.giver_npc_id
  LEFT JOIN quests rq ON rq.id = q.required_quest_id`;

async function attachDetails(db, quests) {
  if (!quests.length) return quests;
  const ids = quests.map((q) => q.id);
  const objs = (await db.query('SELECT * FROM quest_objectives WHERE quest_id = ANY($1::int[]) ORDER BY position, id', [ids])).rows;
  const items = (
    await db.query(
      'SELECT r.quest_id, r.quantity, i.id AS item_id, i.name_ar AS name, i.rarity FROM quest_reward_items r JOIN items i ON i.id = r.item_id WHERE r.quest_id = ANY($1::int[])',
      [ids],
    )
  ).rows;
  for (const q of quests) {
    q.objectives = objs
      .filter((o) => o.quest_id === q.id)
      .map((o) => ({ id: o.id, description: o.description, kind: o.kind, targetKey: o.target_key, requiredCount: o.required_count }));
    q.items = items.filter((i) => i.quest_id === q.id).map((i) => ({ itemId: i.item_id, name: i.name, rarity: i.rarity, quantity: i.quantity }));
  }
  return quests;
}

export async function questBoard({ page = 1 } = {}) {
  const db = getPool();
  const { rows } = await db.query(`${SELECT} WHERE q.active AND (q.expires_at IS NULL OR q.expires_at > now()) ORDER BY q.min_level, q.id`);
  const size = ui.pageSize.quests;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), pages);
  const quests = await attachDetails(db, rows.slice((p - 1) * size, p * size).map(mapQuest));
  return { quests, page: p, pages, total: rows.length };
}

export async function getQuest(input, db = getPool()) {
  const q = String(input ?? '').trim();
  const { rows } = await db.query(`${SELECT} WHERE upper(q.code) = upper($1) OR q.title = $1 LIMIT 1`, [q]);
  if (!rows[0]) return null;
  return (await attachDetails(db, [mapQuest(rows[0])]))[0];
}

export async function questAutocomplete(query, { userId = null, scope = 'board' } = {}) {
  const db = getPool();
  let rows;
  if (scope === 'mine' && userId) {
    rows = (
      await db.query(
        `SELECT q.code, q.title FROM character_quests cq JOIN quests q ON q.id = cq.quest_id JOIN characters c ON c.id = cq.character_id
         WHERE c.user_id = $1 AND cq.status IN ('active','pending_review') AND (q.title ILIKE $2 OR q.code ILIKE $2) LIMIT 25`,
        [userId, `%${query ?? ''}%`],
      )
    ).rows;
  } else {
    rows = (
      await db.query(`SELECT code, title, active FROM quests WHERE ($2 OR active) AND (title ILIKE $1 OR code ILIKE $1) ORDER BY id LIMIT 25`, [
        `%${query ?? ''}%`,
        scope === 'all',
      ])
    ).rows;
  }
  return rows.map((r) => ({ name: `${r.code} — ${r.title}${r.active === false ? ' (معطّلة)' : ''}`.slice(0, 100), value: r.code }));
}

async function questContext(db, ch) {
  const rows = (await db.query('SELECT quest_id, status FROM character_quests WHERE character_id = $1', [ch.id])).rows;
  return {
    level: ch.level,
    completedQuestIds: rows.filter((r) => r.status === 'completed').map((r) => r.quest_id),
    openQuestIds: rows.filter((r) => ['active', 'pending_review'].includes(r.status)).map((r) => r.quest_id),
    activeCount: rows.filter((r) => r.status === 'active').length,
    maxActive: MAX_ACTIVE_QUESTS,
  };
}

export async function accept(userId, code) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const quest = await getQuest(code, db);
    if (!quest) throw new UserError('لم أجد هذه المهمة');
    const check = checkQuestRequirements(quest, await questContext(db, ch));
    if (!check.ok) throw new UserError(check.problems.join('\n'));
    const expires = quest.timeLimitMinutes ? new Date(Date.now() + quest.timeLimitMinutes * 60000) : null;
    await db.query('INSERT INTO character_quests (character_id, quest_id, expires_at) VALUES ($1, $2, $3)', [ch.id, quest.id, expires]);
    return { quest, expiresAt: expires };
  });
}

async function evaluateFor(db, ch, quest, progress) {
  return evaluateObjectives(quest.objectives, {
    inventory: await inventoryMap(db, ch.id),
    visited: await visitedKeys(ch.id, db),
    progress: progress ?? {},
    currentLocationKey: ch.location?.key,
  });
}

export async function activeQuests(userId) {
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const rows = (
    await db.query("SELECT * FROM character_quests WHERE character_id = $1 AND status IN ('active','pending_review') ORDER BY accepted_at", [ch.id])
  ).rows;
  const out = [];
  for (const cq of rows) {
    const quest = await getQuest(String((await db.query('SELECT code FROM quests WHERE id = $1', [cq.quest_id])).rows[0].code), db);
    out.push({ quest, status: cq.status, expiresAt: cq.expires_at, objectives: await evaluateFor(db, ch, quest, cq.progress) });
  }
  return { character: ch, quests: out };
}

export async function viewQuest(userId, code) {
  const db = getPool();
  const quest = await getQuest(code, db);
  if (!quest) throw new UserError('لم أجد هذه المهمة');
  const ch = await requireByUser(userId, db);
  const cq = (await db.query('SELECT * FROM character_quests WHERE character_id = $1 AND quest_id = $2 ORDER BY accepted_at DESC LIMIT 1', [ch.id, quest.id]))
    .rows[0];
  const status = cq && ['active', 'pending_review', 'completed'].includes(cq.status) ? cq.status : 'available';
  const objectives = await evaluateFor(db, ch, quest, cq?.progress);
  return { quest, status, objectives, expiresAt: cq?.expires_at ?? null };
}

export async function abandon(userId, code) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const quest = await getQuest(code, db);
    if (!quest) throw new UserError('لم أجد هذه المهمة');
    const res = await db.query(
      "UPDATE character_quests SET status = 'abandoned' WHERE character_id = $1 AND quest_id = $2 AND status IN ('active','pending_review') RETURNING id",
      [ch.id, quest.id],
    );
    if (!res.rowCount) throw new UserError('هذه المهمة ليست ضمن مهامك النشطة');
    return quest;
  });
}

/** Pays a quest out (shared by auto-complete and staff approval). */
async function payout(db, characterId, quest, cqId) {
  await db.query("UPDATE character_quests SET status = 'completed', completed_at = now() WHERE id = $1", [cqId]);
  await db.query('UPDATE characters SET quests_completed = quests_completed + 1 WHERE id = $1', [characterId]);
  return grantRewards(db, characterId, {
    xp: quest.xpReward,
    nx: quest.nxReward,
    reputation: quest.reputationReward,
    factionId: quest.factionId,
    factionRep: quest.factionRepReward,
    items: quest.items,
    kind: 'quest_reward',
    note: `مكافأة مهمة: ${quest.title}`,
  });
}

/**
 * Turns in a quest. Auto-verifiable objectives must be done; "collect" items are consumed.
 * Quests with manual objectives (RP scenes) go to staff review instead of paying out.
 */
export async function complete(userId, code) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const quest = await getQuest(code, db);
    if (!quest) throw new UserError('لم أجد هذه المهمة');
    const cq = (
      await db.query("SELECT * FROM character_quests WHERE character_id = $1 AND quest_id = $2 AND status IN ('active','pending_review') FOR UPDATE", [
        ch.id,
        quest.id,
      ])
    ).rows[0];
    if (!cq) throw new UserError('هذه المهمة ليست ضمن مهامك النشطة. اقبلها أولاً عبر /quest accept');
    if (cq.status === 'pending_review') throw new UserError('مهمتك بانتظار مراجعة الإدارة بالفعل');
    if (cq.expires_at && new Date(cq.expires_at) < new Date()) {
      await db.query("UPDATE character_quests SET status = 'expired' WHERE id = $1", [cq.id]);
      throw new UserError('انتهى الوقت المحدد لهذه المهمة');
    }
    const evaluated = await evaluateFor(db, ch, quest, cq.progress);
    if (!autoObjectivesDone(evaluated)) {
      const left = evaluated.filter((o) => o.kind !== 'manual' && !o.done).map((o) => `• ${o.description} (${o.current}/${o.requiredCount})`);
      throw new UserError(`لم تكتمل الأهداف بعد:\n${left.join('\n')}`);
    }
    for (const o of quest.objectives.filter((x) => x.kind === 'collect')) {
      const item = (await db.query('SELECT id FROM items WHERE key = $1', [o.targetKey])).rows[0];
      if (item) await removeItem(db, ch.id, item.id, o.requiredCount);
    }
    if (needsReview(quest, evaluated)) {
      await db.query("UPDATE character_quests SET status = 'pending_review' WHERE id = $1", [cq.id]);
      return { quest, review: true };
    }
    const rewards = await payout(db, ch.id, quest, cq.id);
    await audit({ actorId: userId, action: 'quest_completed', targetType: 'quest', targetId: quest.code, after: { character: ch.code } }, db);
    return { quest, review: false, rewards };
  });
}

/** Called by combat/jobs to advance defeat/work objectives. Runs in the caller's transaction. */
export async function recordProgress(db, characterId, kind, targetKey, amount = 1) {
  const { rows } = await db.query(
    `SELECT cq.id, cq.progress, o.id AS objective_id, o.required_count FROM character_quests cq
     JOIN quest_objectives o ON o.quest_id = cq.quest_id
     WHERE cq.character_id = $1 AND cq.status = 'active' AND o.kind = $2 AND (o.target_key = $3 OR o.target_key = 'any')`,
    [characterId, kind, targetKey],
  );
  for (const r of rows) {
    const cur = Number(r.progress?.[r.objective_id] ?? 0);
    if (cur >= r.required_count) continue;
    await db.query(`UPDATE character_quests SET progress = jsonb_set(progress, ARRAY[$2::text], to_jsonb($3::int)) WHERE id = $1`, [
      r.id,
      String(r.objective_id),
      Math.min(r.required_count, cur + amount),
    ]);
  }
  return rows.length;
}

export async function pendingReviews() {
  const { rows } = await getPool().query(
    `SELECT cq.id, q.code, q.title, c.name, c.code AS char_code, c.user_id, cq.accepted_at FROM character_quests cq
     JOIN quests q ON q.id = cq.quest_id JOIN characters c ON c.id = cq.character_id
     WHERE cq.status = 'pending_review' ORDER BY cq.accepted_at LIMIT 25`,
  );
  return rows;
}

export async function review(characterQuestId, approve, { actorId, reason }) {
  return tx(async (db) => {
    const cq = (await db.query("SELECT * FROM character_quests WHERE id = $1 AND status = 'pending_review' FOR UPDATE", [characterQuestId])).rows[0];
    if (!cq) throw new UserError('لا توجد مراجعة معلّقة بهذا الرقم');
    const quest = await getQuest((await db.query('SELECT code FROM quests WHERE id = $1', [cq.quest_id])).rows[0].code, db);
    const ch = (await db.query('SELECT user_id, code FROM characters WHERE id = $1', [cq.character_id])).rows[0];
    if (!approve) {
      await db.query("UPDATE character_quests SET status = 'active' WHERE id = $1", [cq.id]);
      await audit({ actorId, action: 'quest_reviewed', targetType: 'quest', targetId: quest.code, after: { approved: false, character: ch.code }, reason }, db);
      return { quest, approved: false, userId: ch.user_id };
    }
    const rewards = await payout(db, cq.character_id, quest, cq.id);
    await audit({ actorId, action: 'quest_reviewed', targetType: 'quest', targetId: quest.code, after: { approved: true, character: ch.code }, reason }, db);
    return { quest, approved: true, rewards, userId: ch.user_id };
  });
}

/**
 * Admin quest creation. Objectives come as lines: "kind target count | description",
 * e.g. "collect glow_herb 3 | اجمع 3 أعشاب" or "manual - 1 | اكتب مشهداً".
 */
export function parseObjectives(text) {
  const kinds = ['manual', 'collect', 'visit', 'defeat', 'work'];
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((line, i) => {
      const [spec, ...rest] = line.split('|');
      const description = rest.join('|').trim() || spec.trim();
      const [kindRaw = 'manual', target = '-', countRaw = '1'] = spec.trim().split(/\s+/);
      const kind = kinds.includes(kindRaw.toLowerCase()) ? kindRaw.toLowerCase() : 'manual';
      const count = Math.max(1, Math.min(999, parseInt(countRaw, 10) || 1));
      if (kind !== 'manual' && (!target || target === '-')) throw new UserError(`الهدف رقم ${i + 1} يحتاج إلى مفتاح (غرض/مكان/منطقة)`);
      return { position: i + 1, kind, targetKey: kind === 'manual' ? null : target, requiredCount: count, description: description.slice(0, 120) };
    });
}

export async function createQuest(data, { actorId }) {
  return tx(async (db) => {
    const next = (await db.query("SELECT COALESCE(MAX(substring(code from 3)::int), 0) + 1 AS n FROM quests WHERE code ~ '^Q-[0-9]+$'")).rows[0].n;
    const code = `Q-${String(next).padStart(4, '0')}`;
    const { rows } = await db.query(
      `INSERT INTO quests (code, title, description, difficulty, location_id, min_level, xp_reward, nx_reward, reputation_reward,
         faction_id, faction_rep_reward, repeatable, requires_review, time_limit_minutes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [
        code,
        data.title,
        data.description ?? '',
        data.difficulty ?? 'normal',
        data.locationId ?? null,
        data.minLevel ?? 1,
        data.xp ?? 0,
        data.nx ?? 0,
        data.reputation ?? 0,
        data.factionId ?? null,
        data.factionRep ?? 0,
        Boolean(data.repeatable),
        Boolean(data.requiresReview),
        data.timeLimitMinutes ?? null,
        actorId,
      ],
    );
    const id = rows[0].id;
    const objectives = data.objectives?.length
      ? data.objectives
      : [{ position: 1, kind: 'manual', targetKey: null, requiredCount: 1, description: data.title }];
    for (const o of objectives) {
      await db.query('INSERT INTO quest_objectives (quest_id, position, description, kind, target_key, required_count) VALUES ($1,$2,$3,$4,$5,$6)', [
        id,
        o.position,
        o.description,
        o.kind,
        o.targetKey,
        o.requiredCount,
      ]);
    }
    if (data.rewardItem) {
      const item = (await db.query('SELECT id FROM items WHERE key = $1', [data.rewardItem.key])).rows[0];
      if (!item) throw new UserError('غرض المكافأة غير موجود');
      await db.query('INSERT INTO quest_reward_items (quest_id, item_id, quantity) VALUES ($1,$2,$3)', [id, item.id, data.rewardItem.quantity ?? 1]);
    }
    await audit({ actorId, action: 'quest_created', targetType: 'quest', targetId: code, after: { title: data.title } }, db);
    return getQuest(code, db);
  });
}

export async function setQuestActive(code, active, { actorId }) {
  const { rowCount } = await getPool().query('UPDATE quests SET active = $2 WHERE upper(code) = upper($1)', [code, active]);
  if (!rowCount) throw new UserError('المهمة غير موجودة');
  await audit({ actorId, action: 'admin_action', targetType: 'quest', targetId: code, after: { active }, reason: 'quest toggled' });
}

export async function expireQuests() {
  const { rowCount } = await getPool().query(
    "UPDATE character_quests SET status = 'expired' WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now()",
  );
  return rowCount;
}
