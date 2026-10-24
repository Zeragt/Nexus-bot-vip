import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/engine/rng.js';
import { applyXp, totalXpForLevel, effectiveStats, maxVitals, regenerate, levelProgress } from '../../src/engine/progression.js';
import { createFighter, createBattle, performAction, timeoutTurn, chooseAiAction, computeDamage, CombatError } from '../../src/engine/combat.js';
import { applyEffect, modifier, hasFlag, EFFECTS } from '../../src/engine/effects.js';
import { checkQuestRequirements, evaluateObjectives, autoObjectivesDone } from '../../src/engine/quests.js';
import { emptyOffer, setOfferItem, setOfferNx, validateOffer, isEmptyOffer } from '../../src/engine/trade.js';
import { progression } from '../../src/config/game.js';

const stats = (o = {}) => ({ strength: 10, defense: 8, agility: 8, intelligence: 6, endurance: 8, luck: 5, ...o });
const fighter = (o = {}) => createFighter({ id: o.id ?? 1, name: o.name ?? 'A', level: 5, maxHp: 200, maxEnergy: 100, stats: stats(o.stats), ...o });

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
  });
  it('int stays in range', () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

describe('progression', () => {
  it('levels up and carries overflow XP', () => {
    const need = progression.xpToNext(1);
    const res = applyXp({ level: 1, xp: 0 }, need + 5);
    expect(res.level).toBe(2);
    expect(res.xp).toBe(5);
    expect(res.statPoints).toBe(progression.statPointsPerLevel);
  });
  it('handles multi-level gains and skill points every N levels', () => {
    const res = applyXp({ level: 1, xp: 0 }, totalXpForLevel(5));
    expect(res.level).toBe(5);
    expect(res.levelsGained).toBe(4);
    expect(res.skillPoints).toBe(Math.floor(5 / progression.skillPointsEvery) - Math.floor(1 / progression.skillPointsEvery));
  });
  it('rejects negative XP', () => {
    expect(() => applyXp({ level: 1, xp: 0 }, -1)).toThrow();
  });
  it('never passes the level cap', () => {
    const res = applyXp({ level: progression.maxLevel, xp: 0 }, 1e12);
    expect(res.level).toBe(progression.maxLevel);
    expect(res.xp).toBeLessThan(progression.xpToNext(progression.maxLevel));
  });
  it('adds equipment stats', () => {
    const s = effectiveStats(stats(), [{ stats: { attack: 9, strength: 2 } }, { stats: { armor: 4 } }]);
    expect(s.strength).toBe(12);
    expect(s.attack).toBe(9);
    expect(s.armor).toBe(4);
  });
  it('regenerates lazily without exceeding max', () => {
    const v = maxVitals(5, stats());
    const r = regenerate({ hp: 1, energy: 0, vitalsAt: new Date(Date.now() - 10 * 3600e3) }, v);
    expect(r.hp).toBe(v.maxHp);
    expect(r.energy).toBe(v.maxEnergy);
  });
  it('reports level progress between 0 and 1', () => {
    const p = levelProgress(3, 10);
    expect(p.ratio).toBeGreaterThan(0);
    expect(p.ratio).toBeLessThan(1);
  });
});

describe('effects', () => {
  it('stacks by refreshing duration, not duplicating', () => {
    const f = fighter();
    applyEffect(f, 'poison', 2);
    applyEffect(f, 'poison', 4);
    expect(f.effects.filter((e) => e.key === 'poison')).toHaveLength(1);
    expect(f.effects[0].turns).toBe(4);
  });
  it('exposes flags and modifiers', () => {
    const f = fighter();
    applyEffect(f, 'stun', 1);
    expect(hasFlag(f, 'blocksAction')).toBe(true);
    applyEffect(f, 'attack_up', 2);
    expect(modifier(f, 'attack')).toBeGreaterThan(1);
  });
  it('every effect has a name and kind', () => {
    for (const [k, e] of Object.entries(EFFECTS)) {
      expect(e.name, k).toBeTruthy();
      expect(['buff', 'debuff'], k).toContain(e.kind);
    }
  });
});

describe('combat engine', () => {
  it('faster fighter goes first', () => {
    const s = createBattle(fighter({ id: 1, stats: { agility: 20 } }), fighter({ id: 2, stats: { agility: 5 } }), createRng(1));
    expect(s.active).toBe(0);
  });
  it('does not mutate the previous state', () => {
    const rng = createRng(7);
    const s = createBattle(fighter({ id: 1 }), fighter({ id: 2, name: 'B' }), rng);
    const copy = structuredClone(s);
    performAction(s, { type: 'attack' }, rng);
    expect(s).toEqual(copy);
  });
  it('a fight always ends', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rng = createRng(seed);
      let s = createBattle(fighter({ id: 1 }), fighter({ id: 2, name: 'B', ai: true }), rng);
      let guard = 0;
      while (!s.finished && guard++ < 500) s = performAction(s, chooseAiAction(s, rng), rng);
      expect(s.finished).toBe(true);
    }
  });
  it('rejects actions after the end', () => {
    const rng = createRng(3);
    const s = performAction(createBattle(fighter({ id: 1 }), fighter({ id: 2 }), rng), { type: 'forfeit' }, rng);
    expect(s.finished).toBe(true);
    expect(() => performAction(s, { type: 'attack' }, rng)).toThrow(CombatError);
  });
  it('repeated timeouts forfeit the absent player', () => {
    const rng = createRng(5);
    let s = createBattle(fighter({ id: 1, stats: { agility: 30 } }), fighter({ id: 2 }), rng);
    const absent = s.active;
    for (let i = 0; i < 10 && !s.finished; i++) {
      s = s.active === absent ? timeoutTurn(s, rng) : performAction(s, { type: 'defend' }, rng);
    }
    expect(s.finished).toBe(true);
    expect(s.winner).toBe(1 - absent);
    expect(s.reason).toBe('timeout');
  });
  it('damage is positive and armor reduces it', () => {
    const rng = createRng(9);
    const atk = fighter({ stats: { strength: 20 } });
    const soft = fighter({ stats: { defense: 0, agility: 0 } });
    const hard = fighter({ stats: { defense: 60, agility: 0, armor: 30 } });
    const avg = (def) => {
      let t = 0;
      for (let i = 0; i < 200; i++) t += computeDamage(atk, def, { rng, canDodge: false }).damage;
      return t / 200;
    };
    expect(avg(soft)).toBeGreaterThan(avg(hard));
    expect(avg(hard)).toBeGreaterThan(0);
  });
});

describe('quest rules', () => {
  const quest = { id: 1, active: true, minLevel: 3, repeatable: false };
  const ctx = { level: 5, completedQuestIds: [], openQuestIds: [], activeCount: 0, maxActive: 5 };
  it('accepts a valid quest', () => expect(checkQuestRequirements(quest, ctx).ok).toBe(true));
  it('blocks low level, duplicates, completed and full logs', () => {
    expect(checkQuestRequirements(quest, { ...ctx, level: 1 }).ok).toBe(false);
    expect(checkQuestRequirements(quest, { ...ctx, openQuestIds: [1] }).ok).toBe(false);
    expect(checkQuestRequirements(quest, { ...ctx, completedQuestIds: [1] }).ok).toBe(false);
    expect(checkQuestRequirements(quest, { ...ctx, activeCount: 5 }).ok).toBe(false);
  });
  it('evaluates collect/visit objectives', () => {
    const ev = evaluateObjectives(
      [
        { id: 1, kind: 'collect', targetKey: 'herb', requiredCount: 3 },
        { id: 2, kind: 'visit', targetKey: 'caves', requiredCount: 1 },
      ],
      { inventory: { herb: 5 }, visited: ['caves'], progress: {}, currentLocationKey: 'city' },
    );
    expect(ev.every((o) => o.done)).toBe(true);
    expect(ev[0].current).toBe(3);
    expect(autoObjectivesDone(ev)).toBe(true);
  });
});

describe('trade offers', () => {
  it('builds offers immutably', () => {
    const a = emptyOffer();
    const b = setOfferItem(setOfferNx(a, 50.9), 7, 2);
    expect(isEmptyOffer(a)).toBe(true);
    expect(b).toEqual({ nx: 50, items: { 7: 2 } });
    expect(setOfferItem(b, 7, 0).items).toEqual({});
  });
  it('rejects offers the owner cannot cover', () => {
    const offer = { nx: 100, items: { 3: 2 } };
    expect(validateOffer(offer, { nx: 100, inventory: { 3: 2 } }).ok).toBe(true);
    expect(validateOffer(offer, { nx: 99, inventory: { 3: 2 } }).ok).toBe(false);
    expect(validateOffer(offer, { nx: 100, inventory: { 3: 1 } }).ok).toBe(false);
    expect(validateOffer(offer, { nx: 100, inventory: { 3: 2 }, tradeable: { 3: false } }).ok).toBe(false);
  });
});
