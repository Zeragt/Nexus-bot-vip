import { createRng } from './rng.js';
import { DAILY_TEMPLATES, TEMPLATE_BY_KEY, TIER_MULT } from '../content/dailyQuests.js';
import { dailies as D } from '../config/game.js';

/**
 * Pure rules of daily and weekly contracts: which period we are in, which contracts a
 * character draws for it, what they pay, and which game events advance them.
 * The draw is seeded by (character, period, reroll count), so it is stable across restarts.
 */

export function hashString(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

const shifted = (now, offsetHours) => new Date(now.getTime() + offsetHours * 3600_000);
const ymd = (d) => d.toISOString().slice(0, 10);

/** 'd:2026-10-25' for the day (in the server's reset timezone), 'w:2026-10-19' for the week starting Monday. */
export function periodKey(scope, now = new Date(), offsetHours = D.resetOffsetHours) {
  const local = shifted(now, offsetHours);
  if (scope === 'daily') return `d:${ymd(local)}`;
  const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow));
  return `w:${ymd(monday)}`;
}

/** When the current period ends (a real UTC instant). */
export function nextReset(scope, now = new Date(), offsetHours = D.resetOffsetHours) {
  const local = shifted(now, offsetHours);
  const days = scope === 'daily' ? 1 : 7 - ((local.getUTCDay() + 6) % 7);
  const startNext = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days);
  return new Date(startNext - offsetHours * 3600_000);
}

/** Yesterday's daily key, for streaks. */
export function previousDailyKey(now = new Date(), offsetHours = D.resetOffsetHours) {
  return periodKey('daily', new Date(now.getTime() - 86_400_000), offsetHours);
}

/** What a contract pays, scaled to the character's level so it stays worth doing at 5 and at 150. */
export function contractRewards(tier, level, scope = 'daily') {
  const m = (TIER_MULT[tier] ?? 1) * (scope === 'weekly' ? 4 : 1);
  return {
    xp: Math.round((30 + level * 9 + level * level * 0.12) * m),
    nx: Math.round((40 + level * 6) * m),
  };
}

function fillTitle(template, n, placeName) {
  return template.title.replace('{n}', String(n)).replace('{place}', placeName ?? 'منطقة');
}

/**
 * Draws contracts for a character.
 * ctx: { characterId, period, scope: 'daily'|'weekly', slots, level, chapter, places: { hunt:[{key,nameAr}], gather:[...], explore:[...] }, salt }
 * Returns [{ slot, template, event, target, targetName, required, title, tier, rewards }]
 */
export function rollContracts(ctx) {
  const rng = createRng(hashString(`${ctx.characterId}|${ctx.period}|${ctx.salt ?? 0}`));
  const eligible = DAILY_TEMPLATES.filter(
    (t) =>
      (t.scope === 'both' || t.scope === ctx.scope) &&
      (t.minChapter ?? 0) <= (ctx.chapter ?? 0) &&
      (!t.place || (ctx.places?.[t.place] ?? []).length > 0) &&
      !(ctx.exclude ?? []).includes(t.key),
  );
  const out = [];
  const used = new Set();
  // Daily boards always carry one hard contract; the rest is a weighted draw without repeats.
  const wantHard = ctx.scope === 'daily' ? 1 : 0;
  for (let slot = 1; slot <= ctx.slots; slot++) {
    let pool = eligible.filter((t) => !used.has(t.key));
    if (slot === ctx.slots && wantHard && !out.some((c) => c.tier === 'hard')) {
      const hard = pool.filter((t) => t.tier === 'hard');
      if (hard.length) pool = hard;
    }
    if (!pool.length) break;
    const total = pool.reduce((s, t) => s + t.weight, 0);
    let r = rng.next() * total;
    let pick = pool[pool.length - 1];
    for (const t of pool) {
      r -= t.weight;
      if (r <= 0) {
        pick = t;
        break;
      }
    }
    used.add(pick.key);
    out.push(buildContract(pick, slot, ctx, rng));
  }
  return out;
}

export function buildContract(template, slot, ctx, rng) {
  const mult = ctx.scope === 'weekly' ? 4 : 1;
  let required = rng.int(template.count[0], template.count[1]) * mult;
  if (template.scale) required = Math.round((required * (1 + (ctx.level ?? 1) / 25)) / 10) * 10;
  let target = null;
  let targetName = null;
  if (template.place) {
    const place = rng.pick(ctx.places[template.place]);
    target = place.key;
    targetName = place.nameAr;
  }
  return {
    slot,
    template: template.key,
    event: template.event,
    target,
    targetName,
    required,
    title: fillTitle(template, required, targetName),
    tier: template.tier,
    rewards: contractRewards(template.tier, ctx.level ?? 1, ctx.scope),
  };
}

/** How much an event advances a contract (0 when it doesn't apply). */
export function progressFor(contract, event, { key = null, location = null, amount = 1 } = {}) {
  if (contract.event !== event) return 0;
  if (contract.target && contract.target !== location && contract.target !== key) return 0;
  return Math.max(0, amount);
}

export function templateOf(contract) {
  return TEMPLATE_BY_KEY[contract.template] ?? null;
}
