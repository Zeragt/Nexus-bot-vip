import { progression, vitals, STATS } from '../config/game.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Total XP accumulated across all previous levels — handy for leaderboards. */
export function totalXpForLevel(level) {
  let total = 0;
  for (let l = 1; l < level; l++) total += progression.xpToNext(l);
  return total;
}

/**
 * Adds XP and resolves any number of level ups.
 * XP is stored as "progress inside the current level".
 */
export function applyXp({ level, xp }, amount) {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('XP amount must be a non-negative number');
  let lvl = level;
  let cur = xp + Math.floor(amount);
  let statPoints = 0;
  let skillPoints = 0;
  let nxBonus = 0;
  while (lvl < progression.maxLevel && cur >= progression.xpToNext(lvl)) {
    cur -= progression.xpToNext(lvl);
    lvl += 1;
    statPoints += progression.statPointsPerLevel;
    if (lvl % progression.skillPointsEvery === 0) skillPoints += 1;
    nxBonus += progression.levelUpNx(lvl);
  }
  if (lvl >= progression.maxLevel) cur = Math.min(cur, progression.xpToNext(lvl) - 1);
  return { level: lvl, xp: cur, levelsGained: lvl - level, statPoints, skillPoints, nxBonus };
}

/** Sums stat bonuses granted by equipped items onto base stats. */
export function effectiveStats(base, equippedItems = []) {
  const out = {};
  for (const s of STATS) out[s] = base[s] ?? 0;
  let attack = 0;
  let armor = 0;
  for (const item of equippedItems) {
    const st = item.stats || {};
    for (const s of STATS) if (st[s]) out[s] += st[s];
    attack += st.attack || 0;
    armor += st.armor || 0;
  }
  return { ...out, attack, armor };
}

export function maxVitals(level, stats) {
  return {
    maxHp: vitals.maxHp(level, stats.endurance),
    maxEnergy: vitals.maxEnergy(level, stats.endurance, stats.intelligence),
  };
}

/**
 * HP and energy regenerate lazily from the last time they were written (`vitals_at`),
 * so no timer is needed and restarts lose nothing.
 */
export function regenerate({ hp, energy, vitalsAt }, { maxHp, maxEnergy }, now = new Date()) {
  const minutes = Math.max(0, (now - new Date(vitalsAt)) / 60000);
  return {
    hp: clamp(Math.floor(hp + minutes * vitals.hpRegenPerMinute * maxHp), 0, maxHp),
    energy: clamp(Math.floor(energy + minutes * vitals.energyRegenPerMinute * maxEnergy), 0, maxEnergy),
  };
}

export function levelProgress(level, xp) {
  const need = progression.xpToNext(level);
  return { need, ratio: need ? clamp(xp / need, 0, 1) : 1 };
}
