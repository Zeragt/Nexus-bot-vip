import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { app } from '../core/context.js';
import { exploration as X } from '../config/game.js';
import { duration } from '../utils/format.js';
import { defaultRng } from '../engine/rng.js';
import { rollExplore, rollGather, line } from '../engine/explore.js';
import { enemiesFor } from '../engine/enemies.js';
import {
  zonesOf,
  currentZone,
  zoneAccess,
  ZONE_BY_KEY,
  DEPTH_UNLOCK,
  DEPTH_LABELS,
  PROVINCES,
  PROVINCE_BY_KEY,
  provinceOf,
  provinceTier,
  masteryRank,
  weatherFor,
} from '../content/regions.js';
import { requireByUser, loadCharacter, saveVitals, spendEnergy } from './characters.js';
import { grantRewards } from './rewards.js';
import { addItem } from './inventory.js';
import { credit } from './economy.js';
import { track } from './progress.js';
import { startZoneFight } from './combat.js';
import { fieldConditions, provincePoints } from './mastery.js';
import { getSetting } from './settings.js';

export async function explorationOf(db, characterId, locationKey) {
  const { rows } = await db.query('SELECT * FROM character_exploration WHERE character_id = $1 AND location_key = $2', [characterId, locationKey]);
  return { points: rows[0]?.points ?? 0, zones: rows[0]?.zones ?? [], secrets: rows[0]?.secrets ?? [] };
}

/** Adds exploration points and returns the zones this unlocked (by depth threshold). */
async function addPoints(db, ch, locationKey, points) {
  const before = await explorationOf(db, ch.id, locationKey);
  const total = before.points + points;
  const known = new Set(before.zones);
  const unlocked = [];
  for (const z of zonesOf(locationKey)) {
    if (known.has(z.key)) continue;
    if (total >= DEPTH_UNLOCK[z.depth] && ch.level >= z.minLevel) {
      known.add(z.key);
      unlocked.push(z);
    }
  }
  await db.query(
    `INSERT INTO character_exploration (character_id, location_key, points, zones) VALUES ($1,$2,$3,$4::jsonb)
     ON CONFLICT (character_id, location_key) DO UPDATE SET points = $3, zones = $4::jsonb, updated_at = now()`,
    [ch.id, locationKey, total, JSON.stringify([...known])],
  );
  return { total, unlocked };
}

async function itemByKey(db, key) {
  return (await db.query('SELECT id, key, name_ar, rarity FROM items WHERE key = $1', [key])).rows[0] ?? null;
}

async function grantResources(db, characterId, list) {
  const out = [];
  for (const r of list) {
    const it = await itemByKey(db, r.key);
    if (!it) continue;
    await addItem(db, characterId, it.id, r.quantity);
    out.push({ itemId: it.id, key: it.key, name: it.name_ar, rarity: it.rarity, quantity: r.quantity });
  }
  return out;
}

async function addBuff(db, characterId, key, minutes = 20) {
  await db.query(
    `INSERT INTO character_status_effects (character_id, effect_key, expires_at, source) VALUES ($1, $2, now() + make_interval(mins => $3), 'explore')
     ON CONFLICT (character_id, effect_key) DO UPDATE SET expires_at = GREATEST(character_status_effects.expires_at, EXCLUDED.expires_at)`,
    [characterId, key, minutes],
  );
}

/** Ensures the starting zone of the current location is recorded as discovered. */
async function ensureFirstZone(db, ch) {
  const z = zonesOf(ch.location?.key)[0];
  if (!z) return;
  await db.query(
    `INSERT INTO character_exploration (character_id, location_key, zones) VALUES ($1,$2,$3::jsonb)
     ON CONFLICT (character_id, location_key) DO UPDATE SET zones = CASE WHEN character_exploration.zones ? $4 THEN character_exploration.zones
       ELSE character_exploration.zones || to_jsonb($4::text) END`,
    [ch.id, ch.location.key, JSON.stringify([z.key]), z.key],
  );
}

/**
 * /explore — one step into the current zone. Finds resources, caches, lore, travellers,
 * traps or shrines, earns exploration points (which open deeper zones), and sometimes
 * a monster (or an elite) attacks: then a fight starts in the same transaction.
 */
export async function explore(userId, rng = defaultRng) {
  if (!(await getSetting('explore_enabled', true))) throw new UserError('الاستكشاف متوقف مؤقتاً بأمر الإدارة');
  const left = await app.cooldowns.remaining(`u:${userId}`, 'explore');
  if (left > 0) throw new UserError(`التقط أنفاسك قبل أن تستكشف مجدداً (${duration(left)})`);
  const result = await tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    if (!ch.location) throw new UserError('أنت لست في أي مكان. سافر أولاً عبر /travel');
    const zone = currentZone(ch.location.key, ch.zoneKey);
    if (!zone) throw new UserError('لا يوجد ما يُستكشف هنا');
    const inFight = await db.query('SELECT 1 FROM combat_locks WHERE character_id = $1', [ch.id]);
    if (inFight.rowCount) throw new UserError('لا يمكنك الاستكشاف أثناء القتال');
    if (!zone.city && ch.hp < ch.maxHp * 0.15) throw new UserError('جراحك خطيرة. عالجها قبل أن تتوغل أكثر');
    await spendEnergy(db, ch, zone.city ? Math.ceil(X.exploreEnergy / 2) : X.exploreEnergy);
    await ensureFirstZone(db, ch);
    const field = await fieldConditions(db, ch.id, ch.location.key);
    const roll = rollExplore(
      zone,
      {
        level: ch.level,
        weather: field.weather,
        masteryRank: field.mastery.rank,
        provinceTier: provinceTier(field.province?.key),
        hasEnemies: enemiesFor(ch.location.key).length > 0,
      },
      rng,
    );
    const out = {
      zone,
      kind: roll.kind,
      text: line(roll.kind, zone.name, rng),
      weather: field.weather,
      province: field.province,
      items: [],
      nx: 0,
      xp: 0,
      hpLost: 0,
      buff: null,
      unlocked: [],
      fight: null,
    };
    const pts = await addPoints(db, ch, ch.location.key, roll.points);
    out.points = pts.total;
    out.pointsGained = roll.points;
    out.unlocked = pts.unlocked;
    await db.query('UPDATE characters SET explorations = explorations + 1 WHERE id = $1', [ch.id]);
    await track(db, ch.id, 'explore', { target: ch.location.key });
    for (const z of pts.unlocked) await track(db, ch.id, 'discover', { target: z.key });

    if (roll.kind === 'resource') out.items = await grantResources(db, ch.id, roll.resources);
    if (roll.kind === 'cache' && roll.box) {
      const it = await itemByKey(db, 'explorer_cache');
      if (it) {
        await addItem(db, ch.id, it.id, 1);
        out.items.push({ itemId: it.id, name: it.name_ar, rarity: it.rarity, quantity: 1 });
      }
    }
    if (roll.nx > 0) out.nx = await credit(db, ch.id, roll.nx, 'explore', `استكشاف: ${zone.name}`);
    if (roll.nx < 0) {
      const take = Math.min(ch.nx, -roll.nx);
      if (take > 0) {
        await db.query('UPDATE characters SET nx = nx - $2 WHERE id = $1 AND nx >= $2', [ch.id, take]);
        await db.query("INSERT INTO transactions (from_character_id, amount, kind, note) VALUES ($1,$2,'stolen','سرقة في الزحام')", [ch.id, take]);
      }
      out.nx = -take;
    }
    if (roll.hpLossPct > 0) {
      const fresh = await loadCharacter(db, ch.id);
      const lost = Math.min(fresh.hp - 1, Math.round(fresh.maxHp * roll.hpLossPct));
      if (lost > 0) await saveVitals(db, fresh, { hp: fresh.hp - lost });
      out.hpLost = Math.max(0, lost);
    }
    if (roll.buff) {
      await addBuff(db, ch.id, roll.buff, 20);
      out.buff = roll.buff;
    }
    if (roll.xp > 0) {
      const r = await grantRewards(db, ch.id, { xp: roll.xp, kind: 'explore' });
      out.xp = r.xp;
      out.level = r.level;
    }
    if (roll.kind === 'encounter' || roll.kind === 'elite') {
      const fresh = await loadCharacter(db, ch.id, { lock: true });
      out.fight = await startZoneFight(db, fresh, { elite: roll.kind === 'elite' }, rng);
    }
    out.character = await loadCharacter(db, ch.id);
    return out;
  });
  await app.cooldowns.set(`u:${userId}`, 'explore', X.exploreCooldownSeconds * 1000, { persist: false });
  return result;
}

/** /gather — collects the zone's resources (weather and mastery change the yield). */
export async function gather(userId, rng = defaultRng) {
  const left = await app.cooldowns.remaining(`u:${userId}`, 'gather');
  if (left > 0) throw new UserError(`يداك متعبتان. انتظر ${duration(left)}`);
  const result = await tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const zone = currentZone(ch.location?.key, ch.zoneKey);
    if (!zone?.resources?.length) throw new UserError('لا توجد موارد لتجمعها هنا. جرّب البراري أو ساحة السندان');
    const inFight = await db.query('SELECT 1 FROM combat_locks WHERE character_id = $1', [ch.id]);
    if (inFight.rowCount) throw new UserError('لا يمكنك الجمع أثناء القتال');
    await spendEnergy(db, ch, X.gatherEnergy);
    const field = await fieldConditions(db, ch.id, ch.location.key);
    const yieldList = rollGather(zone, { weather: field.weather, masteryRank: field.mastery.rank }, rng);
    const items = await grantResources(db, ch.id, yieldList);
    const total = items.reduce((s, i) => s + i.quantity, 0);
    for (const it of items) await track(db, ch.id, 'gather', { target: it.key, amount: it.quantity });
    await addPoints(db, ch, ch.location.key, 0);
    return { zone, items, total, weather: field.weather, province: field.province, character: await loadCharacter(db, ch.id) };
  });
  await app.cooldowns.set(`u:${userId}`, 'gather', X.gatherCooldownSeconds * 1000, { persist: false });
  return result;
}

/** Zones of the current location with their lock state, for /zone and the location card. */
export async function zoneOverview(userId, db = getPool()) {
  const ch = await requireByUser(userId, db);
  if (!ch.location) throw new UserError('أنت لست في أي مكان');
  const exp = await explorationOf(db, ch.id, ch.location.key);
  const here = currentZone(ch.location.key, ch.zoneKey);
  const zones = zonesOf(ch.location.key).map((z) => {
    const access = zoneAccess(z, { level: ch.level, points: exp.points });
    const known = exp.zones.includes(z.key) || z.depth === 1;
    return { ...z, known, access, current: here?.key === z.key, secretRead: exp.secrets.includes(z.key), depthLabel: DEPTH_LABELS[z.depth] };
  });
  const resKeys = [...new Set(zones.flatMap((z) => (z.resources ?? []).map(([k]) => k)))];
  const names = Object.fromEntries(
    (await db.query('SELECT key, name_ar FROM items WHERE key = ANY($1::text[])', [resKeys])).rows.map((r) => [r.key, r.name_ar]),
  );
  for (const z of zones) z.resourceNames = (z.resources ?? []).map(([k]) => names[k]).filter(Boolean);
  const field = await fieldConditions(db, ch.id, ch.location.key);
  // field.points are the province's mastery points; explorePoints are this location's.
  return { character: ch, location: ch.location, zones, here, ...field, explorePoints: exp.points };
}

/** /zone move — walk to another zone of the same location. */
export async function moveZone(userId, zoneKey) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const zone = ZONE_BY_KEY[zoneKey];
    if (!zone || zone.location !== ch.location?.key) throw new UserError('هذه المنطقة ليست جزءاً من مكانك الحالي');
    if (ch.zoneKey === zone.key) throw new UserError(`أنت في ${zone.name} بالفعل`);
    const inFight = await db.query('SELECT 1 FROM combat_locks WHERE character_id = $1', [ch.id]);
    if (inFight.rowCount) throw new UserError('لا يمكنك التنقل أثناء القتال');
    const exp = await explorationOf(db, ch.id, ch.location.key);
    const access = zoneAccess(zone, { level: ch.level, points: exp.points });
    if (!access.ok) throw new UserError(`لا يمكنك دخول ${zone.name} بعد:\n${access.reasons.join('\n')}`);
    await db.query('UPDATE characters SET zone_key = $2 WHERE id = $1', [ch.id, zone.key]);
    let secret = null;
    if (zone.secret && !exp.secrets.includes(zone.key)) {
      await db.query(
        `UPDATE character_exploration SET secrets = secrets || to_jsonb($3::text), zones = CASE WHEN zones ? $3 THEN zones ELSE zones || to_jsonb($3::text) END
         WHERE character_id = $1 AND location_key = $2`,
        [ch.id, ch.location.key, zone.key],
      );
      secret = zone.secret;
      const tier = provinceTier(provinceOf(ch.location.key)?.key);
      await grantRewards(db, ch.id, { xp: Math.round((50 + ch.level * 12) * tier), nx: Math.round((40 + ch.level * 8) * tier), kind: 'secret' });
    }
    return { zone, secret, character: await loadCharacter(db, ch.id) };
  });
}

/** Province overview: mastery, weather, and every location's exploration. */
export async function provinceOverview(userId, provinceKey = null) {
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const province = PROVINCE_BY_KEY[provinceKey] ?? provinceOf(ch.location?.key) ?? PROVINCES[0];
  const rows = (await db.query('SELECT * FROM character_exploration WHERE character_id = $1 AND location_key = ANY($2::text[])', [ch.id, province.locations]))
    .rows;
  const byLoc = Object.fromEntries(rows.map((r) => [r.location_key, r]));
  const locs = (await db.query('SELECT key, name_ar, min_level, danger_level FROM locations WHERE key = ANY($1::text[])', [province.locations])).rows;
  const nameOf = Object.fromEntries(locs.map((l) => [l.key, l]));
  const points = await provincePoints(db, ch.id, province.key);
  return {
    character: ch,
    province,
    weather: weatherFor(province.key),
    mastery: masteryRank(points),
    points,
    locations: province.locations
      .filter((k) => nameOf[k])
      .map((k) => {
        const zones = zonesOf(k);
        const found = byLoc[k]?.zones ?? [];
        return {
          key: k,
          name: nameOf[k].name_ar,
          minLevel: nameOf[k].min_level,
          danger: nameOf[k].danger_level,
          points: byLoc[k]?.points ?? 0,
          zones: zones.length,
          found: zones.filter((z) => z.depth === 1 || found.includes(z.key)).length,
          hiddenFound: zones.some((z) => z.depth === 4 && found.includes(z.key)),
          here: ch.location?.key === k,
        };
      }),
  };
}

export { openBox } from './boxes.js';
