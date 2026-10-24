import { theme } from '../theme.js';
import { STAT_ICONS, icon } from '../icons.js';
import { STATS, STAT_LABELS } from '../../config/game.js';
import { createCard, background, frame, panel, text, header, footer, bar, radar, hashSeed, toImage } from '../draw.js';
import { pct } from '../../utils/format.js';

export async function renderStats({ name, code, base, effective, statPoints, skillPoints, critChance, dodgeChance, attack, armor, carry }) {
  const W = 1000;
  const H = 640;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(`${code}stats`) });
  frame(ctx, W, H);
  header(ctx, W, `إحصائيات ${name}`, { subtitle: `${code}  •  نقاط متاحة: ${statPoints} إحصائية، ${skillPoints} مهارة`, iconName: 'eye' });

  panel(ctx, 40, 130, 400, 470);
  const vals = {};
  for (const s of STATS) vals[s] = effective[s];
  radar(ctx, 240, 360, 120, vals, { max: 25, labels: STAT_LABELS, icons: STAT_ICONS });

  panel(ctx, 460, 130, W - 500, 470);
  const top = Math.max(25, ...STATS.map((s) => effective[s]));
  STATS.forEach((s, i) => {
    const y = 172 + i * 62;
    const bonus = effective[s] - base[s];
    icon(ctx, STAT_ICONS[s], W - 76, y, 22, theme.cyan, { glow: 8 });
    text(ctx, STAT_LABELS[s], W - 100, y, { size: 20, weight: 800 });
    text(ctx, String(effective[s]), 490, y, { size: 22, weight: 800, family: 'num', align: 'left' });
    if (bonus > 0) text(ctx, `+${bonus}`, 530, y, { size: 15, weight: 700, family: 'num', align: 'left', color: theme.success });
    bar(ctx, 490, y + 18, W - 590, 8, effective[s] / top, { glow: false });
  });
  const extras = [
    ['الهجوم', attack],
    ['الحماية', armor],
    ['ضربة حرجة', pct(critChance)],
    ['مراوغة', pct(dodgeChance)],
    ['الحمولة', carry],
  ];
  extras.forEach(([label, value], i) => {
    const x = W - 76 - i * 94;
    text(ctx, label, x, 556, { size: 14, weight: 600, color: theme.textMute, align: 'center' });
    text(ctx, String(value), x, 582, { size: 19, weight: 800, family: 'num', align: 'center', color: theme.cyanSoft });
  });
  footer(ctx, W, H, 'NEXUS', statPoints > 0 ? 'وزّع نقاطك عبر /character allocate' : '');
  return toImage(canvas);
}
