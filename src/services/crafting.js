import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { RECIPES, RECIPE_BY_KEY } from '../content/recipes.js';
import { requireByUser, loadCharacter } from './characters.js';
import { inventoryMap, removeItem, addItem, assertCapacity } from './inventory.js';
import { debit } from './economy.js';
import { chaptersDone, track } from './progress.js';
import { audit } from './audit.js';

/** Recipes with names, what the character owns, and why each one is locked. */
export async function recipeBook(userId) {
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const chapter = await chaptersDone(db, ch.id);
  const owned = await inventoryMap(db, ch.id);
  const keys = [...new Set(RECIPES.flatMap((r) => [r.output, ...r.materials.map(([k]) => k)]))];
  const names = Object.fromEntries(
    (await db.query('SELECT key, name_ar, rarity, type FROM items WHERE key = ANY($1::text[])', [keys])).rows.map((r) => [r.key, r]),
  );
  return {
    character: ch,
    chapter,
    recipes: RECIPES.map((r) => {
      const materials = r.materials.map(([k, q]) => ({ key: k, name: names[k]?.name_ar ?? k, need: q, have: owned[k] ?? 0 }));
      const locked = chapter < r.chapter ? `الفصل ${r.chapter}` : ch.level < r.level ? `المستوى ${r.level}` : null;
      return {
        ...r,
        name: names[r.output]?.name_ar ?? r.output,
        rarity: names[r.output]?.rarity ?? 'common',
        type: names[r.output]?.type ?? 'misc',
        materials,
        locked,
        ready: !locked && materials.every((m) => m.have >= m.need) && Number(ch.nx) >= r.nx,
      };
    }),
  };
}

export async function craft(userId, key, times = 1) {
  const recipe = RECIPE_BY_KEY[key];
  if (!recipe) throw new UserError('لا توجد وصفة بهذا الاسم');
  const n = Math.max(1, Math.min(10, Math.floor(times)));
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const chapter = await chaptersDone(db, ch.id);
    if (chapter < recipe.chapter) throw new UserError(`هذه الوصفة مختومة حتى تكمل الفصل ${recipe.chapter} من القصة`);
    if (ch.level < recipe.level) throw new UserError(`تحتاج إلى المستوى ${recipe.level} لصناعة هذا`);
    const owned = await inventoryMap(db, ch.id);
    const missing = recipe.materials.filter(([k, q]) => (owned[k] ?? 0) < q * n);
    if (missing.length) {
      const names = Object.fromEntries(
        (await db.query('SELECT key, name_ar FROM items WHERE key = ANY($1::text[])', [missing.map(([k]) => k)])).rows.map((r) => [r.key, r.name_ar]),
      );
      throw new UserError(`تنقصك مواد:\n${missing.map(([k, q]) => `• ${names[k] ?? k}: ${owned[k] ?? 0}/${q * n}`).join('\n')}`);
    }
    const out = (await db.query('SELECT id, name_ar, rarity, weight FROM items WHERE key = $1', [recipe.output])).rows[0];
    if (!out) throw new UserError('ناتج الوصفة غير موجود بعد. أعد تشغيل البوت لمزامنة المحتوى');
    if (recipe.nx) await debit(db, ch.id, recipe.nx * n, 'craft', `صناعة: ${out.name_ar}`);
    for (const [k, q] of recipe.materials) {
      const it = (await db.query('SELECT id FROM items WHERE key = $1', [k])).rows[0];
      await removeItem(db, ch.id, it.id, q * n);
    }
    await assertCapacity(db, ch, Number(out.weight) * recipe.qty * n);
    await addItem(db, ch.id, out.id, recipe.qty * n);
    await db.query('UPDATE characters SET items_crafted = items_crafted + $2 WHERE id = $1', [ch.id, n]);
    const contracts = await track(db, ch.id, 'craft', { key: recipe.output, amount: n });
    await audit({ actorId: userId, action: 'item_crafted', targetType: 'character', targetId: ch.id, after: { item: recipe.output, qty: recipe.qty * n } }, db);
    return {
      item: { name: out.name_ar, rarity: out.rarity },
      quantity: recipe.qty * n,
      cost: recipe.nx * n,
      contracts,
      character: await loadCharacter(db, ch.id),
    };
  });
}

let recipeNames = null;
export async function recipeAutocomplete(q) {
  if (!recipeNames) {
    const { rows } = await getPool().query('SELECT key, name_ar FROM items WHERE key = ANY($1::text[])', [RECIPES.map((r) => r.output)]);
    recipeNames = Object.fromEntries(rows.map((r) => [r.key, r.name_ar]));
  }
  const s = String(q ?? '');
  return RECIPES.map((r) => ({ ...r, name: recipeNames[r.output] ?? r.output }))
    .filter((r) => !s || r.name.includes(s) || r.key.includes(s.toLowerCase()))
    .slice(0, 25);
}
