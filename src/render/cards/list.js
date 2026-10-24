import { theme, hexToRgba } from '../theme.js';
import { icon } from '../icons.js';
import { createCard, background, frame, panel, text, header, footer, bar, portrait, hashSeed, toImage, emptyState, roundRect, measure } from '../draw.js';

/**
 * Generic list card used by leaderboards, members, jobs, skills, factions, lore, events...
 * rows: { title, subtitle, value, valueSub, iconName, color, rank, avatar, progress, badge, dim }
 */
export async function renderList({
  title,
  subtitle = '',
  iconName = 'sparkle',
  color = theme.cyan,
  rows = [],
  page = 1,
  pages = 1,
  footerText = '',
  emptyText = 'لا يوجد شيء لعرضه بعد',
  rowHeight = 78,
  seed,
  valueFamily = 'num',
}) {
  const W = 1000;
  const top = 128;
  const H = Math.max(360, top + Math.max(1, rows.length) * (rowHeight + 10) + 70);
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: seed ?? hashSeed(title) });
  frame(ctx, W, H, color);
  header(ctx, W, title, { subtitle, iconName, color });

  if (!rows.length) emptyState(ctx, W, top + 90, emptyText, iconName);

  rows.forEach((r, i) => {
    const y = top + i * (rowHeight + 10);
    const c = r.color ?? color;
    panel(ctx, 40, y, W - 80, rowHeight, {
      radius: 16,
      fill: r.highlight ? hexToRgba(c, 0.16) : 'rgba(12, 24, 70, 0.55)',
      stroke: r.highlight ? hexToRgba(c, 0.7) : theme.stroke,
    });
    ctx.save();
    ctx.globalAlpha = r.dim ? 0.5 : 1;
    let right = W - 64;
    if (r.rank != null) {
      const medal = r.rank === 1 ? theme.gold : r.rank === 2 ? '#d4dbe8' : r.rank === 3 ? '#e09a63' : null;
      ctx.save();
      ctx.beginPath();
      ctx.arc(right - 20, y + rowHeight / 2, 21, 0, Math.PI * 2);
      ctx.fillStyle = medal ? hexToRgba(medal, 0.2) : 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = medal ?? 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      text(ctx, String(r.rank), right - 20, y + rowHeight / 2 + 1, { size: 18, weight: 800, family: 'num', align: 'center', color: medal ?? theme.textDim });
      right -= 54;
    }
    if (r.avatar !== undefined) {
      portrait(ctx, r.avatar, right - 24, y + rowHeight / 2, 24, { seed: hashSeed(r.title), label: r.title, color: c });
      right -= 64;
    } else if (r.iconName) {
      ctx.save();
      roundRect(ctx, right - 46, y + rowHeight / 2 - 23, 46, 46, 12);
      ctx.fillStyle = hexToRgba(c, 0.14);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(c, 0.5);
      ctx.stroke();
      ctx.restore();
      icon(ctx, r.iconName, right - 23, y + rowHeight / 2, 24, c, { glow: 8 });
      right -= 62;
    }
    const valueW = r.value != null ? Math.max(120, measure(ctx, String(r.value), { size: 22, family: valueFamily }) + 20) : 0;
    const textW = right - 64 - valueW;
    if (r.badge) {
      const bw = measure(ctx, r.badge, { size: 13 }) + 18;
      const tw = Math.min(textW - bw - 10, measure(ctx, r.title, { size: 22, weight: 800 }));
      roundRect(ctx, right - tw - bw - 12, y + (r.subtitle ? 18 : rowHeight / 2 - 11), bw, 22, 11);
      ctx.fillStyle = hexToRgba(c, 0.18);
      ctx.fill();
      text(ctx, r.badge, right - tw - 12 - bw / 2, y + (r.subtitle ? 29 : rowHeight / 2), { size: 13, weight: 700, align: 'center', color: c });
    }
    text(ctx, r.title, right, y + (r.subtitle ? rowHeight / 2 - 13 : rowHeight / 2), { size: 22, weight: 800, maxWidth: textW - (r.badge ? 90 : 0) });
    if (r.subtitle) text(ctx, r.subtitle, right, y + rowHeight / 2 + 16, { size: 16, weight: 500, color: theme.textDim, maxWidth: textW });
    if (r.value != null) {
      text(ctx, String(r.value), 64, y + rowHeight / 2 - (r.valueSub ? 10 : 0), {
        size: 22,
        weight: 800,
        family: valueFamily,
        align: 'left',
        color: r.valueColor ?? c,
        dir: valueFamily === 'num' ? 'ltr' : 'rtl',
      });
      if (r.valueSub) text(ctx, r.valueSub, 64, y + rowHeight / 2 + 16, { size: 13, weight: 600, align: 'left', color: theme.textMute, dir: 'rtl' });
    }
    if (r.progress != null)
      bar(ctx, 64 + valueW, y + rowHeight - 14, right - 64 - valueW, 6, r.progress, { colors: r.progressColors ?? theme.xp, glow: false });
    ctx.restore();
  });

  footer(ctx, W, H, pages > 1 ? `PAGE ${page} / ${pages}` : 'NEXUS', footerText);
  return toImage(canvas);
}
