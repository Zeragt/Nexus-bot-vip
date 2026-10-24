import { theme, hexToRgba } from '../theme.js';
import { icon } from '../icons.js';
import { createCard, background, frame, text, paragraph, hashSeed, toImage, brand, statTile, portrait, divider } from '../draw.js';

/**
 * Announcement / result card: big glowing emblem, title, optional highlight number,
 * a grid of reward tiles and a short paragraph. Used for level ups, rewards, travel...
 */
export async function renderNotice({
  title,
  subtitle = '',
  iconName = 'sparkle',
  color = theme.cyan,
  highlight = null,
  tiles = [],
  body = '',
  footerText = '',
  avatar,
  avatarLabel = '',
  seed,
}) {
  const W = 1000;
  const hasTiles = tiles.length > 0;
  const bodyLines = body ? 3 : 0;
  const H = 300 + (highlight ? 70 : 0) + (hasTiles ? 110 * Math.ceil(tiles.length / 3) : 0) + bodyLines * 32;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: seed ?? hashSeed(title), accent: color });
  frame(ctx, W, H, color);

  const cx = W / 2;
  const cy = 96;
  if (avatar !== undefined) {
    portrait(ctx, avatar, cx, cy, 56, { color, seed: hashSeed(avatarLabel || title), label: avatarLabel });
  } else {
    ctx.save();
    for (const [r, a] of [
      [70, 0.08],
      [54, 0.14],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, a);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(color, 0.9);
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.restore();
    icon(ctx, iconName, cx, cy, 44, color, { glow: 16, width: 1.8 });
  }

  let y = 196;
  text(ctx, title, cx, y, { size: 40, weight: 800, align: 'center', maxWidth: W - 120, glow: 16, glowColor: hexToRgba(color, 0.6) });
  y += 42;
  if (subtitle) {
    text(ctx, subtitle, cx, y, { size: 20, weight: 500, align: 'center', color: theme.textDim, maxWidth: W - 140 });
    y += 30;
  }
  if (highlight) {
    y += 12;
    text(ctx, highlight, cx, y + 14, { size: 44, weight: 800, family: 'num', align: 'center', color, glow: 18 });
    y += 58;
  }
  if (hasTiles) {
    y += 10;
    const tw = 280;
    const gap = 16;
    tiles.forEach((t, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const rowCount = Math.min(3, tiles.length - row * 3);
      const rowTotal = rowCount * tw + (rowCount - 1) * gap;
      const startRight = cx + rowTotal / 2;
      statTile(ctx, startRight - tw - col * (tw + gap), y + row * 92, tw, 76, t);
    });
    y += Math.ceil(tiles.length / 3) * 92 + 6;
  }
  if (body) {
    divider(ctx, 120, W - 120, y + 4, color);
    paragraph(ctx, body, W - 90, y + 30, W - 180, { size: 19, maxLines: 3, color: theme.textDim });
  }
  brand(ctx, 44, H - 30);
  if (footerText) text(ctx, footerText, W - 44, H - 28, { size: 15, weight: 500, color: theme.textMute });
  return toImage(canvas);
}
