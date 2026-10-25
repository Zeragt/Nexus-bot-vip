import { theme, hexToRgba } from '../theme.js';
import { icon } from '../icons.js';
import { createCard, background, frame, panel, text, header, paragraph, hashSeed, toImage, chipRow, roundRect, portrait } from '../draw.js';

const REGION_COLORS = { city: theme.cyan, wild: '#34d399', rift: '#a78bfa', beyond: '#fbbf24' };

/**
 * Constellation-style world map. City districts orbit Nexus City; the wilds and the rift
 * connect to the nearest node. Locked or out-of-level places are dimmed with a lock.
 */
export async function renderMap({ locations, currentKey, visitedKeys = [], playerLevel = 1, chapter = Infinity }) {
  const W = 1000;
  const H = 760;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: 777 });
  frame(ctx, W, H);
  header(ctx, W, 'خريطة نكسس', { subtitle: 'اختر وجهتك من القائمة بالأسفل', iconName: 'map' });

  const area = { x: 60, y: 130, w: W - 120, h: H - 210 };
  const P = (l) => [area.x + l.mapX * area.w, area.y + l.mapY * area.h];
  const hub = locations.find((l) => l.key === 'nexus_city') ?? locations[0];

  // City aura
  if (hub) {
    const [hx, hy] = P(hub);
    const g = ctx.createRadialGradient(hx, hy, 10, hx, hy, 190);
    g.addColorStop(0, 'rgba(34,211,238,0.16)');
    g.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(hx, hy, 190, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = 'rgba(103,232,249,0.22)';
    ctx.beginPath();
    ctx.arc(hx, hy, 160, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Links
  ctx.save();
  for (const l of locations) {
    if (l === hub) continue;
    let target = hub;
    if (l.region !== 'city') {
      let best = Infinity;
      for (const o of locations) {
        if (o === l || o.region === l.region) continue;
        const d = (o.mapX - l.mapX) ** 2 + (o.mapY - l.mapY) ** 2;
        if (d < best) {
          best = d;
          target = o;
        }
      }
    }
    if (!target) continue;
    const [x1, y1] = P(l);
    const [x2, y2] = P(target);
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, hexToRgba(REGION_COLORS[l.region] ?? theme.cyan, 0.5));
    g.addColorStop(1, 'rgba(103,232,249,0.12)');
    ctx.strokeStyle = g;
    ctx.lineWidth = l.region === 'city' ? 1.2 : 1.6;
    ctx.setLineDash(l.region === 'city' ? [] : [6, 6]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();

  for (const l of locations) {
    const [x, y] = P(l);
    const color = REGION_COLORS[l.region] ?? theme.cyan;
    const sealed = (l.requiredChapter ?? 0) > chapter;
    const locked = l.locked || sealed || l.minLevel > playerLevel;
    const here = l.key === currentKey;
    const visited = visitedKeys.includes(l.key);
    const r = l === hub ? 16 : l.region === 'city' ? 9 : 12;
    ctx.save();
    ctx.globalAlpha = locked ? 0.45 : 1;
    if (here) {
      for (const [rr, a] of [
        [r + 22, 0.12],
        [r + 12, 0.25],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(theme.gold, a);
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = here ? theme.gold : visited ? color : hexToRgba(color, 0.35);
    ctx.shadowColor = here ? theme.gold : color;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.restore();
    if (locked) icon(ctx, 'lock', x, y, r * 1.2, '#0b1030', { width: 2.6 });
    if (l === hub) {
      text(ctx, l.nameAr, x + r + 12, y, { size: 20, weight: 800, align: 'left', color: here ? theme.gold : theme.text, glow: 6, glowColor: '#000' });
      continue;
    }
    const labelY = l.region === 'city' && y < P(hub)[1] ? y - r - 14 : y + r + 16;
    text(ctx, l.nameAr, x, labelY, {
      size: l === hub ? 20 : 16,
      weight: here ? 800 : 700,
      align: 'center',
      color: here ? theme.gold : theme.text,
      glow: 6,
      glowColor: '#000',
    });
    if (l.region !== 'city') {
      const sub = sealed ? `الفصل ${l.requiredChapter}` : locked ? `مستوى ${l.minLevel}+` : `خطر ${l.danger}`;
      text(ctx, sub, x, labelY + 20, { size: 12, weight: 600, align: 'center', color: locked ? theme.warn : theme.textMute });
    }
  }

  // Legend
  panel(ctx, 40, H - 70, W - 80, 44, { radius: 14 });
  chipRow(
    ctx,
    [
      { label: 'موقعك', color: theme.gold },
      { label: 'المدينة', color: theme.cyan },
      { label: 'البراري', color: '#34d399' },
      { label: 'الشق', color: '#a78bfa' },
      { label: 'العوالم العائدة', color: '#fbbf24' },
      { label: 'مقفل', color: theme.warn, iconName: 'lock' },
    ],
    W - 54,
    H - 48,
    W - 120,
    { size: 14, h: 28 },
  );
  return toImage(canvas);
}

/** Location detail: description, danger, NPCs present and who's around. */
export async function renderLocation({ nameAr, name, description, region, danger, minLevel, npcs = [], players = 0, here = false, channelName }) {
  const W = 1000;
  const H = 520;
  const color = REGION_COLORS[region] ?? theme.cyan;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(name), accent: color });
  frame(ctx, W, H, color);
  header(ctx, W, nameAr, { subtitle: name.toUpperCase(), iconName: region === 'rift' ? 'gate' : 'pin', color });
  chipRow(
    ctx,
    [
      here && { label: 'أنت هنا', color: theme.gold, iconName: 'pin' },
      { label: region === 'city' ? 'منطقة المدينة' : region === 'rift' ? 'منطقة الشق' : region === 'beyond' ? 'العوالم العائدة' : 'البراري', color },
      { label: `مستوى الخطر ${danger}/10`, color: danger >= 6 ? theme.danger : danger >= 3 ? theme.warn : theme.success, iconName: 'skull' },
      minLevel > 1 && { label: `يتطلب المستوى ${minLevel}`, color: theme.warn, iconName: 'lock' },
      { label: `${players} شخصية هنا`, color: theme.royalSoft, iconName: 'users' },
    ],
    W - 44,
    150,
    W - 88,
  );
  paragraph(ctx, description, W - 50, 204, W - 100, { size: 21, maxLines: 3, color: theme.text });
  panel(ctx, 40, 300, W - 80, 168, { radius: 18 });
  text(ctx, 'الشخصيات في المكان', W - 64, 328, { size: 18, weight: 800 });
  if (!npcs.length) text(ctx, 'لا أحد هنا سوى الريح...', W - 64, 400, { size: 18, weight: 500, color: theme.textMute });
  npcs.slice(0, 4).forEach((n, i) => {
    const cw = (W - 120) / 4;
    const x = W - 60 - i * cw;
    portrait(ctx, null, x - 40, 400, 34, { color: n.color, seed: hashSeed(n.name), label: n.name });
    text(ctx, n.name, x - 86, 388, { size: 18, weight: 800, maxWidth: cw - 100 });
    text(ctx, n.title, x - 86, 414, { size: 13, weight: 500, color: theme.textDim, maxWidth: cw - 100 });
    if (n.hasShop) text(ctx, 'متجر', x - 86, 438, { size: 12, weight: 700, color: theme.gold });
  });
  if (channelName) text(ctx, `#${channelName}`, 44, H - 30, { size: 14, weight: 600, family: 'num', align: 'left', color: theme.textMute });
  return toImage(canvas);
}

/** NPC conversation card with a speech bubble. */
export async function renderNpc({ name, title, description, color = theme.cyan, location, faction, line, hasShop }) {
  const W = 1000;
  const H = 470;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(name), accent: color, secondary: color });
  frame(ctx, W, H, color);
  portrait(ctx, null, W - 140, 150, 86, { color, seed: hashSeed(name), label: name });
  text(ctx, name, W - 260, 92, { size: 44, weight: 800, glow: 14, glowColor: color, maxWidth: 560 });
  text(ctx, title, W - 260, 140, { size: 20, weight: 600, color, maxWidth: 560 });
  chipRow(
    ctx,
    [
      location && { label: location, iconName: 'pin' },
      faction && { label: faction, color: theme.violet, iconName: 'flag' },
      hasShop && { label: 'يملك متجراً', color: theme.gold, iconName: 'coin' },
    ],
    W - 260,
    186,
    600,
  );
  paragraph(ctx, description, W - 260, 232, 640, { size: 17, maxLines: 2 });
  if (line) {
    ctx.save();
    roundRect(ctx, 40, 290, W - 80, 136, 22);
    ctx.fillStyle = 'rgba(8, 16, 52, 0.85)';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W - 170, 290);
    ctx.lineTo(W - 140, 262);
    ctx.lineTo(W - 120, 290);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    icon(ctx, 'chat', W - 74, 330, 26, color, { glow: 8 });
    paragraph(ctx, `«${line}»`, W - 110, 334, W - 200, { size: 23, weight: 600, maxLines: 3, color: theme.text, lineHeight: 1.5 });
  }
  return toImage(canvas);
}
