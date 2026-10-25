import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { app } from '../core/context.js';
import { exploration as X } from '../config/game.js';
import { REGIONS, LANDMARK_BY_KEY } from '../content/regions.js';
import { worldBossesAt } from '../content/bosses.js';
import { ENEMIES } from '../engine/enemies.js';
import { defaultRng } from '../engine/rng.js';
import { duration } from '../utils/format.js';
import { requireByUser, saveVitals, spendEnergy, loadCharacter } from './characters.js';
import { grantRewards, describeRewards } from './rewards.js';
import { assertCapacity } from './inventory.js';
import { chaptersDone, track, mergeTracks } from './progress.js';
import { bumpRegionStat } from './combat.js';
import { getLocation } from './world.js';
import { listNpcs } from './npcs.js';

/**
 * Exploring and gathering. Everything a place offers comes from content/regions.js and is
 * gated by story progress, so returning to an old place after a new chapter shows new things.
 */

const open = (entryChapter, chapter) => (entryChapter ?? 0) <= chapter;

async function itemsByKey(db, keys) {
  if (!keys.length) return {};
  const { rows } = await db.query('SELECT id, key, name_ar, rarity, weight FROM items WHERE key = ANY($1::text[])', [keys]);
  return Object.fromEntries(rows.map((r) => [r.key, r]));
}

/** Everything a place holds for this character, with locks. */
export async function regionOverview(userId, locationKey = null) {
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const key = locationKey ?? ch.location?.key;
  const loc = await getLocation(key, db);
  if (!loc) throw new UserError('لم أجد هذا المكان');
  const region = REGIONS[loc.key] ?? { theme: loc.description, gather: [], events: [], landmarks: [] };
  const chapter = await chaptersDone(db, ch.id);
  const found = new Set(
    (await db.query('SELECT landmark_key FROM character_landmarks WHERE character_id = $1 AND location_key = $2', [ch.id, loc.key])).rows.map(
      (r) => r.landmark_key,
    ),
  );
  const stats = (await db.query('SELECT * FROM character_region_stats WHERE character_id = $1 AND location_key = $2', [ch.id, loc.key])).rows[0] ?? null;
  const items = await itemsByKey(
    db,
    region.gather.map(([k]) => k),
  );
  const bossRows = (await db.query('SELECT boss_key, kills FROM character_bosses WHERE character_id = $1', [ch.id])).rows;
  const kills = Object.fromEntries(bossRows.map((r) => [r.boss_key, r.kills]));
  const npcs = await listNpcs({ locationId: loc.id });
  return {
    character: ch,
    location: loc,
    here: ch.location?.key === loc.key,
    chapter,
    sealed: loc.requiredChapter > chapter,
    theme: region.theme,
    gather: region.gather.map(([k, chance, need]) => ({
      key: k,
      name: items[k]?.name_ar ?? k,
      rarity: items[k]?.rarity ?? 'common',
      chance,
      locked: !open(need, chapter),
      chapter: need ?? 0,
    })),
    events: { open: region.events.filter((e) => open(e.chapter, chapter)).length, total: region.events.length },
    nextUnlock: Math.min(
      ...[...region.events, ...region.landmarks.map((l) => ({ chapter: l.chapter })), ...region.gather.map(([, , c]) => ({ chapter: c }))]
        .map((e) => e.chapter ?? 0)
        .filter((c) => c > chapter),
      Infinity,
    ),
    landmarks: region.landmarks.map((l) => ({ ...l, found: found.has(l.key), locked: !open(l.chapter, chapter) })),
    bosses: worldBossesAt(loc.key).map((b) => ({
      key: b.key,
      name: b.name,
      level: b.level,
      tier: b.tier,
      archetype: b.archetype,
      palette: b.palette,
      look: b.look,
      sealed: chapter < b.chapter,
      chapter: b.chapter,
      kills: kills[b.key] ?? 0,
    })),
    monsters: (ENEMIES[loc.key] ?? []).map((m) => m.name),
    npcs: npcs.map((n) => n.name),
    stats: { explored: stats?.explored ?? 0, gathered: stats?.gathered ?? 0, hunted: stats?.hunted ?? 0, mastered: Boolean(stats?.mastery_paid) },
  };
}

function pickWeighted(list, rng) {
  const total = list.reduce((s, e) => s + (e.weight ?? 1), 0);
  let r = rng.next() * total;
  for (const e of list) {
    r -= e.weight ?? 1;
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}

async function cooldown(userId, key, seconds, label) {
  const left = await app.cooldowns.remaining(`u:${userId}`, key);
  if (left > 0) throw new UserError(`${label} (${duration(left)})`);
  return () => app.cooldowns.set(`u:${userId}`, key, seconds * 1000, { persist: false });
}

/** Pays the one-time mastery reward when every landmark of a place has been found. */
async function checkMastery(db, ch, locKey) {
  const region = REGIONS[locKey];
  if (!region?.landmarks.length) return null;
  const n = (await db.query('SELECT count(*)::int AS n FROM character_landmarks WHERE character_id = $1 AND location_key = $2', [ch.id, locKey])).rows[0].n;
  if (n < region.landmarks.length) return null;
  const paid = await db.query(
    'UPDATE character_region_stats SET mastery_paid = TRUE WHERE character_id = $1 AND location_key = $2 AND NOT mastery_paid RETURNING 1',
    [ch.id, locKey],
  );
  if (!paid.rowCount) return null;
  const cache = (await db.query("SELECT id, name_ar FROM items WHERE key = 'explorer_cache'")).rows[0];
  return grantRewards(db, ch.id, {
    xp: 200 + ch.level * 40,
    nx: 300 + ch.level * 30,
    items: cache ? [{ itemId: cache.id, name: cache.name_ar, quantity: 2 }] : [],
    reputation: 25,
    kind: 'mastery',
    note: `إتقان منطقة: ${locKey}`,
  });
}

/**
 * Explores the current place: a chance to uncover a landmark, otherwise one of the place's
 * events (treasure, traps, encounters, lore), all gated by story progress.
 */
export async function explore(userId, rng = defaultRng) {
  const arm = await cooldown(userId, 'explore', X.exploreCooldownSeconds, 'تحتاج إلى التقاط أنفاسك قبل استكشاف جديد');
  const result = await tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const locKey = ch.location?.key;
    const region = REGIONS[locKey];
    if (!region) throw new UserError('لا يوجد ما يُستكشف هنا');
    const combat = await db.query('SELECT 1 FROM combat_locks WHERE character_id = $1', [ch.id]);
    if (combat.rowCount) throw new UserError('لا يمكنك الاستكشاف أثناء القتال');
    await spendEnergy(db, ch, X.exploreEnergy);
    const chapter = await chaptersDone(db, ch.id);
    const found = new Set((await db.query('SELECT landmark_key FROM character_landmarks WHERE character_id = $1', [ch.id])).rows.map((r) => r.landmark_key));
    const hidden = region.landmarks.filter((l) => open(l.chapter, chapter) && !found.has(l.key));
    await bumpRegionStat(db, ch.id, locKey, 'explored');
    await db.query('UPDATE characters SET explorations = explorations + 1 WHERE id = $1', [ch.id]);
    const out = { character: ch, location: ch.location, landmark: null, event: null, rewards: null, hpChange: 0, mastery: null };
    let tracks = await track(db, ch.id, 'explore', { location: locKey });

    if (hidden.length && rng.chance(0.3)) {
      const lm = rng.pick(hidden);
      await db.query('INSERT INTO character_landmarks (character_id, landmark_key, location_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [
        ch.id,
        lm.key,
        locKey,
      ]);
      const items = await resolveItems(db, lm.reward.items ?? []);
      out.landmark = lm;
      out.rewards = await grantRewards(db, ch.id, { xp: lm.reward.xp ?? 0, nx: lm.reward.nx ?? 0, items, kind: 'landmark', note: `معلم: ${lm.name}` });
      tracks = mergeTracks(tracks, await track(db, ch.id, 'landmark', { key: lm.key, location: locKey }));
      out.mastery = await checkMastery(db, ch, locKey);
    } else {
      const pool = region.events.filter((e) => open(e.chapter, chapter));
      const ev = pickWeighted(pool, rng);
      out.event = { ...ev, text: ev.text.replaceAll('{name}', ch.name) };
      if (ev.hp) {
        const hp = Math.max(1, Math.min(ch.maxHp, ch.hp + Math.round(ev.hp * (ev.hp < 0 ? 1 + ch.level / 60 : 1 + ch.level / 40))));
        out.hpChange = hp - ch.hp;
        await saveVitals(db, ch, { hp });
      }
      let nx = ev.nx ?? 0;
      if (nx < 0) {
        const take = Math.min(-nx, Number(ch.nx));
        if (take > 0) {
          await db.query('UPDATE characters SET nx = nx - $2 WHERE id = $1', [ch.id, take]);
          await db.query("INSERT INTO transactions (from_character_id, amount, kind, note) VALUES ($1, $2, 'explore', 'خسارة أثناء الاستكشاف')", [ch.id, take]);
        }
        out.nxLost = take;
        nx = 0;
      }
      const items = await resolveItems(db, ev.items ?? []);
      if (items.length)
        await assertCapacity(
          db,
          ch,
          items.reduce((s, i) => s + i.weight * i.quantity, 0),
        ).catch(() => items.splice(0));
      out.rewards = await grantRewards(db, ch.id, { xp: ev.xp ?? 0, nx, items, kind: 'explore', note: 'استكشاف' });
    }
    out.text = out.rewards ? describeRewards(out.rewards) : '';
    out.contracts = tracks;
    out.character = await loadCharacter(db, ch.id);
    return out;
  });
  await arm();
  return result;
}

async function resolveItems(db, list) {
  const refs = await itemsByKey(
    db,
    list.map(([k]) => k),
  );
  return list
    .filter(([k]) => refs[k])
    .map(([k, q]) => ({ itemId: refs[k].id, name: refs[k].name_ar, rarity: refs[k].rarity, weight: Number(refs[k].weight), quantity: q }));
}

/** Gathers the current place's resources. Luck improves the odds a little. */
export async function gather(userId, rng = defaultRng) {
  const arm = await cooldown(userId, 'gather', X.gatherCooldownSeconds, 'يداك متعبتان، انتظر قليلاً قبل الجمع مجدداً');
  const result = await tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const locKey = ch.location?.key;
    const region = REGIONS[locKey];
    const chapter = await chaptersDone(db, ch.id);
    const nodes = (region?.gather ?? []).filter(([, , need]) => open(need, chapter));
    if (!nodes.length) throw new UserError('لا توجد موارد تُجمع هنا. جرّب الغابة أو الجبال أو البحيرة...');
    const combat = await db.query('SELECT 1 FROM combat_locks WHERE character_id = $1', [ch.id]);
    if (combat.rowCount) throw new UserError('لا يمكنك الجمع أثناء القتال');
    await spendEnergy(db, ch, X.gatherEnergy);
    const refs = await itemsByKey(
      db,
      nodes.map(([k]) => k),
    );
    const luck = 1 + Math.min(0.5, (ch.stats.luck ?? 0) / 200);
    const got = [];
    for (const [key, chance] of nodes) {
      if (!refs[key] || !rng.chance(Math.min(0.95, chance * luck))) continue;
      const qty = ['common', 'uncommon'].includes(refs[key].rarity) ? rng.int(1, 3) : 1;
      got.push({ itemId: refs[key].id, key, name: refs[key].name_ar, rarity: refs[key].rarity, weight: Number(refs[key].weight), quantity: qty });
    }
    // Never come back empty-handed from a place that has something to give.
    if (!got.length) {
      const [key] = nodes.reduce((a, b) => (b[1] > a[1] ? b : a));
      if (refs[key]) got.push({ itemId: refs[key].id, key, name: refs[key].name_ar, rarity: refs[key].rarity, weight: Number(refs[key].weight), quantity: 1 });
    }
    await assertCapacity(
      db,
      ch,
      got.reduce((s, i) => s + i.weight * i.quantity, 0),
    );
    const rewards = await grantRewards(db, ch.id, { xp: 4 + Math.round(ch.level * 1.5), items: got, kind: 'gather', note: 'جمع موارد' });
    await bumpRegionStat(db, ch.id, locKey, 'gathered');
    const contracts = await track(db, ch.id, 'gather', { location: locKey, key: got[0]?.key });
    return { character: await loadCharacter(db, ch.id), location: ch.location, items: got, rewards, text: describeRewards(rewards), contracts };
  });
  await arm();
  return result;
}

/** Every landmark a character has found, by place. */
export async function landmarkJournal(userId) {
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const rows = (await db.query('SELECT landmark_key, location_key, found_at FROM character_landmarks WHERE character_id = $1 ORDER BY found_at', [ch.id])).rows;
  return { character: ch, found: rows.map((r) => ({ ...LANDMARK_BY_KEY[r.landmark_key], foundAt: r.found_at })).filter((l) => l.key) };
}
