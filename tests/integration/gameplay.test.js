import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, TEST_DB } from '../helpers/db.js';
import { FakeCommand, FakeComponent, FakeAutocomplete, customIds } from '../helpers/discord.js';
import { buildRegistry } from '../../src/commands/index.js';
import { createInteractionHandler } from '../../src/core/interactions.js';
import { app } from '../../src/core/context.js';
import { getPool } from '../../src/db/pool.js';
import { pay } from '../../src/services/economy.js';
import { findByUser } from '../../src/services/characters.js';
import { combatTimeoutsTask, eventsTask, tradeExpiryTask, questExpiryTask, cleanupTask } from '../../src/tasks.js';
import { Scheduler } from '../../src/core/scheduler.js';

const A = { id: '300000000000000001', username: 'kael' };
const B = { id: '300000000000000002', username: 'lyra' };
const OWNER = { id: '300000000000000009', username: 'owner' };
const STRANGER = { id: '300000000000000005', username: 'nobody' };

let handle;
const UNEXPECTED = 'حدث خطأ غير متوقع';

async function cmd(name, user, { sub, group, options } = {}) {
  const i = new FakeCommand(name, { sub, group, options, user });
  await handle(i);
  expect(i.output.text, `/${name} ${group ?? ''} ${sub ?? ''}`).not.toContain(UNEXPECTED);
  return i;
}
async function press(customId, user, extra = {}) {
  const i = new FakeComponent(customId, { user, ...extra });
  await handle(i);
  expect(i.output.text, customId).not.toContain(UNEXPECTED);
  return i;
}
async function auto(name, user, focused, { sub, group, options } = {}) {
  const i = new FakeAutocomplete(name, { sub, group, options, focused, user });
  await handle(i);
  return i.responded;
}
const clean = (i) => expect(i.errors, JSON.stringify(i.output.texts)).toEqual([]);
const findId = (i, prefix) => customIds(i).find((id) => id.startsWith(prefix));

const createFields = (name) => ({ name, race: 'إنسان', age: '24', gender: 'ذكر', origin: 'مملكة الضباب' });

describe.skipIf(!TEST_DB)('gameplay end to end (real handlers, real Postgres)', () => {
  beforeAll(async () => {
    await setupTestDb();
    app.permConfig = {
      ownerIds: [OWNER.id],
      adminRoleIds: [],
      moderatorRoleIds: [],
      eventManagerRoleIds: [],
      loreManagerRoleIds: [],
      trustDiscordAdmin: false,
    };
    handle = createInteractionHandler(buildRegistry());
  });
  afterAll(teardownTestDb);

  it('onboards players with /start and the creation modal', async () => {
    const start = await cmd('start', A);
    clean(start);
    expect(start.output.files[0]).toMatch(/^welcome\./);
    const createBtn = findId(start, 'hp:create');
    const modal = await press(createBtn, A);
    expect(modal.calls[0].kind).toBe('showModal');

    for (const [u, name] of [
      [A, 'كايل'],
      [B, 'ليرا'],
      [OWNER, 'الحارس'],
    ]) {
      const i = await press('chm:create', u, { modal: true, fields: createFields(name) });
      clean(i);
      expect(i.output.files).toContain('welcome.webp');
    }
    const again = await cmd('character', A, { sub: 'create' });
    expect(again.errors.length).toBe(1);
    const ch = await findByUser(A.id);
    expect(ch.code).toMatch(/^NX-\d{6}$/);
    expect(ch.equipment.weapon).toBeTruthy();
  });

  it('shows the profile and every profile tab as images', async () => {
    const p = await cmd('character', A, { sub: 'profile' });
    clean(p);
    expect(p.output.files).toEqual(['profile.webp']);
    const ch = await findByUser(A.id);
    for (const view of ['stats', 'skills', 'inventory', 'quests', 'economy', 'profile']) {
      const i = await press(`pf:${view}:${ch.id}:${A.id}`, A);
      clean(i);
      expect(i.output.files.length, view).toBe(1);
    }
    const foreign = await press(`pf:stats:${ch.id}:${A.id}`, B);
    expect(foreign.errors.length).toBe(1);
    clean(await cmd('character', A, { sub: 'stats', options: { user: B } }));
  });

  it('edits and allocates', async () => {
    for (const section of ['basic', 'bio', 'traits']) {
      const m = await cmd('character', A, { sub: 'edit', options: { section } });
      expect(m.calls[0].kind, section).toBe('showModal');
    }
    const edit = await press('chm:edit_bio', A, { modal: true, fields: { occupation: 'فارس', personality: 'هادئ وحازم', backstory: 'وُلد عند البوابة.' } });
    clean(edit);
    const ch = await findByUser(A.id);
    expect(ch.profile.occupation).toBe('فارس');
    const bad = await cmd('character', A, { sub: 'allocate', options: { stat: 'strength', points: 99 } });
    expect(bad.errors.length).toBe(1);
  });

  it('runs the economy without duplicating money', async () => {
    clean(await cmd('economy', A, { sub: 'daily' }));
    const second = await cmd('economy', A, { sub: 'daily' });
    expect(second.errors.length).toBe(1);
    clean(await cmd('economy', A, { sub: 'balance' }));
    clean(await cmd('economy', A, { sub: 'pay', options: { user: B, amount: '25' } }));
    const self = await cmd('economy', A, { sub: 'pay', options: { user: A, amount: '5' } });
    expect(self.errors.length).toBe(1);

    const before = (await findByUser(A.id)).nx + (await findByUser(B.id)).nx;
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => pay(A.id, B.id, 40)));
    const a = await findByUser(A.id);
    const b = await findByUser(B.id);
    expect(a.nx).toBeGreaterThanOrEqual(0);
    expect(a.nx + b.nx).toBe(before);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    // Same idempotency key twice → only one transfer.
    const key = 'test-idem-1';
    await pay(B.id, A.id, 10, { idempotencyKey: key });
    await pay(B.id, A.id, 10, { idempotencyKey: key }).catch(() => {});
    const { rows } = await getPool().query('SELECT count(*)::int AS n FROM transactions WHERE idempotency_key = $1', [key]);
    expect(rows[0].n).toBe(1);
    clean(await cmd('economy', A, { sub: 'leaderboard' }));
  });

  it('inventory: view, filter, use, equip and info', async () => {
    const inv = await cmd('inventory', A, { sub: 'view' });
    clean(inv);
    expect(inv.output.files.length).toBe(1);
    const choices = await auto('inventory', A, { name: 'item', value: '' }, { sub: 'use' });
    expect(choices.length).toBeGreaterThan(0);
    const coffee = await cmd('inventory', A, { sub: 'use', options: { item: 'nexus_coffee' } });
    expect(coffee.output.text).not.toContain(UNEXPECTED);
    clean(await cmd('inventory', A, { sub: 'info', options: { item: 'rusty_sword' } }));
    clean(await cmd('inventory', A, { sub: 'unequip', options: { slot: 'weapon' } }));
    clean(await cmd('inventory', A, { sub: 'equip', options: { item: 'rusty_sword' } }));
  });

  it('world: map, travel, NPC talk and shop', async () => {
    clean(await cmd('world', A, { sub: 'map' }));
    clean(await cmd('world', A, { sub: 'location' }));
    const lore = await cmd('world', A, { sub: 'lore' });
    clean(lore);
    const go = await cmd('travel', A, { options: { destination: 'cafe' } });
    clean(go);
    expect((await findByUser(A.id)).location.key).toBe('cafe');
    clean(await cmd('npc', A, { sub: 'talk', options: { npc: 'mira' } }));
    clean(await cmd('shop', A, { sub: 'view' }));
    const buy = await cmd('shop', A, { sub: 'buy', options: { item: 'nexus_coffee', qty: 2 } });
    clean(buy);
    clean(await cmd('shop', A, { sub: 'sell', options: { item: 'nexus_coffee', qty: 1 } }));
    const npcs = await auto('npc', A, { name: 'npc', value: '' }, { sub: 'talk' });
    expect(npcs.length).toBeGreaterThan(0);
  });

  it('quests: board, accept, view, active, abandon', async () => {
    const board = await cmd('quest', A, { sub: 'board' });
    clean(board);
    expect(board.output.files.length).toBe(1);
    clean(await cmd('quest', A, { sub: 'accept', options: { quest: 'Q-0002' } }));
    clean(await cmd('quest', A, { sub: 'view', options: { quest: 'Q-0002' } }));
    clean(await cmd('quest', A, { sub: 'active' }));
    const early = await cmd('quest', A, { sub: 'complete', options: { quest: 'Q-0002' } });
    expect(early.errors.length).toBe(1);
    clean(await cmd('quest', A, { sub: 'abandon', options: { quest: 'Q-0002' } }));
    clean(await cmd('quest', A, { sub: 'accept', options: { quest: 'Q-0001' } }));
  });

  it('PvE: hunts a monster and fights it out with buttons', async () => {
    await getPool().query("DELETE FROM cooldowns WHERE key = 'travel'");
    app.cooldowns.cache.clear();
    const travel = await cmd('travel', A, { options: { destination: 'forest' } });
    if (travel.errors.length) {
      // travel can be on cooldown or need energy; force the move for the test.
      await getPool().query("UPDATE characters SET location_id = (SELECT id FROM locations WHERE key = 'forest') WHERE user_id = $1", [A.id]);
    }
    const hunt = await cmd('hunt', A);
    clean(hunt);
    expect(hunt.output.files).toContain('combat.webp');
    let atk = findId(hunt, 'cb:atk');
    let guard = 0;
    while (atk && guard++ < 80) {
      const i = await press(atk, A);
      clean(i);
      atk = findId(i, 'cb:atk');
    }
    expect(atk).toBeFalsy();
    const { rows } = await getPool().query('SELECT count(*)::int AS n FROM combat_locks');
    expect(rows[0].n).toBe(0);
  });

  it('PvP: challenge, accept, fight to the end', async () => {
    await getPool().query("UPDATE characters SET location_id = (SELECT id FROM locations WHERE key = 'nexus_city')");
    await getPool().query('UPDATE characters SET hp = 9999, energy = 9999, vitals_at = now()'); // clamped by hydrate
    const ch = await cmd('combat', A, { sub: 'challenge', options: { user: B } });
    clean(ch);
    const acc = findId(ch, 'cb:acc');
    const notYou = await press(acc, STRANGER);
    expect(notYou.errors.length).toBe(1);
    let i = await press(acc, B);
    clean(i);
    let guard = 0;
    for (;;) {
      const atk = findId(i, 'cb:atk');
      if (!atk || guard++ > 120) break;
      const turnUser = i.output.texts.find((t) => t.startsWith('دور <@'))?.match(/\d{15,}/)?.[0];
      i = await press(atk, turnUser === A.id ? A : B);
      clean(i);
    }
    expect(findId(i, 'cb:atk')).toBeFalsy();
    clean(await cmd('combat', A, { sub: 'status' }));
  });

  it('trade: NX and items with confirmation from both sides', async () => {
    await getPool().query('UPDATE characters SET nx = nx + 500 WHERE user_id = $1', [A.id]);
    const open = await cmd('trade', A, { options: { user: B } });
    clean(open);
    const tradeId = findId(open, 'tr:addnx').split(':')[2];
    const modal = await press(`tr:addnx:${tradeId}`, A);
    expect(modal.calls[0].kind).toBe('showModal');
    clean(await press(`tr:nx:${tradeId}`, A, { modal: true, fields: { amount: '100' } }));
    const pick = await press(`tr:additem:${tradeId}`, B);
    clean(pick);
    clean(await press(`tr:qty:${tradeId}:health_potion`, B, { modal: true, fields: { qty: '1' } }));
    const aBefore = await findByUser(A.id);
    clean(await press(`tr:confirm:${tradeId}`, A));
    const done = await press(`tr:confirm:${tradeId}`, B);
    clean(done);
    const aAfter = await findByUser(A.id);
    expect(aAfter.nx).toBe(aBefore.nx - 100);
    const stranger = await press(`tr:confirm:${tradeId}`, STRANGER);
    expect(stranger.errors.length).toBe(1);
  });

  it('jobs, skills, factions, achievements, relations and leaderboards', async () => {
    clean(await cmd('job', A, { sub: 'list' }));
    clean(await cmd('job', A, { sub: 'select', options: { job: 'merchant' } }));
    clean(await cmd('job', A, { sub: 'work' }));
    const tired = await cmd('job', A, { sub: 'work' });
    expect(tired.errors.length).toBe(1);
    clean(await cmd('skill', A, { sub: 'list' }));
    clean(await cmd('faction', A, { sub: 'list' }));
    const fkeys = await auto('faction', A, { name: 'faction', value: '' }, { sub: 'view' });
    clean(await cmd('faction', A, { sub: 'view', options: { faction: fkeys[0].value } }));
    clean(await cmd('achievements', A));
    clean(await cmd('relation', A, { sub: 'set', options: { user: B, type: 'rival', note: 'منذ معركة الساحة' } }));
    clean(await cmd('relation', A, { sub: 'list' }));
    for (const metric of ['level', 'wealth', 'reputation', 'quests', 'combat']) clean(await cmd('leaderboard', A, { sub: metric }));
    clean(await cmd('help', A));
  });

  it('guilds: create, invite, accept, deposit, promote, members', async () => {
    const low = await cmd('guild', A, { sub: 'create', options: { name: 'حراس الفجر', tag: 'DAWN' } });
    expect(low.errors.length).toBe(1); // level too low
    clean(await cmd('admin', OWNER, { group: 'character', sub: 'xp', options: { user: A, amount: 5000 } }));
    clean(await cmd('admin', OWNER, { group: 'economy', sub: 'add', options: { user: A, amount: 2000, reason: 'test' } }));
    const g = await cmd('guild', A, { sub: 'create', options: { name: 'حراس الفجر', tag: 'DAWN', description: 'نحرس البوابة' } });
    clean(g);
    const inv = await cmd('guild', A, { sub: 'invite', options: { user: B } });
    clean(inv);
    const accept = findId(inv, 'gi:accept');
    expect((await press(accept, STRANGER)).errors.length).toBe(1);
    clean(await press(accept, B));
    clean(await cmd('guild', A, { sub: 'deposit', options: { amount: '300' } }));
    clean(await cmd('guild', A, { sub: 'promote', options: { user: B } }));
    clean(await cmd('guild', B, { sub: 'profile' }));
    clean(await cmd('guild', B, { sub: 'members' }));
    const wd = await cmd('guild', B, { sub: 'withdraw', options: { amount: '10' } });
    expect(wd.errors.length).toBe(1); // officers cannot withdraw
  });

  it('admin permissions are enforced server-side', async () => {
    const denied = await cmd('admin', STRANGER, { group: 'economy', sub: 'add', options: { user: A, amount: 1 } });
    expect(denied.errors.length).toBe(1);
    clean(await cmd('admin', OWNER, { sub: 'logs' }));
    clean(await cmd('admin', OWNER, { group: 'settings', sub: 'view' }));
    clean(await cmd('admin', OWNER, { group: 'settings', sub: 'set', options: { key: 'xp_multiplier', value: '1.5' } }));
    clean(await cmd('admin', OWNER, { group: 'character', sub: 'view', options: { user: B } }));
    clean(await cmd('admin', OWNER, { group: 'character', sub: 'setstat', options: { user: B, stat: 'luck', value: 20 } }));
    clean(await cmd('admin', OWNER, { group: 'item', sub: 'give', options: { user: B, item: 'iron_sword', qty: 1 } }));
    const create = await cmd('admin', OWNER, { group: 'item', sub: 'create', options: { type: 'weapon', rarity: 'epic', value: 900, weight: 3 } });
    const modalId = create.calls[0].payload.custom_id;
    clean(await press(modalId, OWNER, { modal: true, fields: { key: 'moon_blade', names: 'Moon Blade | نصل القمر', stats: 'attack=14, agility=3' } }));
    clean(await cmd('admin', OWNER, { group: 'item', sub: 'give', options: { user: B, item: 'moon_blade' } }));
    const fac = (await getPool().query('SELECT key FROM factions LIMIT 1')).rows[0].key;
    clean(await cmd('admin', OWNER, { group: 'faction', sub: 'rep', options: { user: B, faction: fac, delta: 50 } }));
  });

  it('game master: quests with review, events with phases and votes, random events, lore', async () => {
    const q = await cmd('gm', OWNER, { group: 'quest', sub: 'create', options: { difficulty: 'hard', xp: 300, nx: 200, review: true } });
    clean(
      await press(q.calls[0].payload.custom_id, OWNER, {
        modal: true,
        fields: { title: 'حارس الذاكرة', description: 'اكتب مشهداً عن ذكرى منسية.', objectives: 'manual - 1 | اكتب المشهد' },
      }),
    );
    const { rows } = await getPool().query("SELECT code FROM quests WHERE title = 'حارس الذاكرة'");
    const code = rows[0].code;
    clean(await cmd('quest', B, { sub: 'accept', options: { quest: code } }));
    const submit = await cmd('quest', B, { sub: 'complete', options: { quest: code } });
    clean(submit);
    const reviews = await getPool().query("SELECT id FROM character_quests WHERE status = 'pending_review'");
    expect(reviews.rows.length).toBe(1);
    clean(await cmd('gm', OWNER, { group: 'quest', sub: 'reviews' }));
    const nxBefore = (await findByUser(B.id)).nx;
    clean(await cmd('gm', OWNER, { group: 'quest', sub: 'review', options: { id: reviews.rows[0].id, approve: true } }));
    expect((await findByUser(B.id)).nx).toBeGreaterThan(nxBefore);

    const ev = await cmd('gm', OWNER, { group: 'event', sub: 'create', options: { starts_in: 0, duration: 60, xp: 50, nx: 80 } });
    clean(
      await press(ev.calls[0].payload.custom_id, OWNER, {
        modal: true,
        fields: { title: 'غزو الظلال', description: 'الظلال تهاجم البوابة!', phases: 'الاستعداد | الدفاع، الهجوم\nالمواجهة' },
      }),
    );
    const evId = (await getPool().query("SELECT id FROM events WHERE title = 'غزو الظلال'")).rows[0].id;
    clean(await cmd('gm', OWNER, { group: 'event', sub: 'post', options: { event: String(evId) } }));
    clean(await cmd('event', A, { sub: 'list' }));
    clean(await cmd('event', A, { sub: 'view', options: { event: String(evId) } }));
    clean(await press(`ev:join:${evId}`, A));
    clean(await press(`ev:join:${evId}`, B));
    clean(await press(`ev:vote:${evId}`, A, { values: ['1'] }));
    clean(await press(`ev:vote:${evId}`, B, { values: ['1'] }));
    const adv = await cmd('gm', OWNER, { group: 'event', sub: 'advance', options: { event: String(evId), note: 'اندفع الأبطال' } });
    clean(adv);
    expect(adv.output.text).toContain('الهجوم');
    clean(await cmd('gm', OWNER, { group: 'event', sub: 'contribute', options: { event: String(evId), user: A, points: 10 } }));
    const xpBefore = (await findByUser(B.id)).xp;
    clean(await cmd('gm', OWNER, { group: 'event', sub: 'end', options: { event: String(evId) } }));
    const after = await findByUser(B.id);
    expect(after.xp !== xpBefore || after.level > 0).toBe(true);
    const twice = await cmd('gm', OWNER, { group: 'event', sub: 'end', options: { event: String(evId) } });
    expect(twice.errors.length).toBe(1);

    const keys = await auto('gm', OWNER, { name: 'key', value: '' }, { group: 'world', sub: 'spawn' });
    expect(keys.length).toBeGreaterThan(0);
    const def =
      (await getPool().query("SELECT key FROM random_event_definitions WHERE location_keys = '{}' OR 'nexus_city' = ANY(location_keys) LIMIT 1")).rows[0]
        ?.key ?? keys[0].value;
    const spawn = await cmd('gm', OWNER, { group: 'world', sub: 'spawn', options: { key: def } });
    clean(spawn);
    const inst = (await getPool().query('SELECT id, location_id FROM random_event_instances ORDER BY created_at DESC LIMIT 1')).rows[0];
    await getPool().query('UPDATE characters SET location_id = COALESCE($1, location_id)', [inst.location_id]);
    clean(await press(`rev:claim:${inst.id}`, A));
    expect((await press(`rev:claim:${inst.id}`, A)).errors.length).toBe(1);

    const lore = await cmd('gm', OWNER, { group: 'world', sub: 'lore', options: { category: 'history' } });
    clean(
      await press(lore.calls[0].payload.custom_id, OWNER, {
        modal: true,
        fields: { slug: 'the-first-gate', title: 'البوابة الأولى', content: 'قبل ألف عام انفتحت البوابة الأولى...' },
      }),
    );
    clean(await cmd('world', A, { sub: 'lore', options: { entry: 'the-first-gate' } }));
    clean(await cmd('gm', OWNER, { group: 'world', sub: 'flags', options: { location: 'ruins', locked: true } }));
    clean(await cmd('gm', OWNER, { group: 'npc', sub: 'dialogue', options: { npc: 'mira', text: 'القهوة اليوم على حسابي... ربما.' } }));
  });

  it('scheduler tasks run cleanly and a task is claimed only once', async () => {
    await combatTimeoutsTask();
    await tradeExpiryTask();
    await eventsTask();
    await questExpiryTask();
    await cleanupTask();
    let runs = 0;
    const s1 = new Scheduler(getPool(), { log: { info() {}, error() {}, debug() {} } }).add('once_test', 60_000, async () => runs++);
    const s2 = new Scheduler(getPool(), { log: { info() {}, error() {}, debug() {} } }).add('once_test', 60_000, async () => runs++);
    await s1.start();
    await s2.start();
    await Promise.all([s1.runTask(s1.tasks.get('once_test')), s2.runTask(s2.tasks.get('once_test'))]);
    await s1.stop();
    await s2.stop();
    expect(runs).toBe(1);
  });

  it('deletes a character only after confirmation, and frees everything', async () => {
    const del = await cmd('character', B, { sub: 'delete' });
    const confirm = findId(del, 'chm:delete');
    expect((await press(confirm, A)).errors.length).toBe(1);
    clean(await press(confirm, B));
    expect(await findByUser(B.id)).toBeNull();
    const g = await getPool().query("SELECT leader_character_id FROM guilds WHERE tag = 'DAWN'");
    expect(g.rows.length).toBe(1);
  });
});
