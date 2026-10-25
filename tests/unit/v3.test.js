import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/engine/rng.js';
import { xpLoss, dropChanceOf, droppable, rollDrop } from '../../src/engine/stakes.js';
import {
  dayKey,
  weekKey,
  periodEndsAt,
  previousDay,
  generateBoard,
  generateQuest,
  worldGoalFor,
  matches,
  nextStreak,
  DAILY_SLOTS,
  WEEKLY_SLOTS,
} from '../../src/engine/dailies.js';
import { rollExplore, rollGather, depthBoost, LINES, line } from '../../src/engine/explore.js';
import { stakes } from '../../src/config/game.js';
import { ZONES, ZONE_BY_KEY, PROVINCES, zonesOf, currentZone, zoneAccess, weatherFor, masteryRank, ELITES, DEPTH_UNLOCK } from '../../src/content/regions.js';
import { V3_ITEMS, V3_ITEM_BY_KEY, BOXES, SHOP_STOCK } from '../../src/content/items.js';
import { RECIPES, stationAvailable } from '../../src/content/recipes.js';
import { DAILY_TEMPLATES, WEEKLY_TEMPLATES, WORLD_GOALS } from '../../src/content/dailyQuests.js';
import { CHAPTERS } from '../../src/content/story/index.js';

const ctx = {
  hunt: [{ key: 'forest', name: 'الغابة' }],
  explore: [{ key: 'forest', name: 'الغابة' }],
  visit: [{ key: 'market', name: 'السوق' }],
  gather: [{ key: 'glow_herb', name: 'عشبة' }],
  province: { key: 'verdant', name: 'البراري', hunt: [{ key: 'forest', name: 'الغابة' }], explore: [{ key: 'forest', name: 'الغابة' }] },
};

describe('v3 stakes', () => {
  it('takes a percentage of the XP inside the level, never more', () => {
    expect(xpLoss(1000, 30)).toBe(300);
    expect(xpLoss(1000, 10)).toBe(100);
    expect(xpLoss(0, 30)).toBe(0);
    expect(xpLoss(999, 150)).toBe(999);
    expect(xpLoss(-5, 30)).toBe(0);
  });
  it('uses the rarity table, with secret at 0.0001', () => {
    expect(dropChanceOf('secret')).toBe(0.0001);
    expect(dropChanceOf('common')).toBeGreaterThan(dropChanceOf('legendary'));
    expect(stakes.pvpXpLossPct).toBe(30);
    expect(stakes.pveXpLossPct).toBe(10);
  });
  it('never drops quest items, untradeable items or the guardian charm', () => {
    const bag = [
      { key: 'a', type: 'quest', rarity: 'common', quantity: 1, tradeable: true },
      { key: 'b', type: 'material', rarity: 'common', quantity: 1, tradeable: false },
      { key: 'guardian_charm', type: 'misc', rarity: 'epic', quantity: 1, tradeable: true },
      { key: 'c', type: 'material', rarity: 'common', quantity: 2, tradeable: true },
    ];
    expect(droppable(bag).map((s) => s.key)).toEqual(['c']);
    expect(rollDrop([bag[0]], createRng(1))).toBeNull();
  });
  it('secret items almost never fall', () => {
    const rng = createRng(7);
    let fell = 0;
    for (let n = 0; n < 20_000; n++) if (rollDrop([{ key: 's', type: 'misc', rarity: 'secret', quantity: 1 }], rng).dropped) fell++;
    expect(fell).toBeLessThanOrEqual(10);
  });
});

describe('v3 daily quest engine', () => {
  it('flips the day at local midnight (Baghdad by default)', () => {
    expect(dayKey(new Date('2026-03-01T20:59:00Z'))).toBe('2026-03-01');
    expect(dayKey(new Date('2026-03-01T21:00:00Z'))).toBe('2026-03-02');
    expect(weekKey(new Date('2026-03-04T12:00:00Z'))).toBe('2026-03-02'); // a Monday
    expect(periodEndsAt('daily', new Date('2026-03-01T10:00:00Z')).toISOString()).toBe('2026-03-01T21:00:00.000Z');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
  });
  it('builds a stable, varied board per character and day', () => {
    const a = generateBoard({ period: 'daily', characterId: 1, key: '2026-03-01', level: 12, ctx });
    const again = generateBoard({ period: 'daily', characterId: 1, key: '2026-03-01', level: 12, ctx });
    const tomorrow = generateBoard({ period: 'daily', characterId: 1, key: '2026-03-02', level: 12, ctx });
    expect(a).toHaveLength(DAILY_SLOTS.length);
    expect(a).toEqual(again);
    expect(a.map((q) => q.templateKey)).not.toEqual(tomorrow.map((q) => q.templateKey));
    expect(new Set(a.map((q) => q.templateKey)).size).toBe(a.length);
    for (const q of a) {
      expect(q.required).toBeGreaterThan(0);
      expect(q.rewards.xp).toBeGreaterThan(0);
      expect(q.title).toBeTruthy();
      expect(q.description).not.toMatch(/\{\w+\}/);
    }
    const w = generateBoard({ period: 'weekly', characterId: 1, key: '2026-03-02', level: 12, ctx });
    expect(w).toHaveLength(WEEKLY_SLOTS.length);
  });
  it('different players get different boards', () => {
    const boards = [1, 2, 3, 4, 5].map((id) =>
      generateBoard({ period: 'daily', characterId: id, key: '2026-03-01', level: 20, ctx })
        .map((q) => q.templateKey)
        .join(),
    );
    expect(new Set(boards).size).toBeGreaterThan(1);
  });
  it('respects level gates in templates', () => {
    for (let s = 0; s < 40; s++) {
      const q = generateQuest({ period: 'daily', slot: 6, level: 1, ctx, seed: s });
      const t = [...DAILY_TEMPLATES, ...WEEKLY_TEMPLATES].find((x) => x.key === q.templateKey);
      expect(t.minLevel ?? 1).toBeLessThanOrEqual(1);
    }
  });
  it('matches events and keeps streaks', () => {
    expect(matches({ kind: 'hunt', target: 'any' }, 'hunt', 'forest')).toBe(true);
    expect(matches({ kind: 'hunt', target: 'lake' }, 'hunt', 'forest')).toBe(false);
    expect(matches({ kind: 'gather', target: 'glow_herb' }, 'gather', 'glow_herb')).toBe(true);
    expect(nextStreak(4, '2026-03-01', '2026-03-02')).toBe(5);
    expect(nextStreak(4, '2026-03-02', '2026-03-02')).toBe(4);
    expect(nextStreak(4, '2026-02-27', '2026-03-02')).toBe(1);
    expect(nextStreak(0, null, '2026-03-02')).toBe(1);
  });
  it('picks one world goal per day for everyone', () => {
    const g = worldGoalFor('2026-03-01');
    expect(g).toEqual(worldGoalFor('2026-03-01'));
    expect(g.required).toBeGreaterThan(0);
    expect(WORLD_GOALS.length).toBeGreaterThan(3);
  });
});

describe('v3 exploration engine', () => {
  const edge = ZONE_BY_KEY.forest_edge;
  it('rolls only known outcomes, and no fights where nothing lives', () => {
    const rng = createRng(3);
    const kinds = new Set();
    for (let n = 0; n < 500; n++) {
      const r = rollExplore(edge, { level: 5, weather: { key: 'clear', loot: 1, xp: 1 }, hasEnemies: false }, rng);
      kinds.add(r.kind);
      expect(LINES[r.kind]).toBeTruthy();
      expect(r.points).toBeGreaterThan(0);
    }
    expect(kinds.has('encounter')).toBe(false);
    expect(kinds.has('elite')).toBe(false);
    expect(line('resource', 'X', rng)).not.toContain('{zone}');
  });
  it('gathers from the zone table, more in rain', () => {
    const count = (weather) => {
      const rng = createRng(11);
      let n = 0;
      for (let k = 0; k < 300; k++) n += rollGather(edge, { weather }, rng).reduce((s, x) => s + x.quantity, 0);
      return n;
    };
    const keys = new Set(edge.resources.map(([k]) => k));
    for (const r of rollGather(edge, {}, createRng(1))) expect(keys.has(r.key)).toBe(true);
    expect(count({ gather: 1.25 })).toBeGreaterThan(count({ gather: 1 }));
    expect(depthBoost(ZONE_BY_KEY.forest_mother_tree).level).toBeGreaterThan(depthBoost(edge).level);
  });
});

describe('v3 world content integrity', () => {
  const known = new Set(V3_ITEMS.map((i) => i.key));
  // Base items seeded by the v1 migration: lines like "  ('key', 'Name', ...".
  const seed = readFileSync(new URL('../../src/db/migrations/0002_seed_world.sql', import.meta.url), 'utf8');
  for (const m of seed.matchAll(/^\s*\('([a-z0-9_]+)',\s+'[A-Z]/gm)) known.add(m[1]);
  it('every zone resource, recipe, box and shop item exists', () => {
    const missing = new Set();
    for (const zones of Object.values(ZONES)) for (const z of zones) for (const [k] of z.resources) if (!known.has(k)) missing.add(`zone:${k}`);
    for (const r of RECIPES) for (const k of [r.output, ...r.inputs.map(([x]) => x)]) if (!known.has(k)) missing.add(`recipe:${k}`);
    for (const b of Object.values(BOXES)) for (const [k] of b.table) if (k !== 'nx' && !known.has(k)) missing.add(`box:${k}`);
    for (const list of Object.values(SHOP_STOCK)) for (const [k] of list) if (!known.has(k)) missing.add(`shop:${k}`);
    for (const e of Object.values(ELITES)) for (const [k] of e.loot) if (!known.has(k)) missing.add(`elite:${k}`);
    expect([...missing]).toEqual([]);
  });
  it('every province location has zones, and every wild place hides one', () => {
    for (const p of PROVINCES) for (const l of p.locations) expect(zonesOf(l).length, l).toBeGreaterThan(0);
    for (const [loc, zones] of Object.entries(ZONES)) {
      if (zones[0].city) continue;
      expect(
        zones.some((z) => z.depth === 4 && z.secret),
        loc,
      ).toBe(true);
    }
    expect(currentZone('forest', 'nope').key).toBe('forest_edge');
    expect(zoneAccess(ZONE_BY_KEY.forest_deepwood, { level: 50, points: DEPTH_UNLOCK[2] - 1 }).ok).toBe(false);
  });
  it('has secret relics, boxes that open, and stations', () => {
    expect(V3_ITEMS.filter((i) => i.rarity === 'secret').length).toBeGreaterThanOrEqual(7);
    for (const i of V3_ITEMS.filter((x) => x.useEffect?.box)) expect(BOXES[i.useEffect.box], i.key).toBeTruthy();
    expect(V3_ITEM_BY_KEY.guardian_charm.tradeable).not.toBe(false);
    expect(stationAvailable('forge', 'blacksmith')).toBe(true);
    expect(stationAvailable('forge', 'forest')).toBe(false);
    expect(stationAvailable('camp', 'forest')).toBe(true);
  });
  it('weather and mastery are deterministic', () => {
    const at = new Date('2026-03-01T10:00:00Z');
    expect(weatherFor('verdant', at)).toEqual(weatherFor('verdant', at));
    expect(masteryRank(0).rank).toBe(0);
    expect(masteryRank(10_000).next).toBeNull();
  });
  it('the story reaches level 100 across five acts', () => {
    expect(CHAPTERS.length).toBeGreaterThanOrEqual(30);
    expect(Math.max(...CHAPTERS.map((c) => c.level ?? 0))).toBeGreaterThanOrEqual(93);
  });
});
