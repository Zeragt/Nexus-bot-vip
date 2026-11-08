/**
 * قواعد التقدم: الخبرة، المستويات، إحصاءات اللاعب والوحوش، الأدوات والجوائز.
 */
import { randomUUID } from 'node:crypto';
import {
  CLASSES, REGIONS, STORY, MONSTER_SKILLS, ARCHETYPES, RARITIES, ITEM_BASES, TIER_SUFFIX,
  MAX_LEVEL, BAG_LIMIT, BASIC_ATTACK,
} from './content.js';

export const classByKey = Object.fromEntries(CLASSES.map((c) => [c.key, c]));
export const regionById = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
export const chapterById = Object.fromEntries(STORY.map((c) => [c.id, c]));

/** Math.random by default; tests inject a seeded one. */
export const rng = { next: Math.random };
export const roll = (p) => rng.next() < p;
export const pick = (arr) => arr[Math.floor(rng.next() * arr.length)];
export const randInt = (a, b) => a + Math.floor(rng.next() * (b - a + 1));

// ───────────── الخبرة ─────────────
export function xpToNext(level) {
  return Math.round(40 * level ** 1.55 + 60);
}

/** يضيف خبرة ويعيد عدد المستويات المكتسبة. */
export function addXp(p, amount) {
  let ups = 0;
  if (p.level >= MAX_LEVEL) return 0;
  p.xp += Math.max(0, Math.round(amount));
  while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    ups += 1;
  }
  if (p.level >= MAX_LEVEL) p.xp = 0;
  return ups;
}

/** خسارة نسبة من خبرة المستوى الحالي (لا يهبط المستوى أبداً). */
export function loseXp(p, fraction) {
  const lost = Math.floor(p.xp * fraction);
  p.xp -= lost;
  return lost;
}

// ───────────── اللاعب ─────────────
export function newPlayer({ id, name, avatar, classKey }) {
  if (!classByKey[classKey]) throw new Error('فئة غير معروفة');
  return {
    id,
    name: String(name || 'مغامر').slice(0, 24),
    avatar: avatar || null,
    classKey,
    level: 1,
    xp: 0,
    gold: 120,
    bag: [],
    equip: { weapon: null, armor: null, charm: null },
    potions: { potion_small: 3, potion_big: 0, ether: 1 },
    story: { done: [] },
    stats: { kills: 0, bosses: 0, duelsWon: 0, duelsLost: 0, deaths: 0 },
    rating: 1000,
    dailies: null,
    login: { last: null, streak: 0 },
    createdAt: Date.now(),
  };
}

export function unlockedSkills(p) {
  return classByKey[p.classKey].skills.filter((s) => s.unlock <= p.level);
}

export function gearBonus(p) {
  const b = { hp: 0, atk: 0, def: 0, spd: 0, crit: 0, mp: 0 };
  for (const it of Object.values(p.equip)) {
    if (!it) continue;
    for (const [k, v] of Object.entries(it.stats)) b[k] += v;
  }
  return b;
}

export function playerStats(p) {
  const c = classByKey[p.classKey];
  const g = gearBonus(p);
  const lv = p.level - 1;
  const s = {};
  for (const k of Object.keys(c.base)) s[k] = Math.round(c.base[k] + c.growth[k] * lv + g[k]);
  return s;
}

/** يحوّل لاعباً إلى مقاتل جاهز لمحرك القتال. */
export function playerFighter(p, { potions = true } = {}) {
  const c = classByKey[p.classKey];
  const s = playerStats(p);
  return {
    id: p.id,
    kind: 'player',
    name: p.name,
    icon: c.icon,
    color: c.color,
    avatar: p.avatar,
    level: p.level,
    classKey: c.key,
    maxHp: s.hp, hp: s.hp, maxMp: s.mp, mp: Math.round(s.mp * 0.5),
    atk: s.atk, def: s.def, spd: s.spd, crit: s.crit,
    passive: c.passive,
    skills: [BASIC_ATTACK, ...unlockedSkills(p)],
    potions: potions ? { ...p.potions } : {},
    potionsUsed: 0,
  };
}

// ───────────── الوحوش ─────────────
export const MON = { hp0: 90, hpL: 34, atk0: 8, atkL: 2.4 };
export const BOSS_MULT = { hp: 2.8, atk: 0.95, def: 1.1 };
export const ELITE_MULT = { hp: 1.8, atk: 1.05, def: 1.05 };
export function monsterFighter(def, level, { elite = false, boss = false, name } = {}) {
  const a = ARCHETYPES[def.type];
  const mult = boss ? BOSS_MULT : elite ? ELITE_MULT : { hp: 1, atk: 1, def: 1 };
  const hp = Math.round((MON.hp0 + level * MON.hpL) * a.hp * mult.hp);
  return {
    id: `${def.id}:${randomUUID().slice(0, 6)}`,
    kind: boss ? 'boss' : elite ? 'elite' : 'monster',
    defId: def.id,
    name: name || def.name,
    icon: def.icon,
    color: def.color,
    level,
    maxHp: hp, hp, maxMp: 100, mp: 100,
    atk: Math.round((MON.atk0 + level * MON.atkL) * a.atk * mult.atk),
    def: Math.round((4 + level * 1.7) * a.def * mult.def),
    spd: Math.round((8 + level * 0.4) * a.spd),
    crit: boss ? 10 : 6,
    passive: boss ? { enrage: 0.5 } : {},
    skills: [BASIC_ATTACK, ...def.skills.map((k) => MONSTER_SKILLS[k])],
    ai: true,
  };
}

export function regionUnlocked(p, region) {
  return p.level >= region.levels[0];
}

export function highestRegionIndex(p) {
  let idx = 0;
  REGIONS.forEach((r, i) => { if (regionUnlocked(p, r)) idx = i; });
  return idx;
}

export function chapterUnlocked(p, ch) {
  const i = STORY.indexOf(ch);
  if (i === 0) return true;
  const prev = STORY[i - 1];
  return p.story.done.includes(prev.id) && p.level >= regionById[ch.region].levels[0];
}

/** مستوى الوحش: ضمن نطاق المنطقة، وقريب من مستوى اللاعب (لا يزيد عنه بأكثر من 1). */
export function monsterLevel(region, playerLevel = region.levels[1]) {
  const hi = Math.max(region.levels[0], Math.min(region.levels[1], playerLevel + 1));
  const lo = Math.max(region.levels[0], Math.min(hi, playerLevel - 2));
  return randInt(lo, hi);
}

// ───────────── الأدوات ─────────────
export function rollRarity({ boss = false, luck = 0 } = {}) {
  const table = boss
    ? [['secret', 0.002], ['mythic', 0.03], ['legendary', 0.1], ['epic', 0.3], ['rare', 0.4], ['common', 1]]
    : [['secret', 0.001], ['mythic', 0.009], ['legendary', 0.03], ['epic', 0.09], ['rare', 0.27], ['common', 1]];
  let acc = 0;
  const r = rng.next();
  for (const [k, p] of table) {
    acc += p * (1 + luck);
    if (r < acc) return k;
  }
  return 'common';
}

export function makeItem(tier, rarity, slot) {
  slot = slot || pick(['weapon', 'armor', 'charm']);
  const base = pick(ITEM_BASES[slot]);
  const m = RARITIES[rarity].mult;
  const ro = RARITIES[rarity].order;
  let stats;
  if (slot === 'weapon') stats = { atk: Math.round((4 + tier * 5) * m), crit: Math.round(ro * 1.5) };
  else if (slot === 'armor') stats = { hp: Math.round((20 + tier * 28) * m), def: Math.round((3 + tier * 3.5) * m) };
  else stats = { spd: Math.round((1 + tier * 0.8) * m), crit: Math.round((2 + tier) * m * 0.6), mp: Math.round((5 + tier * 4) * m) };
  for (const k of Object.keys(stats)) if (!stats[k]) delete stats[k];
  return {
    uid: randomUUID(),
    slot,
    base: base.id,
    icon: base.icon,
    name: `${base.name} ${TIER_SUFFIX[tier]}`.trim(),
    tier,
    rarity,
    stats,
  };
}

export function itemPower(it) {
  if (!it) return 0;
  const s = it.stats;
  return (s.atk || 0) * 3 + (s.hp || 0) * 0.3 + (s.def || 0) * 2 + (s.spd || 0) * 3 + (s.crit || 0) * 2 + (s.mp || 0) * 0.5;
}

export function addToBag(p, item) {
  if (p.bag.length >= BAG_LIMIT) return false;
  p.bag.push(item);
  return true;
}

// ───────────── الجوائز ─────────────
export function pveRewards(enemy) {
  const L = enemy.level;
  const mul = enemy.kind === 'boss' ? 5 : enemy.kind === 'elite' ? 2.2 : 1;
  return {
    xp: Math.round((14 + L * 7) * mul),
    gold: Math.round((6 + L * 3) * mul),
  };
}

export function lootChance(enemy) {
  return enemy.kind === 'boss' ? 1 : enemy.kind === 'elite' ? 0.6 : 0.28;
}

/** الدرجة (المنطقة) التي تنتمي لها أداة تسقط من وحش بمستوى معيّن. */
export function tierForLevel(level) {
  let t = 1;
  REGIONS.forEach((r, i) => { if (level >= r.levels[0]) t = i + 1; });
  return t;
}
