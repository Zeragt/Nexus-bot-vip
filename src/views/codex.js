import { ButtonStyle } from 'discord.js';
import { card, row, button, select } from '../core/ui.js';
import { cid } from '../core/customId.js';
import { UserError } from '../core/errors.js';
import { CODEX, CODEX_BY_SLUG, CODEX_CATEGORIES, codexIn } from '../content/lore.js';
import { CHAPTER_BY_KEY, fillStory } from '../content/story/index.js';
import { CLASS_BY_KEY } from '../content/classes.js';
import { ENEMIES, MONSTER_SKILLS } from '../engine/enemies.js';
import { renderCodexIndex, renderCodexEntry, renderBestiary } from '../render/index.js';
import { findByUser } from '../services/characters.js';
import { progressOf } from '../services/story.js';
import { listLocations, listLore, getLore } from '../services/world.js';
import { getPool } from '../db/pool.js';

const PER_PAGE = 15;
const CATEGORY_BY_KEY = Object.fromEntries(CODEX_CATEGORIES.map((c) => [c.key, c]));
const SCENE_OF_ENTRY = {
  place_plaza: 'city',
  place_tavern: 'city',
  place_library: 'city',
  place_forest: 'forest',
  place_mountains: 'mountains',
  place_lake: 'lake',
  place_desert: 'desert',
  place_ruins: 'ruins',
  place_gate: 'gate',
  place_crystal: 'crystal',
  place_ash: 'ash',
  place_sky: 'sky',
  place_sunken: 'sunken',
  place_citadel: 'citadel',
  place_abyss: 'abyss',
};

async function reader(userId) {
  const ch = await findByUser(userId).catch(() => null);
  const completed = ch ? (await progressOf(ch.id)).chapter : 0;
  return { ch, completed };
}

export function isUnlocked(entry, completed) {
  if (!entry.unlock) return true;
  const c = CHAPTER_BY_KEY[entry.unlock];
  return !c || completed > c.index;
}

/** Static codex plus entries written by staff through /gm world lore (category "custom"). */
async function entriesIn(category) {
  if (category !== 'custom') return codexIn(category);
  return (await listLore()).map((e) => ({ slug: `d.${e.slug}`, title: e.title, category: 'custom', db: true }));
}

const CUSTOM = { key: 'custom', label: 'مدونات الإدارة', icon: 'scroll', color: '#fde68a' };
const categoryOf = (key) => CATEGORY_BY_KEY[key] ?? (key === 'custom' ? CUSTOM : null);

function categorySelect(owner, current) {
  return row(
    select(
      cid('cx', 'cat', owner),
      'اختر باباً من الأرشيف',
      [...CODEX_CATEGORIES, CUSTOM].map((c) => ({
        label: c.label,
        value: c.key,
        description: c.key === 'custom' ? 'مداخل كتبها فريق الإدارة' : `${codexIn(c.key).length} مدخلاً`,
        default: c.key === current,
      })),
    ),
  );
}

export async function codexIndexMessage(userId, categoryKey = 'world', page = 1) {
  const category = categoryOf(categoryKey);
  if (!category) throw new UserError('باب غير معروف');
  const { completed } = await reader(userId);
  const all = await entriesIn(categoryKey);
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = all.slice((p - 1) * PER_PAGE, p * PER_PAGE).map((e) => ({ ...e, locked: !isUnlocked(e, completed) }));
  const buf = await renderCodexIndex({
    category,
    entries: slice,
    unlocked: all.filter((e) => isUnlocked(e, completed)).length,
    total: all.length,
    page: p,
    pages,
  });
  const rows = [categorySelect(userId, categoryKey)];
  const open = slice.filter((e) => !e.locked);
  if (open.length)
    rows.push(
      row(
        select(
          cid('cx', 'open', userId),
          'اقرأ مدخلاً',
          open.map((e) => ({ label: e.title, value: e.slug })),
        ),
      ),
    );
  const nav = [];
  if (pages > 1) {
    nav.push(button(cid('cx', 'page', userId, categoryKey, Math.max(1, p - 1)), 'السابق', ButtonStyle.Secondary, { emoji: '◀️', disabled: p <= 1 }));
    nav.push(button(cid('cx', 'page', userId, categoryKey, Math.min(pages, p + 1)), 'التالي', ButtonStyle.Secondary, { emoji: '▶️', disabled: p >= pages }));
  }
  nav.push(button(cid('cx', 'beasts', userId, 'forest'), 'كتاب الوحوش', ButtonStyle.Secondary, { emoji: '🐺' }));
  rows.push(row(...nav));
  return { files: [card(buf, 'codex')], components: rows };
}

export async function codexEntryMessage(userId, slug) {
  const { ch, completed } = await reader(userId);
  let entry;
  let category;
  if (slug.startsWith('d.')) {
    const e = await getLore(slug.slice(3));
    if (!e) throw new UserError('المدخل غير موجود');
    entry = { slug, title: e.title, text: e.content };
    category = CUSTOM;
  } else {
    entry = CODEX_BY_SLUG[slug];
    if (!entry) throw new UserError('المدخل غير موجود');
    if (!isUnlocked(entry, completed)) throw new UserError('هذا المدخل مختوم. تقدّم في القصة عبر /story لتفتحه');
    category = categoryOf(entry.category);
  }
  const list = await entriesIn(category.key);
  const idx = list.findIndex((e) => e.slug === slug);
  const text = fillStory(entry.text, { name: ch?.name ?? 'الوافد', className: CLASS_BY_KEY[ch?.classKey]?.nameAr });
  const buf = await renderCodexEntry({ title: entry.title, text, category, scene: SCENE_OF_ENTRY[slug], number: idx + 1, total: list.length });
  const neighbour = (step) => {
    for (let k = idx + step; k >= 0 && k < list.length; k += step) if (list[k].db || isUnlocked(list[k], completed)) return list[k];
    return null;
  };
  const prev = neighbour(-1);
  const next = neighbour(1);
  return {
    files: [card(buf, 'codex')],
    components: [
      row(
        button(cid('cx', 'open', userId, prev?.slug ?? '-'), 'السابق', ButtonStyle.Secondary, { emoji: '◀️', disabled: !prev }),
        button(cid('cx', 'open', userId, next?.slug ?? '-'), 'التالي', ButtonStyle.Secondary, { emoji: '▶️', disabled: !next }),
        button(cid('cx', 'page', userId, category.key, Math.floor(Math.max(0, idx) / PER_PAGE) + 1), 'فهرس الباب', ButtonStyle.Primary, { emoji: '🗂️' }),
      ),
    ],
  };
}

export async function codexAutocomplete(userId, q) {
  const { completed } = await reader(userId);
  const query = String(q ?? '');
  return CODEX.filter((e) => isUnlocked(e, completed) && (!query || e.title.includes(query) || e.slug.includes(query)))
    .slice(0, 25)
    .map((e) => ({ name: `${e.title} • ${CATEGORY_BY_KEY[e.category].label}`.slice(0, 100), value: e.slug }));
}

async function itemNames() {
  const { rows } = await getPool().query('SELECT key, name_ar FROM items');
  return Object.fromEntries(rows.map((r) => [r.key, r.name_ar]));
}

export async function bestiaryMessage(userId, locationKey = 'forest') {
  const pool = ENEMIES[locationKey];
  if (!pool) throw new UserError('لا توجد وحوش مسجلة في هذا المكان');
  const locs = (await listLocations()).filter((l) => ENEMIES[l.key]);
  const loc = locs.find((l) => l.key === locationKey);
  const names = await itemNames();
  const buf = await renderBestiary({
    location: { key: locationKey, nameAr: loc?.nameAr ?? locationKey, danger: loc?.danger ?? 0 },
    monsters: pool.map((m) => ({
      ...m,
      skills: (m.skills ?? []).map((k) => MONSTER_SKILLS[k]?.name ?? k),
      loot: (m.loot ?? []).map(([k]) => names[k] ?? k),
    })),
  });
  return {
    files: [card(buf, 'codex')],
    components: [
      row(
        select(
          cid('cx', 'beasts', userId),
          'اختر منطقة',
          locs.map((l) => ({
            label: l.nameAr,
            value: l.key,
            description: `خطر ${l.danger} • ${ENEMIES[l.key].length} مخلوقات`,
            default: l.key === locationKey,
          })),
        ),
      ),
      row(button(cid('cx', 'cat', userId, 'peoples'), 'الأرشيف', ButtonStyle.Secondary, { emoji: '📚' })),
    ],
  };
}
