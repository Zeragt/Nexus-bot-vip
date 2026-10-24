/**
 * Status effect registry. Adding a new effect means adding one entry here:
 * the combat engine only talks to effects through these hooks.
 *  - tick(target, effect): runs at the start of the affected fighter's turn, returns a log line or null
 *  - mods: multiplicative modifiers read by the damage formula
 *  - blocksAction / blocksSkills: crowd control
 */
export const EFFECTS = {
  poison: {
    name: 'سم',
    kind: 'debuff',
    color: '#84cc16',
    tick: (t, e) => dot(t, Math.max(3, Math.round(t.maxHp * 0.05 * e.potency)), 'السم'),
  },
  bleeding: {
    name: 'نزيف',
    kind: 'debuff',
    color: '#ef4444',
    tick: (t, e) => dot(t, Math.max(3, Math.round((6 + t.maxHp * 0.03) * e.potency)), 'النزيف'),
  },
  burn: {
    name: 'حرق',
    kind: 'debuff',
    color: '#f97316',
    mods: { defense: 0.85 },
    tick: (t, e) => dot(t, Math.max(3, Math.round(t.maxHp * 0.04 * e.potency)), 'الحرق'),
  },
  stun: { name: 'صعق', kind: 'debuff', color: '#facc15', blocksAction: true },
  freeze: { name: 'تجمد', kind: 'debuff', color: '#7dd3fc', blocksAction: true, mods: { defense: 1.15 } },
  silence: { name: 'إسكات', kind: 'debuff', color: '#c084fc', blocksSkills: true },
  slow: { name: 'إبطاء', kind: 'debuff', color: '#94a3b8', mods: { agility: 0.7 } },
  regeneration: {
    name: 'تجدد',
    kind: 'buff',
    color: '#34d399',
    tick: (t, e) => {
      const heal = Math.max(3, Math.round(t.maxHp * 0.06 * e.potency));
      const before = t.hp;
      t.hp = Math.min(t.maxHp, t.hp + heal);
      return t.hp > before ? `${t.name} يستعيد ${t.hp - before} صحة بفضل التجدد` : null;
    },
  },
  attack_up: { name: 'هجوم+', kind: 'buff', color: '#fb7185', mods: { attack: 1.25 } },
  defense_up: { name: 'دفاع+', kind: 'buff', color: '#60a5fa', mods: { defense: 1.3 } },
  haste: {
    name: 'تسارع',
    kind: 'buff',
    color: '#a7f3d0',
    mods: { agility: 1.35 },
    tick: (t) => {
      t.energy = Math.min(t.maxEnergy, t.energy + 5);
      return null;
    },
  },
  // The shield itself lives on the fighter (`shield`); the effect only tracks how long it lasts.
  barrier: { name: 'حاجز', kind: 'buff', color: '#93c5fd', onExpire: (t) => (t.shield = 0) },
  weaken: { name: 'إضعاف', kind: 'debuff', color: '#94a3b8', mods: { attack: 0.75 } },
  vulnerable: { name: 'انكشاف', kind: 'debuff', color: '#fda4af', mods: { defense: 0.7 } },
  blind: { name: 'عمى', kind: 'debuff', color: '#475569', missChance: 0.35 },
};

function dot(target, amount, label) {
  const dmg = Math.min(target.hp, amount);
  target.hp -= dmg;
  return `${target.name} يتلقى ${dmg} ضرر من ${label}`;
}

export function effectName(key) {
  return EFFECTS[key]?.name ?? key;
}

/** Product of all active modifiers for a stat (attack, defense, agility). */
export function modifier(fighter, stat) {
  let m = 1;
  for (const e of fighter.effects) {
    const def = EFFECTS[e.key];
    if (def?.mods?.[stat]) m *= def.mods[stat];
  }
  return m;
}

/** Chance that the fighter's own attacks miss (blindness). */
export function missChance(fighter) {
  let m = 0;
  for (const e of fighter.effects) m = Math.max(m, EFFECTS[e.key]?.missChance ?? 0);
  return m;
}

export function hasFlag(fighter, flag) {
  return fighter.effects.some((e) => EFFECTS[e.key]?.[flag]);
}

/** Applies or refreshes an effect (refresh keeps the longer duration). */
export function applyEffect(fighter, key, turns, potency = 1) {
  if (!EFFECTS[key] || turns <= 0) return false;
  const existing = fighter.effects.find((e) => e.key === key);
  if (existing) {
    existing.turns = Math.max(existing.turns, turns);
    existing.potency = Math.max(existing.potency, potency);
  } else {
    fighter.effects.push({ key, turns, potency });
  }
  return true;
}
