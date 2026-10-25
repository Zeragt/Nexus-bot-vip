import { stakes as S } from '../config/game.js';
import { xpLoss, rollDrop } from '../engine/stakes.js';
import { defaultRng } from '../engine/rng.js';
import { getSetting } from './settings.js';
import { addItem, removeItem } from './inventory.js';

/** Takes `pct`% of the XP inside the character's current level (levels are never lost). */
export async function applyXpLoss(db, characterId, pct) {
  const row = (await db.query('SELECT xp FROM characters WHERE id = $1 FOR UPDATE', [characterId])).rows[0];
  if (!row) return 0;
  const lost = xpLoss(Number(row.xp), pct);
  if (lost > 0) await db.query('UPDATE characters SET xp = xp - $2, xp_lost = xp_lost + $2 WHERE id = $1', [characterId, lost]);
  return lost;
}

export async function lossPct(kind) {
  if (kind === 'pvp') return Number(await getSetting('pvp_xp_loss_pct', S.pvpXpLossPct)) || 0;
  return Number(await getSetting('pve_xp_loss_pct', S.pveXpLossPct)) || 0;
}

/**
 * Duel stakes: the loser loses XP and may drop one bag item to the winner.
 * A guardian charm in the loser's bag shatters instead of the item falling (it only
 * breaks when an item would actually have dropped).
 * Returns { xpLost, item: {name, rarity, chance} | null, protected, chance, roll }.
 */
export async function applyPvpStakes(db, { winnerId, loserId, sessionId }, rng = defaultRng) {
  const result = { xpLost: 0, item: null, protected: false, chance: null, roll: null, rolled: null };
  result.xpLost = await applyXpLoss(db, loserId, await lossPct('pvp'));
  if (await getSetting('pvp_item_drop_enabled', true)) {
    const stacks = (
      await db.query(
        `SELECT i.id, i.key, i.name_ar, i.type, i.rarity, i.tradeable, ii.quantity FROM inventory_items ii JOIN items i ON i.id = ii.item_id
         WHERE ii.character_id = $1 ORDER BY i.id FOR UPDATE OF ii`,
        [loserId],
      )
    ).rows;
    const drop = rollDrop(stacks, rng);
    if (drop) {
      result.chance = drop.chance;
      result.roll = drop.roll;
      result.rolled = { name: drop.stack.name_ar, rarity: drop.stack.rarity };
      if (drop.dropped) {
        const charm = stacks.find((s) => s.key === S.guardianCharm);
        if (charm) {
          await removeItem(db, loserId, charm.id, 1);
          result.protected = true;
        } else {
          await removeItem(db, loserId, drop.stack.id, 1);
          await addItem(db, winnerId, drop.stack.id, 1);
          result.item = { id: drop.stack.id, key: drop.stack.key, name: drop.stack.name_ar, rarity: drop.stack.rarity, chance: drop.chance };
        }
      }
    }
  }
  await db.query(
    `INSERT INTO pvp_stakes (session_id, winner_id, loser_id, xp_lost, item_id, item_rarity, drop_chance, roll, protected)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [sessionId, winnerId, loserId, result.xpLost, result.item?.id ?? null, result.item?.rarity ?? null, result.chance, result.roll, result.protected],
  );
  return result;
}
