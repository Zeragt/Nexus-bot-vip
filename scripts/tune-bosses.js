// Tunes each story boss's HP so AI-played heroes of several classes win at a target rate,
// then rewrites src/content/story/balance.js.
// Usage: node scripts/tune-bosses.js [fightsPerClass] [--new] [--world]
//   --new    only tune chapters that have no entry yet (keeps the existing numbers)
//   --world  also tune the region bosses of /boss (WORLD_BOSS_TUNE)
import fs from 'node:fs';
import { CHAPTERS } from '../src/content/story/index.js';
import { WORLD_BOSSES } from '../src/content/bosses.js';
import { BOSS_TUNE, WORLD_BOSS_TUNE } from '../src/content/story/balance.js';
import { CLASSES, CLASS_BY_KEY } from '../src/content/classes.js';
import { skillsOfClass, signatureOf, classStatBonus, pathBonus } from '../src/content/classGen.js';
import { createFighter, createBattle, performAction, chooseAiAction, passivesFromSkills } from '../src/engine/combat.js';
import { effectiveStats, maxVitals } from '../src/engine/progression.js';
import { spawnEnemy } from '../src/engine/enemies.js';
import { createRng } from '../src/engine/rng.js';
import { progression as P, STATS } from '../src/config/game.js';
import { bossStatLevel } from '../src/services/story.js';

const args = process.argv.slice(2);
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 30);
// One class per category, so no single playstyle decides the numbers.
const SAMPLE = [...new Set(['warrior', 'shadow', 'ranger', 'arcane', 'divine', 'dark', 'tech', 'rift'].map((c) => CLASSES.find((x) => x.category === c).key))];
// Win rate an AI-played hero should reach: generous early, tense at the end. Humans do better.
// After the first saga (chapter 25) the target keeps easing down to 52% at the finale.
const target = (i) => (i <= 24 ? 0.82 - (i / 24) * 0.24 : 0.58 - ((i - 24) / 30) * 0.06);
// Region bosses are optional and repeatable: a little harder than the story at the same level.
const WORLD_TARGET = 0.6;

/** A hero built the way a typical player would be at that level: points in the class's stats, shop gear, a path from 15. */
export function typicalHero(classKey, L) {
  const cls = CLASS_BY_KEY[classKey];
  const pathKey = L >= 15 ? 'vanguard' : null;
  const sub = pathKey ? `${classKey}.${pathKey}` : null;
  const pts = (L - 1) * P.statPointsPerLevel;
  const base = { ...P.baseStats };
  base[cls.primary] += Math.round(pts * 0.55);
  base[cls.secondary] += Math.round(pts * 0.25);
  base.endurance += Math.round(pts * 0.2);
  const bonus = classStatBonus(classKey, sub, L);
  const grown = Object.fromEntries(STATS.map((s) => [s, base[s] + (bonus[s] ?? 0)]));
  const gear = [
    { stats: { attack: Math.min(34, Math.round(4 + L * 0.35)) } },
    { stats: { armor: Math.min(15, Math.round(4 + L * 0.2)) } },
    { stats: { luck: L > 20 ? 4 : 0 } },
  ];
  const eff = effectiveStats(grown, gear);
  const { maxHp, maxEnergy } = maxVitals(L, eff);
  const own = skillsOfClass(classKey).filter((s) => s.requiredLevel <= L);
  const sig = sub ? signatureOf(classKey, pathKey).filter((s) => s.requiredLevel <= L) : [];
  const all = [...sig, ...own].map((s) => ({ ...s, name: s.nameAr, rank: 1 }));
  const actives = all
    .filter((s) => s.type !== 'passive')
    .sort((a, b) => (b.subclassKey ? 1 : 0) - (a.subclassKey ? 1 : 0) || b.requiredLevel - a.requiredLevel)
    .slice(0, 6);
  const skills = [...actives, ...all.filter((s) => s.type === 'passive')];
  return createFighter({
    id: 1,
    userId: 'sim',
    name: 'hero',
    level: L,
    hp: maxHp,
    maxHp,
    energy: maxEnergy,
    maxEnergy,
    stats: eff,
    skills,
    passives: passivesFromSkills(skills, pathBonus(sub)),
    items: { health_potion: { name: 'potion', qty: 2, heal: 50 + L * 4, energy: 0, cleanse: false } },
    ai: true,
  });
}

function winRate(ch, hpMult) {
  return winRateOf({ ...ch.boss, statMult: Math.min(1.06, Math.max(1, ch.boss.statMult ?? 1)) }, ch.level, ch.index, hpMult);
}

function winRateOf(template, level, seed, hpMult) {
  let wins = 0;
  for (const ck of SAMPLE) {
    for (let k = 0; k < N; k++) {
      const rng = createRng(k * 7919 + seed * 31 + ck.length);
      const boss = spawnEnemy({ ...template, hpMult }, { playerLevel: level, boss: true, statLevel: bossStatLevel(level) }, rng);
      let s = createBattle(typicalHero(ck, level), boss, rng);
      let guard = 0;
      while (!s.finished && guard++ < 400) s = performAction(s, chooseAiAction(s, rng), rng);
      if (s.winner === 0) wins++;
    }
  }
  return wins / (N * SAMPLE.length);
}

function search(rateAt, goal) {
  let lo = 0.3;
  let hi = 6;
  for (let it = 0; it < 8; it++) {
    const mid = (lo + hi) / 2;
    if (rateAt(mid) > goal) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

const entries = (o) =>
  Object.entries(o)
    .map(([k, v]) => `  ${k}: ${v},`)
    .join('\n');

if (import.meta.url === `file://${process.argv[1]}`) {
  const onlyNew = args.includes('--new');
  const tune = onlyNew ? { ...BOSS_TUNE } : {};
  for (const ch of CHAPTERS) {
    if (onlyNew && BOSS_TUNE[ch.key] != null) continue;
    // Same curve as bossHpMult in services/story.js.
    const curve = 1.5 + (Math.min(ch.index, 24) / 24) * 1.4 + Math.max(0, ch.index - 24) * 0.02;
    tune[ch.key] = search((m) => winRate(ch, curve * m), target(ch.index));
    const rate = winRate(ch, curve * tune[ch.key]);
    console.log(`${ch.key} L${ch.level} ${ch.boss.name}: x${tune[ch.key]} → ${(rate * 100).toFixed(0)}% (target ${(target(ch.index) * 100).toFixed(0)}%)`);
  }
  const world = { ...WORLD_BOSS_TUNE };
  if (args.includes('--world')) {
    WORLD_BOSSES.forEach((b, i) => {
      const curve = 1.25 + b.tier * 0.22; // worldBossHpMult in services/bosses.js
      const template = { ...b, statMult: 1 + b.tier * 0.01 };
      world[b.key] = search((m) => winRateOf(template, b.level, 1000 + i, curve * m), WORLD_TARGET);
      const rate = winRateOf(template, b.level, 1000 + i, curve * world[b.key]);
      console.log(`${b.key} L${b.level} ${b.name}: x${world[b.key]} → ${(rate * 100).toFixed(0)}%`);
    });
  }
  fs.writeFileSync(
    new URL('../src/content/story/balance.js', import.meta.url),
    `// Generated by scripts/tune-bosses.js. Per-boss HP correction on top of the saga curve.\nexport const BOSS_TUNE = {\n${entries(tune)}\n};\n\n// Per-boss HP correction for region bosses (scripts/tune-bosses.js --world).\nexport const WORLD_BOSS_TUNE = {\n${entries(world)}\n};\n`,
  );
}
