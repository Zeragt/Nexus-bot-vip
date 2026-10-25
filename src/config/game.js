// Every balance number in Nexus lives here so it can be tuned without touching logic.

export const STATS = ['strength', 'defense', 'agility', 'intelligence', 'endurance', 'luck'];

export const STAT_LABELS = {
  strength: 'القوة',
  defense: 'الدفاع',
  agility: 'الرشاقة',
  intelligence: 'الذكاء',
  endurance: 'التحمل',
  luck: 'الحظ',
};

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
export const RARITY_LABELS = {
  common: 'عادي',
  uncommon: 'غير شائع',
  rare: 'نادر',
  epic: 'ملحمي',
  legendary: 'أسطوري',
  mythic: 'خرافي',
  secret: 'سري',
};

export const ITEM_TYPES = ['weapon', 'armor', 'accessory', 'consumable', 'quest', 'material', 'misc'];
export const ITEM_TYPE_LABELS = {
  weapon: 'سلاح',
  armor: 'درع',
  accessory: 'إكسسوار',
  consumable: 'مستهلك',
  quest: 'غرض مهمة',
  material: 'مادة',
  misc: 'متنوع',
};
export const SLOT_LABELS = { weapon: 'السلاح', armor: 'الدرع', accessory: 'الإكسسوار' };

export const SKILL_TYPE_LABELS = {
  attack: 'هجوم',
  defense: 'دفاع',
  healing: 'شفاء',
  utility: 'دعم',
  passive: 'سلبية',
  special: 'خاصة',
};

export const DIFFICULTY_LABELS = { easy: 'سهلة', normal: 'عادية', hard: 'صعبة', elite: 'نخبوية', legendary: 'أسطورية' };
export const DIFFICULTY_STARS = { easy: 1, normal: 2, hard: 3, elite: 4, legendary: 5 };

export const progression = {
  maxLevel: 100,
  /** XP needed to go from `level` to `level + 1`. */
  xpToNext: (level) => Math.round(100 * Math.pow(level, 1.5)),
  statPointsPerLevel: 3,
  skillPointsEvery: 2,
  /** NX bonus on level up. */
  levelUpNx: (level) => 25 * level,
  baseStats: { strength: 5, defense: 5, agility: 5, intelligence: 5, endurance: 5, luck: 5 },
  startingNx: 150,
};

export const vitals = {
  maxHp: (level, endurance) => 100 + endurance * 10 + (level - 1) * 8,
  maxEnergy: (level, endurance, intelligence) => 60 + endurance * 3 + intelligence * 2 + (level - 1) * 2,
  /** Fraction of max regenerated per minute outside combat. */
  hpRegenPerMinute: 0.01,
  energyRegenPerMinute: 0.015,
};

export const economy = {
  maxTransfer: 1_000_000,
  payTaxRate: 0,
  daily: { base: 100, streakBonus: 25, maxStreak: 7, streakWindowHours: 48 },
  guildCreateCost: 500,
  guildCreateMinLevel: 3,
  carryCapacity: (strength) => 60 + strength * 5,
};

export const combat = {
  turnSeconds: 90,
  maxMissedTurns: 2,
  challengeSeconds: 120,
  energyRegenPerTurn: 6,
  defendDamageMultiplier: 0.5,
  defendEnergyGain: 12,
  baseCritChance: 0.05,
  critPerLuck: 0.004,
  critPerAgility: 0.0015,
  maxCritChance: 0.4,
  critMultiplier: 1.6,
  baseDodge: 0.03,
  dodgePerAgilityDiff: 0.006,
  maxDodge: 0.25,
  variance: 0.1,
  maxTurns: 60,
  fleeBase: 0.4,
  fleePerAgilityDiff: 0.01,
  pvpXp: (loserLevel) => 20 + loserLevel * 5,
  pvpDailyRewardCap: 6,
  pvpSameOpponentCooldownHours: 6,
  huntEnergyCost: 10,
  huntCooldownSeconds: 120,
};

/**
 * PvP stakes (v3). The loser of a duel loses a share of the XP inside their current level and
 * may drop ONE random bag item to the winner. Only one stack is picked, then this rarity chance
 * is rolled, so rare things are both less likely to be picked out and much less likely to fall.
 * Percentages can be overridden in-game: settings pvp_xp_loss_pct / pve_xp_loss_pct.
 */
export const stakes = {
  pvpXpLossPct: 30,
  pveXpLossPct: 10,
  dropChance: {
    common: 0.5,
    uncommon: 0.35,
    rare: 0.2,
    epic: 0.08,
    legendary: 0.025,
    mythic: 0.005,
    secret: 0.0001,
  },
  /** Items that never drop (quest items can't be traded). */
  neverDropTypes: ['quest'],
  guardianCharm: 'guardian_charm',
};

/** Daily / weekly quests (v3). */
export const dailies = {
  slots: 6,
  weeklySlots: 3,
  /** NX price of the n-th paid reroll of the day (n starts at 1). */
  rerollCost: (n) => 150 * n,
  maxRerolls: 6,
  /** Streak rewards paid when the day's board is fully claimed. */
  streakRewards: {
    3: { nx: 500 },
    7: { nx: 1500, items: [['guardian_charm', 1]] },
    14: { nx: 4000, items: [['weekly_chest', 1]] },
    30: { nx: 12000, items: [['relic_coffer', 1]] },
  },
};

/** Exploration and gathering (v3). */
export const exploration = {
  exploreEnergy: 8,
  exploreCooldownSeconds: 25,
  gatherEnergy: 5,
  gatherCooldownSeconds: 40,
  zoneMoveSeconds: 10,
};

export const cooldowns = {
  jobChangeHours: 12,
  travelSeconds: 30,
  rpXp: { minLength: 40, cooldownSeconds: 90, dailyCap: 150, base: 3, perHundredChars: 2, maxPerMessage: 10 },
};

export const factionRanks = [
  { min: -Infinity, label: 'عدائي', color: '#f43f5e' },
  { min: -100, label: 'غير ودود', color: '#fb923c' },
  { min: 0, label: 'محايد', color: '#94a3b8' },
  { min: 100, label: 'ودود', color: '#34d399' },
  { min: 500, label: 'محترم', color: '#22d3ee' },
  { min: 1500, label: 'مُبجّل', color: '#a78bfa' },
  { min: 4000, label: 'أسطورة', color: '#f5b942' },
];

export const guildProgression = {
  xpToNext: (level) => 1000 * level,
  maxMembers: (level) => 15 + level * 5,
};

export const ui = {
  pageSize: { inventory: 12, leaderboard: 10, quests: 5, list: 8 },
  componentTtlMs: 15 * 60 * 1000,
};
