import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, TEST_DB } from '../helpers/db.js';
import { FakeCommand, FakeComponent, customIds } from '../helpers/discord.js';
import { buildRegistry } from '../../src/commands/index.js';
import { createInteractionHandler } from '../../src/core/interactions.js';
import { app } from '../../src/core/context.js';
import { getPool, tx } from '../../src/db/pool.js';
import { syncContent } from '../../src/services/content.js';
import { findByUser } from '../../src/services/characters.js';
import { applyPvpStakes, applyXpLoss } from '../../src/services/stakes.js';
import { track } from '../../src/services/progress.js';
import { complete, review } from '../../src/services/quests.js';
import { setSetting, invalidateSettings } from '../../src/services/settings.js';

const A = { id: '500000000000000001', username: 'nora' };
const B = { id: '500000000000000002', username: 'zaid' };
const UNEXPECTED = 'حدث خطأ غير متوقع';
let handle;

async function cmd(name, user, { sub, group, options } = {}) {
  const i = new FakeCommand(name, { sub, group, options, user });
  await handle(i);
  expect(i.output.text, `/${name} ${sub ?? ''}`).not.toContain(UNEXPECTED);
  return i;
}
async function press(customId, user, extra = {}) {
  const i = new FakeComponent(customId, { user, ...extra });
  await handle(i);
  expect(i.output.text, customId).not.toContain(UNEXPECTED);
  return i;
}
const clean = (i) => expect(i.errors, JSON.stringify(i.output.texts)).toEqual([]);
const findId = (i, prefix) => customIds(i).find((id) => id.startsWith(prefix));
const db = () => getPool();
const fixedRng = (next = 0) => ({ next: () => next, chance: (p) => next < p, int: (a) => a, range: (a) => a, pick: (arr) => arr[0] });

async function itemQty(userId, key) {
  const { rows } = await db().query(
    `SELECT COALESCE(SUM(ii.quantity), 0)::int AS n FROM inventory_items ii JOIN items i ON i.id = ii.item_id JOIN characters c ON c.id = ii.character_id
     WHERE c.user_id = $1 AND i.key = $2`,
    [userId, key],
  );
  return rows[0].n;
}
async function give(userId, key, qty) {
  await db().query(
    `INSERT INTO inventory_items (character_id, item_id, quantity)
     SELECT c.id, i.id, $3 FROM characters c, items i WHERE c.user_id = $1 AND i.key = $2
     ON CONFLICT (character_id, item_id) DO UPDATE SET quantity = inventory_items.quantity + EXCLUDED.quantity`,
    [userId, key, qty],
  );
}
async function moveTo(userId, locationKey, extra = '') {
  await db().query(
    `UPDATE characters SET location_id = (SELECT id FROM locations WHERE key = $2), zone_key = NULL, hp = 99999, energy = 99999, vitals_at = now() ${extra}
     WHERE user_id = $1`,
    [userId, locationKey],
  );
}

describe.skipIf(!TEST_DB)('v3: daily quests, exploration, crafting and duel stakes', () => {
  beforeAll(async () => {
    const pool = await setupTestDb();
    await syncContent(pool, { force: true, log: { info() {} } });
    app.permConfig = { ownerIds: [], adminRoleIds: [], moderatorRoleIds: [], eventManagerRoleIds: [], loreManagerRoleIds: [], trustDiscordAdmin: false };
    handle = createInteractionHandler(buildRegistry());
    for (const [u, name] of [
      [A, 'نورا'],
      [B, 'زيد'],
    ])
      clean(await press('chm:create', u, { modal: true, fields: { name, race: 'إنسان', age: '22', gender: 'أنثى', origin: 'الضباب' } }));
    // Cooldowns are covered elsewhere; here every action may repeat at once.
    app.cooldowns.remaining = async () => 0;
  }, 60_000);
  afterAll(teardownTestDb);

  it('builds a daily board of six and a weekly board of three', async () => {
    const i = await cmd('daily', A, { sub: 'board' });
    clean(i);
    expect(i.output.files[0]).toMatch(/^daily\./);
    const ch = await findByUser(A.id);
    const { rows } = await db().query("SELECT period, count(*)::int AS n FROM daily_quests WHERE character_id = $1 AND status <> 'replaced' GROUP BY period", [
      ch.id,
    ]);
    expect(Object.fromEntries(rows.map((r) => [r.period, r.n]))).toEqual({ daily: 6, weekly: 3 });
    // Opening it again does not create a second board.
    clean(await cmd('daily', A, { sub: 'board' }));
    const again = await db().query("SELECT count(*)::int AS n FROM daily_quests WHERE character_id = $1 AND status <> 'replaced'", [ch.id]);
    expect(again.rows[0].n).toBe(9);
  });

  it('rerolls an unfinished quest, free first and then for NX', async () => {
    const ch = await findByUser(A.id);
    const before = (await db().query("SELECT * FROM daily_quests WHERE character_id = $1 AND period = 'daily' AND slot = 2 AND status <> 'replaced'", [ch.id]))
      .rows[0];
    clean(await cmd('daily', A, { sub: 'reroll', options: { slot: 2 } }));
    const after = (await db().query("SELECT * FROM daily_quests WHERE character_id = $1 AND period = 'daily' AND slot = 2 AND status <> 'replaced'", [ch.id]))
      .rows[0];
    expect(after.id).not.toBe(before.id);
    await db().query('UPDATE characters SET nx = 1000 WHERE id = $1', [ch.id]);
    const board = await cmd('daily', A, { sub: 'board' });
    const sel = findId(board, 'dq:reroll');
    expect(sel).toBeTruthy();
    clean(await press(sel, A, { values: ['3'] }));
    expect((await findByUser(A.id)).nx).toBeLessThan(1000);
  });

  it('tracks real actions into the board and pays the chest when all six are claimed', async () => {
    const ch = await findByUser(A.id);
    // Make one quest a simple "explore once" and do it for real.
    await db().query(
      "UPDATE daily_quests SET kind = 'explore', target = 'any', required = 1, progress = 0 WHERE character_id = $1 AND period = 'daily' AND slot = 1 AND status = 'active'",
      [ch.id],
    );
    await moveTo(A.id, 'forest');
    clean(await cmd('explore', A));
    const q1 = (await db().query("SELECT status FROM daily_quests WHERE character_id = $1 AND period = 'daily' AND slot = 1 AND status <> 'replaced'", [ch.id]))
      .rows[0];
    expect(['done', 'claimed']).toContain(q1.status);
    await db().query("UPDATE combat_sessions SET status = 'cancelled' WHERE status IN ('pending','active')");
    await db().query('DELETE FROM combat_locks');
    // Finish the rest and claim everything.
    await db().query("UPDATE daily_quests SET status = 'done', progress = required WHERE character_id = $1 AND period = 'daily' AND status = 'active'", [
      ch.id,
    ]);
    const xpBefore = (await findByUser(A.id)).xp;
    const levelBefore = (await findByUser(A.id)).level;
    clean(await cmd('daily', A, { sub: 'claim' }));
    const after = await findByUser(A.id);
    expect(after.level > levelBefore || after.xp > xpBefore).toBe(true);
    expect(after.counters.questStreak).toBe(1);
    expect(after.counters.dailiesCompleted).toBe(1);
    expect(await itemQty(A.id, 'daily_chest')).toBe(1);
    // Nothing left to claim.
    const again = await cmd('daily', A, { sub: 'claim' });
    expect(again.errors.length).toBe(1);
  });

  it('opens the daily chest from the bag', async () => {
    const nxBefore = (await findByUser(A.id)).nx;
    const i = await cmd('inventory', A, { sub: 'use', options: { item: 'daily_chest' } });
    clean(i);
    expect(await itemQty(A.id, 'daily_chest')).toBe(0);
    const { rows } = await db().query("SELECT count(*)::int AS n FROM transactions WHERE kind = 'box'");
    const bagSize = (
      await db().query('SELECT count(*)::int AS n FROM inventory_items ii JOIN characters c ON c.id = ii.character_id WHERE c.user_id = $1', [A.id])
    ).rows[0].n;
    expect(rows[0].n > 0 || (await findByUser(A.id)).nx > nxBefore || bagSize > 0).toBe(true);
  });

  it('gathers zone resources and explores deeper zones, revealing the hidden one', async () => {
    await moveTo(B.id, 'forest', ', level = 50');
    const g = await cmd('gather', B);
    clean(g);
    const forestRes = ['glow_herb', 'ancient_bark', 'wolf_pelt'];
    const got = await Promise.all(forestRes.map((k) => itemQty(B.id, k)));
    expect(got.reduce((s, n) => s + n, 0)).toBeGreaterThan(0);

    const blocked = await cmd('zone', B, { sub: 'move', options: { zone: 'forest_deepwood' } });
    expect(blocked.errors.length).toBe(1);
    const ch = await findByUser(B.id);
    await db().query(
      `INSERT INTO character_exploration (character_id, location_key, points) VALUES ($1, 'forest', 60)
       ON CONFLICT (character_id, location_key) DO UPDATE SET points = 60`,
      [ch.id],
    );
    clean(await cmd('zone', B, { sub: 'view' }));
    const hidden = (await import('../../src/content/regions.js')).zonesOf('forest').find((z) => z.depth === 4);
    const xpBefore = (await findByUser(B.id)).xp;
    const move = await cmd('zone', B, { sub: 'move', options: { zone: hidden.key } });
    clean(move);
    const after = await findByUser(B.id);
    expect(after.zoneKey).toBe(hidden.key);
    expect(after.xp !== xpBefore || after.level > 50).toBe(true);
    const exp = (await db().query("SELECT secrets FROM character_exploration WHERE character_id = $1 AND location_key = 'forest'", [ch.id])).rows[0];
    expect(exp.secrets).toContain(hidden.key);
    clean(await cmd('region', B));
    // Travelling resets the zone.
    await db().query("UPDATE characters SET location_id = (SELECT id FROM locations WHERE key = 'nexus_city') WHERE user_id = $1", [B.id]);
    clean(await cmd('travel', B, { options: { destination: 'market' } }));
    expect((await findByUser(B.id)).zoneKey).toBeNull();
  });

  it('crafts at the right station only', async () => {
    await give(B.id, 'iron_ore', 12);
    await db().query('UPDATE characters SET nx = nx + 500 WHERE user_id = $1', [B.id]);
    const wrongPlace = await cmd('craft', B, { sub: 'make', options: { recipe: 'iron_sword' } });
    expect(wrongPlace.errors.length).toBe(1);
    await moveTo(B.id, 'blacksmith');
    clean(await cmd('craft', B, { sub: 'list' }));
    const before = await itemQty(B.id, 'iron_sword');
    clean(await cmd('craft', B, { sub: 'make', options: { recipe: 'iron_sword', times: 2 } }));
    expect(await itemQty(B.id, 'iron_sword')).toBe(before + 2);
    expect(await itemQty(B.id, 'iron_ore')).toBe(0);
    expect((await findByUser(B.id)).counters.itemsCrafted).toBe(2);
    const noMats = await cmd('craft', B, { sub: 'make', options: { recipe: 'iron_sword' } });
    expect(noMats.errors.length).toBe(1);
  });

  it('duel stakes: loser drops 30% XP and one item to the winner; a charm protects the item', async () => {
    const a = await findByUser(A.id);
    const b = await findByUser(B.id);
    await db().query('DELETE FROM inventory_items WHERE character_id = $1', [b.id]);
    await give(B.id, 'wolf_pelt', 3);
    await db().query('UPDATE characters SET xp = 1000 WHERE id = $1', [b.id]);
    const pelt = await itemQty(A.id, 'wolf_pelt');
    const res = await tx((c) => applyPvpStakes(c, { winnerId: a.id, loserId: b.id, sessionId: null }, fixedRng(0)));
    expect(res.xpLost).toBe(300);
    expect(res.item.key).toBe('wolf_pelt');
    expect(await itemQty(B.id, 'wolf_pelt')).toBe(2);
    expect(await itemQty(A.id, 'wolf_pelt')).toBe(pelt + 1);
    expect((await findByUser(B.id)).xp).toBe(700);

    await give(B.id, 'guardian_charm', 1);
    const prot = await tx((c) => applyPvpStakes(c, { winnerId: a.id, loserId: b.id, sessionId: null }, fixedRng(0)));
    expect(prot.protected).toBe(true);
    expect(prot.item).toBeNull();
    expect(await itemQty(B.id, 'guardian_charm')).toBe(0);
    expect(await itemQty(B.id, 'wolf_pelt')).toBe(2);

    // A secret relic only falls when the roll is under 0.0001.
    await db().query('DELETE FROM inventory_items WHERE character_id = $1', [b.id]);
    await give(B.id, 'nexus_spark', 1);
    const safe = await tx((c) => applyPvpStakes(c, { winnerId: a.id, loserId: b.id, sessionId: null }, fixedRng(0.0002)));
    expect(safe.item).toBeNull();
    expect(await itemQty(B.id, 'nexus_spark')).toBe(1);
    const unlucky = await tx((c) => applyPvpStakes(c, { winnerId: a.id, loserId: b.id, sessionId: null }, fixedRng(0.00005)));
    expect(unlucky.item.rarity).toBe('secret');
    expect(await itemQty(A.id, 'nexus_spark')).toBe(1);
    const logged = await db().query('SELECT count(*)::int AS n FROM pvp_stakes WHERE loser_id = $1', [b.id]);
    expect(logged.rows[0].n).toBe(4);

    // Monsters only take 10%, and admins can change both numbers.
    await db().query('UPDATE characters SET xp = 1000 WHERE id = $1', [b.id]);
    expect(await tx((c) => applyXpLoss(c, b.id, 10))).toBe(100);
    await setSetting('pvp_xp_loss_pct', 20);
    invalidateSettings();
    await db().query('UPDATE characters SET xp = 1000 WHERE id = $1', [b.id]);
    expect((await tx((c) => applyPvpStakes(c, { winnerId: a.id, loserId: b.id, sessionId: null }, fixedRng(0.99)))).xpLost).toBe(200);
    await setSetting('pvp_xp_loss_pct', 30);
    invalidateSettings();
  });

  it('a real duel ends with the stakes applied and logged', async () => {
    await db().query("UPDATE characters SET location_id = (SELECT id FROM locations WHERE key = 'nexus_city'), hp = 9999, energy = 9999, vitals_at = now()");
    const ch = await cmd('combat', A, { sub: 'challenge', options: { user: B } });
    clean(ch);
    expect(ch.output.files[0]).toBeTruthy();
    let i = await press(findId(ch, 'cb:acc'), B);
    clean(i);
    expect(findId(i, 'cb:flee')).toBeFalsy();
    let guard = 0;
    for (;;) {
      const atk = findId(i, 'cb:atk');
      if (!atk || guard++ > 150) break;
      const turnUser = i.output.texts.find((t) => t.startsWith('دور <@'))?.match(/\d{15,}/)?.[0];
      i = await press(atk, turnUser === A.id ? A : B);
      clean(i);
    }
    const s = (await db().query("SELECT * FROM combat_sessions WHERE kind = 'pvp' ORDER BY created_at DESC LIMIT 1")).rows[0];
    expect(s.status).toBe('finished');
    const logged = await db().query('SELECT * FROM pvp_stakes WHERE session_id = $1', [s.id]);
    expect(logged.rowCount).toBe(1);
    const a = await findByUser(A.id);
    const b = await findByUser(B.id);
    expect(a.counters.pvpWins + b.counters.pvpWins).toBe(1);
    expect(a.counters.pvpLosses + b.counters.pvpLosses).toBe(1);
  });

  it('the server goal fills from everyone and pays contributors', async () => {
    const { rows } = await db().query('SELECT * FROM world_goals ORDER BY day DESC LIMIT 1');
    const goal = rows[0];
    expect(goal).toBeTruthy();
    const a = await findByUser(A.id);
    await tx((c) => track(c, a.id, goal.kind, { target: 'forest', amount: goal.required }));
    const done = (await db().query('SELECT * FROM world_goals WHERE day = $1', [goal.day])).rows[0];
    expect(done.completed_at).toBeTruthy();
    clean(await cmd('daily', A, { sub: 'view', group: 'world' }));
    const nxBefore = (await findByUser(A.id)).nx;
    clean(await cmd('daily', A, { sub: 'claim', group: 'world' }));
    expect((await findByUser(A.id)).nx).toBeGreaterThan(nxBefore);
    const twice = await cmd('daily', A, { sub: 'claim', group: 'world' });
    expect(twice.errors.length).toBe(1);
  });

  it('a rejected quest review keeps the hand-in items', async () => {
    const a = await findByUser(A.id);
    const q = (
      await db().query(
        `INSERT INTO quests (code, title, description, difficulty, min_level, xp_reward, nx_reward, requires_review, active)
         VALUES ('Q-9001', 'جمع الأعشاب', 'اجمع أعشاباً', 'easy', 1, 10, 10, TRUE, TRUE) RETURNING id`,
      )
    ).rows[0];
    await db().query(
      "INSERT INTO quest_objectives (quest_id, position, description, kind, target_key, required_count) VALUES ($1, 1, 'أعشاب', 'collect', 'glow_herb', 2)",
      [q.id],
    );
    const cq = (await db().query("INSERT INTO character_quests (character_id, quest_id, status) VALUES ($1, $2, 'active') RETURNING id", [a.id, q.id])).rows[0];
    await give(A.id, 'glow_herb', 2);
    const before = await itemQty(A.id, 'glow_herb');
    const res = await complete(A.id, 'Q-9001');
    expect(res.review).toBe(true);
    expect(await itemQty(A.id, 'glow_herb')).toBe(before);
    await review(cq.id, false, { actorId: 'staff' });
    expect(await itemQty(A.id, 'glow_herb')).toBe(before);
    await complete(A.id, 'Q-9001');
    await review(cq.id, true, { actorId: 'staff' });
    expect(await itemQty(A.id, 'glow_herb')).toBe(before - 2);
  });

  it('new commands register and the story has five acts', async () => {
    const names = [...buildRegistry().commands.keys()];
    for (const n of ['daily', 'explore', 'gather', 'zone', 'region', 'craft']) expect(names).toContain(n);
    clean(await cmd('story', A, { sub: 'chapters', options: { act: 5 } }));
  });
});
