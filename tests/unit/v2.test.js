import { describe, it, expect } from 'vitest';
import { CHAPTERS, ACTS, fillStory, storyStats } from '../../src/content/story/index.js';
import { BOSS_TUNE } from '../../src/content/story/balance.js';
import { CODEX, CODEX_CATEGORIES } from '../../src/content/lore.js';
import { MONSTER_SKILLS, ENEMIES } from '../../src/engine/enemies.js';
import { MONSTER_ARCHETYPES } from '../../src/render/sprites.js';
import { PATHS, classStatBonus, offenseStat } from '../../src/content/classGen.js';
import { CLASSES } from '../../src/content/classes.js';
import { PATH_ICON } from '../../src/render/emblems.js';
import { iconNames } from '../../src/render/icons.js';
import { STATS } from '../../src/config/game.js';
import { spawnBoss, bossHpMult, storyStatus, isAtLocation } from '../../src/services/story.js';
import { renderStoryPage, renderChapterCover, renderChoice, renderEmblemCard, renderCodexEntry, renderBestiary } from '../../src/render/index.js';
import { createRng } from '../../src/engine/rng.js';
import { V3_ITEMS } from '../../src/content/items.js';

const LOCATIONS = new Set([
  'nexus_city',
  'central_plaza',
  'cafe',
  'tavern',
  'market',
  'library',
  'blacksmith',
  'residential',
  'forest',
  'mountains',
  'lake',
  'desert',
  'ruins',
  'dimensional_gate',
  'crystal_caverns',
  'ashen_wastes',
  'sky_archipelago',
  'sunken_kingdom',
  'shadow_citadel',
  'the_abyss',
  'mirror_steppe',
  'clockwork_isles',
  'eclipse_sanctum',
  'nexus_heart',
]);
const ITEMS = new Set([
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
  ...V3_ITEMS.map((i) => i.key),
]);
const FACTIONS = new Set(['nexus_guard', 'adventurers', 'merchants', 'unknown_order']);
const isImage = (buf) => Buffer.isBuffer(buf) && buf.length > 1000;

describe('story content', () => {
  it('has five acts and thirty ordered chapters', () => {
    expect(ACTS).toHaveLength(5);
    expect(CHAPTERS).toHaveLength(30);
    for (let i = 1; i < CHAPTERS.length; i++) expect(CHAPTERS[i].level).toBeGreaterThanOrEqual(CHAPTERS[i - 1].level);
    expect(new Set(CHAPTERS.map((c) => c.key)).size).toBe(30);
    expect(storyStats().pages).toBeGreaterThan(150);
  });

  it('only references things that exist', () => {
    for (const c of CHAPTERS) {
      expect(LOCATIONS.has(c.location), c.key).toBe(true);
      expect(c.pages.length, c.key).toBeGreaterThan(4);
      expect(MONSTER_ARCHETYPES).toContain(c.boss.archetype);
      for (const s of c.boss.skills) expect(MONSTER_SKILLS[s], `${c.key} ${s}`).toBeTruthy();
      for (const w of Object.keys(c.boss.weights)) expect(STATS).toContain(w);
      for (const [item] of c.rewards.items ?? []) expect(ITEMS.has(item), `${c.key} ${item}`).toBe(true);
      if (c.rewards.factionRep) expect(FACTIONS.has(c.rewards.factionRep[0])).toBe(true);
      for (const o of c.choice?.options ?? []) expect(FACTIONS.has(o.rep[0])).toBe(true);
      expect(BOSS_TUNE[c.key], c.key).toBeGreaterThan(0);
    }
  });

  it('fills the hero placeholders', () => {
    expect(fillStory('{name} الـ{class}', { name: 'آريا', className: 'فارس' })).toBe('آريا الـفارس');
    expect(fillStory('{class}', { name: 'x' })).toBe('مغامر');
  });

  it('spawns bosses at their chapter level with growing toughness', () => {
    const rng = createRng(1);
    const first = spawnBoss(CHAPTERS[0], rng);
    const last = spawnBoss(CHAPTERS[24], rng);
    expect(first.boss).toBe(true);
    expect(last.maxHp).toBeGreaterThan(first.maxHp * 10);
    expect(last.level).toBeGreaterThan(90);
    expect(bossHpMult(CHAPTERS[24]) / BOSS_TUNE.c25).toBeGreaterThan(bossHpMult(CHAPTERS[0]) / BOSS_TUNE.c01);
  });

  it('gates chapters on level and pending choices', () => {
    const ch = { level: 5, location: { key: 'tavern', region: 'city' } };
    expect(storyStatus(ch, { chapter: 3, choices: {} }).blockers).toHaveLength(1);
    expect(storyStatus({ ...ch, level: 20 }, { chapter: 6, choices: {} }).pendingChoice?.key).toBe('c06');
    expect(storyStatus({ ...ch, level: 20 }, { chapter: 6, choices: { c06: 1 } }).pendingChoice).toBeNull();
    expect(storyStatus(ch, { chapter: CHAPTERS.length, choices: {} }).done).toBe(true);
    expect(storyStatus(ch, { chapter: 25, choices: {} }).done).toBe(false);
    expect(isAtLocation(ch, CHAPTERS[0], 'city')).toBe(true);
    expect(isAtLocation(ch, CHAPTERS[2], 'wild')).toBe(false);
  });
});

describe('codex', () => {
  it('has unique entries in known categories, sealed by real chapters', () => {
    const cats = new Set(CODEX_CATEGORIES.map((c) => c.key));
    expect(new Set(CODEX.map((e) => e.slug)).size).toBe(CODEX.length);
    expect(CODEX.length).toBeGreaterThanOrEqual(60);
    for (const e of CODEX) {
      expect(cats.has(e.category), e.slug).toBe(true);
      if (e.unlock)
        expect(
          CHAPTERS.some((c) => c.key === e.unlock),
          e.slug,
        ).toBe(true);
      expect(iconNames).toContain(CODEX_CATEGORIES.find((c) => c.key === e.category).icon);
    }
  });
});

describe('classes after balancing', () => {
  it('every path has its own crest sign', () => {
    for (const p of PATHS) expect(iconNames, p.key).toContain(PATH_ICON[p.key]);
    expect(new Set(Object.values(PATH_ICON)).size).toBe(PATHS.length);
  });

  it('every class hits with an offensive stat and grows sturdier', () => {
    for (const c of CLASSES) {
      expect(['strength', 'agility', 'intelligence', 'luck']).toContain(offenseStat(c));
      const b = classStatBonus(c.key, null, 60);
      expect(b.endurance, c.key).toBeGreaterThan(0);
      for (const v of Object.values(b)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('every region with monsters uses known archetypes and skills', () => {
    for (const mobs of Object.values(ENEMIES)) {
      for (const m of mobs) {
        expect(MONSTER_ARCHETYPES).toContain(m.archetype);
        for (const s of m.skills) expect(MONSTER_SKILLS[s], m.key).toBeTruthy();
      }
    }
  });
});

describe('v2 renders', () => {
  const ch = CHAPTERS[19];
  it('story cards', async () => {
    expect(isImage(await renderStoryPage({ act: ch.act, chapter: ch, page: 1, total: 8, text: ch.pages[0].text, avatar: null, classKey: 'knight' }))).toBe(
      true,
    );
    expect(
      isImage(
        await renderChapterCover({
          act: ch.act,
          chapter: ch,
          boss: ch.boss,
          avatar: null,
          classKey: null,
          heroName: 'x',
          status: { completed: 1, total: 25 },
          blockers: [],
          here: true,
        }),
      ),
    ).toBe(true);
    const c6 = CHAPTERS[5];
    expect(isImage(await renderChoice({ act: c6.act, chapter: c6, prompt: c6.choice.prompt, options: c6.choice.options, chosen: 0 }))).toBe(true);
  });
  it('codex and crest cards', async () => {
    expect(isImage(await renderCodexEntry({ title: 't', text: CODEX[0].text, category: CODEX_CATEGORIES[0] }))).toBe(true);
    expect(
      isImage(
        await renderBestiary({ location: { key: 'forest', nameAr: 'غابة', danger: 2 }, monsters: ENEMIES.forest.map((m) => ({ ...m, skills: [], loot: [] })) }),
      ),
    ).toBe(true);
    expect(isImage(await renderEmblemCard({ classKey: 'knight', pathKey: 'mythic', label: 'أسطورة' }))).toBe(true);
  });
});
