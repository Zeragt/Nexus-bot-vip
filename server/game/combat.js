/**
 * محرك القتال بالأدوار. دوال نقية تعمل على كائن حالة، وتعيد قائمة أحداث
 * تستعملها الواجهة لعرض الحركات والأرقام. الخادم وحده يحسب النتائج.
 */
import { randomUUID } from 'node:crypto';
import { STATUSES, POTIONS_PER_BATTLE, SHOP } from './content.js';
import { rng, roll } from './rules.js';

const MAX_ACTIONS = 120;
const other = (side) => (side === 'a' ? 'b' : 'a');
const shopById = Object.fromEntries(SHOP.map((s) => [s.id, s]));

export function createBattle(a, b, mode = 'pve', meta = {}) {
  for (const f of [a, b]) {
    f.cds = {};
    f.statuses = [];
    f.enraged = false;
  }
  const first = a.spd === b.spd ? (roll(0.5) ? 'a' : 'b') : a.spd > b.spd ? 'a' : 'b';
  return {
    id: randomUUID(),
    mode,
    meta,
    sides: { a, b },
    turn: first,
    actions: 0,
    over: false,
    winner: null,
    fled: false,
    log: [],
    startedAt: Date.now(),
  };
}

// ───────────── أدوات مساعدة ─────────────
const has = (f, id) => f.statuses.find((s) => s.id === id);
const sum = (f, id) => f.statuses.filter((s) => s.id === id).reduce((a, s) => a + s.value, 0);

function addStatus(f, id, turns, value = 0) {
  const ex = has(f, id);
  if (ex) {
    ex.turns = Math.max(ex.turns, turns);
    ex.value = Math.max(ex.value, value);
  } else f.statuses.push({ id, turns, value });
}

function effAtk(f) {
  return f.atk * Math.max(0.2, 1 + sum(f, 'atk_up') - sum(f, 'weaken')) * (f.enraged ? 1.2 : 1);
}
function effDef(f) {
  return f.def * Math.max(0, 1 + sum(f, 'def_up') - sum(f, 'armor_break'));
}
export function effSpd(f) {
  return f.spd * (1 + sum(f, 'spd_up'));
}

function checkEnd(st) {
  for (const side of ['a', 'b']) {
    if (st.sides[side].hp <= 0) {
      st.sides[side].hp = 0;
      st.over = true;
      st.winner = other(side);
      return true;
    }
  }
  return false;
}

/** ضرر مباشر يمر عبر الدرع. */
function applyDamage(st, side, amount, ev, extra = {}) {
  const f = st.sides[side];
  let dmg = Math.max(1, Math.round(amount));
  const shield = has(f, 'shield');
  let absorbed = 0;
  if (shield) {
    absorbed = Math.min(shield.value, dmg);
    shield.value -= absorbed;
    dmg -= absorbed;
    if (shield.value <= 0) f.statuses = f.statuses.filter((s) => s !== shield);
  }
  f.hp = Math.max(0, f.hp - dmg);
  ev.push({ t: 'dmg', target: side, amount: dmg, absorbed, hp: f.hp, ...extra });
  return dmg;
}

function heal(st, side, amount, ev, extra = {}) {
  const f = st.sides[side];
  const before = f.hp;
  f.hp = Math.min(f.maxHp, f.hp + Math.round(amount));
  const healed = f.hp - before;
  if (healed > 0) ev.push({ t: 'heal', target: side, amount: healed, hp: f.hp, ...extra });
  return healed;
}

function maybeEnrage(st, side, ev) {
  const f = st.sides[side];
  if (f.passive?.enrage && !f.enraged && f.hp > 0 && f.hp / f.maxHp <= f.passive.enrage) {
    f.enraged = true;
    ev.push({ t: 'enrage', target: side });
  }
}

// ───────────── بداية الدور ─────────────
function startTurn(st, side, ev) {
  const f = st.sides[side];
  const foe = other(side);
  for (const k of Object.keys(f.cds)) f.cds[k] = Math.max(0, f.cds[k] - 1);
  const regen = Math.round(f.maxMp * 0.08 * (f.passive?.mpRegen || 1));
  f.mp = Math.min(f.maxMp, f.mp + regen);

  for (const s of [...f.statuses]) {
    const kind = STATUSES[s.id].kind;
    if (kind === 'dot') applyDamage(st, side, s.value, ev, { status: s.id });
    else if (s.id === 'regen') heal(st, side, f.maxHp * s.value, ev, { status: 'regen' });
    else if (s.id === 'summon') applyDamage(st, foe, s.value, ev, { status: 'summon', by: side });
    if (checkEnd(st)) return 'over';
  }
  const control = f.statuses.find((s) => s.id === 'stun' || s.id === 'freeze');
  for (const s of f.statuses) s.turns -= 1;
  f.statuses = f.statuses.filter((s) => s.turns > 0);
  if (control) {
    ev.push({ t: 'skip', side, status: control.id });
    return 'skip';
  }
  return 'ok';
}

function endTurn(st, ev) {
  st.actions += 1;
  if (st.actions >= MAX_ACTIONS && !st.over) {
    const ra = st.sides.a.hp / st.sides.a.maxHp;
    const rb = st.sides.b.hp / st.sides.b.maxHp;
    st.over = true;
    st.winner = ra >= rb ? 'a' : 'b';
    ev.push({ t: 'timeout' });
    return;
  }
  let guard = 0;
  while (!st.over && guard++ < 4) {
    st.turn = other(st.turn);
    const r = startTurn(st, st.turn, ev);
    if (r === 'skip') continue;
    break;
  }
}

// ───────────── تنفيذ مهارة ─────────────
function useSkill(st, side, skill, ev) {
  const me = st.sides[side];
  const foeSide = other(side);
  const foe = st.sides[foeSide];
  me.mp -= skill.cost;
  if (skill.cd) me.cds[skill.id] = skill.cd + 1;
  ev.push({ t: 'skill', side, skill: skill.id, name: skill.name, icon: skill.icon, kind: skill.kind });
  if (skill.id === 'strike') me.mp = Math.min(me.maxMp, me.mp + 6);

  if (skill.kind === 'attack') {
    for (let h = 0; h < skill.hits; h++) {
      if (foe.hp <= 0) break;
      const evadeChance = sum(foe, 'evade') + (foe.passive?.evade || 0);
      if (evadeChance && roll(evadeChance)) {
        ev.push({ t: 'miss', target: foeSide });
        continue;
      }
      const def = skill.pierce ? 0 : effDef(foe);
      let dmg = effAtk(me) * skill.power * (100 / (100 + def)) * (0.9 + rng.next() * 0.2);
      const critChance = (me.crit + sum(me, 'crit_up')) / 100;
      const crit = roll(critChance);
      if (crit) dmg *= me.passive?.critMul || 1.6;
      dmg *= 1 + sum(foe, 'mark');
      dmg *= me.passive?.dmgMul || 1;
      dmg *= foe.passive?.dmgTaken || 1;
      if (skill.execute && foe.hp / foe.maxHp < skill.execute) dmg *= 2;
      const dealt = applyDamage(st, foeSide, dmg, ev, { crit, hit: h });
      const ls = (skill.lifesteal || 0) + (me.passive?.lifesteal || 0);
      if (ls) heal(st, side, dealt * ls, ev, { lifesteal: true });
      if (checkEnd(st)) return;
      maybeEnrage(st, foeSide, ev);
    }
  } else if (skill.kind === 'heal') {
    heal(st, side, me.maxHp * skill.power * (me.passive?.healMul || 1), ev);
  } else if (skill.kind === 'shield') {
    const amount = Math.round(me.maxHp * skill.power * (me.passive?.shieldMul || 1));
    addStatus(me, 'shield', 3, amount);
    ev.push({ t: 'status', target: side, status: 'shield', value: amount });
  }

  if (skill.cleanse) {
    const before = me.statuses.length;
    me.statuses = me.statuses.filter((s) => ['buff'].includes(STATUSES[s.id].kind));
    if (me.statuses.length !== before) ev.push({ t: 'cleanse', target: side });
  }

  for (const e of skill.effects) {
    const targetSide = e.self ? side : foeSide;
    const target = st.sides[targetSide];
    if (target.hp <= 0 || !roll(e.chance)) continue;
    const kind = STATUSES[e.status].kind;
    const value = kind === 'dot' || e.status === 'summon' ? Math.max(1, Math.round(effAtk(me) * e.value)) : e.value || 0;
    addStatus(target, e.status, e.turns, value);
    ev.push({ t: 'status', target: targetSide, status: e.status, turns: e.turns });
  }
}

function useItem(st, side, id, ev) {
  const me = st.sides[side];
  const item = shopById[id];
  me.potions[id] -= 1;
  me.potionsUsed += 1;
  ev.push({ t: 'item', side, item: id, name: item.name, icon: item.icon });
  if (item.heal) heal(st, side, me.maxHp * item.heal, ev);
  if (item.mp) {
    me.mp = Math.min(me.maxMp, me.mp + item.mp);
    ev.push({ t: 'mp', target: side, mp: me.mp });
  }
}

/** يتحقق من أن الحركة مسموحة ويعيد سبب الرفض إن وجد. */
export function validate(st, side, action) {
  if (st.over) return 'المعركة انتهت';
  if (st.turn !== side) return 'ليس دورك';
  const me = st.sides[side];
  if (action.type === 'skill') {
    const sk = me.skills.find((s) => s.id === action.id);
    if (!sk) return 'مهارة غير معروفة';
    if (has(me, 'silence') && sk.id !== 'strike') return 'أنت مُسكت! الضربة العادية فقط';
    if ((me.cds[sk.id] || 0) > 0) return 'المهارة في فترة التهدئة';
    if (me.mp < sk.cost) return 'طاقة غير كافية';
    return null;
  }
  if (action.type === 'item') {
    if (!shopById[action.id] || shopById[action.id].chest) return 'أداة غير صالحة';
    if (!(me.potions?.[action.id] > 0)) return 'لا تملك هذه الجرعة';
    if (me.potionsUsed >= POTIONS_PER_BATTLE) return `مسموح ${POTIONS_PER_BATTLE} جرعات فقط في المعركة`;
    return null;
  }
  if (action.type === 'flee') return st.mode === 'pve' && st.meta.canFlee !== false ? null : 'لا يمكن الهروب';
  return 'حركة غير معروفة';
}

/** ينفذ حركة الطرف side ويعيد الأحداث. يرمي خطأ إن كانت الحركة غير صالحة. */
export function act(st, side, action) {
  const err = validate(st, side, action);
  if (err) {
    const e = new Error(err);
    e.status = 400;
    throw e;
  }
  const ev = [];
  const me = st.sides[side];
  if (action.type === 'flee') {
    if (roll(0.6)) {
      st.over = true;
      st.fled = true;
      st.winner = other(side);
      ev.push({ t: 'flee', side, ok: true });
      return ev;
    }
    ev.push({ t: 'flee', side, ok: false });
  } else if (action.type === 'item') {
    useItem(st, side, action.id, ev);
  } else {
    if (st.mode === 'pve' && !me.ai) st.meta.skillsUsed = (st.meta.skillsUsed || 0) + (action.id === 'strike' ? 0 : 1);
    const before = ev.length;
    useSkill(st, side, me.skills.find((s) => s.id === action.id), ev);
    if (!me.ai) st.meta.crits = (st.meta.crits || 0) + ev.slice(before).filter((e) => e.t === 'dmg' && e.crit && e.target !== side).length;
  }
  if (!st.over) endTurn(st, ev);
  st.log.push(...ev);
  if (st.log.length > 200) st.log.splice(0, st.log.length - 200);
  return ev;
}

/** اختيار الذكاء الاصطناعي للوحوش. */
export function aiChoose(st, side) {
  const me = st.sides[side];
  if (has(me, 'silence')) return { type: 'skill', id: 'strike' };
  const ready = me.skills.filter((s) => s.id !== 'strike' && !(me.cds[s.id] > 0) && me.mp >= s.cost);
  const low = me.hp / me.maxHp < 0.4;
  const defensive = ready.filter((s) => s.kind === 'heal' || s.kind === 'shield');
  if (low && defensive.length && roll(0.7)) return { type: 'skill', id: defensive[0].id };
  const useful = ready.filter((s) => {
    if (s.kind === 'heal') return me.hp / me.maxHp < 0.6;
    if (s.kind === 'shield') return !has(me, 'shield');
    if (s.kind === 'buff') return !s.effects.some((e) => e.self && has(me, e.status));
    return true;
  });
  if (useful.length && roll(0.65)) return { type: 'skill', id: useful[Math.floor(rng.next() * useful.length)].id };
  return { type: 'skill', id: 'strike' };
}

/** يدير أدوار الطرف الآلي حتى يأتي دور لاعب أو تنتهي المعركة. */
export function runAi(st) {
  const ev = [];
  let guard = 0;
  while (!st.over && st.sides[st.turn].ai && guard++ < 10) ev.push(...act(st, st.turn, aiChoose(st, st.turn)));
  return ev;
}

/** صورة من الحالة ترسل للواجهة. */
export function view(st, forSide = 'a') {
  const f = (x) => ({
    id: x.id, kind: x.kind, name: x.name, icon: x.icon, color: x.color, avatar: x.avatar, level: x.level,
    classKey: x.classKey, hp: x.hp, maxHp: x.maxHp, mp: Math.round(x.mp), maxMp: x.maxMp, enraged: x.enraged,
    statuses: x.statuses.map((s) => ({ id: s.id, turns: s.turns, value: s.value })),
    skills: x.skills.map((s) => ({ id: s.id, name: s.name, icon: s.icon, cost: s.cost, cd: s.cd, kind: s.kind, desc: s.desc, ready: x.cds[s.id] || 0 })),
    potions: x.potions, potionsUsed: x.potionsUsed,
  });
  return {
    id: st.id, mode: st.mode, you: forSide, turn: st.turn, over: st.over, winner: st.winner, fled: st.fled,
    me: f(st.sides[forSide]), foe: f(st.sides[other(forSide)]),
    region: st.meta.region, chapter: st.meta.chapter, potionLimit: POTIONS_PER_BATTLE,
  };
}
