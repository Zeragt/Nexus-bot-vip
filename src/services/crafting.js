import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { RECIPES, RECIPE_BY_KEY, STATIONS, stationAvailable } from '../content/recipes.js';
import { requireByUser, loadCharacter } from './characters.js';
import { addItem, removeItem, assertCapacity } from './inventory.js';
import { debit } from './economy.js';
import { checkAchievements } from './achievements.js';
import { track } from './progress.js';

export const MAX_CRAFT_BATCH = 10;

async function itemsByKeys(db, keys) {
  const { rows } = await db.query('SELECT id, key, name_ar, rarity, weight, type FROM items WHERE key = ANY($1::text[])', [keys]);
  return Object.fromEntries(rows.map((r) => [r.key, r]));
}

/** Every recipe with what the player has, what is missing, and whether it can be made right here. */
export async function recipeBook(userId, { station = null } = {}) {
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const list = RECIPES.filter((r) => !station || r.station === station);
  const keys = [...new Set(list.flatMap((r) => [r.output, ...r.inputs.map(([k]) => k)]))];
  const items = await itemsByKeys(db, keys);
  const inv = Object.fromEntries(
    (
      await db.query(
        'SELECT i.key, ii.quantity FROM inventory_items ii JOIN items i ON i.id = ii.item_id WHERE ii.character_id = $1 AND i.key = ANY($2::text[])',
        [ch.id, keys],
      )
    ).rows.map((r) => [r.key, r.quantity]),
  );
  const recipes = list
    .filter((r) => items[r.output])
    .map((r) => {
      const inputs = r.inputs.map(([k, n]) => ({ key: k, name: items[k]?.name_ar ?? k, rarity: items[k]?.rarity ?? 'common', need: n, have: inv[k] ?? 0 }));
      const here = stationAvailable(r.station, ch.location?.key);
      const levelOk = ch.level >= r.minLevel;
      const enough = inputs.every((x) => x.have >= x.need);
      const batches = Math.min(MAX_CRAFT_BATCH, ...inputs.map((x) => Math.floor(x.have / x.need)), r.nx ? Math.floor(ch.nx / r.nx) : MAX_CRAFT_BATCH);
      return {
        ...r,
        name: items[r.output].name_ar,
        rarity: items[r.output].rarity,
        type: items[r.output].type,
        stationName: STATIONS[r.station].name,
        inputs,
        here,
        levelOk,
        enough,
        ready: here && levelOk && enough && ch.nx >= r.nx,
        batches: Math.max(0, batches),
      };
    })
    .sort((a, b) => Number(b.ready) - Number(a.ready) || Number(b.levelOk) - Number(a.levelOk) || a.minLevel - b.minLevel);
  return { character: ch, recipes };
}

export async function recipeAutocomplete(userId, query) {
  const { recipes } = await recipeBook(userId).catch(() => ({ recipes: [] }));
  const q = String(query ?? '').trim();
  return recipes
    .filter((r) => !q || r.name.includes(q) || r.key.includes(q.toLowerCase()))
    .slice(0, 25)
    .map((r) => ({ name: `${r.ready ? '✓' : '·'} ${r.name} (${r.stationName}، مستوى ${r.minLevel})`.slice(0, 100), value: r.key }));
}

/** Crafts `times` batches of a recipe: consumes materials and NX, adds the output. */
export async function craft(userId, recipeKey, times = 1) {
  const recipe = RECIPE_BY_KEY[recipeKey];
  if (!recipe) throw new UserError('لم أجد هذه الوصفة. تصفّح /craft list');
  if (!Number.isInteger(times) || times < 1 || times > MAX_CRAFT_BATCH) throw new UserError(`عدد المرات بين 1 و ${MAX_CRAFT_BATCH}`);
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    if (ch.level < recipe.minLevel) throw new UserError(`تحتاج إلى المستوى ${recipe.minLevel} لصنع هذا`);
    const station = STATIONS[recipe.station];
    if (!stationAvailable(recipe.station, ch.location?.key)) {
      const names = (await db.query('SELECT name_ar FROM locations WHERE key = ANY($1::text[])', [station.locations ?? []])).rows.map((r) => r.name_ar);
      throw new UserError(`تحتاج إلى ${station.name} لهذه الوصفة${names.length ? `. تجده في: ${names.join('، ')}` : ''}`);
    }
    const inFight = await db.query('SELECT 1 FROM combat_locks WHERE character_id = $1', [ch.id]);
    if (inFight.rowCount) throw new UserError('لا يمكنك الصناعة أثناء القتال');
    const items = await itemsByKeys(db, [recipe.output, ...recipe.inputs.map(([k]) => k)]);
    const out = items[recipe.output];
    if (!out) throw new UserError('ناتج هذه الوصفة غير موجود في قاعدة البيانات');
    const missing = [];
    for (const [k, n] of recipe.inputs) {
      const it = items[k];
      const have = it
        ? ((await db.query('SELECT quantity FROM inventory_items WHERE character_id = $1 AND item_id = $2 FOR UPDATE', [ch.id, it.id])).rows[0]?.quantity ?? 0)
        : 0;
      if (have < n * times) missing.push(`• ${it?.name_ar ?? k}: ${have}/${n * times}`);
    }
    if (missing.length) throw new UserError(`ينقصك:\n${missing.join('\n')}`);
    const inputWeight = recipe.inputs.reduce((s, [k, n]) => s + Number(items[k].weight) * n * times, 0);
    await assertCapacity(db, ch, Math.max(0, Number(out.weight) * recipe.quantity * times - inputWeight));
    const cost = recipe.nx * times;
    if (cost > 0) await debit(db, ch.id, cost, 'craft', `صناعة: ${out.name_ar} x${recipe.quantity * times}`);
    for (const [k, n] of recipe.inputs) await removeItem(db, ch.id, items[k].id, n * times);
    const made = recipe.quantity * times;
    await addItem(db, ch.id, out.id, made);
    await db.query('UPDATE characters SET items_crafted = items_crafted + $2 WHERE id = $1', [ch.id, made]);
    await track(db, ch.id, 'craft', { target: out.key, amount: made });
    const unlocked = await checkAchievements(db, ch.id);
    return {
      recipe,
      item: { id: out.id, key: out.key, name: out.name_ar, rarity: out.rarity, type: out.type },
      quantity: made,
      cost,
      used: recipe.inputs.map(([k, n]) => ({ name: items[k].name_ar, quantity: n * times, rarity: items[k].rarity })),
      unlocked,
      character: await loadCharacter(db, ch.id),
    };
  });
}
