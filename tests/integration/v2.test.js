import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, TEST_DB } from '../helpers/db.js';
import { FakeCommand, FakeComponent, FakeAutocomplete, customIds } from '../helpers/discord.js';
import { buildRegistry } from '../../src/commands/index.js';
import { createInteractionHandler } from '../../src/core/interactions.js';
import { app } from '../../src/core/context.js';
import { getPool } from '../../src/db/pool.js';
import { syncContent } from '../../src/services/content.js';
import { findByUser } from '../../src/services/characters.js';
import { CHAPTERS } from '../../src/content/story/index.js';

const A = { id: '400000000000000001', username: 'aria' };
const B = { id: '400000000000000002', username: 'kai' };
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

async function fightToTheEnd(first, user) {
  let atk = findId(first, 'cb:atk');
  let i = first;
  let guard = 0;
  while (atk && guard++ < 120) {
    i = await press(atk, user);
    clean(i);
    atk = findId(i, 'cb:atk');
  }
  return i;
}

describe.skipIf(!TEST_DB)('v2: classes, story and codex end to end', () => {
  beforeAll(async () => {
    const pool = await setupTestDb();
    await syncContent(pool, { force: true, log: { info() {} } });
    app.permConfig = { ownerIds: [], adminRoleIds: [], moderatorRoleIds: [], eventManagerRoleIds: [], loreManagerRoleIds: [], trustDiscordAdmin: false };
    handle = createInteractionHandler(buildRegistry());
    for (const [u, name] of [
      [A, 'آريا'],
      [B, 'كاي'],
    ]) {
      const i = await press('chm:create', u, { modal: true, fields: { name, race: 'إنسان', age: '20', gender: 'أنثى', origin: 'الضباب' } });
      clean(i);
    }
  }, 60_000);
  afterAll(teardownTestDb);

  it('picks a class from the gallery and gets its skills', async () => {
    const browse = await cmd('class', A, { sub: 'browse', options: { category: 'divine' } });
    clean(browse);
    expect(browse.output.files[0]).toMatch(/^classes\./);
    const choose = await cmd('class', A, { sub: 'choose', options: { class: 'paladin' } });
    clean(choose);
    const ch = await findByUser(A.id);
    expect(ch.classKey).toBe('paladin');
    const { rows } = await db().query(
      'SELECT count(*)::int AS n FROM character_skills cs JOIN skills s ON s.id = cs.skill_id WHERE cs.character_id = $1 AND s.class_key = $2',
      [ch.id, 'paladin'],
    );
    expect(rows[0].n).toBeGreaterThan(0);
    clean(await cmd('class', A, { sub: 'loadout' }));
  });

  it('shows the first chapter, its pages, and refuses chapters not reached', async () => {
    const cur = await cmd('story', A, { sub: 'current' });
    clean(cur);
    expect(cur.output.files[0]).toMatch(/^story\./);
    const read = findId(cur, 'st:read');
    expect(read).toBeTruthy();
    let i = await press(read, A, { message: { attachments: [{ name: 'story.webp' }] } });
    clean(i);
    for (let p = 2; p <= CHAPTERS[0].pages.length; p++) {
      i = await press(`st:read:${A.id}:c01:${p}`, A, { message: { attachments: [{ name: 'story.webp' }] } });
      clean(i);
    }
    expect(findId(i, 'st:fight')).toBeTruthy();
    const locked = await cmd('story', A, { sub: 'read', options: { chapter: 'c10' } });
    expect(locked.errors.length).toBe(1);
    const other = await press(`st:read:${A.id}:c01:1`, B);
    expect(other.errors.length).toBe(1);
  });

  it('beats the chapter boss, earns the rewards once, and moves on', async () => {
    const ch = await findByUser(A.id);
    // Make the hero strong enough to win reliably; the fight is still played through the real buttons.
    await db().query(
      "UPDATE characters SET hp = 99999, energy = 9999, vitals_at = now(), location_id = (SELECT id FROM locations WHERE key = 'central_plaza') WHERE id = $1",
      [ch.id],
    );
    await db().query('UPDATE character_stats SET strength = 80, defense = 60, agility = 40, endurance = 60 WHERE character_id = $1', [ch.id]);
    const before = (await findByUser(A.id)).nx;
    const start = await cmd('story', A, { sub: 'fight' });
    clean(start);
    expect(start.output.files).toContain('combat.webp');
    const end = await fightToTheEnd(start, A);
    const follow = end.calls.find((c) => c.kind === 'followUp' && c.payload?.files?.length);
    expect(follow, 'victory page follow-up').toBeTruthy();
    const { rows } = await db().query('SELECT chapter FROM character_story WHERE character_id = $1', [ch.id]);
    expect(rows[0].chapter).toBe(1);
    expect((await findByUser(A.id)).nx).toBeGreaterThan(before);
    clean(await press(`st:win:${A.id}:c01`, A));
    const list = await cmd('story', A, { sub: 'chapters' });
    clean(list);
    clean(await cmd('story', A, { sub: 'bosses' }));
  });

  it('gates the story behind pending choices and records the decision', async () => {
    const ch = await findByUser(A.id);
    // Jump to right after chapter 6, which ends with a decision.
    await db().query('UPDATE character_story SET chapter = 6 WHERE character_id = $1', [ch.id]);
    await db().query('UPDATE characters SET level = 20 WHERE id = $1', [ch.id]);
    const fight = await cmd('story', A, { sub: 'fight' });
    expect(fight.errors.length).toBe(1);
    const cur = await cmd('story', A, { sub: 'current' });
    clean(cur);
    const choose = findId(cur, 'st:choose');
    expect(choose).toBeTruthy();
    clean(await press(choose, A, { message: { attachments: [{ name: 'story.webp' }] } }));
    const again = await press(choose, A);
    expect(again.errors.length).toBe(1);
    const { rows } = await db().query('SELECT choices FROM character_story WHERE character_id = $1', [ch.id]);
    expect(rows[0].choices.c06).toBe(0);
    const away = await cmd('story', A, { sub: 'fight' });
    expect(away.errors.length).toBe(1); // chapter 7 is in the crystal caverns
  });

  it('counts a lost boss fight as an attempt without advancing', async () => {
    const ch = await findByUser(B.id);
    await db().query(
      "UPDATE characters SET hp = 99999, vitals_at = now(), location_id = (SELECT id FROM locations WHERE key = 'central_plaza') WHERE id = $1",
      [ch.id],
    );
    const start = await cmd('story', B, { sub: 'fight' });
    clean(start);
    clean(await cmd('combat', B, { sub: 'forfeit' }));
    const { rows } = await db().query('SELECT chapter, boss_attempts FROM character_story WHERE character_id = $1', [ch.id]);
    expect(rows[0].chapter).toBe(0);
    expect(rows[0].boss_attempts).toBe(1);
  });

  it('browses the codex, hides sealed entries and opens the bestiary', async () => {
    const idx = await cmd('codex', A, { sub: 'browse', options: { category: 'characters' } });
    clean(idx);
    expect(idx.output.files[0]).toMatch(/^codex\./);
    clean(await cmd('codex', A, { sub: 'entry', options: { entry: 'char_aurel' } }));
    const sealed = await cmd('codex', B, { sub: 'entry', options: { entry: 'char_valerius' } });
    expect(sealed.errors.length).toBe(1);
    const ac = new FakeAutocomplete('codex', { sub: 'entry', focused: { name: 'entry', value: '' }, user: B });
    await handle(ac);
    expect(ac.responded.some((c) => c.value === 'char_valerius')).toBe(false);
    clean(await cmd('codex', A, { sub: 'bestiary', options: { region: 'ashen_wastes' } }));
    clean(await press(`cx:page:${A.id}:places:2`, A, { message: { attachments: [{ name: 'codex.webp' }] } }));
  });
});
