import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { bosses as BC } from '../config/game.js';
import { WORLD_BOSSES, WORLD_BOSS_BY_KEY, BOSS_SECRETS, worldBossesAt } from '../content/bosses.js';
import { ALL_BOSSES } from '../content/bossRegistry.js';
import { WORLD_BOSS_TUNE } from '../content/story/balance.js';
import { spawnEnemy } from '../engine/enemies.js';
import { defaultRng } from '../engine/rng.js';
import { requireByUser, spendEnergy } from './characters.js';
import { grantRewards, describeRewards } from './rewards.js';
import { startScriptedFight } from './combat.js';
import { chaptersDone } from './progress.js';
import { bossStatLevel } from './story.js';
import { audit } from './audit.js';

/**
 * Region bosses: the lords of each place, fought with /boss fight. Each one opens with the
 * story (`chapter`), asks for a level close to its own, and can be beaten again every few
 * hours for its loot and trophy. The first kill pays double.
 */

export const worldBossHpMult = (boss) => (1.25 + boss.tier * 0.22) * (WORLD_BOSS_TUNE[boss.key] ?? 1);
export const worldBossMinLevel = (boss) => Math.max(1, boss.level - 4);

export function spawnWorldBoss(boss, rng = defaultRng) {
  return spawnEnemy(
    { ...boss, hpMult: worldBossHpMult(boss), statMult: 1 + boss.tier * 0.01 },
    { playerLevel: boss.level, boss: true, statLevel: bossStatLevel(boss.level) },
    rng,
  );
}

export function worldBossRewards(boss, firstKill) {
  const base = {
    xp: Math.round((60 + boss.level * 14 + boss.level * boss.level * 0.55) * (1 + boss.tier * 0.15)),
    nx: Math.round((50 + boss.level * 12) * (1 + boss.tier * 0.1)),
  };
  return firstKill ? { xp: base.xp * 2, nx: base.nx * 2 } : base;
}

async function bossRows(db, characterId) {
  const { rows } = await db.query('SELECT * FROM character_bosses WHERE character_id = $1', [characterId]);
  return Object.fromEntries(rows.map((r) => [r.boss_key, r]));
}

/** Why a boss can't be fought right now (empty = ready). */
export function bossBlockers(boss, { level, chapter, here, record, now = new Date() }) {
  const out = [];
  if (chapter < boss.chapter) out.push(`مختوم: يظهر بعد إكمال الفصل ${boss.chapter} من القصة`);
  if (level < worldBossMinLevel(boss)) out.push(`تحتاج إلى المستوى ${worldBossMinLevel(boss)}`);
  if (here !== boss.location) out.push('ليس في موقعك الحالي');
  if (record?.last_fight_at && record.kills > 0) {
    const ready = new Date(new Date(record.last_fight_at).getTime() + BC.cooldownHours * 3600_000);
    if (ready > now) out.push(`يستعيد قوته... متاح بعد ${Math.ceil((ready - now) / 60000)} دقيقة`);
  }
  return out;
}

/** Bosses of a place with their state for this character. */
export async function bossesAt(userId, locationKey = null) {
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const loc = locationKey ?? ch.location?.key;
  const chapter = await chaptersDone(db, ch.id);
  const records = await bossRows(db, ch.id);
  return {
    character: ch,
    chapter,
    location: loc,
    bosses: worldBossesAt(loc).map((b) => ({
      ...b,
      record: records[b.key] ?? null,
      sealed: chapter < b.chapter,
      blockers: bossBlockers(b, { level: ch.level, chapter, here: ch.location?.key, record: records[b.key] }),
    })),
  };
}

/** The full hall of 100 bosses with what this character has beaten. */
export async function bossHall(userId) {
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const chapter = await chaptersDone(db, ch.id);
  const records = await bossRows(db, ch.id);
  return {
    character: ch,
    chapter,
    bosses: ALL_BOSSES.map((b) => ({
      ...b,
      defeated: b.kind === 'story' ? b.chapterIndex < chapter : (records[b.key]?.kills ?? 0) > 0,
      kills: b.kind === 'story' ? (b.chapterIndex < chapter ? 1 : 0) : (records[b.key]?.kills ?? 0),
      sealed: b.kind === 'story' ? b.chapterIndex > chapter : chapter < b.chapter,
    })),
  };
}

export async function bossInfo(userId, key) {
  const boss = ALL_BOSSES.find((b) => b.key === key);
  if (!boss) throw new UserError('لم أجد هذا الزعيم');
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const chapter = await chaptersDone(db, ch.id);
  const record = boss.kind === 'world' ? ((await bossRows(db, ch.id))[boss.key] ?? null) : null;
  const sealed = boss.kind === 'story' ? boss.chapterIndex > chapter : chapter < boss.chapter;
  return {
    boss,
    character: ch,
    chapter,
    record,
    sealed,
    blockers: boss.kind === 'world' ? bossBlockers(boss, { level: ch.level, chapter, here: ch.location?.key, record }) : [],
    rewards: boss.kind === 'world' ? worldBossRewards(boss, !(record?.kills > 0)) : null,
  };
}

export async function startWorldBossFight(userId, key, rng = defaultRng) {
  const boss = WORLD_BOSS_BY_KEY[key];
  if (!boss) throw new UserError('لم أجد هذا الزعيم');
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const chapter = await chaptersDone(db, ch.id);
    const record = (await db.query('SELECT * FROM character_bosses WHERE character_id = $1 AND boss_key = $2', [ch.id, boss.key])).rows[0];
    const blockers = bossBlockers(boss, { level: ch.level, chapter, here: ch.location?.key, record });
    if (blockers.length) throw new UserError(blockers.join('\n'));
    if (ch.hp < ch.maxHp * BC.minHpRatio) throw new UserError('صحتك أقل من النصف. الزعماء لا يرحمون: استرح أو استخدم جرعة أولاً');
    await spendEnergy(db, ch, BC.energyCost);
    await db.query(
      `INSERT INTO character_bosses (character_id, boss_key, attempts) VALUES ($1, $2, 1)
       ON CONFLICT (character_id, boss_key) DO UPDATE SET attempts = character_bosses.attempts + 1`,
      [ch.id, boss.key],
    );
    return startScriptedFight(db, ch, spawnWorldBoss(boss, rng), { locationKey: boss.location, worldBoss: { key: boss.key } }, rng);
  });
}

async function itemRefs(db, keys) {
  const out = [];
  for (const [key, quantity] of keys) {
    const it = (await db.query('SELECT id, name_ar, rarity FROM items WHERE key = $1', [key])).rows[0];
    if (it) out.push({ itemId: it.id, name: it.name_ar, rarity: it.rarity, quantity });
  }
  return out;
}

/** Called by the combat service when a region-boss fight ends (inside its transaction). */
export async function onWorldBossFight(db, state, player, won, rng = defaultRng) {
  const boss = WORLD_BOSS_BY_KEY[state.worldBoss.key];
  if (!boss || typeof player?.id !== 'number') return null;
  if (!won) return { won: false, boss };
  const record = (await db.query('SELECT kills FROM character_bosses WHERE character_id = $1 AND boss_key = $2 FOR UPDATE', [player.id, boss.key])).rows[0];
  const firstKill = !(record?.kills > 0);
  await db.query(
    `INSERT INTO character_bosses (character_id, boss_key, kills, first_kill_at, last_fight_at) VALUES ($1, $2, 1, now(), now())
     ON CONFLICT (character_id, boss_key) DO UPDATE SET kills = character_bosses.kills + 1, last_fight_at = now(),
       first_kill_at = COALESCE(character_bosses.first_kill_at, now())`,
    [player.id, boss.key],
  );
  const drops = boss.loot.filter(([, chance]) => rng.chance(chance)).map(([key]) => [key, 1 + (rng.chance(0.3) ? 1 : 0)]);
  if (firstKill || rng.chance(0.25)) drops.push([boss.trophy, 1]);
  if (rng.chance(0.35)) drops.push(['boss_chest', 1]);
  for (const [key, chance] of BOSS_SECRETS[boss.key] ?? []) if (rng.chance(chance)) drops.push([key, 1]);
  const items = await itemRefs(db, drops);
  const rewards = await grantRewards(db, player.id, {
    ...worldBossRewards(boss, firstKill),
    reputation: 5 + boss.tier * 5,
    items,
    kind: 'boss',
    note: `زعيم: ${boss.name}`,
  });
  const secret = items.find((i) => i.rarity === 'secret') ?? null;
  await audit(
    {
      actorId: null,
      action: 'boss_defeated',
      targetType: 'character',
      targetId: player.id,
      after: { boss: boss.key, firstKill, secret: secret?.name ?? null },
    },
    db,
  );
  return { won: true, boss, firstKill, rewards, text: describeRewards(rewards), secret };
}

/** Server-wide: who has slain each boss first, and the top slayers. */
export async function bossLeaders(limit = 10) {
  const { rows } = await getPool().query(
    `SELECT c.name, count(*) FILTER (WHERE b.kills > 0)::int AS bosses, sum(b.kills)::int AS kills
     FROM character_bosses b JOIN characters c ON c.id = b.character_id GROUP BY c.id, c.name
     HAVING count(*) FILTER (WHERE b.kills > 0) > 0 ORDER BY bosses DESC, kills DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export { WORLD_BOSSES };
