import { describe, it, expect } from 'vitest';
import { xpLoss, dropChance, pickDrop } from '../../src/engine/defeat.js';
import { periodKey, nextReset, previousDailyKey, rollContracts, progressFor, contractRewards } from '../../src/engine/dailies.js';
import { DAILY_TEMPLATES } from '../../src/content/dailyQuests.js';
import { ALL_BOSSES, STORY_BOSSES, lookSignature } from '../../src/content/bossRegistry.js';
import { WORLD_BOSSES, BOSS_SECRETS } from '../../src/content/bosses.js';
import { REGIONS, ALL_LANDMARKS } from '../../src/content/regions.js';
import { RECIPES } from '../../src/content/recipes.js';
import { CONTENT_ITEMS, CONTENT_ITEM_BY_KEY, CHESTS } from '../../src/content/items.js';
import { SHOP_STOCK } from '../../src/content/shops.js';
import { WORLD_BOSS_TUNE } from '../../src/content/story/balance.js';
import { MONSTER_SKILLS } from '../../src/engine/enemies.js';
import { MONSTER_ARCHETYPES } from '../../src/render/sprites.js';
import { createRng } from '../../src/engine/rng.js';
import { defeat as DEFEAT, RARITIES } from '../../src/config/game.js';
import { spawnWorldBoss, bossBlockers, worldBossRewards } from '../../src/services/bosses.js';
import { renderContracts, renderBossCard, renderRegion, renderBossHall } from '../../src/render/index.js';
import { commandPayloads } from '../../src/commands/index.js';

// Every place in the game (v2 seeds + the ten returned worlds of migration 0004).
const LOCATIONS = Object.keys(REGIONS);
// Items seeded by SQL migrations that content may also reference.
const SEEDED = new Set([
  'health_potion',
  'greater_potion',
  'energy_tonic',
  'nexus_coffee',
  'antidote',
  'glow_herb',
  'iron_ore',
  'star_shard',
  'ancient_relic',
  'old_map',
  'wolf_pelt',
  'crystal_rose',
  'lucky_charm',
  'iron_sword',
  'leather_armor',
  'hunter_bow',
  'arcane_staff',
  'shadow_dagger',
  'chainmail',
  'guard_plate',
  'runic_blade',
  'storm_ring',
  'starlight_robe',
  'cyan_pendant',
  'sealed_letter',
  'rusty_sword',
  'stone_elixir',
  'fury_elixir',
  'starforged_blade',
  'void_reaver',
  'rift_core',
]);
const itemExists = (k) => Boolean(CONTENT_ITEM_BY_KEY[k]) || SEEDED.has(k);
const isImage = (buf) => Buffer.isBuffer(buf) && buf.length > 1000;

describe('defeat rules', () => {
  it('takes 30% of the level progress in a duel and 10% against monsters', () => {
    expect(DEFEAT.pvpXpLoss).toBe(0.3);
    expect(xpLoss(1000, 'pvp')).toBe(300);
    expect(xpLoss(1000, 'pve')).toBe(100);
    expect(xpLoss(0, 'pvp')).toBe(0);
  });

  it('makes rarer things far harder to lose, and a secret item 1 in 10,000', () => {
    expect(dropChance('secret')).toBe(0.0001);
    const order = RARITIES.map(dropChance);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeLessThan(order[i - 1]);
  });

  it('never drops quest or untradeable items, and rarely drops a secret', () => {
    const bag = [
      { key: 'letter', rarity: 'common', quantity: 1, type: 'quest' },
      { key: 'bound', rarity: 'common', quantity: 3, tradeable: false },
      { key: 'heart', rarity: 'secret', quantity: 1 },
    ];
    let secret = 0;
    for (let s = 0; s < 5000; s++) {
      const d = pickDrop(bag, createRng(s));
      if (d) {
        expect(d.key).toBe('heart');
        secret++;
      }
    }
    expect(secret).toBeLessThan(5);
    const commons = [{ key: 'a', rarity: 'common', quantity: 5 }];
    let dropped = 0;
    for (let s = 0; s < 1000; s++) if (pickDrop(commons, createRng(s))) dropped++;
    expect(dropped).toBeGreaterThan(400);
    expect(dropped).toBeLessThan(600);
  });
});

describe('daily contracts', () => {
  it('changes day at midnight Baghdad time and weeks on Monday', () => {
    expect(periodKey('daily', new Date('2026-10-25T20:59:00Z'))).toBe('d:2026-10-25');
    expect(periodKey('daily', new Date('2026-10-25T21:00:00Z'))).toBe('d:2026-10-26');
    expect(periodKey('weekly', new Date('2026-10-25T12:00:00Z'))).toBe('w:2026-10-19');
    expect(periodKey('weekly', new Date('2026-10-25T21:30:00Z'))).toBe('w:2026-10-26');
    expect(nextReset('daily', new Date('2026-10-25T12:00:00Z')).toISOString()).toBe('2026-10-25T21:00:00.000Z');
    expect(previousDailyKey(new Date('2026-10-25T12:00:00Z'))).toBe('d:2026-10-24');
  });

  const places = { hunt: [{ key: 'forest', nameAr: 'الغابة' }], gather: [{ key: 'lake', nameAr: 'البحيرة' }], explore: [{ key: 'ruins', nameAr: 'الأطلال' }] };
  const ctx = (period, extra = {}) => ({ characterId: 7, period, scope: 'daily', slots: 5, level: 30, chapter: 10, places, ...extra });

  it('draws a stable board per day, different across days, always with a hard contract', () => {
    const a = rollContracts(ctx('d:2026-10-25'));
    const again = rollContracts(ctx('d:2026-10-25'));
    expect(again).toEqual(a);
    expect(a).toHaveLength(5);
    expect(new Set(a.map((c) => c.template)).size).toBe(5);
    expect(a.some((c) => c.tier === 'hard')).toBe(true);
    const days = new Set();
    for (let d = 1; d <= 10; d++)
      days.add(
        rollContracts(ctx(`d:2026-11-${String(d).padStart(2, '0')}`))
          .map((c) => c.template)
          .join(),
      );
    expect(days.size).toBeGreaterThan(5);
  });

  it('respects story locks, places and exclusions', () => {
    for (let s = 0; s < 40; s++) {
      const board = rollContracts(ctx(`d:x${s}`, { chapter: 0, places: { hunt: [], gather: [], explore: [] } }));
      for (const c of board) {
        expect(c.template).not.toBe('boss_any');
        expect(c.target).toBeNull();
      }
    }
    const ex = rollContracts(ctx('d:2026-10-25', { exclude: DAILY_TEMPLATES.map((t) => t.key).slice(0, 15) }));
    for (const c of ex) expect(DAILY_TEMPLATES.slice(0, 15).map((t) => t.key)).not.toContain(c.template);
  });

  it('counts only matching events and places', () => {
    const c = { event: 'defeat', target: 'forest' };
    expect(progressFor(c, 'defeat', { location: 'forest' })).toBe(1);
    expect(progressFor(c, 'defeat', { location: 'lake' })).toBe(0);
    expect(progressFor(c, 'gather', { location: 'forest' })).toBe(0);
    expect(progressFor({ event: 'shop_spend', target: null }, 'shop_spend', { amount: 250 })).toBe(250);
  });

  it('pays weekly contracts four times a daily one, and grows with level', () => {
    expect(contractRewards('hard', 50, 'weekly').xp).toBe(contractRewards('hard', 50, 'daily').xp * 4);
    expect(contractRewards('easy', 150).xp).toBeGreaterThan(contractRewards('easy', 10).xp * 10);
  });
});

describe('the hundred bosses', () => {
  it('has exactly 100 bosses: 55 story + 45 region, with unique keys and looks', () => {
    expect(STORY_BOSSES).toHaveLength(55);
    expect(WORLD_BOSSES).toHaveLength(45);
    expect(ALL_BOSSES).toHaveLength(100);
    expect(new Set(ALL_BOSSES.map((b) => b.key)).size).toBe(100);
    expect(new Set(ALL_BOSSES.map(lookSignature)).size).toBe(100);
    expect(ALL_BOSSES.map((b) => b.number)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('only references real places, skills, archetypes and items', () => {
    for (const b of WORLD_BOSSES) {
      expect(LOCATIONS, b.key).toContain(b.location);
      expect(MONSTER_ARCHETYPES, b.key).toContain(b.archetype);
      for (const s of b.skills) expect(MONSTER_SKILLS[s], `${b.key} ${s}`).toBeTruthy();
      for (const [k] of b.loot) expect(itemExists(k), `${b.key} ${k}`).toBe(true);
      expect(CONTENT_ITEM_BY_KEY[b.trophy], b.trophy).toBeTruthy();
      expect(WORLD_BOSS_TUNE[b.key], b.key).toBeGreaterThan(0);
    }
    for (const [key, list] of Object.entries(BOSS_SECRETS)) {
      expect(WORLD_BOSSES.some((b) => b.key === key)).toBe(true);
      for (const [k, chance] of list) {
        expect(CONTENT_ITEM_BY_KEY[k]?.rarity, k).toBe('secret');
        expect(chance).toBeLessThan(0.05);
      }
    }
  });

  it('spawns region bosses at their level and explains why one cannot be fought', () => {
    const b = WORLD_BOSSES.find((x) => x.key === 'rime_sovereign');
    const e = spawnWorldBoss(b, createRng(3));
    expect(e.boss).toBe(true);
    expect(e.level).toBeGreaterThanOrEqual(b.level);
    expect(bossBlockers(b, { level: 1, chapter: 0, here: 'forest', record: null })).toHaveLength(3);
    expect(bossBlockers(b, { level: b.level, chapter: 30, here: b.location, record: null })).toEqual([]);
    const cooling = { kills: 1, last_fight_at: new Date().toISOString() };
    expect(bossBlockers(b, { level: b.level, chapter: 30, here: b.location, record: cooling })).toHaveLength(1);
    expect(worldBossRewards(b, true).xp).toBe(worldBossRewards(b, false).xp * 2);
  });
});

describe('regions, recipes and items', () => {
  it('gives every place its own content, locked by story chapters', () => {
    expect(LOCATIONS).toHaveLength(30);
    for (const [key, r] of Object.entries(REGIONS)) {
      expect(r.theme, key).toBeTruthy();
      expect(r.events.length, key).toBeGreaterThanOrEqual(3);
      for (const [k] of r.gather) expect(itemExists(k), `${key} ${k}`).toBe(true);
      for (const e of r.events) for (const [k] of e.items ?? []) expect(itemExists(k), `${key} ${k}`).toBe(true);
    }
    expect(new Set(ALL_LANDMARKS.map((l) => l.key)).size).toBe(ALL_LANDMARKS.length);
    expect(ALL_LANDMARKS.length).toBeGreaterThanOrEqual(60);
    expect(ALL_LANDMARKS.some((l) => l.chapter > 25)).toBe(true);
  });

  it('crafts only from items that exist', () => {
    expect(new Set(RECIPES.map((r) => r.key)).size).toBe(RECIPES.length);
    for (const r of RECIPES) {
      expect(itemExists(r.output), r.key).toBe(true);
      for (const [k, q] of r.materials) {
        expect(itemExists(k), `${r.key} ${k}`).toBe(true);
        expect(q).toBeGreaterThan(0);
      }
    }
  });

  it('keeps item content consistent', () => {
    expect(new Set(CONTENT_ITEMS.map((i) => i.key)).size).toBe(CONTENT_ITEMS.length);
    for (const it of CONTENT_ITEMS) expect(RARITIES, it.key).toContain(it.rarity);
    for (const [name, chest] of Object.entries(CHESTS)) for (const [k] of chest.items) expect(itemExists(k), `${name} ${k}`).toBe(true);
    for (const [npc, stock] of Object.entries(SHOP_STOCK))
      for (const [k, price] of stock) {
        expect(itemExists(k), `${npc} ${k}`).toBe(true);
        expect(price).toBeGreaterThan(0);
      }
    // Secret items are never sold.
    for (const stock of Object.values(SHOP_STOCK)) for (const [k] of stock) expect(CONTENT_ITEM_BY_KEY[k]?.rarity).not.toBe('secret');
  });
});

describe('new cards and commands', () => {
  it('renders the contracts board, boss card, region card and boss hall', async () => {
    const c = { slot: 0, title: 'اهزم 5 وحوش', tier: 'easy', progress: 2, required: 5, done: false, xp: 100, nx: 50 };
    expect(
      isImage(
        await renderContracts({
          name: 'x',
          daily: [c],
          weekly: [c],
          streak: 2,
          bestStreak: 3,
          clearedToday: false,
          dailyResetIn: '1',
          weeklyResetIn: '2',
          rerollCost: 0,
        }),
      ),
    ).toBe(true);
    const b = ALL_BOSSES[60];
    expect(
      isImage(
        await renderBossCard({
          boss: b,
          number: 61,
          kind: 'world',
          locationName: 'x',
          sealed: false,
          blockers: [],
          skills: ['a'],
          loot: [{ name: 'y', rarity: 'epic' }],
        }),
      ),
    ).toBe(true);
    expect(isImage(await renderBossCard({ boss: b, number: 61, kind: 'world', locationName: 'x', sealed: true }))).toBe(true);
    const region = {
      location: { key: 'bone_sea', nameAr: 'بحر العظام', danger: 10, requiredChapter: 43 },
      here: true,
      sealed: false,
      theme: 't',
      gather: [{ name: 'a', rarity: 'rare', chance: 0.3, locked: false }],
      landmarks: [{ name: 'l', found: true }],
      bosses: [{ name: 'b', level: 130, kills: 0, sealed: false }],
      monsters: ['m'],
      events: { open: 1, total: 2 },
      nextUnlock: Infinity,
      stats: { explored: 0, gathered: 0, hunted: 0, mastered: true },
    };
    expect(isImage(await renderRegion(region))).toBe(true);
    expect(
      isImage(
        await renderBossHall({
          bosses: ALL_BOSSES.slice(90).map((x, i) => ({ ...x, defeated: i % 2 === 0, sealed: i % 3 === 0 })),
          beaten: 5,
          total: 100,
          page: 10,
          pages: 10,
          filterLabel: 'all',
        }),
      ),
    ).toBe(true);
  }, 30_000);

  it('registers /daily, /boss, /region and /craft', () => {
    const names = commandPayloads().map((c) => c.name);
    for (const n of ['daily', 'boss', 'region', 'craft']) expect(names).toContain(n);
  });
});
