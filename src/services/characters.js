import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { STATS, progression } from '../config/game.js';
import { applyXp, effectiveStats, maxVitals, regenerate, levelProgress } from '../engine/progression.js';
import { characterSchema, characterPatchSchema, parseOrThrow } from '../utils/validation.js';
import { getSetting } from './settings.js';
import { audit } from './audit.js';
import { classStatBonus } from '../content/classGen.js';
import { syncClassSkills } from './classes.js';

const STARTER_ITEMS = [
  ['rusty_sword', 1, true],
  ['leather_armor', 1, true],
  ['health_potion', 3, false],
  ['nexus_coffee', 2, false],
];

export const NO_CHARACTER = 'ليس لديك شخصية بعد. ابدأ رحلتك عبر /character create';

const BASE_SELECT = `
  SELECT c.*, s.strength, s.defense, s.agility, s.intelligence, s.endurance, s.luck,
         l.key AS loc_key, l.name_ar AS loc_name, l.region AS loc_region, l.danger_level AS loc_danger,
         j.key AS job_key, j.name_ar AS job_name,
         g.id AS guild_id, g.name AS guild_name, g.tag AS guild_tag, gm.role AS guild_role
  FROM characters c
  JOIN character_stats s ON s.character_id = c.id
  LEFT JOIN locations l ON l.id = c.location_id
  LEFT JOIN jobs j ON j.id = c.job_id
  LEFT JOIN guild_members gm ON gm.character_id = c.id
  LEFT JOIN guilds g ON g.id = gm.guild_id`;

/** Turns a DB row plus its equipment into the game's character model (with regenerated vitals). */
export function hydrate(row, equipment = [], now = new Date()) {
  const base = {};
  for (const s of STATS) base[s] = row[s];
  // Class and path growth is automatic and sits on top of the points the player allocated.
  const classBonus = classStatBonus(row.class_key, row.subclass_key, row.level);
  const grown = {};
  for (const s of STATS) grown[s] = base[s] + (classBonus[s] ?? 0);
  const eff = effectiveStats(grown, equipment);
  const { maxHp, maxEnergy } = maxVitals(row.level, eff);
  const vit = regenerate({ hp: row.hp, energy: row.energy, vitalsAt: row.vitals_at }, { maxHp, maxEnergy }, now);
  const { need } = levelProgress(row.level, row.xp);
  const equip = {};
  for (const it of equipment) equip[it.slot] = it;
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id,
    name: row.name,
    profile: {
      age: row.age,
      gender: row.gender,
      race: row.race,
      origin: row.origin,
      occupation: row.occupation,
      personality: row.personality,
      appearance: row.appearance,
      backstory: row.backstory,
      alignment: row.alignment,
      abilities: row.abilities,
      weaknesses: row.weaknesses,
    },
    hasAvatar: Boolean(row.avatar),
    classKey: row.class_key ?? null,
    subclassKey: row.subclass_key ?? null,
    zoneKey: row.zone_key ?? null,
    classChanges: row.class_changes ?? 0,
    classBonus,
    level: row.level,
    xp: Number(row.xp),
    xpNeed: need,
    statPoints: row.stat_points,
    skillPoints: row.skill_points,
    nx: Number(row.nx),
    reputation: row.reputation,
    base,
    stats: eff,
    maxHp,
    maxEnergy,
    hp: vit.hp,
    energy: vit.energy,
    location: row.location_id ? { id: row.location_id, key: row.loc_key, nameAr: row.loc_name, region: row.loc_region, danger: row.loc_danger } : null,
    job: row.job_id ? { id: row.job_id, key: row.job_key, nameAr: row.job_name } : null,
    jobChangedAt: row.job_changed_at,
    guild: row.guild_id ? { id: row.guild_id, name: row.guild_name, tag: row.guild_tag, role: row.guild_role } : null,
    equipment: equip,
    counters: {
      combatWins: row.combat_wins,
      combatLosses: row.combat_losses,
      questsCompleted: row.quests_completed,
      tradesCompleted: row.trades_completed,
      shiftsWorked: row.shifts_worked,
      pvpWins: row.pvp_wins ?? 0,
      pvpLosses: row.pvp_losses ?? 0,
      dailiesCompleted: row.dailies_completed ?? 0,
      questStreak: row.quest_streak ?? 0,
      explorations: row.explorations ?? 0,
      itemsCrafted: row.items_crafted ?? 0,
      elitesSlain: row.elites_slain ?? 0,
      xpLost: Number(row.xp_lost ?? 0),
    },
    createdAt: row.created_at,
  };
}

async function loadEquipment(db, characterId) {
  const { rows } = await db.query(
    `SELECT e.slot, i.id, i.key, i.name_ar AS name, i.rarity, i.type, i.stats
     FROM equipment e JOIN items i ON i.id = e.item_id WHERE e.character_id = $1`,
    [characterId],
  );
  return rows;
}

/** Loads a character by id. Pass `lock` inside a transaction to SELECT ... FOR UPDATE. */
export async function loadCharacter(db, id, { lock = false } = {}) {
  const { rows } = await db.query(`${BASE_SELECT} WHERE c.id = $1 ${lock ? 'FOR UPDATE OF c' : ''}`, [id]);
  if (!rows[0]) return null;
  return hydrate(rows[0], await loadEquipment(db, id));
}

export async function findByUser(userId, db = getPool(), opts = {}) {
  const { rows } = await db.query('SELECT id FROM characters WHERE user_id = $1 ORDER BY slot LIMIT 1', [userId]);
  return rows[0] ? loadCharacter(db, rows[0].id, opts) : null;
}

export async function requireByUser(userId, db = getPool(), opts = {}) {
  const ch = await findByUser(userId, db, opts);
  if (!ch) throw new UserError(NO_CHARACTER);
  return ch;
}

export async function findByCode(code, db = getPool()) {
  const { rows } = await db.query('SELECT id FROM characters WHERE upper(code) = upper($1)', [code]);
  return rows[0] ? loadCharacter(db, rows[0].id) : null;
}

/** Writes regenerated (or changed) vitals and resets the regen clock. */
export async function saveVitals(db, ch, { hp = ch.hp, energy = ch.energy } = {}) {
  const h = Math.max(0, Math.min(ch.maxHp, Math.round(hp)));
  const e = Math.max(0, Math.min(ch.maxEnergy, Math.round(energy)));
  await db.query('UPDATE characters SET hp = $2, energy = $3, vitals_at = now() WHERE id = $1', [ch.id, h, e]);
  ch.hp = h;
  ch.energy = e;
}

/** Spends energy inside a transaction (character must be loaded with lock). */
export async function spendEnergy(db, ch, amount) {
  if (ch.energy < amount) throw new UserError(`طاقتك لا تكفي (${ch.energy}/${amount}). استرح قليلاً أو تناول منشطاً.`);
  await saveVitals(db, ch, { energy: ch.energy - amount });
}

export async function createCharacter(userId, input) {
  const data = parseOrThrow(characterSchema, input);
  return tx(async (db) => {
    await db.query('INSERT INTO users (discord_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    const exists = await db.query('SELECT 1 FROM characters WHERE user_id = $1', [userId]);
    if (exists.rowCount) throw new UserError('لديك شخصية بالفعل. يمكنك تعديلها عبر /character edit');
    const start = (await db.query('SELECT id FROM locations WHERE is_start ORDER BY id LIMIT 1')).rows[0];
    const b = progression.baseStats;
    const { maxHp, maxEnergy } = maxVitals(1, b);
    const { rows } = await db.query(
      `INSERT INTO characters (user_id, name, age, gender, race, origin, occupation, personality, appearance, backstory,
         alignment, abilities, weaknesses, hp, energy, nx, location_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id, code`,
      [
        userId,
        data.name,
        data.age,
        data.gender,
        data.race,
        data.origin,
        data.occupation,
        data.personality,
        data.appearance,
        data.backstory,
        data.alignment,
        data.abilities,
        data.weaknesses,
        maxHp,
        maxEnergy,
        progression.startingNx,
        start?.id ?? null,
      ],
    );
    const { id, code } = rows[0];
    await db.query('INSERT INTO character_stats (character_id, strength, defense, agility, intelligence, endurance, luck) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
      id,
      b.strength,
      b.defense,
      b.agility,
      b.intelligence,
      b.endurance,
      b.luck,
    ]);
    await db.query('INSERT INTO character_skills (character_id, skill_id) SELECT $1, id FROM skills WHERE starter', [id]);
    for (const [key, qty, equip] of STARTER_ITEMS) {
      const it = (await db.query('SELECT id, slot FROM items WHERE key = $1', [key])).rows[0];
      if (!it) continue;
      if (equip && it.slot) await db.query('INSERT INTO equipment (character_id, slot, item_id) VALUES ($1,$2,$3)', [id, it.slot, it.id]);
      else await db.query('INSERT INTO inventory_items (character_id, item_id, quantity) VALUES ($1,$2,$3)', [id, it.id, qty]);
    }
    if (start) await db.query('INSERT INTO character_locations (character_id, location_id) VALUES ($1,$2)', [id, start.id]);
    await db.query(`INSERT INTO transactions (to_character_id, amount, kind, note) VALUES ($1, $2, 'starting_funds', 'رصيد البداية')`, [
      id,
      progression.startingNx,
    ]);
    await audit({ actorId: userId, action: 'character_created', targetType: 'character', targetId: code, after: { name: data.name } }, db);
    return loadCharacter(db, id);
  });
}

export async function updateCharacter(characterId, patch, { actorId, reason } = {}) {
  const data = parseOrThrow(characterPatchSchema, patch);
  const fields = Object.keys(data).filter((k) => data[k] !== undefined);
  if (!fields.length) throw new UserError('لا يوجد ما يمكن تعديله');
  return tx(async (db) => {
    const before = (await db.query(`SELECT ${fields.join(', ')} FROM characters WHERE id = $1 FOR UPDATE`, [characterId])).rows[0];
    if (!before) throw new UserError('الشخصية غير موجودة');
    const sets = fields.map((f, i) => `${f} = $${i + 2}`);
    await db.query(`UPDATE characters SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [characterId, ...fields.map((f) => data[f])]);
    await audit({ actorId, action: 'character_edited', targetType: 'character', targetId: characterId, before, after: data, reason }, db);
    return loadCharacter(db, characterId);
  });
}

/**
 * Deletes a character. A guild leader hands leadership to the most senior officer/member;
 * a guild left empty is disbanded and its treasury is lost (logged).
 */
export async function deleteCharacter(characterId, { actorId, reason } = {}) {
  return tx(async (db) => {
    const ch = await loadCharacter(db, characterId, { lock: true });
    if (!ch) throw new UserError('الشخصية غير موجودة');
    await db.query(
      "UPDATE combat_sessions SET status = 'cancelled', finished_at = now() WHERE status IN ('pending','active') AND (challenger_id = $1 OR opponent_id = $1)",
      [characterId],
    );
    // Free the opponent too, or they would stay locked in a fight that no longer exists.
    await db.query('DELETE FROM combat_locks WHERE session_id IN (SELECT session_id FROM combat_locks WHERE character_id = $1)', [characterId]);
    await db.query("UPDATE trades SET status = 'cancelled' WHERE status = 'open' AND (initiator_id = $1 OR partner_id = $1)", [characterId]);
    const led = (await db.query('SELECT id, name, treasury FROM guilds WHERE leader_character_id = $1', [characterId])).rows[0];
    if (led) {
      const heir = (
        await db.query(
          `SELECT character_id FROM guild_members WHERE guild_id = $1 AND character_id <> $2
           ORDER BY (role = 'officer') DESC, joined_at ASC LIMIT 1`,
          [led.id, characterId],
        )
      ).rows[0];
      if (heir) {
        await db.query('UPDATE guilds SET leader_character_id = $2 WHERE id = $1', [led.id, heir.character_id]);
        await db.query("UPDATE guild_members SET role = 'leader' WHERE guild_id = $1 AND character_id = $2", [led.id, heir.character_id]);
      } else {
        await db.query('DELETE FROM guilds WHERE id = $1', [led.id]);
        await audit({ actorId, action: 'guild_deleted', targetType: 'guild', targetId: led.id, before: led, reason: 'disbanded: leader deleted' }, db);
      }
    }
    await db.query('DELETE FROM characters WHERE id = $1', [characterId]);
    await audit(
      { actorId, action: 'character_deleted', targetType: 'character', targetId: ch.code, before: { name: ch.name, level: ch.level, nx: ch.nx }, reason },
      db,
    );
    return ch;
  });
}

/**
 * Grants XP (with the server multiplier) and resolves level ups. Must run in a transaction.
 * Returns { gained, levelsGained, level, statPoints, skillPoints, nxBonus }.
 */
export async function grantXp(db, characterId, amount, { ignoreMultiplier = false } = {}) {
  const mult = ignoreMultiplier ? 1 : Number(await getSetting('xp_multiplier', 1)) || 1;
  const gained = Math.max(0, Math.floor(amount * mult));
  const row = (await db.query('SELECT level, xp FROM characters WHERE id = $1 FOR UPDATE', [characterId])).rows[0];
  if (!row) throw new UserError('الشخصية غير موجودة');
  const res = applyXp({ level: row.level, xp: Number(row.xp) }, gained);
  await db.query(
    `UPDATE characters SET level = $2, xp = $3, stat_points = stat_points + $4, skill_points = skill_points + $5,
       nx = nx + $6, updated_at = now() WHERE id = $1`,
    [characterId, res.level, res.xp, res.statPoints, res.skillPoints, res.nxBonus],
  );
  if (res.nxBonus > 0) {
    await db.query(`INSERT INTO transactions (to_character_id, amount, kind, note) VALUES ($1, $2, 'level_up', $3)`, [
      characterId,
      res.nxBonus,
      `مكافأة الوصول إلى المستوى ${res.level}`,
    ]);
  }
  const unlockedSkills = res.levelsGained > 0 ? await syncClassSkills(db, characterId) : [];
  return { gained, ...res, unlockedSkills };
}

export async function allocateStat(userId, stat, points) {
  if (!STATS.includes(stat)) throw new UserError('إحصائية غير معروفة');
  if (!Number.isInteger(points) || points < 1) throw new UserError('عدد النقاط غير صالح');
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    if (ch.statPoints < points) throw new UserError(`لديك ${ch.statPoints} نقاط فقط`);
    await db.query(`UPDATE character_stats SET ${stat} = ${stat} + $2 WHERE character_id = $1`, [ch.id, points]);
    await db.query('UPDATE characters SET stat_points = stat_points - $2 WHERE id = $1', [ch.id, points]);
    // Keep current HP/energy as-is (they'll regenerate up to the new max).
    await saveVitals(db, ch);
    return loadCharacter(db, ch.id);
  });
}

/** Admin: set base stats directly. */
export async function setStats(characterId, values, { actorId, reason } = {}) {
  return tx(async (db) => {
    const before = (await db.query('SELECT * FROM character_stats WHERE character_id = $1 FOR UPDATE', [characterId])).rows[0];
    if (!before) throw new UserError('الشخصية غير موجودة');
    const keys = Object.keys(values).filter((k) => STATS.includes(k));
    if (!keys.length) throw new UserError('لم تحدد أي إحصائية');
    for (const k of keys) if (!Number.isInteger(values[k]) || values[k] < 0 || values[k] > 999) throw new UserError('القيمة يجب أن تكون بين 0 و 999');
    await db.query(`UPDATE character_stats SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE character_id = $1`, [
      characterId,
      ...keys.map((k) => values[k]),
    ]);
    await audit({ actorId, action: 'admin_action', targetType: 'character', targetId: characterId, before, after: values, reason: reason ?? 'set stats' }, db);
    return loadCharacter(db, characterId);
  });
}

export async function setAvatar(characterId, png) {
  await getPool().query('UPDATE characters SET avatar = $2, updated_at = now() WHERE id = $1', [characterId, png]);
}

export async function getAvatar(characterId) {
  const { rows } = await getPool().query('SELECT avatar FROM characters WHERE id = $1', [characterId]);
  return rows[0]?.avatar ?? null;
}

export async function recordVisit(db, characterId, locationId) {
  await db.query('INSERT INTO character_locations (character_id, location_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [characterId, locationId]);
}

export async function visitedKeys(characterId, db = getPool()) {
  const { rows } = await db.query('SELECT l.key FROM character_locations cl JOIN locations l ON l.id = cl.location_id WHERE cl.character_id = $1', [
    characterId,
  ]);
  return rows.map((r) => r.key);
}
