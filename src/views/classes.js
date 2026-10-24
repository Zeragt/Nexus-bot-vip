import { ButtonStyle } from 'discord.js';
import { card, row, button, select } from '../core/ui.js';
import { cid } from '../core/customId.js';
import { CATEGORIES, CLASSES, CLASS_BY_KEY, classesIn, ROLE_LABELS, ELEMENTS } from '../content/classes.js';
import { skillsOfClass, subclassByKey } from '../content/classGen.js';
import { renderClassGallery, renderClassCard, renderPaths, renderSkillTree, renderLoadout, renderNotice, renderEmblemCard } from '../render/index.js';
import { classPopularity, classSkillTree, loadoutOf, pathsFor, MAX_EQUIPPED, classChangeCost } from '../services/classes.js';
import { passivesFromSkills } from '../engine/combat.js';
import { pathBonus } from '../content/classGen.js';
import { findByUser } from '../services/characters.js';
import { characterImage, userImage } from './avatars.js';
import { hasArt } from './art.js';

const PATHS_PER_PAGE = 10;
const SKILLS_PER_PAGE = 10;

async function viewerFace(userId) {
  const ch = await findByUser(userId).catch(() => null);
  return { ch, avatar: ch ? await characterImage(ch.id, userId) : await userImage(userId) };
}

export function categorySelect(owner, current = null) {
  return row(
    select(
      cid('cl', 'cat', owner),
      'اختر فئة الكلاسات',
      Object.entries(CATEGORIES).map(([key, c]) => ({
        label: `${c.name} (${classesIn(key).length})`,
        value: key,
        description: c.blurb,
        default: key === current,
      })),
    ),
  );
}

function classSelect(owner, category) {
  return row(
    select(
      cid('cl', 'view', owner),
      'اعرض كلاساً بالتفصيل',
      classesIn(category).map((c) => ({
        label: `${c.nameAr} (${c.name})`,
        value: c.key,
        description: `${ROLE_LABELS[c.role]} • ${ELEMENTS[c.element].name} • ${c.motto}`,
      })),
    ),
  );
}

export async function galleryMessage(userId, category = 'warrior') {
  const { avatar } = await viewerFace(userId);
  const pop = await classPopularity();
  const buf = await renderClassGallery({ category, classes: classesIn(category).map((c) => ({ ...c, popularity: pop[c.key] ?? 0 })), avatar });
  return { files: [card(buf, 'classes')], components: [categorySelect(userId, category), classSelect(userId, category)] };
}

/** Milestones shown on the class card: the ultimate of every tier and a few early skills. */
function milestonesOf(cls) {
  const skills = skillsOfClass(cls.key);
  const pick = [1, 4, 10, 30, 60, 100].map((l) => skills.find((s) => s.requiredLevel === l)).filter(Boolean);
  return pick.map((s) => ({ name: s.nameAr, level: s.requiredLevel, type: s.type }));
}

export async function classCardMessage(userId, classKey) {
  const cls = CLASS_BY_KEY[classKey];
  const { ch, avatar } = await viewerFace(userId);
  const pop = await classPopularity();
  const current = ch?.classKey === classKey;
  const buf = await renderClassCard({
    cls,
    avatar,
    milestones: milestonesOf(cls),
    chosenBy: pop[classKey] ?? 0,
    current,
    subclass: current ? subclassByKey(ch.subclassKey)?.name : null,
  });
  const actions = [];
  if (ch && !current) {
    const cost = await classChangeCost(ch);
    actions.push(
      button(cid('cl', 'pick', userId, classKey), cost ? `غيّر إلى ${cls.nameAr} (${cost} NX)` : `اختر ${cls.nameAr}`, ButtonStyle.Success, { emoji: '✨' }),
    );
  }
  actions.push(button(cid('cl', 'paths', userId, classKey, 1), 'المسارات الثلاثون', ButtonStyle.Primary, { emoji: '🧭' }));
  actions.push(button(cid('cl', 'tree', userId, classKey, 1), 'شجرة المهارات', ButtonStyle.Primary, { emoji: '📜' }));
  if (hasArt(`classes/${cls.key}.webp`)) actions.push(button(cid('cl', 'hd', userId, cls.key), 'ملصق HD', ButtonStyle.Secondary, { emoji: '🖼️' }));
  actions.push(button(cid('cl', 'cat', userId, cls.category), 'رجوع للمعرض', ButtonStyle.Secondary, { emoji: '↩️' }));
  return { files: [card(buf, 'class')], components: [row(...actions)] };
}

export async function pathsMessage(userId, classKey, page = 1) {
  const cls = CLASS_BY_KEY[classKey];
  const ch = await findByUser(userId).catch(() => null);
  const mine = ch?.classKey === classKey;
  const all = pathsFor(classKey, mine ? ch.level : 100).map((p) => (mine ? p : { ...p, locked: false }));
  const pages = Math.ceil(all.length / PATHS_PER_PAGE);
  const p = Math.min(Math.max(1, page), pages);
  const slice = all.slice((p - 1) * PATHS_PER_PAGE, p * PATHS_PER_PAGE);
  const buf = await renderPaths({ cls, paths: slice, page: p, pages, level: mine ? ch.level : 1, current: mine ? ch.subclassKey : null });
  const components = [
    row(
      button(cid('cl', 'paths', userId, classKey, p - 1), 'السابق', ButtonStyle.Secondary, { emoji: '◀️', disabled: p <= 1 }),
      button(cid('cl', 'paths', userId, classKey, p + 1), 'التالي', ButtonStyle.Secondary, { emoji: '▶️', disabled: p >= pages }),
      button(cid('cl', 'show', userId, classKey), 'صفحة الكلاس', ButtonStyle.Secondary, { emoji: '↩️' }),
    ),
  ];
  const choosable = mine ? slice.filter((x) => !x.locked && x.key !== ch.subclassKey) : [];
  if (choosable.length) {
    components.unshift(
      row(
        select(
          cid('cl', 'path', userId),
          ch.subclassKey ? `غيّر مسارك (${ch.level * 100} NX)` : 'اختر مسارك',
          choosable.map((x) => ({ label: x.name, value: x.path, description: x.blurb })),
        ),
      ),
    );
  }
  return { files: [card(buf, 'paths')], components };
}

export async function treeMessage(userId, classKey, page = 1) {
  const cls = CLASS_BY_KEY[classKey];
  const ch = await findByUser(userId).catch(() => null);
  const mine = ch?.classKey === classKey;
  const all = (await classSkillTree(classKey, mine ? ch.id : null, { subclassKey: mine ? ch.subclassKey : null })).map((s) => ({
    ...s,
    rank: mine ? s.rank : null,
  }));
  const pages = Math.ceil(all.length / SKILLS_PER_PAGE);
  const p = Math.min(Math.max(1, page), pages);
  const buf = await renderSkillTree({
    cls,
    skills: all.slice((p - 1) * SKILLS_PER_PAGE, p * SKILLS_PER_PAGE),
    page: p,
    pages,
    level: mine ? ch.level : null,
    subclass: mine ? subclassByKey(ch.subclassKey)?.name : null,
  });
  // Jump straight to the page of the player's current level.
  const levelPage = mine ? Math.min(pages, Math.max(1, Math.ceil(all.filter((s) => s.required_level <= ch.level).length / SKILLS_PER_PAGE))) : 1;
  return {
    files: [card(buf, 'skills')],
    components: [
      row(
        button(cid('cl', 'tree', userId, classKey, 1), 'الأولى', ButtonStyle.Secondary, { emoji: '⏮️', disabled: p <= 1 }),
        button(cid('cl', 'tree', userId, classKey, p - 1), 'السابق', ButtonStyle.Secondary, { emoji: '◀️', disabled: p <= 1 }),
        button(cid('cl', 'tree', userId, classKey, levelPage), mine ? 'مستواي' : `${p}/${pages}`, ButtonStyle.Primary, { emoji: '📍', disabled: !mine }),
        button(cid('cl', 'tree', userId, classKey, p + 1), 'التالي', ButtonStyle.Secondary, { emoji: '▶️', disabled: p >= pages }),
        button(cid('cl', 'tree', userId, classKey, pages), 'الأخيرة', ButtonStyle.Secondary, { emoji: '⏭️', disabled: p >= pages }),
      ),
      row(button(cid('cl', 'show', userId, classKey), 'صفحة الكلاس', ButtonStyle.Secondary, { emoji: '↩️' })),
    ],
  };
}

export async function loadoutMessage(ch, viewerId) {
  const cls = CLASS_BY_KEY[ch.classKey];
  const rows = await loadoutOf(ch.id);
  const equipped = rows.filter((r) => r.equipped && r.type !== 'passive');
  const passiveRows = rows.filter((r) => r.type === 'passive');
  const passives = passivesFromSkills(
    passiveRows.map((r) => ({ type: 'passive', power: r.power, rank: r.rank, extra: r.extra })),
    pathBonus(ch.subclassKey),
  );
  const buf = await renderLoadout({
    name: ch.name,
    cls,
    subclass: subclassByKey(ch.subclassKey)?.name,
    avatar: await characterImage(ch.id, ch.userId),
    level: ch.level,
    equipped,
    passives,
    passiveCount: passiveRows.length,
    owned: rows.length,
    skillPoints: ch.skillPoints,
    maxEquipped: MAX_EQUIPPED,
  });
  const components = [];
  if (viewerId === ch.userId) {
    const spare = rows.filter((r) => !r.equipped && r.type !== 'passive').slice(0, 25);
    if (spare.length && equipped.length < MAX_EQUIPPED)
      components.push(
        row(
          select(
            cid('cl', 'equip', viewerId),
            'جهّز مهارة',
            spare.map((r) => ({ label: r.name_ar, value: r.key, description: `مستوى ${r.required_level} • رتبة ${r.rank}` })),
          ),
        ),
      );
    if (equipped.length)
      components.push(
        row(
          select(
            cid('cl', 'unequip', viewerId),
            'أزل مهارة من التجهيز',
            equipped.map((r) => ({ label: r.name_ar, value: r.key, description: `رتبة ${r.rank}` })),
          ),
        ),
      );
    components.push(
      row(
        button(cid('cl', 'tree', viewerId, ch.classKey, 1), 'شجرة المهارات', ButtonStyle.Primary, { emoji: '📜' }),
        button(cid('cl', 'paths', viewerId, ch.classKey, 1), 'المسارات', ButtonStyle.Secondary, { emoji: '🧭' }),
      ),
    );
  }
  return { files: [card(buf, 'loadout')], components };
}

/** Card shown after picking a class or a path. */
export async function chosenMessage(res, userId, { path = false } = {}) {
  const cls = res.cls;
  const names = res.unlocked.slice(-6).map((s) => s.name_ar);
  const buf = await renderNotice({
    title: path ? `مسار جديد: ${res.sub.name}` : res.changed ? `أصبحت ${cls.nameAr}` : `وُلد ${cls.nameAr} جديد`,
    subtitle: path ? res.sub.blurb : `«${cls.motto}»`,
    iconName: 'sparkle',
    color: cls.colors[1],
    avatar: await characterImage(res.character.id, userId),
    avatarLabel: res.character.name,
    tiles: [
      { label: 'مهارات فُتحت', value: String(res.unlocked.length), iconName: 'zap', color: cls.colors[1] },
      { label: 'التكلفة', value: res.cost ? `${res.cost} NX` : 'مجاناً', iconName: 'coin' },
      { label: 'نقاط مستردة', value: String(res.refund ?? 0), iconName: 'star' },
    ],
    body: names.length ? `جاهزة للقتال: ${names.join('، ')}` : 'افتح المزيد من المهارات مع كل مستوى.',
  });
  const files = [card(buf, 'class-chosen')];
  if (path) files.push(card(await renderEmblemCard({ classKey: cls.key, pathKey: res.sub.path, label: res.sub.name }), 'emblem'));
  return {
    files,
    components: [
      row(
        button(cid('cl', 'loadout', userId), 'تجهيزي القتالي', ButtonStyle.Success, { emoji: '🗡️' }),
        button(cid('cl', 'tree', userId, cls.key, 1), 'شجرة المهارات', ButtonStyle.Primary, { emoji: '📜' }),
        button(cid('cl', 'paths', userId, cls.key, 1), 'المسارات', ButtonStyle.Secondary, { emoji: '🧭' }),
      ),
    ],
  };
}

export function classAutocomplete(query) {
  const q = String(query ?? '').toLowerCase();
  return CLASSES.filter((c) => !q || c.nameAr.includes(q) || c.name.toLowerCase().includes(q) || c.key.includes(q))
    .slice(0, 25)
    .map((c) => ({ name: `${c.nameAr} (${c.name}) — ${CATEGORIES[c.category].name}`, value: c.key }));
}
