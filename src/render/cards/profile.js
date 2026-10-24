import { theme, rarityColors } from '../theme.js';
import { STATS, STAT_LABELS, SLOT_LABELS } from '../../config/game.js';
import { STAT_ICONS, ITEM_ICONS } from '../icons.js';
import {
  createCard,
  background,
  frame,
  panel,
  text,
  portrait,
  levelRing,
  vitalBar,
  chipRow,
  radar,
  statTile,
  hashSeed,
  toImage,
  footer,
  brand,
  itemTile,
} from '../draw.js';
import { fmt, compact } from '../../utils/format.js';

/**
 * Main character card.
 * @param {object} p view model built by the character service (no DB/Discord objects).
 */
export async function renderProfile(p) {
  const W = 1000;
  const H = 744;
  const { canvas, ctx } = createCard(W, H);
  const seed = hashSeed(p.code);
  background(ctx, W, H, { seed });
  frame(ctx, W, H);

  // Identity
  portrait(ctx, p.avatar, 862, 152, 92, { seed, label: p.name, color: theme.cyan });
  text(ctx, p.name, 735, 96, { size: 48, weight: 800, maxWidth: 440, glow: 16, glowColor: 'rgba(34,211,238,0.55)' });
  const subtitle = [p.title, p.occupation].filter(Boolean).join(' • ');
  text(ctx, p.code, 735, 146, { size: 19, weight: 700, family: 'num', align: 'right', color: theme.cyan, dir: 'ltr' });
  if (subtitle) text(ctx, subtitle, 735 - 150, 147, { size: 19, weight: 600, color: theme.textDim, maxWidth: 290 });
  chipRow(
    ctx,
    [
      { label: p.className ?? 'بلا كلاس • /class browse', iconName: 'swords', color: p.classColor ?? theme.textMute },
      p.race && { label: p.race, iconName: 'sparkle' },
      p.origin && { label: p.origin, iconName: 'pin', color: theme.royalSoft },
      p.age && { label: `العمر ${p.age}`, color: theme.violet },
      p.alignment && { label: p.alignment, color: '#93c5fd' },
    ],
    735,
    200,
    470,
  );

  levelRing(ctx, 128, 140, 74, p.level, p.xpNeed ? p.xp / p.xpNeed : 1);
  text(ctx, `${fmt(p.xp)} / ${fmt(p.xpNeed)} XP`, 128, 238, { size: 14, weight: 600, family: 'num', align: 'center', color: theme.textDim });

  // Vitals
  panel(ctx, 40, 268, W - 80, 104, { accentTop: theme.cyan });
  const bw = 270;
  const gap = (W - 80 - 60 - bw * 3) / 2;
  const bx = (i) => W - 70 - bw - i * (bw + gap);
  vitalBar(ctx, bx(0), 336, bw, { label: 'الصحة', value: p.hp, max: p.maxHp, colors: theme.hp, iconName: 'heart' });
  vitalBar(ctx, bx(1), 336, bw, { label: 'الطاقة', value: p.energy, max: p.maxEnergy, colors: theme.energy, iconName: 'zap' });
  vitalBar(ctx, bx(2), 336, bw, { label: 'الخبرة', value: p.xp, max: p.xpNeed, colors: theme.xp, iconName: 'sparkle' });

  // Stats radar
  panel(ctx, 40, 392, 380, 300);
  text(ctx, 'الإحصائيات', 400, 416, { size: 18, weight: 800 });
  if (p.statPoints > 0) text(ctx, `+${p.statPoints} نقاط`, 60, 416, { size: 15, weight: 700, align: 'left', color: theme.gold, dir: 'rtl' });
  const values = {};
  for (const s of STATS) values[s] = p.stats[s];
  radar(ctx, 230, 556, 78, values, { max: 20, labels: STAT_LABELS, icons: STAT_ICONS });

  // Info tiles
  const tx = 440;
  const tw = (W - 40 - tx - 14) / 2;
  const tiles = [
    { label: 'رصيد NX', value: compact(p.nx), iconName: 'coin', color: theme.gold },
    { label: 'السمعة', value: fmt(p.reputation), iconName: 'crown', color: theme.violet },
    { label: 'الموقع الحالي', value: p.location ?? 'مجهول', iconName: 'pin', color: theme.cyan },
    { label: 'النقابة', value: p.guild ? `${p.guild.name} [${p.guild.tag}]` : 'بلا نقابة', iconName: 'users', color: theme.royalSoft },
  ];
  tiles.forEach((t, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    statTile(ctx, W - 40 - tw - col * (tw + 14), 392 + row * 82, tw, 70, t);
  });

  // Equipment
  panel(ctx, tx, 560, W - 40 - tx, 132);
  text(ctx, 'العتاد', W - 60, 586, { size: 18, weight: 800 });
  text(ctx, `${p.job ? `الوظيفة: ${p.job}` : 'بلا وظيفة'}  •  انتصارات ${fmt(p.wins ?? 0)}`, tx + 20, 586, {
    size: 15,
    weight: 600,
    align: 'left',
    color: theme.textDim,
    dir: 'rtl',
  });
  const slots = ['weapon', 'armor', 'accessory'];
  const sw = (W - 40 - tx - 40 - 20) / 3;
  slots.forEach((slot, i) => {
    const x = W - 60 - sw - i * (sw + 10);
    const it = p.equipment?.[slot];
    const color = it ? rarityColors[it.rarity] : 'rgba(255,255,255,0.25)';
    itemTile(ctx, x + sw - 62, 606, 60, { color, iconName: ITEM_ICONS[slot], dim: !it });
    text(ctx, SLOT_LABELS[slot], x + sw - 72, 624, { size: 13, weight: 600, color: theme.textMute });
    text(ctx, it ? it.name : 'فارغ', x + sw - 72, 650, { size: 16, weight: 700, color: it ? color : theme.textMute, maxWidth: sw - 80 });
  });

  brand(ctx, 44, H - 26);
  footer(ctx, W, H + 6, '', p.footer ?? '');
  return toImage(canvas);
}
