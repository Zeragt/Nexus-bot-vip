import { defaultRng } from '../engine/rng.js';
import { BOXES } from '../content/items.js';
import { grantRewards } from './rewards.js';

async function itemByKey(db, key) {
  return (await db.query('SELECT id, key, name_ar, rarity FROM items WHERE key = $1', [key])).rows[0] ?? null;
}

/** Opens a loot box item (daily/weekly chests, caches). Runs in the caller's transaction. */
export async function openBox(db, characterId, boxKey, rng = defaultRng) {
  const box = BOXES[boxKey];
  if (!box) return { nx: 0, xp: 0, items: [] };
  const total = box.table.reduce((s, e) => s + e[1], 0);
  const got = new Map();
  let nx = 0;
  for (let i = 0; i < box.rolls; i++) {
    let r = rng.next() * total;
    for (const [key, w, min, max] of box.table) {
      r -= w;
      if (r > 0) continue;
      const n = rng.int(min, max);
      if (key === 'nx') nx += n;
      else got.set(key, (got.get(key) ?? 0) + n);
      break;
    }
  }
  const items = [];
  for (const [key, quantity] of got) {
    const it = await itemByKey(db, key);
    if (it) items.push({ itemId: it.id, name: it.name_ar, rarity: it.rarity, quantity });
  }
  const rewards = await grantRewards(db, characterId, { nx, items, kind: 'box', note: 'محتوى صندوق' });
  return rewards;
}
