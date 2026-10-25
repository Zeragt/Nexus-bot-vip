import { icon } from './icons.js';
import { hexToRgba, rarityColors } from './theme.js';
import { createRng } from './../engine/rng.js';
import { hashSeed, roundRect, text } from './draw.js';
import { ELEMENTS } from '../content/classes.js';

const TAU = Math.PI * 2;

/** Central glyph per skill slot (the action), tinted by the element. */
const SLOT_GLYPHS = {
  strike: 'sword',
  strike2: 'swords',
  pierce: 'target',
  combo: 'zap',
  drain: 'drop',
  debuff: 'skull',
  control: 'lock',
  control2: 'hourglass',
  guard: 'shield',
  barrier: 'gem',
  evade: 'wind',
  buff: 'flame',
  heal: 'heart',
  heal2: 'leaf',
  passive: 'star',
  ultimate: 'crown',
};
const TIER_RING = ['#94a3b8', '#94a3b8', '#34d399', '#4f9dff', '#a78bfa', '#f5b942'];

function polygon(ctx, cx, cy, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU;
    ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

/**
 * A square skill icon: element-coloured gem with a seeded rune ring, the slot's glyph, and
 * tier pips. Deterministic per skill key, so the art pack and live cards always agree.
 */
export function drawSkillIcon(ctx, skill, { size = 256, x = 0, y = 0 } = {}) {
  const el = ELEMENTS[skill.element] ?? ELEMENTS.physical;
  const color = el.color;
  const rng = createRng(hashSeed(skill.key));
  const s = size / 256;
  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.save();
  ctx.fillStyle = '#02030a';
  ctx.fillRect(x, y, size, size);
  // Base plate.
  roundRect(ctx, x + 6 * s, y + 6 * s, size - 12 * s, size - 12 * s, 36 * s);
  const bg = ctx.createRadialGradient(cx, cy - 30 * s, 10 * s, cx, cy, size * 0.7);
  bg.addColorStop(0, hexToRgba(color, 0.55));
  bg.addColorStop(0.55, '#0b1238');
  bg.addColorStop(1, '#03050f');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.clip();
  // Faint rays.
  ctx.globalCompositeOperation = 'lighter';
  const rays = 6 + Math.floor(rng.next() * 8);
  const rot = rng.next() * TAU;
  for (let i = 0; i < rays; i++) {
    const a = rot + (i / rays) * TAU;
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * size, cy + Math.sin(a) * size);
    g.addColorStop(0, hexToRgba(color, 0.22));
    g.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, size, a - 0.06, a + 0.06);
    ctx.closePath();
    ctx.fill();
  }
  // Specks.
  for (let i = 0; i < 40; i++) {
    const px = x + rng.next() * size;
    const py = y + rng.next() * size;
    const r = (0.6 + rng.next() * 2) * s;
    ctx.fillStyle = hexToRgba(color, 0.2 + rng.next() * 0.5);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // Rune ring: polygon + tick marks, shape seeded per skill.
  const sides = 3 + Math.floor(rng.next() * 6);
  ctx.strokeStyle = hexToRgba(color, 0.55);
  ctx.lineWidth = 2.5 * s;
  polygon(ctx, cx, cy, 86 * s, sides, rng.next() * TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(color, 0.3);
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.arc(cx, cy, 100 * s, 0, TAU);
  ctx.stroke();
  const ticks = 12 + Math.floor(rng.next() * 24);
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * TAU;
    const long = i % 3 === 0;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 100 * s, cy + Math.sin(a) * 100 * s);
    ctx.lineTo(cx + Math.cos(a) * (long ? 88 : 94) * s, cy + Math.sin(a) * (long ? 88 : 94) * s);
    ctx.stroke();
  }
  // Glyph.
  const glyph = SLOT_GLYPHS[skill.slot] ?? (skill.type === 'healing' ? 'heart' : 'sparkle');
  icon(ctx, glyph, cx, cy, 108 * s, '#ffffff', { width: 1.8, glow: 26 * s, fill: hexToRgba(color, 0.25) });
  icon(ctx, glyph, cx, cy, 108 * s, color, { width: 1.1 });
  ctx.restore();
  // Tier frame and pips.
  const tc = TIER_RING[skill.tier] ?? TIER_RING[1];
  ctx.save();
  roundRect(ctx, x + 6 * s, y + 6 * s, size - 12 * s, size - 12 * s, 36 * s);
  ctx.strokeStyle = tc;
  ctx.lineWidth = (skill.tier >= 5 ? 6 : 4) * s;
  ctx.shadowColor = tc;
  ctx.shadowBlur = (skill.tier >= 4 ? 10 : 4) * s;
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < (skill.tier ?? 1); i++) {
    const px = cx + (i - ((skill.tier ?? 1) - 1) / 2) * 20 * s;
    ctx.save();
    ctx.fillStyle = tc;
    ctx.shadowColor = tc;
    ctx.shadowBlur = 8 * s;
    polygon(ctx, px, y + size - 26 * s, 7 * s, 4, Math.PI / 4);
    ctx.fill();
    ctx.restore();
  }
  if (skill.slot === 'ultimate' || skill.subclassKey) {
    text(ctx, skill.subclassKey ? '✦' : '★', x + size - 34 * s, y + 34 * s, { size: 26 * s, weight: 800, align: 'center', color: tc, family: 'num' });
  }
}

/** Item art (512²): rarity-coloured pedestal, glow and the item-type glyph. Secret items shimmer. */
export function drawItemArt(ctx, item, { size = 512, x = 0, y = 0, glyph = 'gem' } = {}) {
  const color = rarityColors[item.rarity] ?? rarityColors.common;
  const rng = createRng(hashSeed(item.key));
  const s = size / 512;
  const cx = x + size / 2;
  const cy = y + size / 2 - 20 * s;
  const bg = ctx.createRadialGradient(cx, cy, 20 * s, cx, cy, size * 0.75);
  bg.addColorStop(0, hexToRgba(color, 0.45));
  bg.addColorStop(0.5, '#0a1033');
  bg.addColorStop(1, '#02030a');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, size, size);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const n = item.rarity === 'secret' ? 26 : item.rarity === 'mythic' || item.rarity === 'legendary' ? 16 : 8;
  for (let i = 0; i < n; i++) {
    const a = rng.next() * TAU;
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * size, cy + Math.sin(a) * size);
    const c = item.rarity === 'secret' ? ['#2dfcd2', '#a78bfa', '#f0abfc', '#fde68a'][i % 4] : color;
    g.addColorStop(0, hexToRgba(c, 0.3));
    g.addColorStop(1, hexToRgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, size, a - 0.05, a + 0.05);
    ctx.fill();
  }
  ctx.restore();
  // Pedestal.
  ctx.save();
  ctx.fillStyle = 'rgba(2,4,14,0.85)';
  ctx.beginPath();
  ctx.ellipse(cx, y + size - 92 * s, 150 * s, 30 * s, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, 0.7);
  ctx.lineWidth = 3 * s;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20 * s;
  ctx.stroke();
  ctx.restore();
  icon(ctx, glyph, cx, cy, 230 * s, '#ffffff', { width: 1.4, glow: 40 * s, fill: hexToRgba(color, 0.3) });
  icon(ctx, glyph, cx, cy, 230 * s, color, { width: 0.9 });
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6 * s;
  ctx.shadowColor = color;
  ctx.shadowBlur = 24 * s;
  roundRect(ctx, x + 8 * s, y + 8 * s, size - 16 * s, size - 16 * s, 44 * s);
  ctx.stroke();
  ctx.restore();
}
