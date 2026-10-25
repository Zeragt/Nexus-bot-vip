import { PROVINCE_BY_KEY, masteryRank, provinceOf, weatherFor, MASTERY_BONUS } from '../content/regions.js';

/** Exploration points a character has across one province's locations. */
export async function provincePoints(db, characterId, provinceKey) {
  const p = PROVINCE_BY_KEY[provinceKey];
  if (!p) return 0;
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(points), 0)::int AS n FROM character_exploration WHERE character_id = $1 AND location_key = ANY($2::text[])',
    [characterId, p.locations],
  );
  return rows[0].n;
}

/** Weather + mastery for where a character stands: the modifiers every wild action uses. */
export async function fieldConditions(db, characterId, locationKey, now = new Date()) {
  const province = provinceOf(locationKey);
  const weather = province ? weatherFor(province.key, now) : weatherFor(null, now);
  const points = province ? await provincePoints(db, characterId, province.key) : 0;
  const mastery = masteryRank(points);
  return { province, weather, mastery, points, lootBonus: 1 + mastery.rank * MASTERY_BONUS.loot };
}
