import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { CLASS_BY_KEY } from '../content/classes.js';
import { subclassByKey, subclassesOf, PATH_BY_KEY } from '../content/classGen.js';
import { requireByUser, loadCharacter } from './characters.js';
import { getSetting } from './settings.js';
import { audit } from './audit.js';

export const MAX_EQUIPPED = 6;

/**
 * Makes sure a character owns every class/path skill their level allows, and fills empty
 * loadout slots with the newest actives. Called after choosing a class or path and after
 * every level up. Returns the skills unlocked by this call.
 */
export async function syncClassSkills(db, characterId) {
  const ch = (await db.query('SELECT level, class_key, subclass_key FROM characters WHERE id = $1', [characterId])).rows[0];
  if (!ch?.class_key) return [];
  const { rows: added } = await db.query(
    `INSERT INTO character_skills (character_id, skill_id, equipped)
     SELECT $1, s.id, FALSE FROM skills s
     WHERE s.class_key = $2 AND (s.subclass_key IS NULL OR s.subclass_key = $3) AND s.required_level <= $4
     ON CONFLICT (character_id, skill_id) DO NOTHING
     RETURNING skill_id`,
    [characterId, ch.class_key, ch.subclass_key, ch.level],
  );
  if (!added.length) return [];
  await fillLoadout(db, characterId);
  const { rows } = await db.query('SELECT key, name_ar, type, required_level, subclass_key FROM skills WHERE id = ANY($1::int[]) ORDER BY required_level', [
    added.map((r) => r.skill_id),
  ]);
  return rows;
}

/** Equips the strongest unequipped actives until the loadout is full. */
async function fillLoadout(db, characterId) {
  const used = (
    await db.query(
      "SELECT count(*)::int AS n FROM character_skills cs JOIN skills s ON s.id = cs.skill_id WHERE cs.character_id = $1 AND cs.equipped AND s.type <> 'passive'",
      [characterId],
    )
  ).rows[0].n;
  const free = MAX_EQUIPPED - used;
  if (free <= 0) return;
  await db.query(
    `UPDATE character_skills SET equipped = TRUE WHERE character_id = $1 AND skill_id IN (
       SELECT s.id FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
       WHERE cs.character_id = $1 AND NOT cs.equipped AND s.type <> 'passive'
       ORDER BY (s.subclass_key IS NOT NULL) DESC, s.required_level DESC LIMIT $2)`,
    [characterId, free],
  );
}

/** Removes class or path skills and refunds the skill points spent ranking them up. */
async function dropSkills(db, characterId, where, params) {
  const { rows } = await db.query(
    `DELETE FROM character_skills cs USING skills s WHERE cs.skill_id = s.id AND cs.character_id = $1 AND ${where} RETURNING cs.rank`,
    [characterId, ...params],
  );
  const refund = rows.reduce((n, r) => n + (r.rank - 1), 0);
  if (refund > 0) await db.query('UPDATE characters SET skill_points = skill_points + $2 WHERE id = $1', [characterId, refund]);
  return refund;
}

export async function classChangeCost(ch) {
  if (!ch.classKey) return 0;
  const freeBelow = Number(await getSetting('class_change_free_below', 10)) || 0;
  if (ch.level < freeBelow && ch.classChanges === 0) return 0;
  return ch.level * (Number(await getSetting('class_change_cost_per_level', 150)) || 0);
}

/** Picks (or changes) the character's class. Changing later costs NX and resets the path. */
export async function chooseClass(userId, classKey, { actorId = userId, free = false } = {}) {
  const cls = CLASS_BY_KEY[classKey];
  if (!cls) throw new UserError('كلاس غير معروف');
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    if (ch.classKey === classKey) throw new UserError(`أنت بالفعل ${cls.nameAr}`);
    const cost = free ? 0 : await classChangeCost(ch);
    if (cost > ch.nx) throw new UserError(`تغيير الكلاس يكلف ${cost} NX في مستواك، ورصيدك ${ch.nx} NX`);
    let refund = 0;
    if (ch.classKey) refund = await dropSkills(db, ch.id, 's.class_key IS NOT NULL', []);
    if (cost > 0) {
      await db.query('UPDATE characters SET nx = nx - $2 WHERE id = $1', [ch.id, cost]);
      await db.query(`INSERT INTO transactions (from_character_id, amount, kind, note) VALUES ($1, $2, 'class_change', $3)`, [
        ch.id,
        cost,
        `تغيير الكلاس إلى ${cls.nameAr}`,
      ]);
    }
    await db.query(
      `UPDATE characters SET class_key = $2, subclass_key = NULL, class_chosen_at = now(),
         class_changes = class_changes + CASE WHEN class_key IS NULL THEN 0 ELSE 1 END, updated_at = now() WHERE id = $1`,
      [ch.id, classKey],
    );
    const unlocked = await syncClassSkills(db, ch.id);
    await audit(
      { actorId, action: 'class_chosen', targetType: 'character', targetId: ch.code, before: { class: ch.classKey }, after: { class: classKey, cost } },
      db,
    );
    return { character: await loadCharacter(db, ch.id), cls, cost, refund, unlocked, changed: Boolean(ch.classKey) };
  });
}

/** Picks the path (subclass). The first pick is free; switching costs NX. */
export async function chooseSubclass(userId, pathKey, { actorId = userId } = {}) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    if (!ch.classKey) throw new UserError('اختر كلاسك أولاً عبر /class choose');
    const cls = CLASS_BY_KEY[ch.classKey];
    const sub = subclassByKey(`${ch.classKey}.${pathKey}`);
    if (!sub) throw new UserError('مسار غير معروف');
    if (ch.subclassKey === sub.key) throw new UserError(`أنت تسلك مسار ${sub.name} بالفعل`);
    if (ch.level < sub.minLevel) throw new UserError(`مسار ${sub.name} يتطلب المستوى ${sub.minLevel}`);
    const cost = ch.subclassKey ? ch.level * 100 : 0;
    if (cost > ch.nx) throw new UserError(`تغيير المسار يكلف ${cost} NX، ورصيدك ${ch.nx} NX`);
    let refund = 0;
    if (ch.subclassKey) refund = await dropSkills(db, ch.id, 's.subclass_key IS NOT NULL', []);
    if (cost > 0) {
      await db.query('UPDATE characters SET nx = nx - $2 WHERE id = $1', [ch.id, cost]);
      await db.query(`INSERT INTO transactions (from_character_id, amount, kind, note) VALUES ($1, $2, 'class_change', $3)`, [
        ch.id,
        cost,
        `تغيير المسار إلى ${sub.name}`,
      ]);
    }
    await db.query('UPDATE characters SET subclass_key = $2, updated_at = now() WHERE id = $1', [ch.id, sub.key]);
    const unlocked = await syncClassSkills(db, ch.id);
    await audit(
      { actorId, action: 'class_chosen', targetType: 'character', targetId: ch.code, before: { path: ch.subclassKey }, after: { path: sub.key, cost } },
      db,
    );
    return { character: await loadCharacter(db, ch.id), cls, sub, cost, refund, unlocked };
  });
}

/** Admin reset: removes class, path and their skills (ranks refunded). */
export async function resetClass(characterId, { actorId, reason } = {}) {
  return tx(async (db) => {
    const ch = await loadCharacter(db, characterId, { lock: true });
    if (!ch) throw new UserError('الشخصية غير موجودة');
    const refund = await dropSkills(db, ch.id, 's.class_key IS NOT NULL', []);
    await db.query('UPDATE characters SET class_key = NULL, subclass_key = NULL, class_chosen_at = NULL WHERE id = $1', [ch.id]);
    await audit(
      {
        actorId,
        action: 'admin_action',
        targetType: 'character',
        targetId: ch.code,
        before: { class: ch.classKey, path: ch.subclassKey },
        reason: reason ?? 'class reset',
      },
      db,
    );
    return { character: await loadCharacter(db, ch.id), refund };
  });
}

// Loadout ------------------------------------------------------------------
async function ownedSkill(db, characterId, key) {
  return (
    await db.query(
      `SELECT s.*, cs.rank, cs.equipped FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
       WHERE cs.character_id = $1 AND (s.key = $2 OR s.name_ar = $2) LIMIT 1`,
      [characterId, key],
    )
  ).rows[0];
}

export async function equipSkill(userId, key) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const s = await ownedSkill(db, ch.id, key);
    if (!s) throw new UserError('لا تملك هذه المهارة');
    if (s.type === 'passive') throw new UserError('المهارات السلبية تعمل دائماً ولا تحتاج تجهيزاً');
    if (s.equipped) throw new UserError(`${s.name_ar} مجهّزة بالفعل`);
    const used = (
      await db.query(
        "SELECT count(*)::int AS n FROM character_skills cs JOIN skills s ON s.id = cs.skill_id WHERE cs.character_id = $1 AND cs.equipped AND s.type <> 'passive'",
        [ch.id],
      )
    ).rows[0].n;
    if (used >= MAX_EQUIPPED) throw new UserError(`لديك ${MAX_EQUIPPED} مهارات مجهّزة. أزل واحدة أولاً عبر /class unequip`);
    await db.query('UPDATE character_skills SET equipped = TRUE WHERE character_id = $1 AND skill_id = $2', [ch.id, s.id]);
    return { skill: s, equipped: used + 1 };
  });
}

export async function unequipSkill(userId, key) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const s = await ownedSkill(db, ch.id, key);
    if (!s) throw new UserError('لا تملك هذه المهارة');
    if (!s.equipped) throw new UserError(`${s.name_ar} غير مجهّزة`);
    await db.query('UPDATE character_skills SET equipped = FALSE WHERE character_id = $1 AND skill_id = $2', [ch.id, s.id]);
    return { skill: s };
  });
}

/** Skills the player owns, for autocomplete (filtered by equipped state). */
export async function ownedSkillAutocomplete(userId, query, { equipped = null } = {}) {
  const { rows } = await getPool().query(
    `SELECT s.key, s.name_ar, s.type, s.required_level, cs.rank, cs.equipped FROM characters c
     JOIN character_skills cs ON cs.character_id = c.id JOIN skills s ON s.id = cs.skill_id
     WHERE c.user_id = $1 AND s.type <> 'passive' AND s.name_ar ILIKE $2 AND ($3::boolean IS NULL OR cs.equipped = $3)
     ORDER BY cs.equipped DESC, s.required_level DESC LIMIT 25`,
    [userId, `%${query ?? ''}%`, equipped],
  );
  return rows.map((r) => ({ name: `${r.name_ar} • مستوى ${r.required_level} • رتبة ${r.rank}${r.equipped ? ' • مجهّزة' : ''}`.slice(0, 100), value: r.key }));
}

/**
 * Full class tree for the UI: every class skill with its unlock state and the player's rank.
 * Works without a character too (browsing classes before choosing).
 */
export async function classSkillTree(classKey, characterId = null, { subclassKey = null } = {}) {
  const { rows } = await getPool().query(
    `SELECT s.key, s.name_ar, s.description, s.type, s.power, s.energy_cost, s.cooldown_turns, s.required_level, s.tier, s.element,
            s.effect_key, s.extra, s.subclass_key, cs.rank, cs.equipped
     FROM skills s LEFT JOIN character_skills cs ON cs.skill_id = s.id AND cs.character_id = $2
     WHERE s.class_key = $1 AND (s.subclass_key IS NULL OR s.subclass_key = $3)
     ORDER BY s.required_level, s.subclass_key NULLS FIRST, s.key`,
    [classKey, characterId, subclassKey],
  );
  return rows;
}

export async function loadoutOf(characterId, db = getPool()) {
  const { rows } = await db.query(
    `SELECT s.key, s.name_ar, s.type, s.power, s.energy_cost, s.cooldown_turns, s.required_level, s.element, s.effect_key, s.extra, cs.rank, cs.equipped
     FROM character_skills cs JOIN skills s ON s.id = cs.skill_id WHERE cs.character_id = $1
     ORDER BY cs.equipped DESC, (s.type = 'passive'), s.required_level DESC`,
    [characterId],
  );
  return rows;
}

/** How many players picked each class (for the class browser). */
export async function classPopularity() {
  const { rows } = await getPool().query('SELECT class_key, count(*)::int AS n FROM characters WHERE class_key IS NOT NULL GROUP BY class_key');
  return Object.fromEntries(rows.map((r) => [r.class_key, r.n]));
}

export function pathsFor(classKey, level = 1) {
  const cls = CLASS_BY_KEY[classKey];
  if (!cls) return [];
  return subclassesOf(cls).map((s) => ({ ...s, locked: level < s.minLevel, archetype: PATH_BY_KEY[s.path] }));
}
