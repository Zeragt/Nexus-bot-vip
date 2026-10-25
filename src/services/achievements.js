import { getPool } from '../db/pool.js';
import { grantXp } from './characters.js';

async function metrics(db, characterId) {
  const { rows } = await db.query(
    `SELECT c.level, c.nx, c.combat_wins, c.quests_completed, c.shifts_worked, c.trades_completed,
            c.contracts_completed, c.items_crafted, c.pvp_wins,
            (SELECT count(*)::int FROM character_locations WHERE character_id = c.id) AS locations,
            (SELECT count(*)::int FROM character_bosses WHERE character_id = c.id AND kills > 0) AS world_bosses,
            (SELECT count(*)::int FROM character_landmarks WHERE character_id = c.id) AS landmarks,
            (SELECT chapter FROM character_story WHERE character_id = c.id) AS chapters
     FROM characters c WHERE c.id = $1`,
    [characterId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    created: 1,
    level: r.level,
    nx: Number(r.nx),
    combat_wins: r.combat_wins,
    quests_completed: r.quests_completed,
    shifts_worked: r.shifts_worked,
    trades_completed: r.trades_completed,
    locations: r.locations,
    contracts: r.contracts_completed,
    crafted: r.items_crafted,
    pvp_wins: r.pvp_wins,
    world_bosses: r.world_bosses,
    landmarks: r.landmarks,
    chapters: r.chapters ?? 0,
  };
}

/**
 * Unlocks any achievements whose threshold is met and pays their rewards.
 * Runs inside the caller's transaction; loops because a reward can unlock another.
 * Returns the newly unlocked achievements.
 */
export async function checkAchievements(db, characterId) {
  const unlocked = [];
  for (let pass = 0; pass < 3; pass++) {
    const m = await metrics(db, characterId);
    if (!m) return unlocked;
    const { rows } = await db.query(
      `SELECT a.* FROM achievements a
       WHERE NOT EXISTS (SELECT 1 FROM character_achievements ca WHERE ca.character_id = $1 AND ca.achievement_key = a.key)`,
      [characterId],
    );
    const due = rows.filter((a) => (m[a.metric] ?? 0) >= a.threshold);
    if (!due.length) break;
    for (const a of due) {
      const ins = await db.query('INSERT INTO character_achievements (character_id, achievement_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
        characterId,
        a.key,
      ]);
      if (!ins.rowCount) continue;
      if (a.nx_reward > 0) {
        await db.query('UPDATE characters SET nx = nx + $2 WHERE id = $1', [characterId, a.nx_reward]);
        await db.query(`INSERT INTO transactions (to_character_id, amount, kind, note) VALUES ($1, $2, 'achievement', $3)`, [
          characterId,
          a.nx_reward,
          `إنجاز: ${a.name_ar}`,
        ]);
      }
      if (a.xp_reward > 0) await grantXp(db, characterId, a.xp_reward, { ignoreMultiplier: true });
      unlocked.push(a);
    }
  }
  return unlocked;
}

export async function listAchievements(characterId, db = getPool()) {
  const m = await metrics(db, characterId);
  const { rows } = await db.query(
    `SELECT a.*, ca.unlocked_at FROM achievements a
     LEFT JOIN character_achievements ca ON ca.achievement_key = a.key AND ca.character_id = $1
     ORDER BY a.position, a.key`,
    [characterId],
  );
  return rows.map((a) => ({
    key: a.key,
    name: a.name_ar,
    description: a.description,
    tier: a.tier,
    unlocked: Boolean(a.unlocked_at),
    progress: m ? Math.min(1, (m[a.metric] ?? 0) / a.threshold) : 0,
  }));
}
