import { defeat as D } from '../config/game.js';

/**
 * Pure rules for what a defeat costs.
 *
 * XP: a fraction of the progress inside the current level. A defeat never removes a level,
 * so stat and skill points already spent stay valid.
 *
 * Items (player-vs-player challenges only): the bag is shuffled and each stack rolls its
 * rarity's chance in turn; the first stack that fails its roll loses one item to the winner.
 * Common things go easily, a secret relic almost never (1 in 10,000).
 */

export function xpLoss(currentXp, kind) {
  const rate = kind === 'pvp' ? D.pvpXpLoss : D.pveXpLoss;
  return Math.max(0, Math.floor(Number(currentXp) * rate));
}

export function dropChance(rarity) {
  return D.dropChance[rarity] ?? D.dropChance.common;
}

/**
 * bag: [{ itemId, key, name, rarity, quantity, tradeable, type }]
 * Returns the stack that loses one item, or null when every roll was survived.
 */
export function pickDrop(bag, rng) {
  const pool = bag.filter((s) => s.quantity > 0 && s.tradeable !== false && s.type !== 'quest');
  // Fisher–Yates with the seeded rng, so a fight can be replayed in tests.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const stack of pool) if (rng.chance(dropChance(stack.rarity))) return stack;
  return null;
}
