import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { factionRanks } from '../config/game.js';
import { audit } from './audit.js';

export function rankFor(rep) {
  let rank = factionRanks[0];
  for (const r of factionRanks) if (rep >= r.min) rank = r;
  return rank;
}

export function nextRank(rep) {
  return factionRanks.find((r) => r.min > rep) ?? null;
}

/** Adjusts a character's standing with a faction (inside a transaction). */
export async function adjustFactionRep(db, characterId, factionId, delta) {
  if (!factionId || !delta) return;
  await db.query(
    `INSERT INTO character_factions (character_id, faction_id, reputation) VALUES ($1, $2, GREATEST(-10000, LEAST(100000, $3)))
     ON CONFLICT (character_id, faction_id) DO UPDATE SET reputation = GREATEST(-10000, LEAST(100000, character_factions.reputation + $3))`,
    [characterId, factionId, delta],
  );
}

export async function listFactions() {
  const { rows } = await getPool().query('SELECT * FROM factions ORDER BY id');
  return rows;
}

export async function getFaction(keyOrName) {
  const { rows } = await getPool().query('SELECT * FROM factions WHERE key = $1 OR name_ar = $1 OR lower(name) = lower($1) LIMIT 1', [keyOrName]);
  return rows[0] ?? null;
}

export async function standings(characterId) {
  const { rows } = await getPool().query(
    `SELECT f.*, COALESCE(cf.reputation, 0) AS rep,
            (SELECT count(*)::int FROM character_factions x WHERE x.faction_id = f.id AND x.reputation >= 100) AS allies
     FROM factions f LEFT JOIN character_factions cf ON cf.faction_id = f.id AND cf.character_id = $1
     ORDER BY f.id`,
    [characterId],
  );
  return rows.map((f) => ({ ...f, rank: rankFor(f.rep), next: nextRank(f.rep) }));
}

export async function createFaction({ key, name, nameAr, description, color }, { actorId }) {
  if (!/^[a-z0-9_]{2,40}$/.test(key)) throw new UserError('المفتاح يجب أن يكون بالإنجليزية الصغيرة والأرقام و _ فقط');
  const { rows } = await getPool().query('INSERT INTO factions (key, name, name_ar, description, color) VALUES ($1,$2,$3,$4,$5) RETURNING *', [
    key,
    name,
    nameAr,
    description ?? '',
    color ?? '#22d3ee',
  ]);
  await audit({ actorId, action: 'admin_action', targetType: 'faction', targetId: key, after: rows[0], reason: 'faction created' });
  return rows[0];
}

export async function adminSetRep(characterId, factionId, delta, { actorId, reason }) {
  return tx(async (db) => {
    await adjustFactionRep(db, characterId, factionId, delta);
    await audit(
      { actorId, action: 'admin_action', targetType: 'character', targetId: characterId, after: { factionId, delta }, reason: reason ?? 'faction reputation' },
      db,
    );
  });
}
