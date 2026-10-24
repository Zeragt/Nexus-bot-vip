import { MAX_EQUIPPED } from './classes.js';
import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { ui } from '../config/game.js';
import { totalXpForLevel } from '../engine/progression.js';
import { requireByUser } from './characters.js';
import { cleanText } from '../utils/validation.js';

// Relationships -------------------------------------------------------------
export async function relationshipTypes() {
  return (await getPool().query('SELECT * FROM relationship_types ORDER BY key')).rows;
}

export async function setRelationship(userId, targetUserId, typeKey, note) {
  if (userId === targetUserId) throw new UserError('لا يمكنك إنشاء علاقة مع نفسك');
  const db = getPool();
  const a = await requireByUser(userId, db);
  const b = await requireByUser(targetUserId, db).catch(() => {
    throw new UserError('هذا المستخدم لا يملك شخصية');
  });
  const type = (await db.query('SELECT * FROM relationship_types WHERE key = $1', [typeKey])).rows[0];
  if (!type) throw new UserError('نوع علاقة غير معروف');
  await db.query(
    `INSERT INTO relationships (character_id, target_character_id, type_key, note) VALUES ($1,$2,$3,$4)
     ON CONFLICT (character_id, target_character_id) DO UPDATE SET type_key = EXCLUDED.type_key, note = EXCLUDED.note`,
    [a.id, b.id, type.key, cleanText(note).slice(0, 120) || null],
  );
  return { a, b, type };
}

export async function removeRelationship(userId, targetUserId) {
  const db = getPool();
  const a = await requireByUser(userId, db);
  const b = await requireByUser(targetUserId, db);
  const { rowCount } = await db.query('DELETE FROM relationships WHERE character_id = $1 AND target_character_id = $2', [a.id, b.id]);
  if (!rowCount) throw new UserError('لا توجد علاقة مسجلة مع هذه الشخصية');
  return b;
}

export async function listRelationships(characterId) {
  const { rows } = await getPool().query(
    `SELECT r.*, t.name_ar AS type_name, t.color, c.name, c.code,
       (SELECT r2.type_key FROM relationships r2 WHERE r2.character_id = r.target_character_id AND r2.target_character_id = r.character_id) AS mutual
     FROM relationships r JOIN relationship_types t ON t.key = r.type_key JOIN characters c ON c.id = r.target_character_id
     WHERE r.character_id = $1 ORDER BY r.created_at`,
    [characterId],
  );
  return rows;
}

// Leaderboards --------------------------------------------------------------
export const BOARDS = {
  level: {
    label: 'المستوى',
    order: 'c.level DESC, c.xp DESC',
    value: (r) => `LV ${r.level}`,
    sub: (r) => `${(totalXpForLevel(r.level) + Number(r.xp)).toLocaleString('en-US')} XP`,
  },
  wealth: { label: 'الثروة', order: 'c.nx DESC', value: (r) => `${Number(r.nx).toLocaleString('en-US')}`, sub: () => 'NX' },
  reputation: { label: 'السمعة', order: 'c.reputation DESC', value: (r) => `${r.reputation}`, sub: () => 'سمعة' },
  quests: { label: 'المهام', order: 'c.quests_completed DESC, c.level DESC', value: (r) => `${r.quests_completed}`, sub: () => 'مهمة' },
  combat: { label: 'القتال', order: 'c.combat_wins DESC, c.combat_losses ASC', value: (r) => `${r.combat_wins}`, sub: (r) => `${r.combat_losses} هزيمة` },
};

export async function leaderboard(metric, { page = 1, viewerCharacterId = null } = {}) {
  const board = BOARDS[metric];
  if (!board) throw new UserError('لوحة غير معروفة');
  const size = ui.pageSize.leaderboard;
  const db = getPool();
  const total = (await db.query('SELECT count(*)::int AS n FROM characters')).rows[0].n;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pages);
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.code, c.user_id, c.level, c.xp, c.nx, c.reputation, c.quests_completed, c.combat_wins, c.combat_losses
     FROM characters c ORDER BY ${board.order}, c.id LIMIT $1 OFFSET $2`,
    [size, (p - 1) * size],
  );
  return {
    board,
    page: p,
    pages,
    rows: rows.map((r, i) => ({ ...r, rank: (p - 1) * size + i + 1, isViewer: r.id === viewerCharacterId })),
  };
}

// Skills ----------------------------------------------------------------------
export async function skillCatalog(characterId) {
  const { rows } = await getPool().query(
    `SELECT s.*, cs.rank FROM skills s LEFT JOIN character_skills cs ON cs.skill_id = s.id AND cs.character_id = $1
     ORDER BY s.required_level, s.id`,
    [characterId],
  );
  return rows;
}

export async function learnSkill(userId, key) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const s = (
      await db.query(
        `SELECT * FROM skills WHERE (key = $1 OR name_ar = $1) AND (class_key IS NULL OR class_key = $2)
         ORDER BY (class_key IS NULL) LIMIT 1`,
        [key, ch.classKey],
      )
    ).rows[0];
    if (!s) throw new UserError('المهارة غير موجودة أو خاصة بكلاس آخر');
    if (s.subclass_key && s.subclass_key !== ch.subclassKey) throw new UserError('هذه المهارة خاصة بمسار آخر');
    if (ch.level < s.required_level) throw new UserError(`تحتاج إلى المستوى ${s.required_level}`);
    if (s.required_stat && (ch.base[s.required_stat] ?? 0) < s.required_value) throw new UserError('إحصائياتك لا تحقق متطلبات هذه المهارة');
    const owned = (await db.query('SELECT rank FROM character_skills WHERE character_id = $1 AND skill_id = $2', [ch.id, s.id])).rows[0];
    if (owned && owned.rank >= 5) throw new UserError('وصلت إلى أعلى رتبة في هذه المهارة');
    if (ch.skillPoints < 1) throw new UserError('لا تملك نقاط مهارة. تحصل عليها كل مستويين');
    await db.query('UPDATE characters SET skill_points = skill_points - 1 WHERE id = $1', [ch.id]);
    await db.query(
      `INSERT INTO character_skills (character_id, skill_id) VALUES ($1, $2)
       ON CONFLICT (character_id, skill_id) DO UPDATE SET rank = character_skills.rank + 1`,
      [ch.id, s.id],
    );
    if (!owned && ch.classKey) {
      const used = (
        await db.query(
          "SELECT count(*)::int AS n FROM character_skills cs JOIN skills s ON s.id = cs.skill_id WHERE cs.character_id = $1 AND cs.equipped AND s.type <> 'passive'",
          [ch.id],
        )
      ).rows[0].n;
      if (used < MAX_EQUIPPED) await db.query('UPDATE character_skills SET equipped = TRUE WHERE character_id = $1 AND skill_id = $2', [ch.id, s.id]);
    } else if (!owned) {
      await db.query('UPDATE character_skills SET equipped = TRUE WHERE character_id = $1 AND skill_id = $2', [ch.id, s.id]);
    }
    return { skill: s, rank: (owned?.rank ?? 0) + 1 };
  });
}

/** Skills this player may learn or rank up: generic skills plus their own class and path. */
export async function skillAutocomplete(query, userId = null) {
  const { rows } = await getPool().query(
    `SELECT s.key, s.name_ar, s.name, s.required_level, s.class_key, cs.rank
     FROM skills s
     LEFT JOIN characters c ON c.user_id = $2
     LEFT JOIN character_skills cs ON cs.skill_id = s.id AND cs.character_id = c.id
     WHERE (s.name_ar ILIKE $1 OR s.name ILIKE $1)
       AND (s.class_key IS NULL OR (s.class_key = c.class_key AND cs.rank IS NOT NULL))
     ORDER BY (cs.rank IS NOT NULL) DESC, s.required_level LIMIT 25`,
    [`%${query ?? ''}%`, userId],
  );
  return rows.map((r) => ({
    name: `${r.name_ar} — مستوى ${r.required_level}${r.rank ? ` • رتبة ${r.rank}` : ''}${r.class_key ? '' : ` (${r.name})`}`.slice(0, 100),
    value: r.key,
  }));
}
