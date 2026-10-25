/**
 * Pure daily/weekly quest rules: period keys, board generation, rewards and world goals.
 * Everything is seeded by (character, period, slot, reroll) so a board is stable all day
 * and two players get different boards.
 */
import { createRng } from './rng.js';
import { progression } from '../config/game.js';
import { DAILY_TEMPLATES, WEEKLY_TEMPLATES, WORLD_GOALS } from '../content/dailyQuests.js';

const DAY = 86_400_000;

/** Local date (YYYY-MM-DD) of the quest day; the day flips at local midnight (offset in hours from UTC). */
export function dayKey(now = new Date(), offsetHours = 3) {
  return new Date(now.getTime() + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

/** Monday of the local week that contains `now`. */
export function weekKey(now = new Date(), offsetHours = 3) {
  const local = new Date(now.getTime() + offsetHours * 3_600_000);
  const dow = (local.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(local.getTime() - dow * DAY).toISOString().slice(0, 10);
}

export function periodKey(period, now, offsetHours) {
  return period === 'weekly' ? weekKey(now, offsetHours) : dayKey(now, offsetHours);
}

/** Moment the current period ends (UTC). */
export function periodEndsAt(period, now = new Date(), offsetHours = 3) {
  const start = Date.parse(`${periodKey(period, now, offsetHours)}T00:00:00Z`) - offsetHours * 3_600_000;
  return new Date(start + (period === 'weekly' ? 7 : 1) * DAY);
}

/** The day before a local date key. */
export function previousDay(key) {
  return new Date(Date.parse(`${key}T00:00:00Z`) - DAY).toISOString().slice(0, 10);
}

export function seedOf(...parts) {
  let h = 2166136261;
  for (const c of parts.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Slot layout of a board: which template group (and tier) each slot draws from. */
export const DAILY_SLOTS = [
  { group: 'easy', tier: 'easy' },
  { group: 'core', tier: 'normal' },
  { group: 'core', tier: 'normal' },
  { group: 'region', tier: 'normal' },
  { group: 'social', tier: 'normal' },
  { group: 'hard', tier: 'hard' },
];
export const WEEKLY_SLOTS = [
  { group: 'core', tier: 'elite' },
  { group: 'core', tier: 'elite' },
  { group: 'hard', tier: 'legendary' },
];

const TIER_XP = { easy: 0.05, normal: 0.08, hard: 0.13, elite: 0.35, legendary: 0.55 };
const TIER_NX = { easy: 0.8, normal: 1.2, hard: 2, elite: 6, legendary: 9 };
const TIER_COUNT = { easy: 1, normal: 1, hard: 1.15, elite: 1, legendary: 1 };

/** Rewards scale with the level so dailies stay worth doing at 5 and at 95. */
export function rewardsFor(tier, level) {
  const xp = Math.round(30 + progression.xpToNext(level) * TIER_XP[tier]);
  const nx = Math.round((40 + level * 7) * TIER_NX[tier]);
  return { xp, nx };
}

function fill(text, vars) {
  return String(text)
    .replaceAll('{loc}', vars.loc ?? '')
    .replaceAll('{item}', vars.item ?? '')
    .replaceAll('{n}', String(vars.n ?? ''))
    .replaceAll('{province}', vars.province ?? '');
}

/**
 * Resolves a template's selector against what this character can reach.
 * ctx: { hunt: [{key,name}], explore: [...], gather: [{key,name}], visit: [...],
 *        province: { name, hunt: [...], explore: [...] } }
 * Returns { target, vars } or null when nothing fits.
 */
function pickTarget(tpl, ctx, rng) {
  const one = (list) => (list?.length ? rng.pick(list) : null);
  switch (tpl.select) {
    case 'any':
      return { target: 'any', vars: {} };
    case 'hunt': {
      const l = one(ctx.hunt);
      return l && { target: l.key, vars: { loc: l.name } };
    }
    case 'explore': {
      const l = one(ctx.explore);
      return l && { target: l.key, vars: { loc: l.name } };
    }
    case 'visit': {
      const l = one(ctx.visit);
      return l && { target: l.key, vars: { loc: l.name } };
    }
    case 'gather': {
      const it = one(ctx.gather);
      return it && { target: it.key, vars: { item: it.name } };
    }
    case 'province_hunt': {
      const l = one(ctx.province?.hunt);
      return l && { target: l.key, vars: { loc: l.name, province: ctx.province.name } };
    }
    case 'province_explore': {
      const l = one(ctx.province?.explore);
      return l && { target: l.key, vars: { loc: l.name, province: ctx.province.name } };
    }
    default:
      return null;
  }
}

function weightedPick(list, rng) {
  const total = list.reduce((s, t) => s + t.weight, 0);
  let r = rng.next() * total;
  for (const t of list) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return list[list.length - 1];
}

/**
 * Builds one quest for a slot. `exclude` holds "kind:target" pairs already on the board.
 * Falls back to any group when the slot's group has nothing that fits (e.g. a level-1 player
 * whose region has no monsters yet).
 */
export function generateQuest({ period = 'daily', slot, level, ctx, seed, exclude = new Set(), avoidTemplates = new Set() }) {
  const slots = period === 'weekly' ? WEEKLY_SLOTS : DAILY_SLOTS;
  const spec = slots[(slot - 1) % slots.length];
  const pool = period === 'weekly' ? WEEKLY_TEMPLATES : DAILY_TEMPLATES;
  const rng = createRng(seed);
  const eligible = (group) => pool.filter((t) => (!group || t.group === group) && level >= t.minLevel && !avoidTemplates.has(t.key));
  for (const group of [spec.group, null]) {
    let candidates = eligible(group);
    for (let tries = 0; tries < 24 && candidates.length; tries++) {
      const tpl = weightedPick(candidates, rng);
      const picked = pickTarget(tpl, ctx, rng);
      if (!picked || exclude.has(`${tpl.kind}:${picked.target}`) || (tpl.select === 'any' && exclude.has(`${tpl.kind}:*`))) {
        candidates = candidates.filter((c) => c !== tpl);
        continue;
      }
      const [lo, hi] = tpl.count;
      const n = Math.max(1, Math.round(rng.int(lo, hi) * TIER_COUNT[spec.tier]));
      const variant = rng.pick(tpl.variants);
      const vars = { ...picked.vars, n };
      return {
        slot,
        templateKey: tpl.key,
        tier: spec.tier,
        kind: tpl.kind,
        target: picked.target,
        required: n,
        title: fill(variant.title, vars).slice(0, 80),
        description: fill(variant.description, vars).slice(0, 240),
        rewards: rewardsFor(spec.tier, level),
      };
    }
  }
  // Last resort: something every character can always do.
  return {
    slot,
    templateKey: 'fallback',
    tier: spec.tier,
    kind: 'explore',
    target: 'any',
    required: 2,
    title: 'خطوات جديدة',
    description: 'استكشف مرتين في أي مكان.',
    rewards: rewardsFor(spec.tier, level),
  };
}

/** A whole board. Quests on one board never share kind+target. */
export function generateBoard({ period = 'daily', characterId, key, level, ctx }) {
  const slots = period === 'weekly' ? WEEKLY_SLOTS : DAILY_SLOTS;
  const exclude = new Set();
  const used = new Set();
  const out = [];
  for (let slot = 1; slot <= slots.length; slot++) {
    const q = generateQuest({ period, slot, level, ctx, seed: seedOf(characterId, period, key, slot, 0), exclude, avoidTemplates: used });
    exclude.add(`${q.kind}:${q.target}`);
    if (q.target === 'any') exclude.add(`${q.kind}:*`);
    used.add(q.templateKey);
    out.push(q);
  }
  return out;
}

/** Today's server-wide goal (same for everyone), scaled by an admin setting. */
export function worldGoalFor(key, scale = 1) {
  const rng = createRng(seedOf('world', key));
  const g = rng.pick(WORLD_GOALS);
  const n = Math.max(1, Math.round(g.required * scale));
  return {
    templateKey: g.key,
    kind: g.kind,
    target: 'any',
    required: n,
    title: g.title,
    description: g.description.replaceAll('{n}', String(n)),
    rewards: { xpPct: 0.12, nx: 600, items: [['daily_chest', 1]] },
  };
}

/** Does an event (kind + target) count for a quest? */
export function matches(quest, kind, target) {
  if (quest.kind !== kind) return false;
  return quest.target === 'any' || quest.target == null || quest.target === target;
}

/** Streak after finishing a board on `key`, given the last finished day. */
export function nextStreak(current, lastDay, key) {
  if (lastDay === key) return current;
  if (lastDay && previousDay(key) === lastDay) return current + 1;
  return 1;
}

export function streakMilestone(streak, table) {
  return table[streak] ?? null;
}
