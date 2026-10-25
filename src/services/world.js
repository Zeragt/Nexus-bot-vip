import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { app } from '../core/context.js';
import { can } from '../core/permissions.js';
import { cooldowns as CD } from '../config/game.js';
import { duration } from '../utils/format.js';
import { requireByUser, recordVisit, loadCharacter, spendEnergy } from './characters.js';
import { checkAchievements } from './achievements.js';
import { audit } from './audit.js';
import { track } from './progress.js';

export function mapLocation(r) {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    nameAr: r.name_ar,
    description: r.description,
    region: r.region,
    channelName: r.channel_name,
    mapX: r.map_x,
    mapY: r.map_y,
    danger: r.danger_level,
    minLevel: r.min_level,
    requiredQuestId: r.required_quest_id,
    requiresPermission: r.requires_permission,
    locked: r.locked,
    isStart: r.is_start,
  };
}

export async function listLocations() {
  const { rows } = await getPool().query('SELECT * FROM locations ORDER BY region, id');
  return rows.map(mapLocation);
}

export async function getLocation(keyOrName, db = getPool()) {
  const { rows } = await db.query('SELECT * FROM locations WHERE key = $1 OR name_ar = $1 OR lower(name) = lower($1) LIMIT 1', [
    String(keyOrName ?? '').trim(),
  ]);
  return rows[0] ? mapLocation(rows[0]) : null;
}

export async function locationByChannelName(channelName) {
  if (!channelName) return null;
  const { rows } = await getPool().query(
    `SELECT * FROM locations WHERE channel_name IS NOT NULL AND position(channel_name in $1) > 0 ORDER BY length(channel_name) DESC LIMIT 1`,
    [channelName.toLowerCase()],
  );
  return rows[0] ? mapLocation(rows[0]) : null;
}

export async function playersAt(locationId) {
  const { rows } = await getPool().query('SELECT count(*)::int AS n FROM characters WHERE location_id = $1', [locationId]);
  return rows[0].n;
}

/** Energy cost of a trip: free inside the city, more for dangerous places. */
export function travelEnergyCost(from, to) {
  if (!from || (from.region === 'city' && to.region === 'city')) return 0;
  const dist = Math.hypot((from.mapX ?? 0.5) - to.mapX, (from.mapY ?? 0.5) - to.mapY);
  return Math.round(4 + dist * 20 + to.danger);
}

/** Checks every travel requirement; returns a list of Arabic reasons (empty = allowed). */
export async function travelBlockers(ch, loc, roles, db = getPool()) {
  const reasons = [];
  const staff = roles && can(roles, 'manageWorld');
  if (loc.locked && !staff) reasons.push('هذه المنطقة مغلقة حالياً بأمر الإدارة');
  if (loc.requiresPermission && !staff) reasons.push('تحتاج إذناً خاصاً من الإدارة لدخول هذه المنطقة');
  if (ch.level < loc.minLevel) reasons.push(`تحتاج إلى المستوى ${loc.minLevel} على الأقل`);
  if (loc.requiredQuestId) {
    const done = await db.query("SELECT 1 FROM character_quests WHERE character_id = $1 AND quest_id = $2 AND status = 'completed'", [
      ch.id,
      loc.requiredQuestId,
    ]);
    if (!done.rowCount) {
      const q = (await db.query('SELECT title FROM quests WHERE id = $1', [loc.requiredQuestId])).rows[0];
      reasons.push(`يجب إنجاز مهمة «${q?.title ?? 'خاصة'}» أولاً`);
    }
  }
  return reasons;
}

export async function travel(userId, destination, roles) {
  const loc = await getLocation(destination);
  if (!loc) throw new UserError('لم أجد هذا المكان على الخريطة');
  const left = await app.cooldowns.remaining(`u:${userId}`, 'travel');
  if (left > 0) throw new UserError(`ما زلت في الطريق... انتظر ${duration(left)}`);
  const result = await tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    if (ch.location?.id === loc.id) throw new UserError(`أنت موجود في ${loc.nameAr} بالفعل`);
    const combat = await db.query('SELECT 1 FROM combat_locks WHERE character_id = $1', [ch.id]);
    if (combat.rowCount) throw new UserError('لا يمكنك السفر أثناء القتال');
    const blockers = await travelBlockers(ch, loc, roles, db);
    if (blockers.length) throw new UserError(blockers.join('\n'));
    const from = ch.location ? await getLocation(ch.location.key, db) : null;
    const cost = travelEnergyCost(from, loc);
    if (cost) await spendEnergy(db, ch, cost);
    const firstVisit = !(await db.query('SELECT 1 FROM character_locations WHERE character_id = $1 AND location_id = $2', [ch.id, loc.id])).rowCount;
    await db.query('UPDATE characters SET location_id = $2, zone_key = NULL, updated_at = now() WHERE id = $1', [ch.id, loc.id]);
    await recordVisit(db, ch.id, loc.id);
    await track(db, ch.id, 'travel', { target: loc.key });
    const unlocked = await checkAchievements(db, ch.id);
    return { from, to: loc, cost, firstVisit, unlocked, character: await loadCharacter(db, ch.id) };
  });
  await app.cooldowns.set(`u:${userId}`, 'travel', CD.travelSeconds * 1000, { persist: false });
  return result;
}

export async function createLocation(data, { actorId }) {
  if (!/^[a-z0-9_]{2,40}$/.test(data.key)) throw new UserError('المفتاح يجب أن يكون بالإنجليزية الصغيرة والأرقام و _ فقط');
  const { rows } = await getPool().query(
    `INSERT INTO locations (key, name, name_ar, description, region, channel_name, map_x, map_y, danger_level, min_level)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      data.key,
      data.name,
      data.nameAr,
      data.description ?? '',
      data.region ?? 'wild',
      data.channelName ?? null,
      data.mapX ?? 0.5,
      data.mapY ?? 0.5,
      data.danger ?? 0,
      data.minLevel ?? 1,
    ],
  );
  await audit({ actorId, action: 'admin_action', targetType: 'location', targetId: data.key, after: rows[0], reason: 'location created' });
  return mapLocation(rows[0]);
}

export async function setLocationFlags(key, flags, { actorId }) {
  const loc = await getLocation(key);
  if (!loc) throw new UserError('المكان غير موجود');
  const sets = [];
  const vals = [loc.id];
  for (const [col, v] of Object.entries({
    locked: flags.locked,
    requires_permission: flags.requiresPermission,
    min_level: flags.minLevel,
    danger_level: flags.danger,
  })) {
    if (v === undefined || v === null) continue;
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  }
  if (!sets.length) throw new UserError('لم تحدد أي تغيير');
  await getPool().query(`UPDATE locations SET ${sets.join(', ')} WHERE id = $1`, vals);
  await audit({ actorId, action: 'admin_action', targetType: 'location', targetId: key, before: loc, after: flags, reason: 'location flags' });
  return getLocation(key);
}

// Lore ---------------------------------------------------------------------
export async function listLore() {
  const { rows } = await getPool().query('SELECT slug, title, category, created_at FROM lore_entries ORDER BY category, title');
  return rows;
}

export async function getLore(slugOrTitle) {
  const { rows } = await getPool().query('SELECT * FROM lore_entries WHERE slug = $1 OR title = $1 LIMIT 1', [slugOrTitle]);
  return rows[0] ?? null;
}

export async function upsertLore({ slug, title, category, content }, { actorId }) {
  const { rows } = await getPool().query(
    `INSERT INTO lore_entries (slug, title, category, content, author_id) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, category = EXCLUDED.category, content = EXCLUDED.content, updated_at = now()
     RETURNING *`,
    [slug, title, category, content, actorId],
  );
  await audit({ actorId, action: 'admin_action', targetType: 'lore', targetId: slug, after: { title, category }, reason: 'lore saved' });
  return rows[0];
}

export async function deleteLore(slug, { actorId }) {
  const { rowCount } = await getPool().query('DELETE FROM lore_entries WHERE slug = $1', [slug]);
  if (!rowCount) throw new UserError('المدخل غير موجود');
  await audit({ actorId, action: 'admin_action', targetType: 'lore', targetId: slug, reason: 'lore deleted' });
}
