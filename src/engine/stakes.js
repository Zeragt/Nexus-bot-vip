/**
 * Pure PvP/PvE stakes rules (v3).
 *  - Losing costs a percentage of the XP inside the current level (never a level).
 *  - A duel loser may drop ONE bag item: one stack is picked at random, then its rarity's
 *    drop chance is rolled. A secret item falls with probability 0.0001.
 */
import { stakes as S } from '../config/game.js';

export function xpLoss(xp, pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return Math.floor(Math.max(0, Number(xp) || 0) * (p / 100));
}

export function dropChanceOf(rarity, table = S.dropChance) {
  return table[rarity] ?? table.common;
}

/** Stacks that may fall: tradeable, not quest items. Equipped gear is not in the bag. */
export function droppable(stacks) {
  return stacks.filter((s) => s.quantity > 0 && s.tradeable !== false && !S.neverDropTypes.includes(s.type) && s.key !== S.guardianCharm);
}

/**
 * Picks the stack and rolls the drop. Returns
 *  { stack, chance, roll, dropped } or null when the bag has nothing that can fall.
 */
export function rollDrop(stacks, rng, table = S.dropChance) {
  const pool = droppable(stacks);
  if (!pool.length) return null;
  const stack = rng.pick(pool);
  const chance = dropChanceOf(stack.rarity, table);
  const roll = rng.next();
  return { stack, chance, roll, dropped: roll < chance };
}
