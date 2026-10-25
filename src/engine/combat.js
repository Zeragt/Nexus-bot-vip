import { combat as C } from '../config/game.js';
import { EFFECTS, applyEffect, effectName, hasFlag, missChance, modifier } from './effects.js';
import { defaultRng } from './rng.js';

/**
 * Pure turn-based combat engine. It never touches Discord or the database:
 * state in, action in, new state out. The state is plain JSON so it can be
 * persisted between button presses and survives bot restarts.
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const LOG_SIZE = 6;

export function createFighter({
  id,
  userId = null,
  name,
  level = 1,
  hp,
  maxHp,
  energy,
  maxEnergy,
  stats,
  skills = [],
  items = {},
  effects = [],
  ai = false,
  passives = {},
  avatarKey = null,
  look = null,
  boss = false,
}) {
  const p = { ...EMPTY_PASSIVES, ...passives };
  // HP passives raise the pool and keep the current health ratio.
  const bonusHp = p.hp > 0 ? Math.round(maxHp * p.hp) : 0;
  const ratio = maxHp > 0 ? (hp ?? maxHp) / maxHp : 1;
  const finalMax = maxHp + bonusHp;
  return {
    id,
    userId,
    name,
    level,
    hp: clamp(Math.round(finalMax * ratio), 0, finalMax),
    maxHp: finalMax,
    energy: clamp(Math.round(energy ?? maxEnergy), 0, maxEnergy),
    maxEnergy,
    stats: { attack: 0, armor: 0, ...stats },
    skills: skills.filter((s) => s.type !== 'passive'),
    passives: p,
    cooldowns: {},
    effects: effects.map((e) => ({ key: e.key, turns: e.turns ?? 3, potency: e.potency ?? 1 })),
    items,
    itemsUsed: {},
    defending: false,
    shield: 0,
    ai,
    avatarKey,
    look,
    boss,
  };
}

const EMPTY_PASSIVES = { defense: 0, crit: 0, attack: 0, hp: 0, lifesteal: 0, dodge: 0 };

/**
 * Passive skills turn into permanent bonuses instead of buttons.
 * Class passives carry their kind in `extra.passive`; older generic passives use the scaling stat.
 * Units: defense is flat mitigation, everything else is a fraction (0.05 = 5%).
 */
export function passivesFromSkills(skills, bonus = {}) {
  const p = { ...EMPTY_PASSIVES };
  const add = (kind, v) => {
    if (kind === 'defense') p.defense += v * 2;
    else if (kind === 'crit') p.crit += v / 100;
    else if (kind === 'attack') p.attack += v / 100;
    else if (kind === 'hp') p.hp += (v * 2) / 100;
    else if (kind === 'lifesteal') p.lifesteal += v / 100;
    else if (kind === 'dodge') p.dodge += v / 200;
  };
  for (const s of skills) {
    if (s.type !== 'passive') continue;
    const v = s.power * (s.rank ?? 1);
    const kind = s.extra?.passive;
    if (kind) add(kind, v);
    else if (s.scalingStat === 'defense') p.defense += v;
    else if (s.scalingStat === 'luck') p.crit += v / 100;
  }
  for (const [kind, v] of Object.entries(bonus)) add(kind, v);
  p.lifesteal = Math.min(p.lifesteal, 0.35);
  p.hp = Math.min(p.hp, 1.5);
  return p;
}

export function createBattle(a, b, rng = defaultRng) {
  const agiA = a.stats.agility;
  const agiB = b.stats.agility;
  const first = agiA === agiB ? (rng.chance(0.5) ? 0 : 1) : agiA > agiB ? 0 : 1;
  const state = {
    turn: 1,
    active: first,
    fighters: [a, b],
    log: [],
    missed: [0, 0],
    finished: false,
    winner: null,
    reason: null,
  };
  pushLog(state, `${state.fighters[first].name} يبدأ القتال بفضل سرعته`, 'info');
  return state;
}

function pushLog(state, text, tone = 'info') {
  state.log.push({ text, tone });
  if (state.log.length > LOG_SIZE) state.log.splice(0, state.log.length - LOG_SIZE);
}

export function activeFighter(state) {
  return state.fighters[state.active];
}
export function opponentOf(state, index = state.active) {
  return state.fighters[1 - index];
}

export function critChance(f) {
  return clamp(C.baseCritChance + f.stats.luck * C.critPerLuck + f.stats.agility * C.critPerAgility + (f.passives.crit || 0), 0, C.maxCritChance);
}

export function dodgeChance(attacker, defender) {
  const diff = defender.stats.agility * modifier(defender, 'agility') - attacker.stats.agility * modifier(attacker, 'agility');
  return clamp(C.baseDodge + diff * C.dodgePerAgilityDiff + (defender.passives.dodge || 0), 0, C.maxDodge);
}

/**
 * Damage formula. Stats dominate; randomness is limited to ±variance and crits,
 * so a stronger character wins most of the time without fights being predictable.
 */
export function computeDamage(attacker, defender, { power = 100, scaling = 'strength', rng = defaultRng, canDodge = true, pierce = 0 } = {}) {
  if (canDodge && rng.chance(dodgeChance(attacker, defender))) return { damage: 0, dodged: true, crit: false };
  if (canDodge && rng.chance(missChance(attacker))) return { damage: 0, dodged: true, crit: false, blind: true };
  const stat = attacker.stats[scaling] ?? attacker.stats.strength;
  const raw =
    (stat * 2.2 + attacker.stats.attack * 1.5 + 8 + attacker.level * 1.5) *
    (power / 100) *
    modifier(attacker, 'attack') *
    (1 + (attacker.passives.attack || 0));
  const mitigation =
    (defender.stats.defense * 1.6 + defender.stats.armor * 1.8 + (defender.passives.defense || 0)) *
    modifier(defender, 'defense') *
    (1 - clamp(pierce, 0, 0.9));
  let dmg = raw * (100 / (100 + mitigation * 1.5));
  dmg *= 1 + rng.range(-C.variance, C.variance);
  const crit = rng.chance(critChance(attacker));
  if (crit) dmg *= C.critMultiplier;
  if (defender.defending) dmg *= C.defendDamageMultiplier;
  return { damage: Math.max(1, Math.round(dmg)), dodged: false, crit };
}

/** What the active fighter may do right now (used to build buttons and validate input). */
export function availableActions(state) {
  const f = activeFighter(state);
  const silenced = hasFlag(f, 'blocksSkills');
  const skills = f.skills.map((s) => ({
    key: s.key,
    name: s.name,
    energyCost: s.energyCost,
    cooldown: f.cooldowns[s.key] || 0,
    usable: !silenced && !(f.cooldowns[s.key] > 0) && f.energy >= s.energyCost,
  }));
  const items = Object.entries(f.items)
    .filter(([, it]) => it.qty > 0)
    .map(([key, it]) => ({ key, name: it.name, qty: it.qty }));
  // Duels have stakes: no running away (surrender counts as a loss).
  return { attack: true, defend: true, flee: !state.pvp, silenced, skills, items };
}

/**
 * Resolves one action for the active fighter and advances the turn.
 * Returns a new state; the input is never mutated.
 */
export function performAction(prev, action, rng = defaultRng) {
  if (prev.finished) throw new CombatError('القتال انتهى بالفعل');
  const state = structuredClone(prev);
  const actor = activeFighter(state);
  const target = opponentOf(state);
  state.missed[state.active] = 0;
  // What just happened, for the renderer (poses, damage numbers). Overwritten every action.
  state.lastAction = {
    actor: state.active,
    type: action.type,
    key: action.key ?? null,
    damage: 0,
    heal: 0,
    hits: 0,
    crit: false,
    dodged: false,
    element: null,
  };

  switch (action.type) {
    case 'attack': {
      // Basic attacks use the fighter's best offensive stat, so casters are not helpless without energy.
      const scaling = ['strength', 'agility', 'intelligence'].reduce((best, s) => ((actor.stats[s] ?? 0) > (actor.stats[best] ?? 0) ? s : best), 'strength');
      const res = doHit(state, actor, target, { power: 100, scaling, label: 'يهاجم' }, rng);
      track(state, res);
      break;
    }
    case 'skill':
      useSkill(state, actor, target, action.key, rng);
      break;
    case 'defend':
      actor.defending = true;
      actor.energy = Math.min(actor.maxEnergy, actor.energy + C.defendEnergyGain);
      pushLog(state, `${actor.name} يتخذ وضعية الدفاع`, 'info');
      break;
    case 'item':
      useItem(state, actor, action.key);
      break;
    case 'flee': {
      if (state.pvp) throw new CombatError('لا انسحاب في المبارزة. يمكنك الاستسلام، لكنه يُحسب خسارة');
      const chance = clamp(C.fleeBase + (actor.stats.agility - target.stats.agility) * C.fleePerAgilityDiff, 0.15, 0.85);
      if (rng.chance(chance)) {
        pushLog(state, `${actor.name} ينسحب من القتال`, 'info');
        return finish(state, null, 'flee');
      }
      pushLog(state, `${actor.name} يحاول الهرب... ويفشل`, 'miss');
      break;
    }
    case 'forfeit':
      pushLog(state, `${actor.name} يستسلم`, 'info');
      return finish(state, 1 - state.active, 'forfeit');
    default:
      throw new CombatError('إجراء غير معروف');
  }

  if (target.hp <= 0) return finish(state, state.active, 'ko');
  if (actor.hp <= 0) return finish(state, 1 - state.active, 'ko');
  return nextTurn(state, rng);
}

/** Called when the active player doesn't act in time: auto-defend, then forfeit after repeated misses. */
export function timeoutTurn(prev, rng = defaultRng) {
  const state = structuredClone(prev);
  const idx = state.active;
  state.missed[idx] += 1;
  if (state.missed[idx] >= C.maxMissedTurns) {
    pushLog(state, `${state.fighters[idx].name} لم يتحرك وخسر بسبب الغياب`, 'info');
    return finish(state, 1 - idx, 'timeout');
  }
  const f = state.fighters[idx];
  f.defending = true;
  pushLog(state, `${f.name} تأخر، فاتخذ وضعية الدفاع تلقائياً`, 'info');
  return nextTurn(state, rng);
}

function track(state, res) {
  const la = state.lastAction;
  if (!la || !res) return;
  la.damage += res.damage || 0;
  la.hits += res.dodged ? 0 : 1;
  la.crit = la.crit || Boolean(res.crit);
  la.dodged = la.hits === 0 && Boolean(res.dodged);
}

/** Applies damage through the target's barrier first. Returns the HP actually lost. */
function dealDamage(target, amount) {
  let rest = amount;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, rest);
    target.shield -= absorbed;
    rest -= absorbed;
  }
  target.hp = Math.max(0, target.hp - rest);
  return rest;
}

function heal(f, amount) {
  const before = f.hp;
  f.hp = Math.min(f.maxHp, f.hp + Math.max(0, Math.round(amount)));
  return f.hp - before;
}

function doHit(state, actor, target, { power, scaling, label, canDodge = true, pierce = 0, lifesteal = 0, quiet = false }, rng) {
  const res = computeDamage(actor, target, { power, scaling, rng, canDodge, pierce });
  if (res.dodged) {
    if (!quiet) pushLog(state, res.blind ? `${actor.name} يضرب في العمى ويخطئ` : `${target.name} يراوغ ${label === 'يهاجم' ? 'الهجوم' : label}`, 'miss');
    return res;
  }
  const lost = dealDamage(target, res.damage);
  const steal = (lifesteal + (actor.passives.lifesteal || 0)) * res.damage;
  res.healed = steal > 0 ? heal(actor, steal) : 0;
  if (state.lastAction) state.lastAction.heal += res.healed;
  if (!quiet) {
    const verb = label === 'يهاجم' ? `${actor.name} يهاجم` : `${actor.name} يستخدم ${label}`;
    const shielded = lost < res.damage ? ` (امتص الحاجز ${res.damage - lost})` : '';
    const drained = res.healed ? ` ويمتص ${res.healed}` : '';
    pushLog(state, `${verb}: ${res.damage} ضرر${res.crit ? ' (ضربة حرجة!)' : ''}${shielded}${drained}`, res.crit ? 'crit' : 'hit');
  }
  return res;
}

function useSkill(state, actor, target, key, rng) {
  const skill = actor.skills.find((s) => s.key === key);
  if (!skill) throw new CombatError('لا تملك هذه المهارة');
  if (hasFlag(actor, 'blocksSkills')) throw new CombatError('أنت مُسكت ولا يمكنك استخدام المهارات');
  if (actor.cooldowns[key] > 0) throw new CombatError(`المهارة في فترة انتظار (${actor.cooldowns[key]} أدوار)`);
  if (actor.energy < skill.energyCost) throw new CombatError('طاقتك لا تكفي لهذه المهارة');

  actor.energy -= skill.energyCost;
  if (skill.cooldownTurns > 0) actor.cooldowns[key] = skill.cooldownTurns + 1; // +1: reduced at end of this turn
  const rank = skill.rank ?? 1;
  const extra = skill.extra ?? {};
  if (state.lastAction) state.lastAction.element = skill.element ?? null;

  if (skill.type === 'healing') {
    if (skill.power > 0) {
      const amount = skill.power + (actor.stats[skill.scalingStat] ?? 0) * 2.5 * (1 + (rank - 1) * 0.15);
      const got = heal(actor, amount);
      if (state.lastAction) state.lastAction.heal += got;
      pushLog(state, `${actor.name} يستخدم ${skill.name} ويستعيد ${got} صحة`, 'heal');
    }
    if (extra.cleanse) actor.effects = actor.effects.filter((e) => EFFECTS[e.key]?.kind !== 'debuff');
  }

  let landed = true;
  if (skill.target === 'enemy' && skill.power > 0) {
    const power = skill.power * (1 + (rank - 1) * 0.1);
    const hits = Math.max(1, extra.hits ?? 1);
    const opts = {
      scaling: skill.scalingStat,
      label: skill.name,
      canDodge: skill.type !== 'special',
      pierce: extra.pierce ?? 0,
      lifesteal: extra.lifesteal ?? 0,
    };
    if (hits === 1) {
      const res = doHit(state, actor, target, { ...opts, power }, rng);
      track(state, res);
      landed = !res.dodged;
    } else {
      let total = 0;
      let crits = 0;
      let connected = 0;
      for (let h = 0; h < hits && target.hp > 0; h++) {
        const res = doHit(state, actor, target, { ...opts, power: power / hits, quiet: true }, rng);
        track(state, res);
        if (!res.dodged) {
          connected += 1;
          total += res.damage;
          if (res.crit) crits += 1;
        }
      }
      landed = connected > 0;
      pushLog(
        state,
        landed
          ? `${actor.name} يستخدم ${skill.name}: ${connected}/${hits} ضربات، ${total} ضرر${crits ? ` (${crits} حرجة)` : ''}`
          : `${target.name} يراوغ كل ضربات ${skill.name}`,
        crits ? 'crit' : landed ? 'hit' : 'miss',
      );
    }
  } else if (skill.target === 'self' && skill.power === 0 && !skill.effectKey) {
    pushLog(state, `${actor.name} يستخدم ${skill.name}`, 'info');
  }

  if (skill.effectKey && landed) {
    const recipient = skill.target === 'self' ? actor : target;
    if (rng.chance(skill.effectChance)) {
      const potency = 1 + (rank - 1) * 0.1;
      applyEffect(recipient, skill.effectKey, skill.effectTurns, potency);
      if (skill.effectKey === 'barrier') {
        const amount = Math.round(recipient.maxHp * 0.1 * potency + (recipient.stats[skill.scalingStat] ?? 0) * 1.5 + recipient.level * 2);
        recipient.shield = Math.max(recipient.shield || 0, amount);
      }
      const prefix = skill.power > 0 && skill.target === 'enemy' ? '' : `${actor.name} يستخدم ${skill.name}: `;
      const suffix = skill.effectKey === 'barrier' ? ` (${recipient.shield})` : '';
      pushLog(
        state,
        `${prefix}${recipient.name} تحت تأثير ${effectName(skill.effectKey)}${suffix}`,
        EFFECTS[skill.effectKey].kind === 'buff' ? 'heal' : 'effect',
      );
    }
  }
}

function useItem(state, actor, key) {
  const it = actor.items[key];
  if (!it || it.qty <= 0) throw new CombatError('لا تملك هذا الغرض');
  it.qty -= 1;
  actor.itemsUsed[key] = (actor.itemsUsed[key] || 0) + 1;
  const parts = [];
  if (it.heal) {
    const before = actor.hp;
    actor.hp = Math.min(actor.maxHp, actor.hp + it.heal);
    parts.push(`+${actor.hp - before} صحة`);
  }
  if (it.energy) {
    const before = actor.energy;
    actor.energy = Math.min(actor.maxEnergy, actor.energy + it.energy);
    parts.push(`+${actor.energy - before} طاقة`);
  }
  if (it.cleanse) {
    actor.effects = actor.effects.filter((e) => EFFECTS[e.key]?.kind !== 'debuff');
    parts.push('إزالة التأثيرات السلبية');
  }
  pushLog(state, `${actor.name} يستخدم ${it.name}${parts.length ? ` (${parts.join('، ')})` : ''}`, 'heal');
}

function endOfTurnUpkeep(f) {
  for (const k of Object.keys(f.cooldowns)) {
    f.cooldowns[k] -= 1;
    if (f.cooldowns[k] <= 0) delete f.cooldowns[k];
  }
}

/** Switches to the other fighter and runs their start-of-turn effects (DoTs, stuns...). */
function nextTurn(state, rng, depth = 0) {
  endOfTurnUpkeep(activeFighter(state));
  state.active = 1 - state.active;
  state.turn += 1;
  if (state.turn > C.maxTurns) {
    const [a, b] = state.fighters;
    const ra = a.hp / a.maxHp;
    const rb = b.hp / b.maxHp;
    pushLog(state, 'انتهى الوقت! يُحسم القتال بنسبة الصحة المتبقية', 'info');
    return finish(state, ra === rb ? null : ra > rb ? 0 : 1, 'time');
  }

  const f = activeFighter(state);
  f.defending = false;
  f.energy = Math.min(f.maxEnergy, f.energy + C.energyRegenPerTurn);

  for (const e of f.effects) {
    const line = EFFECTS[e.key]?.tick?.(f, e);
    if (line) pushLog(state, line, EFFECTS[e.key].kind === 'buff' ? 'heal' : 'effect');
  }
  if (f.hp <= 0) return finish(state, 1 - state.active, 'ko');

  const blocked = f.effects.find((e) => EFFECTS[e.key]?.blocksAction);
  for (const e of f.effects) {
    e.turns -= 1;
    if (e.turns <= 0) EFFECTS[e.key]?.onExpire?.(f);
  }
  f.effects = f.effects.filter((e) => e.turns > 0);

  if (blocked && depth < 4) {
    pushLog(state, `${f.name} عاجز عن الحركة (${effectName(blocked.key)})`, 'effect');
    return nextTurn(state, rng, depth + 1);
  }
  return state;
}

function finish(state, winner, reason) {
  state.finished = true;
  state.winner = winner;
  state.reason = reason;
  for (const f of state.fighters) f.defending = false;
  return state;
}

/** Simple but sensible AI for monsters: heal when low, use skills when affordable, otherwise attack. */
export function chooseAiAction(state, rng = defaultRng) {
  const f = activeFighter(state);
  const acts = availableActions(state);
  const usable = f.skills.filter((s) => acts.skills.find((a) => a.key === s.key)?.usable);
  const ratio = f.hp / f.maxHp;
  const heal = usable.find((s) => s.type === 'healing');
  if (ratio < 0.35 && heal) return { type: 'skill', key: heal.key };
  if (ratio < 0.25) {
    const potion = acts.items.find((i) => f.items[i.key]?.heal);
    if (potion) return { type: 'item', key: potion.key };
  }
  const special = usable.find((s) => s.type === 'special');
  if (special && rng.chance(f.boss ? 0.6 : 0.35)) return { type: 'skill', key: special.key };
  const offensive = usable.filter((s) => s.target === 'enemy');
  if (offensive.length && rng.chance(f.boss ? 0.6 : 0.45)) return { type: 'skill', key: rng.pick(offensive).key };
  const buff = usable.find((s) => s.target === 'self' && s.effectKey && !f.effects.some((e) => e.key === s.effectKey));
  if (buff && rng.chance(0.25)) return { type: 'skill', key: buff.key };
  if (ratio < 0.5 && rng.chance(0.15)) return { type: 'defend' };
  return { type: 'attack' };
}

export class CombatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CombatError';
    this.userMessage = message;
  }
}
