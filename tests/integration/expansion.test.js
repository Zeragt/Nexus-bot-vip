import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, TEST_DB } from '../helpers/db.js';
import { FakeCommand, FakeComponent, FakeAutocomplete, customIds } from '../helpers/discord.js';
import { buildRegistry } from '../../src/commands/index.js';
import { createInteractionHandler } from '../../src/core/interactions.js';
import { app } from '../../src/core/context.js';
import { getPool } from '../../src/db/pool.js';
import { syncContent } from '../../src/services/content.js';
import { findByUser } from '../../src/services/characters.js';
import { resetContractMemo } from '../../src/services/progress.js';

const A = { id: '500000000000000001', username: 'nora' };
const B = { id: '500000000000000002', username: 'zed' };
const UNEXPECTED = 'حدث خطأ غير متوقع';
let handle;

async function cmd(name, user, { sub, options } = {}) {
  const i = new FakeCommand(name, { sub, options, user });
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
const qty = async (charId, key) =>
  (
    await db().query(
      'SELECT COALESCE(sum(ii.quantity), 0)::int AS n FROM inventory_items ii JOIN items i ON i.id = ii.item_id WHERE ii.character_id = $1 AND i.key = $2',
      [charId, key],
    )
  ).rows[0].n;
async function give(charId, key, n) {
  await db().query(
    `INSERT INTO inventory_items (character_id, item_id, quantity) SELECT $1, id, $3 FROM items WHERE key = $2
     ON CONFLICT (character_id, item_id) DO UPDATE SET quantity = inventory_items.quantity + $3`,
    [charId, key, n],
  );
}
const goTo = (charId, key) => db().query('UPDATE characters SET location_id = (SELECT id FROM locations WHERE key = $2) WHERE id = $1', [charId, key]);
const setChapters = (charId, n) =>
  db().query('INSERT INTO character_story (character_id, chapter) VALUES ($1, $2) ON CONFLICT (character_id) DO UPDATE SET chapter = $2', [charId, n]);

describe.skipIf(!TEST_DB)('v2.5: contracts, bosses, regions, crafting and duel penalties', () => {
  beforeAll(async () => {
    const pool = await setupTestDb();
    await syncContent(pool, { force: true, log: { info() {} } });
    app.permConfig = { ownerIds: [], adminRoleIds: [], moderatorRoleIds: [], eventManagerRoleIds: [], loreManagerRoleIds: [], trustDiscordAdmin: false };
    handle = createInteractionHandler(buildRegistry());
    resetContractMemo();
    for (const [u, name] of [
      [A, 'نورا'],
      [B, 'زيد'],
    ]) {
      clean(await press('chm:create', u, { modal: true, fields: { name, race: 'إنسان', age: '22', gender: 'أنثى', origin: 'الشمال' } }));
    }
  }, 60_000);
  afterAll(teardownTestDb);

  it('syncs the new items, shops and the ten returned worlds', async () => {
    const items = (await db().query("SELECT count(*)::int AS n FROM items WHERE rarity = 'secret'")).rows[0].n;
    expect(items).toBeGreaterThanOrEqual(8);
    const worlds = (await db().query("SELECT count(*)::int AS n FROM locations WHERE region = 'beyond' AND required_chapter > 0")).rows[0].n;
    expect(worlds).toBe(10);
  });

  it('draws a daily board, advances it with play, and rerolls once for free', async () => {
    const board = await cmd('daily', A, { sub: 'board' });
    clean(board);
    expect(board.output.files[0]).toMatch(/^contracts\./);
    const ch = await findByUser(A.id);
    const rows = (await db().query('SELECT * FROM character_contracts WHERE character_id = $1 ORDER BY period, slot', [ch.id])).rows;
    expect(rows.filter((r) => r.period.startsWith('d:'))).toHaveLength(5);
    expect(rows.filter((r) => r.period.startsWith('w:'))).toHaveLength(3);
    // The free reroll swaps the contract in place.
    const daily = rows.filter((r) => r.period.startsWith('d:'));
    const swap = await press(findId(board, 'dl:reroll'), A, { values: [String(daily[0].slot)], message: { attachments: [{ name: 'contracts.webp' }] } });
    clean(swap);
    const after = (
      await db().query('SELECT template FROM character_contracts WHERE character_id = $1 AND period = $2 AND slot = $3', [
        ch.id,
        daily[0].period,
        daily[0].slot,
      ])
    ).rows[0];
    expect(after.template).not.toBe(daily[0].template);
    // The second reroll costs NX; with an empty wallet it is refused.
    await db().query('UPDATE characters SET nx = 0 WHERE id = $1', [ch.id]);
    const paid = await cmd('daily', A, { sub: 'reroll', options: { slot: daily[1].slot + 1 } });
    expect(paid.errors.length).toBe(1);
    clean(await cmd('daily', A, { sub: 'top' }));
  });

  it('pays a contract the moment it completes', async () => {
    const ch = await findByUser(A.id);
    const { rows } = await db().query("SELECT * FROM character_contracts WHERE character_id = $1 AND period LIKE 'd:%' ORDER BY slot", [ch.id]);
    const c = rows[0];
    await db().query(
      'UPDATE character_contracts SET event = $3, target = NULL, required = 1, progress = 0 WHERE character_id = $1 AND period = $2 AND slot = $4',
      [ch.id, c.period, 'visit', c.slot],
    );
    const before = await findByUser(A.id);
    const go = await cmd('travel', A, { options: { destination: 'market' } });
    clean(go);
    expect(go.output.text).toContain('أنجزت');
    const done = (
      await db().query('SELECT claimed_at FROM character_contracts WHERE character_id = $1 AND period = $2 AND slot = $3', [ch.id, c.period, c.slot])
    ).rows[0];
    expect(done.claimed_at).not.toBeNull();
    const now = await findByUser(A.id);
    expect(Number(now.nx)).toBeGreaterThan(Number(before.nx));
    expect((await db().query('SELECT contracts_completed FROM characters WHERE id = $1', [ch.id])).rows[0].contracts_completed).toBe(1);
  });

  it('explores and gathers with story locks, and crafts from what was gathered', async () => {
    const ch = await findByUser(A.id);
    await goTo(ch.id, 'forest');
    await db().query('UPDATE characters SET energy = 999, hp = 9999, vitals_at = now() WHERE id = $1', [ch.id]);
    const view = await cmd('region', A, { sub: 'view' });
    clean(view);
    expect(view.output.files[0]).toMatch(/^region\./);
    clean(await cmd('region', A, { sub: 'explore' }));
    const again = await cmd('region', A, { sub: 'explore' });
    expect(again.errors.length).toBe(1); // cooldown
    clean(await cmd('region', A, { sub: 'gather' }));
    clean(await cmd('region', A, { sub: 'landmarks' }));
    const stats = (await db().query("SELECT * FROM character_region_stats WHERE character_id = $1 AND location_key = 'forest'", [ch.id])).rows[0];
    expect(stats.explored).toBe(1);
    expect(stats.gathered).toBe(1);
    // A sealed world can be viewed but not travelled to.
    clean(await cmd('region', A, { sub: 'view', options: { place: 'the_origin' } }));
    const sealed = await cmd('travel', A, { options: { destination: 'frost_reach' } });
    expect(sealed.errors.length).toBe(1);

    clean(await cmd('craft', A, { sub: 'list' }));
    const ac = new FakeAutocomplete('craft', { sub: 'make', focused: { name: 'recipe', value: '' }, user: A });
    await handle(ac);
    expect(ac.responded.length).toBeGreaterThan(0);
    const { RECIPES } = await import('../../src/content/recipes.js');
    const sealedRecipe = RECIPES.find((r) => r.chapter > 20);
    const refused = await cmd('craft', A, { sub: 'make', options: { recipe: sealedRecipe.key } });
    expect(refused.errors.length).toBe(1);
  });

  it('crafts a recipe when the materials and NX are there', async () => {
    const ch = await findByUser(A.id);
    const { RECIPES } = await import('../../src/content/recipes.js');
    const r = RECIPES.find((x) => x.chapter === 0 && x.level <= 1);
    expect(r).toBeTruthy();
    for (const [k, q] of r.materials) await give(ch.id, k, q);
    await db().query('UPDATE characters SET nx = 100000 WHERE id = $1', [ch.id]);
    const before = await qty(ch.id, r.output);
    const mats = Object.fromEntries(await Promise.all(r.materials.map(async ([k]) => [k, await qty(ch.id, k)])));
    clean(await cmd('craft', A, { sub: 'make', options: { recipe: r.key } }));
    expect(await qty(ch.id, r.output)).toBe(before + r.qty);
    for (const [k, q] of r.materials) expect(await qty(ch.id, k)).toBe(mats[k] - q);
  });

  it('opens a contract chest', async () => {
    const ch = await findByUser(A.id);
    await give(ch.id, 'contract_chest', 1);
    clean(await cmd('inventory', A, { sub: 'use', options: { item: 'contract_chest' } }));
    expect(await qty(ch.id, 'contract_chest')).toBe(0);
  });

  it('shows the hall of 100 bosses and fights a region boss', async () => {
    const hall = await cmd('boss', A, { sub: 'hall' });
    clean(hall);
    expect(hall.output.files[0]).toMatch(/^boss-hall\./);
    clean(await press(findId(hall, 'bs:page'), A, { message: { attachments: [{ name: 'boss-hall.webp' }] } }));
    clean(await press(`bs:filter:${A.id}`, A, { values: ['world'] }));
    clean(await cmd('boss', A, { sub: 'info', options: { boss: 'king_of_dead_stars' } }));
    clean(await cmd('story', A, { sub: 'bosses' }));

    const ch = await findByUser(A.id);
    // Sealed until the story reaches it.
    await goTo(ch.id, 'forest');
    await db().query('UPDATE characters SET level = 40, energy = 999, hp = 99999, vitals_at = now() WHERE id = $1', [ch.id]);
    await setChapters(ch.id, 0);
    const sealed = await cmd('boss', A, { sub: 'fight', options: { boss: 'alpha_shade' } });
    expect(sealed.errors.length).toBe(1);
    await setChapters(ch.id, 5);
    clean(await cmd('boss', A, { sub: 'here' }));
    await db().query('UPDATE character_stats SET strength = 200, defense = 150, agility = 80, endurance = 150 WHERE character_id = $1', [ch.id]);
    await db().query('UPDATE characters SET hp = 99999, vitals_at = now() WHERE id = $1', [ch.id]);
    const start = await cmd('boss', A, { sub: 'fight', options: { boss: 'alpha_shade' } });
    clean(start);
    let i = start;
    let guard = 0;
    for (let atk = findId(i, 'cb:atk'); atk && guard++ < 120; atk = findId(i, 'cb:atk')) {
      i = await press(atk, A);
      clean(i);
    }
    const rec = (await db().query("SELECT kills, attempts FROM character_bosses WHERE character_id = $1 AND boss_key = 'alpha_shade'", [ch.id])).rows[0];
    expect(rec.attempts).toBe(1);
    expect(rec.kills).toBe(1);
    expect(await qty(ch.id, 'trophy_alpha_shade')).toBe(1);
    // Resting after a kill.
    const tired = await cmd('boss', A, { sub: 'fight', options: { boss: 'alpha_shade' } });
    expect(tired.errors.length).toBe(1);
    clean(await cmd('boss', A, { sub: 'top' }));
  });

  async function duel(loserUser) {
    await app.cooldowns.clear(`u:${A.id}`, 'challenge');
    await db().query("UPDATE characters SET location_id = (SELECT id FROM locations WHERE key = 'nexus_city'), hp = 9999, energy = 9999, vitals_at = now()");
    const ch = await cmd('combat', A, { sub: 'challenge', options: { user: B } });
    clean(ch);
    const started = await press(findId(ch, 'cb:acc'), B);
    clean(started);
    expect(findId(started, 'cb:flee')).toBeFalsy(); // no running away from a duel
    const surrender = findId(started, 'cb:surrender');
    expect(surrender).toBeTruthy();
    clean(await press(surrender, loserUser));
  }

  it('a lost duel costs 30% of the level XP and one bag item, which goes to the winner', async () => {
    const loser = await findByUser(B.id);
    const winner = await findByUser(A.id);
    await db().query('UPDATE characters SET xp = 1000 WHERE id = $1', [loser.id]);
    // A bag full of common stacks makes the drop near-certain (each stack is a 50% roll).
    await db().query(
      `INSERT INTO inventory_items (character_id, item_id, quantity)
       SELECT $1, id, 1 FROM items WHERE rarity = 'common' AND tradeable AND type <> 'quest' AND key <> 'soul_ward' ORDER BY id LIMIT 30
       ON CONFLICT DO NOTHING`,
      [loser.id],
    );
    const bagBefore = (await db().query('SELECT sum(quantity)::int AS n FROM inventory_items WHERE character_id = $1', [loser.id])).rows[0].n;
    const winBefore = (await db().query('SELECT sum(quantity)::int AS n FROM inventory_items WHERE character_id = $1', [winner.id])).rows[0].n;
    await duel(B);
    expect((await db().query('SELECT xp FROM characters WHERE id = $1', [loser.id])).rows[0].xp).toBe(700);
    const drop = (await db().query('SELECT * FROM pvp_drops WHERE loser_id = $1 ORDER BY id DESC LIMIT 1', [loser.id])).rows[0];
    expect(drop.xp_lost).toBe(300);
    expect(drop.item_id).not.toBeNull();
    expect((await db().query('SELECT sum(quantity)::int AS n FROM inventory_items WHERE character_id = $1', [loser.id])).rows[0].n).toBe(bagBefore - 1);
    expect((await db().query('SELECT sum(quantity)::int AS n FROM inventory_items WHERE character_id = $1', [winner.id])).rows[0].n).toBe(winBefore + 1);
    expect((await db().query('SELECT pvp_losses FROM characters WHERE id = $1', [loser.id])).rows[0].pvp_losses).toBe(1);
  });

  it('a soul ward breaks instead of the item', async () => {
    const loser = await findByUser(B.id);
    await give(loser.id, 'soul_ward', 1);
    const bagBefore = (
      await db().query(
        "SELECT sum(ii.quantity)::int AS n FROM inventory_items ii JOIN items i ON i.id = ii.item_id WHERE ii.character_id = $1 AND i.key <> 'soul_ward'",
        [loser.id],
      )
    ).rows[0].n;
    await duel(B);
    const drop = (await db().query('SELECT * FROM pvp_drops WHERE loser_id = $1 ORDER BY id DESC LIMIT 1', [loser.id])).rows[0];
    expect(drop.warded).toBe(true);
    expect(await qty(loser.id, 'soul_ward')).toBe(0);
    const bagAfter = (
      await db().query(
        "SELECT sum(ii.quantity)::int AS n FROM inventory_items ii JOIN items i ON i.id = ii.item_id WHERE ii.character_id = $1 AND i.key <> 'soul_ward'",
        [loser.id],
      )
    ).rows[0].n;
    expect(bagAfter).toBe(bagBefore);
  });

  it('losing to a monster costs only 10% and no items', async () => {
    const ch = await findByUser(B.id);
    await goTo(ch.id, 'forest');
    await db().query('UPDATE characters SET xp = 500, hp = 9999, energy = 999, vitals_at = now() WHERE id = $1', [ch.id]);
    const bag = (await db().query('SELECT sum(quantity)::int AS n FROM inventory_items WHERE character_id = $1', [ch.id])).rows[0].n;
    clean(await cmd('hunt', B));
    clean(await cmd('combat', B, { sub: 'forfeit' }));
    expect((await db().query('SELECT xp FROM characters WHERE id = $1', [ch.id])).rows[0].xp).toBe(450);
    expect((await db().query('SELECT sum(quantity)::int AS n FROM inventory_items WHERE character_id = $1', [ch.id])).rows[0].n).toBe(bag);
  });
});
