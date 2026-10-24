import { theme, hexToRgba } from '../theme.js';
import { icon } from '../icons.js';
import { createCard, frame, panel, text, paragraph, wrap, toImage, header, hashSeed } from '../draw.js';
import { drawMonster } from '../sprites.js';
import { sceneImage } from '../sceneCache.js';
import { sceneFor } from '../scenes.js';

const W = 1280;
const H = 720;
const SCENE_OF_CODEX = { world: 'city', history: 'ruins', places: 'mountains', factions: 'gate', peoples: 'forest', legends: 'sky', characters: 'lake' };

async function backdrop(ctx, scene, dim) {
  ctx.drawImage(await sceneImage(scene, W, H), 0, 0);
  ctx.fillStyle = `rgba(4, 7, 22, ${dim})`;
  ctx.fillRect(0, 0, W, H);
}

/** Category index: tiles for every entry, locked ones shown as sealed. `view` = { category:{key,label,icon,color}, entries:[{title,locked}], unlocked, total, page, pages } */
export async function renderCodexIndex(view) {
  const { category } = view;
  const { canvas, ctx } = createCard(W, H);
  await backdrop(ctx, SCENE_OF_CODEX[category.key] ?? 'city', 0.66);
  header(ctx, W, `أرشيف نكسس • ${category.label}`, {
    subtitle: `فتحت ${view.unlocked} من ${view.total} مدخلاً`,
    iconName: category.icon,
    color: category.color,
  });
  const cols = 3;
  const cw = (W - 80 - (cols - 1) * 16) / cols;
  const ch = 78;
  view.entries.forEach((e, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = W - 40 - cw - col * (cw + 16);
    const y = 140 + row * (ch + 14);
    panel(ctx, x, y, cw, ch, {
      radius: 16,
      fill: e.locked ? 'rgba(10,12,30,0.65)' : 'rgba(8,14,44,0.78)',
      stroke: hexToRgba(e.locked ? '#475569' : category.color, 0.55),
    });
    icon(ctx, e.locked ? 'lock' : category.icon, x + cw - 34, y + ch / 2, 24, e.locked ? theme.textMute : category.color, { glow: e.locked ? 0 : 8 });
    text(ctx, e.locked ? 'مدخل مختوم' : e.title, x + cw - 62, y + ch / 2 - 4, {
      size: 19,
      weight: 800,
      maxWidth: cw - 84,
      color: e.locked ? theme.textMute : theme.text,
    });
    text(ctx, e.locked ? 'يُفتح بالتقدم في القصة' : (e.hint ?? ''), x + cw - 62, y + ch / 2 + 20, {
      size: 13,
      weight: 600,
      color: theme.textMute,
      maxWidth: cw - 84,
    });
  });
  if (view.pages > 1) text(ctx, `${view.page} / ${view.pages}`, 44, H - 30, { size: 14, family: 'num', align: 'left', color: theme.textMute });
  frame(ctx, W, H, category.color);
  return toImage(canvas);
}

/** One entry, laid out as an illuminated page. `view` = { title, text, category:{label,icon,color}, scene, number, total } */
export async function renderCodexEntry(view) {
  const { category } = view;
  const { canvas, ctx } = createCard(W, H);
  await backdrop(ctx, view.scene ?? SCENE_OF_CODEX[category.key] ?? 'city', 0.5);
  const x = 140;
  const w = W - 280;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 32, 0.9)';
  ctx.shadowColor = hexToRgba(category.color, 0.55);
  ctx.shadowBlur = 40;
  ctx.fillRect(x, 60, w, H - 120);
  ctx.restore();
  ctx.strokeStyle = hexToRgba(category.color, 0.5);
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 10, 70, w - 20, H - 140);
  icon(ctx, category.icon, W / 2, 112, 34, category.color, { glow: 14 });
  text(ctx, view.title, W / 2, 178, { size: 38, weight: 800, align: 'center', maxWidth: w - 80, glow: 12, glowColor: hexToRgba(category.color, 0.6) });
  text(ctx, `أرشيف نكسس • ${category.label}`, W / 2, 212, { size: 16, weight: 700, align: 'center', color: category.color });
  // Body: shrink to fit.
  const right = x + w - 60;
  const width = w - 120;
  for (let size = 28; size >= 16; size--) {
    const max = Math.floor((H - 120 - 250) / (size * 1.75));
    if (wrap(ctx, view.text, width, { size, maxLines: max + 1 }).length <= max) {
      paragraph(ctx, view.text, right, 262, width, { size, color: theme.text, lineHeight: 1.75, maxLines: max });
      break;
    }
    if (size === 16) paragraph(ctx, view.text, right, 262, width, { size, color: theme.text, lineHeight: 1.7, maxLines: max });
  }
  if (view.total) text(ctx, `${view.number} / ${view.total}`, W / 2, H - 82, { size: 14, weight: 700, family: 'num', align: 'center', color: theme.textMute });
  frame(ctx, W, H, category.color);
  return toImage(canvas);
}

/**
 * Bestiary page for one region: every creature drawn with its sprite.
 * `view` = { location:{key,nameAr,danger}, monsters:[{key,name,archetype,palette,skills:[name],loot:[name],seen,kills}] }
 */
export async function renderBestiary(view) {
  const { canvas, ctx } = createCard(W, H);
  await backdrop(ctx, sceneFor(view.location.key), 0.42);
  header(ctx, W, `كتاب الوحوش • ${view.location.nameAr}`, {
    subtitle: `مستوى الخطر ${view.location.danger} • ${view.monsters.length} مخلوقات`,
    iconName: 'skull',
    color: '#fb7185',
  });
  const n = view.monsters.length;
  const cw = (W - 80) / Math.max(1, n);
  view.monsters.forEach((m, i) => {
    const cx = W - 40 - cw * i - cw / 2;
    panel(ctx, cx - cw / 2 + 8, 130, cw - 16, H - 170, { radius: 18, fill: 'rgba(6, 10, 34, 0.6)', stroke: hexToRgba(m.palette[1], 0.5) });
    const scale = Math.min(0.62, (cw - 30) / 330) * (m.archetype === 'dragon' ? 0.75 : 1);
    drawMonster(ctx, { x: cx, y: 420, scale, facing: -1, archetype: m.archetype, palette: m.palette, seed: hashSeed(m.key) });
    text(ctx, m.name, cx, 466, { size: 21, weight: 800, align: 'center', maxWidth: cw - 30 });
    let y = 500;
    for (const s of m.skills.slice(0, 3)) {
      text(ctx, `✦ ${s}`, cx, y, { size: 14, weight: 600, align: 'center', color: m.palette[1], maxWidth: cw - 30 });
      y += 22;
    }
    if (m.loot.length) text(ctx, `غنائم: ${m.loot.join('، ')}`, cx, H - 92, { size: 13, weight: 600, align: 'center', color: theme.gold, maxWidth: cw - 30 });
  });
  frame(ctx, W, H, '#fb7185');
  return toImage(canvas);
}

/** Story bosses as a gallery; undefeated ones are dark silhouettes. `view` = { bosses:[{key,name,archetype,palette,defeated,chapter}], page, pages } */
export async function renderBossGallery(view) {
  const { canvas, ctx } = createCard(W, H);
  await backdrop(ctx, 'abyss', 0.35);
  const beaten = view.bosses.filter((b) => b.defeated).length;
  header(ctx, W, 'قاعة الزعماء', {
    subtitle: `هزمت ${beaten} من ${view.totalBosses ?? view.bosses.length} زعيماً في القصة`,
    iconName: 'crown',
    color: theme.gold,
  });
  const cols = Math.min(5, view.bosses.length);
  const rows = Math.ceil(view.bosses.length / cols);
  const cw = (W - 80) / cols;
  const rh = (H - 170) / rows;
  view.bosses.forEach((b, i) => {
    const col = i % cols;
    const r = Math.floor(i / cols);
    const cx = W - 40 - cw * col - cw / 2;
    const top = 128 + r * rh;
    panel(ctx, cx - cw / 2 + 6, top, cw - 12, rh - 12, { radius: 16, fill: 'rgba(6,8,28,0.65)', stroke: hexToRgba(b.defeated ? theme.gold : '#334155', 0.6) });
    const palette = b.defeated ? b.palette : ['#05060f', '#1e293b'];
    const scale = (rh / 520) * (b.archetype === 'dragon' ? 0.62 : 0.8);
    drawMonster(ctx, { x: cx, y: top + rh - 62, scale, facing: -1, archetype: b.archetype, palette, boss: b.defeated, seed: hashSeed(b.key) });
    text(ctx, b.defeated ? b.name : '؟؟؟', cx, top + rh - 36, {
      size: 16,
      weight: 800,
      align: 'center',
      maxWidth: cw - 24,
      color: b.defeated ? theme.text : theme.textMute,
    });
    text(ctx, `الفصل ${b.chapter}`, cx, top + 24, { size: 12, weight: 700, align: 'center', color: theme.textMute });
  });
  if (view.pages > 1) text(ctx, `${view.page} / ${view.pages}`, 44, H - 30, { size: 14, family: 'num', align: 'left', color: theme.textMute });
  frame(ctx, W, H, theme.gold);
  return toImage(canvas);
}
