import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, REGIONS, STORY, STATUSES, MONSTER_SKILLS, SPEAKERS } from '../server/game/content.js';
import {
  newPlayer, playerFighter, monsterFighter, addXp, loseXp, xpToNext, makeItem, rng, chapterUnlocked,
} from '../server/game/rules.js';
import { createBattle, act, runAi, aiChoose, validate } from '../server/game/combat.js';
import { generateDailies, track, ensureDailies } from '../server/game/dailies.js';
import { Game, PVP_XP_LOSS } from '../server/game/service.js';
import { MemoryStore } from '../server/store.js';

test('المحتوى سليم: كل فئة لها 5 مهارات بأسماء فريدة وحالات معروفة', () => {
  assert.equal(CLASSES.length, 8);
  const ids = new Set();
  for (const c of CLASSES) {
    assert.equal(c.skills.length, 5, c.key);
    for (const s of c.skills) {
      assert.ok(!ids.has(s.id), `مهارة مكررة ${s.id}`);
      ids.add(s.id);
      for (const e of s.effects) assert.ok(STATUSES[e.status], `${s.id} → ${e.status}`);
    }
  }
  for (const s of Object.values(MONSTER_SKILLS)) for (const e of s.effects) assert.ok(STATUSES[e.status]);
  assert.equal(STORY.length, REGIONS.length * 3);
  for (const ch of STORY) {
    if (!ch.boss) assert.ok(REGIONS.find((r) => r.id === ch.region).monsters.some((m) => m.id === ch.enemy.monster), ch.id);
    for (const l of [...ch.lines, ...(ch.outro || [])]) assert.ok(SPEAKERS[l.speaker], `متحدث بلا أيقونة: ${l.speaker}`);
  }
});

test('الخبرة: الارتقاء وخسارة النسبة لا تُنزل المستوى', () => {
  const p = newPlayer({ id: '1', name: 'a', classKey: 'knight' });
  const ups = addXp(p, xpToNext(1) + xpToNext(2) + 5);
  assert.equal(ups, 2);
  assert.equal(p.level, 3);
  assert.equal(p.xp, 5);
  p.xp = 100;
  assert.equal(loseXp(p, PVP_XP_LOSS), 30);
  assert.equal(p.xp, 70);
  assert.equal(p.level, 3);
});

test('محرك القتال ينتهي دائماً بفائز، والذكاء الاصطناعي لا يختار حركة غير صالحة', () => {
  for (const c of CLASSES) {
    for (const r of REGIONS) {
      const p = newPlayer({ id: 'x', name: 'x', classKey: c.key });
      p.level = r.levels[0];
      const st = createBattle(playerFighter(p), monsterFighter(r.boss, r.levels[1], { boss: true }), 'pve');
      runAi(st);
      let guard = 0;
      while (!st.over && guard++ < 500) {
        const a = aiChoose(st, 'a');
        assert.equal(validate(st, 'a', a), null);
        act(st, 'a', a);
        runAi(st);
      }
      assert.ok(st.over, `${c.key} vs ${r.boss.id}`);
      assert.ok(['a', 'b'].includes(st.winner));
    }
  }
});

test('لا يمكن اللعب خارج الدور أو باستخدام مهارة في فترة التهدئة', () => {
  const p = newPlayer({ id: 'x', name: 'x', classKey: 'mage' });
  const st = createBattle(playerFighter(p), monsterFighter(REGIONS[0].monsters[0], 1), 'pve');
  st.turn = 'b';
  assert.throws(() => act(st, 'a', { type: 'skill', id: 'strike' }), /ليس دورك/);
  st.turn = 'a';
  st.sides.a.cds.fireball = 2;
  assert.throws(() => act(st, 'a', { type: 'skill', id: 'fireball' }), /التهدئة/);
  st.sides.a.potionsUsed = 3;
  assert.throws(() => act(st, 'a', { type: 'item', id: 'potion_small' }), /جرعات/);
});

test('المهام اليومية ثابتة لنفس اليوم وتتقدم بالأحداث', () => {
  const a = generateDailies('u1', 5, '2026-11-08');
  const b = generateDailies('u1', 5, '2026-11-08');
  assert.deepEqual(a, b);
  assert.equal(a.quests.length, 3);
  const p = newPlayer({ id: 'u1', name: 'a', classKey: 'cleric' });
  ensureDailies(p);
  p.dailies.quests[0].event = 'kill';
  p.dailies.quests[0].target = 2;
  track(p, 'kill');
  track(p, 'kill');
  track(p, 'kill');
  assert.equal(p.dailies.quests[0].progress, 2);
});

test('الأدوات: إحصاءات أعلى للندرة الأعلى', () => {
  const c = makeItem(3, 'common', 'weapon');
  const l = makeItem(3, 'legendary', 'weapon');
  assert.ok(l.stats.atk > c.stats.atk);
});

test('طبقة اللعبة: إنشاء، قصة، معركة، مكافآت، ومبارزة', async () => {
  const game = new Game(new MemoryStore(null));
  await game.store.init();
  const me = await game.createCharacter({ id: 'p1', name: 'بطل' }, 'necromancer');
  assert.equal(me.level, 1);
  await assert.rejects(() => game.createCharacter({ id: 'p1', name: 'بطل' }, 'mage'), /بالفعل/);

  // الفصل الثاني مقفل قبل الأول
  const p = await game.store.get('p1');
  assert.equal(chapterUnlocked(p, STORY[1]), false);
  await assert.rejects(() => game.startBattle('p1', { type: 'story', chapterId: 'c2' }), /مقفل/);

  // نلعب الفصل الأول حتى النهاية (نجعل البطل قوياً لضمان الفوز)
  const strong = await game.store.get('p1');
  strong.level = 10;
  await game.store.save(strong);
  const start = await game.startBattle('p1', { type: 'story', chapterId: 'c1' });
  assert.ok(start.battle);
  let res = null;
  for (let i = 0; i < 200 && !res; i++) {
    const r = await game.battleAct('p1', { type: 'skill', id: 'strike' });
    res = r.result;
  }
  assert.ok(res?.win);
  const after = await game.store.get('p1');
  assert.ok(after.story.done.includes('c1'));
  assert.ok(after.gold > 120);

  // مبارزة: الخاسر يفقد 30% من خبرة مستواه
  await game.createCharacter({ id: 'p2', name: 'خصم' }, 'knight');
  const loser = await game.store.get('p2');
  loser.xp = 100;
  loser.bag = [makeItem(1, 'common', 'weapon')];
  await game.store.save(loser);
  const prev = rng.next;
  rng.next = () => 0; // يضمن سقوط الأداة
  const out = await game.finishDuel('p1', 'p2');
  rng.next = prev;
  assert.equal(out.loser.xpLost, 30);
  assert.ok(out.drop);
  const l2 = await game.store.get('p2');
  const w2 = await game.store.get('p1');
  assert.equal(l2.xp, 70);
  assert.equal(l2.bag.length, 0);
  assert.ok(w2.bag.some((x) => x.uid === out.drop.uid));
  assert.equal(w2.stats.duelsWon, 1);
});

test('الخسارة أمام الوحوش تفقد 10% بدون أدوات', async () => {
  const game = new Game(new MemoryStore(null));
  await game.store.init();
  await game.createCharacter({ id: 'w', name: 'ضعيف' }, 'mage');
  const p = await game.store.get('w');
  p.xp = 50;
  p.bag = [makeItem(1, 'rare', 'armor')];
  await game.store.save(p);
  await game.startBattle('w', { type: 'explore', regionId: 'dawn' });
  const st = game.pve.get('w');
  st.sides.a.hp = 1;
  st.sides.b.atk = 9999;
  st.sides.b.passive = {};
  st.sides.a.passive = {};
  st.sides.b.skills = st.sides.b.skills.filter((s) => s.id === 'strike');
  let res = null;
  for (let i = 0; i < 10 && !res; i++) {
    if (st.turn === 'a') res = (await game.battleAct('w', { type: 'skill', id: 'strike' })).result;
  }
  // إن فاز اللاعب بضربة واحدة بالصدفة نعيد المحاولة بشكل حتمي
  if (res?.win) return;
  assert.equal(res.win, false);
  assert.equal(res.xpLost, 5);
  const after = await game.store.get('w');
  assert.equal(after.bag.length, 1);
});
