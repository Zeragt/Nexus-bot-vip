import { theme, hexToRgba } from '../theme.js';
import { icon } from '../icons.js';
import { STAT_LABELS, SKILL_TYPE_LABELS } from '../../config/game.js';
import { CATEGORIES, ELEMENTS, ROLE_LABELS } from '../../content/classes.js';
import { PASSIVE_LABELS, TIER_LABELS } from '../../content/classGen.js';
import { createCard, frame, panel, text, paragraph, chip, toImage, brand, header, roundRect, bar, divider } from '../draw.js';
import { drawFighter } from '../sprites.js';
import { drawEmblem } from '../emblems.js';
import { sceneImage } from '../sceneCache.js';

const W = 1280;
const H = 720;

const TYPE_COLORS = { attack: '#fb7185', defense: '#60a5fa', healing: '#34d399', utility: '#c084fc', passive: '#94a3b8', special: '#f5c451' };
const TYPE_ICONS = { attack: 'sword', defense: 'shield', healing: 'heart', utility: 'sparkle', passive: 'eye', special: 'flame' };
const SCENE_OF_CATEGORY = {
  warrior: 'mountains',
  shadow: 'citadel',
  ranger: 'forest',
  arcane: 'crystal',
  divine: 'sky',
  dark: 'ash',
  tech: 'city',
  rift: 'gate',
};

const WEAPON_LABELS = {
  sword_shield: 'سيف ودرع',
  axe: 'فأس',
  hammer: 'مطرقة',
  katana: 'كاتانا',
  sword: 'سيف',
  spear: 'رمح',
  greatsword: 'سيف عظيم',
  daggers: 'خناجر',
  rapier: 'سيف المبارزة',
  whip: 'سوط',
  cards: 'أوراق',
  bow: 'قوس',
  gun: 'مسدس',
  crossbow: 'قوس ونشاب',
  rifle: 'بندقية',
  staff: 'عصا',
  tome: 'كتاب',
  orb: 'كرة سحرية',
  wand: 'صولجان',
  fists: 'قبضات',
  scythe: 'منجل',
  flask: 'قارورة',
  wrench: 'مفتاح',
  gauntlet: 'قفاز',
  energy_blade: 'نصل طاقة',
  bombs: 'قنابل',
  injector: 'حاقن',
  lute: 'عود',
  lance: 'رمح الفرسان',
  claws: 'مخالب',
};
export const weaponLabel = (w) => WEAPON_LABELS[w] ?? w;

async function backdrop(ctx, category, { dim = 0.55 } = {}) {
  ctx.drawImage(await sceneImage(SCENE_OF_CATEGORY[category] ?? 'gate', W, H), 0, 0);
  ctx.fillStyle = `rgba(4, 7, 22, ${dim})`;
  ctx.fillRect(0, 0, W, H);
}

/** All classes of one category, drawn as a line-up of fighters wearing the viewer's face. */
export async function renderClassGallery({ category, classes, avatar = null, page = 1, pages = 1 }) {
  const { canvas, ctx } = createCard(W, H);
  const cat = CATEGORIES[category];
  await backdrop(ctx, category, { dim: 0.45 });
  header(ctx, W, `${cat.name} • ${classes.length} كلاسات`, { subtitle: cat.blurb, iconName: cat.icon, color: cat.color });
  const perRow = classes.length > 6 ? Math.ceil(classes.length / 2) : classes.length;
  const rows = Math.ceil(classes.length / perRow);
  const cellW = (W - 80) / perRow;
  const cellH = rows === 1 ? 520 : 280;
  classes.forEach((c, i) => {
    const col = i % perRow;
    const r = Math.floor(i / perRow);
    const cx = W - 40 - cellW * col - cellW / 2;
    const top = 130 + r * cellH;
    panel(ctx, cx - cellW / 2 + 6, top, cellW - 12, cellH - 14, { radius: 18, fill: 'rgba(6, 12, 40, 0.55)', stroke: hexToRgba(c.colors[1], 0.45) });
    const scale = rows === 1 ? 1.15 : 0.62;
    drawFighter(ctx, { x: cx, y: top + cellH - (rows === 1 ? 110 : 72), scale, avatar, classKey: c.key, seed: i + 3 });
    text(ctx, c.nameAr, cx, top + cellH - (rows === 1 ? 74 : 50), { size: rows === 1 ? 26 : 19, weight: 800, align: 'center', maxWidth: cellW - 24 });
    text(ctx, `${ROLE_LABELS[c.role]} • ${ELEMENTS[c.element].name}`, cx, top + cellH - (rows === 1 ? 44 : 28), {
      size: rows === 1 ? 16 : 13,
      weight: 600,
      align: 'center',
      color: ELEMENTS[c.element].color,
      maxWidth: cellW - 20,
    });
    if (c.popularity)
      text(ctx, `${c.popularity}`, cx - cellW / 2 + 22, top + 20, { size: 13, weight: 700, family: 'num', align: 'left', color: theme.textDim });
  });
  text(ctx, pages > 1 ? `${page} / ${pages}` : '', 44, H - 30, { size: 14, family: 'num', align: 'left', color: theme.textMute });
  frame(ctx, W, H, cat.color);
  return toImage(canvas);
}

/** One class in full: splash art, lore, growth, signature moves and path count. */
export async function renderClassCard({
  cls,
  avatar = null,
  milestones = [],
  pathCount = 30,
  skillCount = 100,
  chosenBy = 0,
  current = false,
  subclass = null,
}) {
  const { canvas, ctx } = createCard(W, H);
  const cat = CATEGORIES[cls.category];
  const el = ELEMENTS[cls.element];
  await backdrop(ctx, cls.category, { dim: 0.3 });
  // Darken the text side.
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(4,7,22,0.05)');
  g.addColorStop(0.42, 'rgba(4,7,22,0.55)');
  g.addColorStop(1, 'rgba(4,7,22,0.88)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawFighter(ctx, { x: 270, y: H - 56, scale: 1.4, avatar, classKey: cls.key, pose: 'victory', seed: 11 });

  const right = W - 48;
  chip(ctx, cat.name, right, 52, { color: cat.color, size: 15, h: 30, iconName: cat.icon });
  if (current) chip(ctx, 'كلاسك الحالي', right - 190, 52, { color: theme.gold, size: 15, h: 30, iconName: 'crown' });
  text(ctx, cls.nameAr, right, 112, { size: 58, weight: 800, glow: 22, glowColor: hexToRgba(cls.colors[1], 0.8), maxWidth: 700 });
  text(ctx, cls.name.toUpperCase(), right, 160, { size: 20, weight: 700, family: 'num', align: 'right', color: cls.colors[1], dir: 'ltr' });
  if (subclass) text(ctx, `المسار: ${subclass}`, right - 260, 160, { size: 18, weight: 700, color: theme.gold, maxWidth: 400 });

  let x = right;
  for (const c of [
    { label: ROLE_LABELS[cls.role], color: theme.cyan, iconName: 'shield' },
    { label: `عنصر ${el.name}`, color: el.color, iconName: 'sparkle' },
    { label: weaponLabel(cls.weapon), color: '#e2e8f0', iconName: 'sword' },
  ]) {
    x -= chip(ctx, c.label, x, 204, { ...c, size: 15, h: 30 }) + 10;
  }
  paragraph(ctx, cls.description, right, 252, 700, { size: 20, weight: 500, color: theme.text, maxLines: 3, lineHeight: 1.6 });
  text(ctx, `«${cls.motto}»`, right, 348, { size: 21, weight: 700, color: cls.colors[1], maxWidth: 700 });

  // Growth
  panel(ctx, right - 700, 380, 340, 120, { radius: 16, fill: 'rgba(6,12,40,0.7)' });
  text(ctx, 'النمو التلقائي لكل مستوى', right - 380, 404, { size: 16, weight: 800, align: 'right' });
  [
    [cls.primary, 0.5, 'رئيسية'],
    [cls.secondary, 0.3, 'ثانوية'],
  ].forEach(([stat, per, label], i) => {
    const y = 438 + i * 36;
    text(ctx, `${STAT_LABELS[stat]} (${label})`, right - 380, y, { size: 15, weight: 700, color: theme.textDim });
    bar(ctx, right - 680, y - 6, 150, 12, per / 0.5, { colors: [cls.colors[0], cls.colors[1]] });
    text(ctx, `+${per}`, right - 690, y, { size: 14, weight: 800, family: 'num', align: 'right', color: '#fff' });
  });
  panel(ctx, right - 345, 380, 345, 120, { radius: 16, fill: 'rgba(6,12,40,0.7)' });
  [
    [`${skillCount}`, 'مهارة كلاس'],
    [`${pathCount}`, 'مساراً فرعياً'],
    [`${chosenBy}`, 'لاعب اختاره'],
  ].forEach(([v, l], i) => {
    const cx = right - 345 + 58 + i * 115;
    text(ctx, v, cx, 428, { size: 32, weight: 800, family: 'num', align: 'center', color: cls.colors[1], glow: 10 });
    text(ctx, l, cx, 466, { size: 14, weight: 600, align: 'center', color: theme.textDim });
  });

  // Milestones
  text(ctx, 'محطات في طريق الكلاس', right, 530, { size: 18, weight: 800 });
  milestones.slice(0, 6).forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = right - col * 352;
    const by = 560 + row * 44;
    panel(ctx, bx - 344, by - 18, 344, 38, { radius: 12, fill: 'rgba(6,12,40,0.72)', stroke: hexToRgba(TYPE_COLORS[m.type] ?? theme.cyan, 0.55) });
    icon(ctx, TYPE_ICONS[m.type] ?? 'sparkle', bx - 20, by + 1, 18, TYPE_COLORS[m.type] ?? theme.cyan);
    text(ctx, m.name, bx - 40, by + 1, { size: 16, weight: 700, maxWidth: 230 });
    text(ctx, `LV ${m.level}`, bx - 334, by + 1, { size: 13, weight: 800, family: 'num', align: 'left', color: theme.textDim });
  });
  frame(ctx, W, H, cls.colors[1]);
  brand(ctx, 36, H - 30);
  return toImage(canvas);
}

function bonusText(bonus) {
  return Object.entries(bonus)
    .map(([k, v]) => {
      const amount = k === 'defense' ? `+${v * 2}` : k === 'hp' ? `+${v * 2}%` : k === 'dodge' ? `+${v / 2}%` : `+${v}%`;
      return `${PASSIVE_LABELS[k]} ${amount}`;
    })
    .join(' • ');
}

/** Ten paths per page in two columns. */
export async function renderPaths({ cls, paths, page, pages, level = 1, current = null }) {
  const { canvas, ctx } = createCard(W, H);
  await backdrop(ctx, cls.category, { dim: 0.72 });
  header(ctx, W, `مسارات ${cls.nameAr}`, {
    subtitle: `30 مساراً فرعياً • اختر واحداً من المستوى 15 عبر /class path • صفحة ${page}/${pages}`,
    iconName: 'map',
    color: cls.colors[1],
  });
  const colW = (W - 100) / 2;
  paths.forEach((p, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = W - 40 - colW - col * (colW + 20);
    const y = 132 + row * 112;
    const isCurrent = current === p.key;
    const col1 = isCurrent ? theme.gold : p.locked ? '#475569' : cls.colors[1];
    panel(ctx, x, y, colW, 100, {
      radius: 16,
      fill: isCurrent ? 'rgba(48,34,8,0.85)' : 'rgba(6,12,40,0.78)',
      stroke: hexToRgba(col1, 0.7),
      glow: isCurrent ? theme.gold : null,
    });
    const r = x + colW - 20;
    text(ctx, `${p.index + 1}`, r, y + 30, { size: 15, weight: 800, family: 'num', align: 'right', color: col1 });
    text(ctx, p.name, r - 34, y + 30, { size: 22, weight: 800, maxWidth: colW - 260, color: p.locked ? theme.textDim : theme.text });
    ctx.save();
    if (p.locked) ctx.globalAlpha = 0.35;
    drawEmblem(ctx, { classKey: cls.key, pathKey: p.path, size: 104, x: x + 2, y: y - 2 });
    ctx.restore();
    chip(ctx, p.locked ? `LV ${p.minLevel}` : isCurrent ? 'مسارك' : `LV ${p.minLevel}+`, x + 104, y + 30, {
      color: col1,
      size: 13,
      h: 26,
      align: 'left',
      iconName: p.locked ? 'lock' : isCurrent ? 'crown' : 'check',
    });
    text(ctx, bonusText(p.bonus), r, y + 60, { size: 14, weight: 700, color: theme.cyanSoft, maxWidth: colW - 130 });
    text(ctx, `نمو: ${p.growth.map((s) => STAT_LABELS[s]).join(' و')}  •  ${p.blurb}`, r, y + 84, {
      size: 13,
      weight: 500,
      color: theme.textDim,
      maxWidth: colW - 130,
    });
  });
  text(ctx, `مستواك: ${level}`, 44, H - 30, { size: 14, weight: 700, align: 'left', color: theme.textMute, dir: 'rtl' });
  frame(ctx, W, H, cls.colors[1]);
  return toImage(canvas);
}

/** One decade of the class skill tree (10 skills) with ranks, loadout state and locks. */
export async function renderSkillTree({ cls, skills, page, pages, level = null, subclass = null }) {
  const { canvas, ctx } = createCard(W, H);
  await backdrop(ctx, cls.category, { dim: 0.78 });
  const from = skills[0]?.required_level ?? 1;
  const to = skills.at(-1)?.required_level ?? from;
  header(ctx, W, `شجرة مهارات ${cls.nameAr}`, {
    subtitle: `المستويات ${from} - ${to}  •  ${TIER_LABELS[Math.min(5, Math.ceil(to / 20))]}${subclass ? `  •  ${subclass}` : ''}  •  صفحة ${page}/${pages}`,
    iconName: 'zap',
    color: cls.colors[1],
  });
  const rowH = 54;
  skills.slice(0, 10).forEach((s, i) => {
    const y = 128 + i * (rowH + 4);
    const locked = level != null && s.required_level > level;
    const owned = s.rank != null;
    const tc = TYPE_COLORS[s.type] ?? theme.cyan;
    panel(ctx, 40, y, W - 80, rowH, {
      radius: 12,
      fill: s.equipped ? 'rgba(8, 40, 60, 0.85)' : 'rgba(6, 12, 40, 0.78)',
      stroke: hexToRgba(s.subclass_key ? theme.gold : tc, locked ? 0.2 : 0.6),
    });
    ctx.save();
    ctx.globalAlpha = locked ? 0.45 : 1;
    const r = W - 60;
    roundRect(ctx, r - 56, y + 9, 56, 36, 10);
    ctx.fillStyle = hexToRgba(tc, 0.18);
    ctx.fill();
    text(ctx, `${s.required_level}`, r - 28, y + 28, { size: 18, weight: 800, family: 'num', align: 'center', color: tc });
    icon(ctx, TYPE_ICONS[s.type] ?? 'sparkle', r - 80, y + 27, 20, tc, { glow: 6 });
    text(ctx, s.name_ar, r - 100, y + 18, { size: 19, weight: 800, maxWidth: 300, color: s.subclass_key ? theme.gold : theme.text });
    text(ctx, `${SKILL_TYPE_LABELS[s.type]}${s.type !== 'passive' ? ` • ${s.energy_cost} طاقة • انتظار ${s.cooldown_turns}` : ''}`, r - 100, y + 40, {
      size: 13,
      weight: 600,
      color: theme.textDim,
      maxWidth: 300,
    });
    text(ctx, s.description, r - 420, y + 28, { size: 14, weight: 500, color: theme.text, maxWidth: s.equipped ? 520 : 600 });
    // Rank pips / state
    const lx = 60;
    if (locked) chip(ctx, 'مقفلة', lx, y + 28, { color: '#64748b', size: 12, h: 24, iconName: 'lock', align: 'left' });
    else if (owned) {
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.arc(lx + 8 + k * 16, y + 28, 5, 0, Math.PI * 2);
        ctx.fillStyle = k < s.rank ? theme.gold : 'rgba(255,255,255,0.15)';
        ctx.fill();
      }
      if (s.equipped) chip(ctx, 'مجهّزة', lx + 92, y + 28, { color: theme.cyan, size: 12, h: 24, align: 'left', iconName: 'check' });
    } else if (level != null) chip(ctx, 'غير مملوكة', lx, y + 28, { color: '#94a3b8', size: 12, h: 24, align: 'left' });
    ctx.restore();
  });
  frame(ctx, W, H, cls.colors[1]);
  return toImage(canvas);
}

/** The player's battle loadout: their 2D character, six equipped skills and passive totals. */
export async function renderLoadout({
  name,
  cls,
  subclass = null,
  avatar = null,
  level,
  equipped = [],
  passives = {},
  passiveCount = 0,
  owned = 0,
  skillPoints = 0,
  maxEquipped = 6,
}) {
  const { canvas, ctx } = createCard(W, H);
  await backdrop(ctx, cls.category, { dim: 0.35 });
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(4,7,22,0.1)');
  g.addColorStop(0.4, 'rgba(4,7,22,0.6)');
  g.addColorStop(1, 'rgba(4,7,22,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawFighter(ctx, { x: 260, y: H - 60, scale: 1.4, avatar, classKey: cls.key, pose: 'cast', seed: 5 });
  const right = W - 48;
  text(ctx, name, right, 64, { size: 44, weight: 800, maxWidth: 640, glow: 16, glowColor: hexToRgba(cls.colors[1], 0.7) });
  text(ctx, `${cls.nameAr}${subclass ? ` • ${subclass}` : ''}  •  LV ${level}`, right, 112, { size: 20, weight: 700, color: cls.colors[1], maxWidth: 680 });
  text(ctx, `مهارات مملوكة ${owned} • سلبية فعّالة ${passiveCount} • نقاط مهارة ${skillPoints}`, right, 146, {
    size: 16,
    weight: 600,
    color: theme.textDim,
    maxWidth: 680,
  });
  divider(ctx, right - 700, right, 170, cls.colors[1]);
  text(ctx, `التجهيز القتالي (${equipped.length}/${maxEquipped})`, right, 196, { size: 18, weight: 800 });
  for (let i = 0; i < maxEquipped; i++) {
    const s = equipped[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bw = 340;
    const x = right - bw - col * (bw + 16);
    const y = 220 + row * 92;
    const tc = s ? (TYPE_COLORS[s.type] ?? theme.cyan) : '#334155';
    panel(ctx, x, y, bw, 80, { radius: 16, fill: 'rgba(6,12,40,0.8)', stroke: hexToRgba(tc, 0.7), glow: s?.type === 'special' ? theme.gold : null });
    if (!s) {
      text(ctx, 'خانة فارغة', x + bw / 2, y + 40, { size: 16, weight: 600, align: 'center', color: theme.textMute });
      continue;
    }
    icon(ctx, TYPE_ICONS[s.type] ?? 'sparkle', x + bw - 30, y + 28, 24, tc, { glow: 8 });
    text(ctx, s.name_ar, x + bw - 54, y + 28, { size: 19, weight: 800, maxWidth: bw - 120 });
    text(ctx, `${SKILL_TYPE_LABELS[s.type]} • ${s.power ? `قوة ${s.power} • ` : ''}${s.energy_cost} طاقة`, x + bw - 20, y + 58, {
      size: 13,
      weight: 600,
      color: theme.textDim,
      maxWidth: bw - 110,
    });
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.arc(x + 20 + k * 14, y + 58, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = k < (s.rank ?? 1) ? theme.gold : 'rgba(255,255,255,0.15)';
      ctx.fill();
    }
  }
  panel(ctx, right - 696, 504, 696, 150, { radius: 16, fill: 'rgba(6,12,40,0.8)', accentTop: cls.colors[1] });
  text(ctx, 'المكاسب الدائمة (السلبيات + المسار)', right - 20, 530, { size: 17, weight: 800 });
  const entries = [
    ['attack', `+${Math.round((passives.attack ?? 0) * 100)}%`],
    ['crit', `+${Math.round((passives.crit ?? 0) * 100)}%`],
    ['defense', `+${Math.round(passives.defense ?? 0)}`],
    ['hp', `+${Math.round((passives.hp ?? 0) * 100)}%`],
    ['lifesteal', `+${Math.round((passives.lifesteal ?? 0) * 100)}%`],
    ['dodge', `+${Math.round((passives.dodge ?? 0) * 1000) / 10}%`],
  ];
  entries.forEach(([k, v], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = right - 20 - col * 225;
    const cy = 572 + row * 46;
    text(ctx, PASSIVE_LABELS[k], cx, cy, { size: 15, weight: 600, color: theme.textDim });
    text(ctx, v, cx - 130, cy, { size: 18, weight: 800, family: 'num', align: 'right', color: theme.cyanSoft });
  });
  frame(ctx, W, H, cls.colors[1]);
  brand(ctx, 36, H - 30);
  return toImage(canvas);
}

/** A path's crest on its own, large: sent when a player takes a path. */
export async function renderEmblemCard({ classKey, pathKey, label, size = 512 }) {
  const { canvas, ctx } = createCard(size, size);
  ctx.fillStyle = '#060818';
  ctx.fillRect(0, 0, size, size);
  drawEmblem(ctx, { classKey, pathKey, size, label });
  return toImage(canvas);
}
