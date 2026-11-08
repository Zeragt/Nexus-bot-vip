/**
 * طبقة اللعبة: كل ما يغيّر حالة لاعب يمر من هنا، تحت قفل لكل لاعب حتى لا تتداخل الطلبات.
 */
import { REGIONS, STORY, SHOP, RARITIES, BAG_LIMIT } from './content.js';
import {
  regionById, chapterById, newPlayer, playerFighter, monsterFighter, playerStats, xpToNext, addXp, loseXp,
  regionUnlocked, chapterUnlocked, monsterLevel, pick, roll, rollRarity, makeItem, addToBag, pveRewards,
  lootChance, tierForLevel, highestRegionIndex, unlockedSkills,
} from './rules.js';
import { createBattle, act, runAi, view } from './combat.js';
import { ensureDailies, track, today, loginReward } from './dailies.js';

export const PVE_XP_LOSS = 0.1;
export const PVP_XP_LOSS = 0.3;

export class GameError extends Error {
  constructor(msg, status = 400) {
    super(msg);
    this.status = status;
  }
}

export class Game {
  constructor(store) {
    this.store = store;
    this.locks = new Map();
    this.pve = new Map(); // userId -> battle state
  }

  /** ينفّذ fn على لاعب تحت قفل، ويحفظه إن تغيّر. */
  async withPlayer(id, fn, { create = false } = {}) {
    const prev = this.locks.get(id) || Promise.resolve();
    let release;
    const mine = new Promise((r) => (release = r));
    const chain = prev.then(() => mine);
    this.locks.set(id, chain);
    await prev;
    try {
      const p = await this.store.get(id);
      if (!p && !create) throw new GameError('لم تنشئ شخصيتك بعد', 404);
      const ctx = { save: true };
      const out = await fn(p, ctx);
      const target = ctx.player || p;
      if (target && ctx.save) await this.store.save(target);
      return out;
    } finally {
      release();
      if (this.locks.get(id) === chain) this.locks.delete(id);
    }
  }

  publicPlayer(p) {
    if (!p) return null;
    ensureDailies(p);
    return {
      ...p,
      statsTotal: playerStats(p),
      nextXp: xpToNext(p.level),
      skills: unlockedSkills(p).map((s) => s.id),
      inBattle: this.pve.has(p.id),
      today: today(),
    };
  }

  async me(id) {
    const p = await this.store.get(id);
    if (!p) return null;
    return this.publicPlayer(p);
  }

  async createCharacter(user, classKey, name) {
    return this.withPlayer(user.id, (existing, ctx) => {
      if (existing) throw new GameError('لديك شخصية بالفعل');
      const p = newPlayer({ id: user.id, name: name || user.name, avatar: user.avatar, classKey });
      ensureDailies(p);
      ctx.player = p;
      return this.publicPlayer(p);
    }, { create: true });
  }

  async resetCharacter(id) {
    this.pve.delete(id);
    await this.store.delete(id);
  }

  // ───────────── المعارك ضد الوحوش ─────────────
  async startBattle(id, { type, regionId, chapterId }) {
    return this.withPlayer(id, (p, ctx) => {
      ctx.save = false;
      if (this.pve.has(id)) return this.battleView(id);
      let enemy;
      let meta = {};
      if (type === 'explore' || type === 'region_boss') {
        const region = regionById[regionId];
        if (!region) throw new GameError('منطقة غير معروفة');
        if (!regionUnlocked(p, region)) throw new GameError(`تحتاج المستوى ${region.levels[0]} لدخول ${region.name}`);
        if (type === 'explore') {
          enemy = monsterFighter(pick(region.monsters), monsterLevel(region, p.level));
        } else {
          const bossChapter = STORY.find((c) => c.region === region.id && c.boss);
          if (!p.story.done.includes(bossChapter.id)) throw new GameError('اهزم زعيم المنطقة في القصة أولاً');
          enemy = monsterFighter(region.boss, region.levels[1] + 1, { boss: true });
        }
        meta = { type, region: region.id };
      } else if (type === 'story') {
        const ch = chapterById[chapterId];
        if (!ch) throw new GameError('فصل غير معروف');
        if (!chapterUnlocked(p, ch)) throw new GameError('هذا الفصل مقفل بعد');
        const region = regionById[ch.region];
        const idx = STORY.filter((c) => c.region === ch.region).indexOf(ch);
        const lvl = Math.round(region.levels[0] + ((region.levels[1] - region.levels[0]) * idx) / 2);
        if (ch.boss) enemy = monsterFighter(region.boss, lvl, { boss: true });
        else enemy = monsterFighter(region.monsters.find((m) => m.id === ch.enemy.monster), lvl, { elite: true, name: ch.enemy.name });
        meta = { type, region: region.id, chapter: ch.id, replay: p.story.done.includes(ch.id), canFlee: true };
      } else throw new GameError('نوع معركة غير معروف');

      const st = createBattle(playerFighter(p), enemy, 'pve', meta);
      const events = runAi(st);
      this.pve.set(id, st);
      return { battle: view(st, 'a'), events };
    });
  }

  battleView(id) {
    const st = this.pve.get(id);
    return st ? { battle: view(st, 'a'), events: [] } : { battle: null, events: [] };
  }

  async battleAct(id, action) {
    return this.withPlayer(id, (p, ctx) => {
      const st = this.pve.get(id);
      if (!st) throw new GameError('لا توجد معركة حالية', 404);
      const events = act(st, 'a', action);
      if (!st.over) events.push(...runAi(st));
      let result = null;
      if (st.over) {
        this.pve.delete(id);
        result = this.finishPve(p, st);
      } else ctx.save = false;
      return { battle: view(st, 'a'), events, result };
    });
  }

  finishPve(p, st) {
    const me = st.sides.a;
    const foe = st.sides.b;
    p.potions = { ...me.potions };
    const res = { win: st.winner === 'a', fled: st.fled, xp: 0, gold: 0, xpLost: 0, levelUps: 0, loot: [], bagFull: false };
    if (st.fled) return res;
    if (!res.win) {
      res.xpLost = loseXp(p, PVE_XP_LOSS);
      p.stats.deaths += 1;
      return res;
    }
    const replay = st.meta.replay;
    const r = pveRewards(foe);
    const mul = replay ? 0.4 : 1;
    res.xp = Math.round(r.xp * mul);
    res.gold = Math.round(r.gold * mul);
    p.gold += res.gold;
    res.levelUps = addXp(p, res.xp);
    p.stats.kills += 1;
    track(p, 'kill');
    track(p, 'gold', res.gold);
    track(p, 'skill', st.meta.skillsUsed || 0);
    track(p, 'crit', st.meta.crits || 0);
    if (foe.kind === 'boss') {
      p.stats.bosses += 1;
      track(p, 'boss');
    }
    if (st.meta.type === 'story') {
      track(p, 'story');
      if (!p.story.done.includes(st.meta.chapter)) {
        p.story.done.push(st.meta.chapter);
        res.chapterDone = st.meta.chapter;
      }
    }
    const drops = foe.kind === 'boss' && !replay ? 2 : 1;
    for (let i = 0; i < drops; i++) {
      if (!roll(lootChance(foe) * (replay ? 0.5 : 1))) continue;
      const it = makeItem(tierForLevel(foe.level), rollRarity({ boss: foe.kind === 'boss' }));
      if (addToBag(p, it)) {
        res.loot.push(it);
        track(p, 'loot');
      } else res.bagFull = true;
    }
    if (roll(0.12)) {
      p.potions.potion_small = (p.potions.potion_small || 0) + 1;
      res.potion = 'potion_small';
    }
    return res;
  }

  // ───────────── الحقيبة والمتجر ─────────────
  async equip(id, uid) {
    return this.withPlayer(id, (p) => {
      if (this.pve.has(id)) throw new GameError('لا يمكن تغيير العتاد أثناء المعركة');
      const i = p.bag.findIndex((x) => x.uid === uid);
      if (i < 0) throw new GameError('الأداة غير موجودة');
      const it = p.bag.splice(i, 1)[0];
      const old = p.equip[it.slot];
      p.equip[it.slot] = it;
      if (old) p.bag.push(old);
      return this.publicPlayer(p);
    });
  }

  async unequip(id, slot) {
    return this.withPlayer(id, (p) => {
      if (this.pve.has(id)) throw new GameError('لا يمكن تغيير العتاد أثناء المعركة');
      const it = p.equip[slot];
      if (!it) throw new GameError('الخانة فارغة');
      if (p.bag.length >= BAG_LIMIT) throw new GameError('الحقيبة ممتلئة');
      p.bag.push(it);
      p.equip[slot] = null;
      return this.publicPlayer(p);
    });
  }

  async sell(id, uids) {
    return this.withPlayer(id, (p) => {
      let gold = 0;
      for (const uid of [].concat(uids)) {
        const i = p.bag.findIndex((x) => x.uid === uid);
        if (i < 0) continue;
        const it = p.bag.splice(i, 1)[0];
        gold += RARITIES[it.rarity].sell * it.tier;
      }
      if (!gold) throw new GameError('لم يتم بيع شيء');
      p.gold += gold;
      return { player: this.publicPlayer(p), gold };
    });
  }

  async buy(id, shopId, qty = 1) {
    return this.withPlayer(id, (p) => {
      const item = SHOP.find((s) => s.id === shopId);
      if (!item) throw new GameError('غرض غير معروف');
      qty = Math.max(1, Math.min(10, Math.floor(qty) || 1));
      if (item.chest) qty = 1;
      const cost = item.price * qty;
      if (p.gold < cost) throw new GameError('ذهب غير كافٍ');
      let got = null;
      if (item.chest) {
        if (p.bag.length >= BAG_LIMIT) throw new GameError('الحقيبة ممتلئة');
        got = makeItem(highestRegionIndex(p) + 1, rollRarity({ luck: 0.3 }));
        addToBag(p, got);
      } else {
        p.potions[shopId] = (p.potions[shopId] || 0) + qty;
      }
      p.gold -= cost;
      return { player: this.publicPlayer(p), item: got };
    });
  }

  // ───────────── المهام اليومية ─────────────
  async claimDaily(id, index) {
    return this.withPlayer(id, (p) => {
      const ds = ensureDailies(p);
      const q = ds.quests[index];
      if (!q) throw new GameError('مهمة غير موجودة');
      if (q.claimed) throw new GameError('استلمت هذه المكافأة');
      if (q.progress < q.target) throw new GameError('المهمة لم تكتمل بعد');
      q.claimed = true;
      p.gold += q.reward.gold;
      const levelUps = addXp(p, q.reward.xp);
      return { player: this.publicPlayer(p), reward: q.reward, levelUps };
    });
  }

  async claimDailyBonus(id) {
    return this.withPlayer(id, (p) => {
      const ds = ensureDailies(p);
      if (ds.bonusClaimed) throw new GameError('استلمت الجائزة الكبرى اليوم');
      if (!ds.quests.every((q) => q.claimed)) throw new GameError('أكمل واستلم كل المهام أولاً');
      ds.bonusClaimed = true;
      const it = makeItem(highestRegionIndex(p) + 1, rollRarity({ boss: true, luck: 0.5 }));
      const ok = addToBag(p, it);
      p.potions.potion_big = (p.potions.potion_big || 0) + 1;
      return { player: this.publicPlayer(p), item: ok ? it : null };
    });
  }

  async claimLogin(id) {
    return this.withPlayer(id, (p) => {
      const d = today();
      if (p.login.last === d) throw new GameError('استلمت مكافأة اليوم');
      const yesterday = today(Date.now() - 86400000);
      p.login.streak = p.login.last === yesterday ? p.login.streak + 1 : 1;
      p.login.last = d;
      const r = loginReward(p.login.streak, p.level);
      p.gold += r.gold;
      if (r.potions) p.potions.potion_big = (p.potions.potion_big || 0) + r.potions;
      return { player: this.publicPlayer(p), reward: r, streak: p.login.streak };
    });
  }

  async leaderboard(by) {
    return this.store.top(by === 'rating' ? 'rating' : 'level', 25);
  }

  // ───────────── المبارزات بين اللاعبين ─────────────
  async duelFighters(idA, idB) {
    const [a, b] = await Promise.all([this.store.get(idA), this.store.get(idB)]);
    if (!a || !b) throw new GameError('أحد اللاعبين ليس لديه شخصية');
    if (this.pve.has(idA) || this.pve.has(idB)) throw new GameError('أحد اللاعبين في معركة أخرى');
    return [playerFighter(a, { potions: false }), playerFighter(b, { potions: false })];
  }

  /** يطبّق نتيجة المبارزة: الخاسر يفقد 30% من خبرته وقد تسقط أداة من حقيبته للفائز. */
  async finishDuel(winnerId, loserId) {
    const out = { winner: {}, loser: {} };
    await this.withPlayer(loserId, (l) => {
      out.loser.xpLost = loseXp(l, PVP_XP_LOSS);
      l.stats.duelsLost += 1;
      l.rating = Math.max(0, l.rating - 20);
      out.loserLevel = l.level;
      // سقوط أداة: نجرّب أدوات الحقيبة بترتيب عشوائي، وكل أداة لها فرصة حسب ندرتها
      const bag = [...l.bag].sort(() => Math.random() - 0.5);
      for (const it of bag) {
        if (roll(RARITIES[it.rarity].pvpDrop)) {
          l.bag = l.bag.filter((x) => x.uid !== it.uid);
          out.drop = it;
          break;
        }
      }
    });
    await this.withPlayer(winnerId, (w) => {
      const xp = 30 + (out.loserLevel || w.level) * 10;
      const gold = 25 + (out.loserLevel || w.level) * 6;
      w.gold += gold;
      out.winner.levelUps = addXp(w, xp);
      out.winner.xp = xp;
      out.winner.gold = gold;
      w.stats.duelsWon += 1;
      w.rating += 25;
      track(w, 'duel_win');
      if (out.drop) {
        if (!addToBag(w, out.drop)) out.dropLost = true;
      }
    });
    return out;
  }
}

/** نسخة من المحتوى ترسل للواجهة. */
export { REGIONS, STORY };
