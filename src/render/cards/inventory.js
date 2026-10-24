import { theme, rarityColors } from '../theme.js';
import { ITEM_ICONS, icon } from '../icons.js';
import { RARITY_LABELS, ITEM_TYPE_LABELS } from '../../config/game.js';
import { createCard, background, frame, panel, text, header, footer, bar, itemTile, hashSeed, toImage, emptyState, paragraph, chipRow } from '../draw.js';
import { fmt, compact } from '../../utils/format.js';

/** Grid of item tiles, 4 per row, with weight/capacity and wallet in the header strip. */
export async function renderInventory({ owner, code, nx, weight, capacity, items, page = 1, pages = 1, filterLabel = 'كل الأغراض' }) {
  const W = 1000;
  const cols = 4;
  const rowsCount = Math.max(1, Math.ceil(items.length / cols));
  const cellH = 118;
  const top = 214;
  const H = top + rowsCount * (cellH + 12) + 60;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(`${code}inv`) });
  frame(ctx, W, H);
  header(ctx, W, `حقيبة ${owner}`, { subtitle: `${code}  •  ${filterLabel}`, iconName: 'bag' });

  panel(ctx, 40, 132, W - 80, 64, { radius: 16 });
  icon(ctx, 'coin', W - 72, 164, 24, theme.gold, { glow: 8 });
  text(ctx, `${compact(nx)} NX`, W - 96, 165, { size: 22, weight: 800, color: theme.gold, maxWidth: 200 });
  const over = weight > capacity;
  text(ctx, 'الوزن', 560, 165, { size: 18, weight: 700, color: theme.textDim });
  bar(ctx, 250, 158, 250, 14, capacity ? weight / capacity : 0, { colors: over ? theme.hp : theme.energy });
  text(ctx, `${weight.toFixed(1)} / ${capacity}`, 66, 165, { size: 17, weight: 700, family: 'num', align: 'left', color: over ? theme.danger : theme.textDim });

  if (!items.length) emptyState(ctx, W, top + 40, 'الحقيبة فارغة... اذهب واكتشف العالم!', 'bag');

  const cw = (W - 80 - (cols - 1) * 12) / cols;
  items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = W - 40 - cw - col * (cw + 12);
    const y = top + row * (cellH + 12);
    const color = rarityColors[it.rarity] ?? theme.cyan;
    panel(ctx, x, y, cw, cellH, { radius: 16, fill: 'rgba(12, 24, 70, 0.6)', stroke: 'rgba(103,232,249,0.18)' });
    itemTile(ctx, x + cw - 82, y + 14, 70, { color, iconName: ITEM_ICONS[it.type] ?? 'box', qty: it.quantity, equipped: it.equipped });
    text(ctx, it.name, x + cw - 92, y + 32, { size: 18, weight: 800, maxWidth: cw - 104 });
    text(ctx, RARITY_LABELS[it.rarity], x + cw - 92, y + 58, { size: 14, weight: 700, color, maxWidth: cw - 104 });
    text(ctx, ITEM_TYPE_LABELS[it.type], x + cw - 92, y + 80, { size: 13, weight: 500, color: theme.textMute, maxWidth: cw - 104 });
    text(ctx, `${fmt(it.value)} NX`, x + 14, y + cellH - 18, { size: 13, weight: 600, family: 'num', align: 'left', color: theme.textMute });
  });

  footer(ctx, W, H, pages > 1 ? `PAGE ${page} / ${pages}` : 'NEXUS', 'استخدم /inventory use أو /inventory equip');
  return toImage(canvas);
}

/** Single item detail card. */
export async function renderItem({ name, nameEn, description, rarity, type, value, weight, stats = {}, useEffect, quantity = 0, equippable, usable, slot }) {
  const W = 1000;
  const H = 460;
  const color = rarityColors[rarity] ?? theme.cyan;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(name), accent: color, secondary: color });
  frame(ctx, W, H, color);
  itemTile(ctx, W - 230, 60, 170, { color, iconName: ITEM_ICONS[type] ?? 'box' });
  text(ctx, name, W - 260, 92, { size: 42, weight: 800, maxWidth: 620, glow: 16, glowColor: color });
  if (nameEn) text(ctx, nameEn.toUpperCase(), W - 260, 136, { size: 15, weight: 600, family: 'num', align: 'right', color: theme.textMute, dir: 'ltr' });
  chipRow(
    ctx,
    [
      { label: RARITY_LABELS[rarity], color },
      { label: ITEM_TYPE_LABELS[type], color: theme.royalSoft },
      equippable && { label: 'قابل للتجهيز', color: theme.cyan, iconName: 'check' },
      usable && { label: 'قابل للاستخدام', color: theme.success, iconName: 'flask' },
      quantity > 0 && { label: `تملك ${quantity}`, color: theme.gold },
    ],
    W - 260,
    182,
    680,
  );
  paragraph(ctx, description || 'لا يوجد وصف.', W - 260, 232, 680, { size: 19, maxLines: 2 });

  const statEntries = Object.entries(stats).filter(([, v]) => v);
  const labels = {
    attack: 'الهجوم',
    armor: 'الحماية',
    strength: 'القوة',
    defense: 'الدفاع',
    agility: 'الرشاقة',
    intelligence: 'الذكاء',
    endurance: 'التحمل',
    luck: 'الحظ',
  };
  const effects = [];
  if (useEffect?.heal) effects.push(`+${useEffect.heal} صحة`);
  if (useEffect?.energy) effects.push(`+${useEffect.energy} طاقة`);
  if (useEffect?.cleanse) effects.push('يزيل التأثيرات السلبية');
  if (useEffect?.buff) effects.push(`تعزيز لمدة ${useEffect.minutes} دقيقة`);
  panel(ctx, 40, 300, W - 80, 110, { radius: 16 });
  let x = W - 66;
  const blocks = [
    ...statEntries.map(([k, v]) => ({ label: labels[k] ?? k, value: `+${v}` })),
    ...effects.map((e) => ({ label: 'التأثير', value: e })),
    { label: 'القيمة', value: `${fmt(value)} NX` },
    { label: 'الوزن', value: String(weight) },
    slot && { label: 'الخانة', value: { weapon: 'سلاح', armor: 'درع', accessory: 'إكسسوار' }[slot] },
  ].filter(Boolean);
  for (const b of blocks.slice(0, 7)) {
    const w = Math.max(100, Math.min(220, b.value.length * 13 + 40));
    if (x - w < 50) break;
    text(ctx, b.label, x, 336, { size: 15, weight: 600, color: theme.textMute });
    text(ctx, b.value, x, 372, { size: 22, weight: 800, color, maxWidth: w - 10 });
    x -= w + 16;
  }
  footer(ctx, W, H, 'NEXUS', '');
  return toImage(canvas);
}
