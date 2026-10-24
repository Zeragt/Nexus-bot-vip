import { grantXp } from './characters.js';
import { credit } from './economy.js';
import { addItem } from './inventory.js';
import { adjustFactionRep } from './factions.js';
import { checkAchievements } from './achievements.js';
import { addGuildXp } from './guilds.js';
import { getSetting } from './settings.js';

/**
 * Pays out a reward bundle inside the caller's transaction and returns a summary
 * the UI can render. Every reward source (quests, events, random events, combat) uses this.
 */
export async function grantRewards(
  db,
  characterId,
  { xp = 0, nx = 0, reputation = 0, factionId = null, factionRep = 0, items = [], kind = 'reward', note = null } = {},
) {
  const summary = { xp: 0, nx: 0, reputation: 0, items: [], level: null, unlocked: [] };
  if (xp > 0) {
    const res = await grantXp(db, characterId, xp);
    summary.xp = res.gained;
    if (res.levelsGained > 0) summary.level = res;
    await addGuildXp(db, characterId, Math.floor(res.gained / 10));
  }
  if (nx > 0) {
    const mult = Number(await getSetting('nx_multiplier', 1)) || 1;
    summary.nx = await credit(db, characterId, Math.floor(nx * mult), kind, note);
  }
  if (reputation) {
    await db.query('UPDATE characters SET reputation = reputation + $2 WHERE id = $1', [characterId, reputation]);
    summary.reputation = reputation;
  }
  if (factionId && factionRep) await adjustFactionRep(db, characterId, factionId, factionRep);
  for (const it of items) {
    if (!it.itemId || !(it.quantity > 0)) continue;
    await addItem(db, characterId, it.itemId, it.quantity);
    summary.items.push(it);
  }
  summary.unlocked = await checkAchievements(db, characterId);
  return summary;
}

/** Human-readable one-liner for a reward summary. */
export function describeRewards(s) {
  const parts = [];
  if (s.xp) parts.push(`+${s.xp} XP`);
  if (s.nx) parts.push(`+${s.nx} NX`);
  if (s.reputation) parts.push(`${s.reputation > 0 ? '+' : ''}${s.reputation} سمعة`);
  for (const it of s.items ?? []) parts.push(`${it.name ?? 'غرض'} x${it.quantity}`);
  return parts.join('  •  ');
}
