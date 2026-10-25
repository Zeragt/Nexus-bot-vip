import { createCanvas } from '@napi-rs/canvas';
import { CLASS_BY_KEY, ELEMENTS } from '../content/classes.js';
import { hexToRgba } from './theme.js';
import { createRng } from '../engine/rng.js';

/**
 * 2D fighters. A player's fighter is a full-body chibi character whose face is their
 * profile picture: the outfit colours are sampled from that picture, while the class
 * decides the outfit, the headgear, the weapon and the element aura.
 *
 * Local sprite space: origin at the feet, +x is "forward", y grows downwards (canvas).
 * A fighter is about 300 units tall; `scale` maps units to pixels.
 */

const TAU = Math.PI * 2;

// ── Colour helpers ──────────────────────────────────────────────────────
function parseHex(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = ([r, g, b]) =>
  `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
export function mix(a, b, t) {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
export const shade = (c, t) => (t < 0 ? mix(c, '#000000', -t) : mix(c, '#ffffff', t));
function luminance(hex) {
  const [r, g, b] = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Dominant colours of a picture: shrink to 24×24, bucket by quantised colour and keep the
 * most common vivid buckets. Returns null when there is no picture.
 */
export function avatarPalette(img) {
  if (!img) return null;
  try {
    const n = 24;
    const c = createCanvas(n, n);
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, n, n);
    const data = x.getImageData(0, 0, n, n).data;
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
      const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, score: 0 };
      e.r += r;
      e.g += g;
      e.b += b;
      e.n += 1;
      e.score += 1 + sat * 2.5; // vivid colours make better outfits than grey backgrounds
      buckets.set(key, e);
    }
    const ranked = [...buckets.values()].sort((a, b) => b.score - a.score).map((e) => toHex([e.r / e.n, e.g / e.n, e.b / e.n]));
    if (!ranked.length) return null;
    const distinct = [ranked[0]];
    for (const col of ranked) {
      if (distinct.length >= 3) break;
      if (distinct.every((d) => colorDistance(d, col) > 90)) distinct.push(col);
    }
    while (distinct.length < 3) distinct.push(shade(distinct[0], distinct.length === 1 ? 0.35 : -0.35));
    return distinct;
  } catch {
    return null;
  }
}
function colorDistance(a, b) {
  const x = parseHex(a);
  const y = parseHex(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Outfit colours for a class, tinted by the avatar palette so every player looks unique. */
export function fighterColors(cls, palette, seed = 1) {
  const rng = createRng(seed);
  const [c0, c1] = cls?.colors ?? ['#334155', '#22d3ee'];
  const p = palette ?? [c0, c1, shade(c0, 0.4)];
  const main = mix(c0, p[0], 0.5);
  return {
    main: luminance(main) < 0.12 ? shade(main, 0.25) : main,
    dark: shade(mix(c0, p[0], 0.4), -0.45),
    trim: mix(c1, p[1], 0.3),
    accent: p[2] ?? c1,
    metal: mix('#cbd5e1', c1, 0.2),
    skin: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'][rng.int(0, 4)],
    aura: ELEMENTS[cls?.element]?.color ?? c1,
  };
}

// ── Poses ───────────────────────────────────────────────────────────────
// Arm angles: 0 = hanging down, π/2 = straight forward, π = straight up.
// weapon: tilt of the held weapon from vertical, positive leans forward.
export const POSES = {
  idle: { lean: 0, front: 0.35, back: -0.2, legs: 0.14, dx: 0, dy: 0, weapon: 0.55 },
  attack: { lean: 0.16, front: 1.55, back: -0.7, legs: 0.42, dx: 26, dy: 4, weapon: 1.75 },
  cast: { lean: -0.06, front: 2.35, back: -0.5, legs: 0.16, dx: 0, dy: 0, weapon: 0.25, glow: true },
  defend: { lean: -0.1, front: 1.25, back: 1.0, legs: 0.34, dx: -6, dy: 10, weapon: -0.15 },
  hurt: { lean: -0.32, front: -0.55, back: 0.75, legs: 0.22, dx: -22, dy: 0, weapon: -0.6, flash: '#ff3355' },
  victory: { lean: 0, front: 2.95, back: -0.45, legs: 0.12, dx: 0, dy: -14, weapon: 0.05 },
  defeated: { lean: 0, front: 0.2, back: 0.2, legs: 0.1, dx: 0, dy: 0, weapon: 1.2, down: true },
};

// ── Small drawing helpers ───────────────────────────────────────────────
function limb(ctx, x1, y1, x2, y2, w, color, outline) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = w + 5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

function blob(ctx, fill, outline, lw = 4) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

const armEnd = (sx, sy, a, len) => [sx + Math.sin(a) * len, sy + Math.cos(a) * len];

// ── Weapons (grip at origin, pointing up = -y) ──────────────────────────
function blade(ctx, { len = 150, w = 16, color = '#e2e8f0', guard = '#f5c451', curve = 0, glow = null, tip = 'point' }) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 24;
  }
  ctx.beginPath();
  ctx.moveTo(-w / 2, -18);
  ctx.quadraticCurveTo(-w / 2 + curve, -len * 0.6, tip === 'point' ? curve : -w / 2 + curve, -len);
  if (tip !== 'point') ctx.lineTo(w / 2 + curve, -len);
  ctx.quadraticCurveTo(w / 2 + curve, -len * 0.6, w / 2, -18);
  ctx.closePath();
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, shade(color, -0.25));
  g.addColorStop(0.5, shade(color, 0.35));
  g.addColorStop(1, shade(color, -0.1));
  blob(ctx, g, '#0b1020', 3);
  ctx.restore();
  ctx.strokeStyle = hexToRgba('#ffffff', 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.quadraticCurveTo(curve * 0.6, -len * 0.6, curve * 0.9, -len + 12);
  ctx.stroke();
  rr(ctx, -w * 1.4, -22, w * 2.8, 9, 4);
  blob(ctx, guard, '#0b1020', 3);
  rr(ctx, -5, -14, 10, 28, 4);
  blob(ctx, '#3f2d1d', '#0b1020', 3);
}

function pole(ctx, len, color = '#7c5a3a') {
  rr(ctx, -5, -len, 10, len + 30, 5);
  blob(ctx, color, '#0b1020', 3);
}

const WEAPONS = {
  sword: (ctx, c) => blade(ctx, { len: 150, w: 16, color: c.metal, guard: c.trim }),
  sword_shield: (ctx, c) => blade(ctx, { len: 135, w: 16, color: c.metal, guard: c.trim }),
  katana: (ctx) => blade(ctx, { len: 170, w: 10, color: '#f1f5f9', guard: '#111827', curve: 18 }),
  greatsword: (ctx, c) => blade(ctx, { len: 200, w: 30, color: c.metal, guard: c.trim, tip: 'flat' }),
  rapier: (ctx, c) => {
    blade(ctx, { len: 165, w: 7, color: '#e2e8f0', guard: c.trim });
    ctx.beginPath();
    ctx.arc(0, -18, 14, Math.PI, TAU);
    blob(ctx, c.trim, '#0b1020', 3);
  },
  energy_blade: (ctx, c) => blade(ctx, { len: 160, w: 14, color: c.aura, guard: '#1f2937', glow: c.aura }),
  daggers: (ctx, c) => {
    blade(ctx, { len: 70, w: 12, color: c.metal, guard: c.trim });
    ctx.save();
    ctx.translate(18, 8);
    ctx.rotate(0.6);
    blade(ctx, { len: 60, w: 11, color: c.metal, guard: c.trim });
    ctx.restore();
  },
  spear: (ctx, c) => {
    pole(ctx, 190);
    ctx.beginPath();
    ctx.moveTo(0, -250);
    ctx.lineTo(14, -190);
    ctx.lineTo(-14, -190);
    ctx.closePath();
    blob(ctx, c.metal, '#0b1020', 3);
    ctx.fillStyle = c.trim;
    ctx.fillRect(-8, -192, 16, 8);
  },
  lance: (ctx, c) => {
    ctx.beginPath();
    ctx.moveTo(0, -240);
    ctx.lineTo(20, -40);
    ctx.lineTo(-20, -40);
    ctx.closePath();
    blob(ctx, c.metal, '#0b1020', 3);
    ctx.beginPath();
    ctx.arc(0, -36, 24, Math.PI, TAU);
    blob(ctx, c.trim, '#0b1020', 3);
    rr(ctx, -6, -36, 12, 50, 5);
    blob(ctx, '#3f2d1d', '#0b1020', 3);
  },
  axe: (ctx, c) => {
    pole(ctx, 140);
    ctx.beginPath();
    ctx.moveTo(4, -140);
    ctx.quadraticCurveTo(70, -150, 64, -95);
    ctx.quadraticCurveTo(36, -112, 4, -100);
    ctx.closePath();
    blob(ctx, c.metal, '#0b1020', 3);
  },
  hammer: (ctx, c) => {
    pole(ctx, 140);
    rr(ctx, -38, -175, 76, 46, 8);
    blob(ctx, c.metal, '#0b1020', 3);
    ctx.fillStyle = c.trim;
    ctx.fillRect(-38, -156, 76, 8);
  },
  scythe: (ctx, c) => {
    pole(ctx, 200, '#1f2937');
    ctx.beginPath();
    ctx.moveTo(0, -200);
    ctx.quadraticCurveTo(-110, -215, -130, -140);
    ctx.quadraticCurveTo(-80, -185, 0, -178);
    ctx.closePath();
    ctx.save();
    ctx.shadowColor = c.aura;
    ctx.shadowBlur = 16;
    blob(ctx, '#cbd5e1', '#0b1020', 3);
    ctx.restore();
  },
  staff: (ctx, c) => {
    pole(ctx, 180);
    ctx.save();
    ctx.shadowColor = c.aura;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(0, -196, 20, 0, TAU);
    blob(ctx, c.aura, '#0b1020', 3);
    ctx.restore();
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -196, 26, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  },
  wand: (ctx, c) => {
    rr(ctx, -4, -80, 8, 90, 4);
    blob(ctx, '#f8fafc', '#0b1020', 3);
    ctx.save();
    ctx.shadowColor = c.aura;
    ctx.shadowBlur = 22;
    star(ctx, 0, -88, 14, 6);
    blob(ctx, c.aura, '#0b1020', 2);
    ctx.restore();
  },
  orb: (ctx, c) => {
    ctx.save();
    ctx.shadowColor = c.aura;
    ctx.shadowBlur = 36;
    const g = ctx.createRadialGradient(-6, -46, 2, 0, -40, 26);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, c.aura);
    g.addColorStop(1, shade(c.aura, -0.5));
    ctx.beginPath();
    ctx.arc(0, -40, 26, 0, TAU);
    blob(ctx, g, '#0b1020', 3);
    ctx.restore();
  },
  tome: (ctx, c) => {
    rr(ctx, -30, -50, 60, 44, 5);
    blob(ctx, c.dark, '#0b1020', 3);
    rr(ctx, -26, -48, 52, 38, 3);
    blob(ctx, '#f5f0e1', null);
    ctx.strokeStyle = c.aura;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.lineTo(0, -10);
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = c.aura;
    ctx.shadowBlur = 20;
    star(ctx, 0, -70, 10, 4);
    blob(ctx, c.aura, null);
    ctx.restore();
  },
  cards: (ctx, c) => {
    for (let i = -2; i <= 2; i++) {
      ctx.save();
      ctx.rotate(i * 0.22);
      rr(ctx, -13, -62, 26, 38, 4);
      blob(ctx, i % 2 ? '#f8fafc' : c.trim, '#0b1020', 2);
      ctx.restore();
    }
  },
  bow: (ctx, c) => {
    ctx.strokeStyle = '#0b1020';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(-50, -10, 95, -0.95, 0.95);
    ctx.stroke();
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-50 + Math.cos(-0.95) * 95, -10 + Math.sin(-0.95) * 95);
    ctx.lineTo(-50 + Math.cos(0.95) * 95, -10 + Math.sin(0.95) * 95);
    ctx.stroke();
  },
  crossbow: (ctx, c) => {
    rr(ctx, -8, -90, 16, 100, 4);
    blob(ctx, '#5b4636', '#0b1020', 3);
    ctx.strokeStyle = c.metal;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, -40, 50, -2.6, -0.54);
    ctx.stroke();
  },
  gun: (ctx, c) => {
    rr(ctx, -9, -70, 18, 72, 4);
    blob(ctx, c.metal, '#0b1020', 3);
    rr(ctx, -10, -8, 20, 30, 5);
    blob(ctx, '#3f2d1d', '#0b1020', 3);
    ctx.fillStyle = c.trim;
    ctx.fillRect(-10, -40, 20, 6);
  },
  rifle: (ctx, c) => {
    rr(ctx, -7, -170, 14, 160, 4);
    blob(ctx, c.metal, '#0b1020', 3);
    rr(ctx, -12, -40, 24, 70, 6);
    blob(ctx, '#3f2d1d', '#0b1020', 3);
    rr(ctx, -14, -120, 10, 30, 3);
    blob(ctx, c.trim, '#0b1020', 2);
  },
  fists: (ctx, c) => {
    ctx.beginPath();
    ctx.arc(0, -8, 17, 0, TAU);
    blob(ctx, c.trim, '#0b1020', 3);
  },
  gauntlet: (ctx, c) => {
    rr(ctx, -20, -30, 40, 46, 10);
    blob(ctx, c.metal, '#0b1020', 3);
    ctx.save();
    ctx.shadowColor = c.aura;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, -8, 8, 0, TAU);
    blob(ctx, c.aura, null);
    ctx.restore();
  },
  claws: (ctx) => {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 10 - 4, -10);
      ctx.quadraticCurveTo(i * 16, -50, i * 12 + 12, -70);
      ctx.lineTo(i * 10 + 4, -10);
      ctx.closePath();
      blob(ctx, '#e2e8f0', '#0b1020', 2);
    }
  },
  whip: (ctx, c) => {
    rr(ctx, -6, -30, 12, 40, 5);
    blob(ctx, '#3f2d1d', '#0b1020', 3);
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.bezierCurveTo(60, -90, -40, -140, 70, -170);
    ctx.stroke();
  },
  flask: (ctx, c) => {
    ctx.save();
    ctx.shadowColor = c.aura;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(-8, -60);
    ctx.lineTo(-8, -42);
    ctx.lineTo(-24, -10);
    ctx.quadraticCurveTo(0, 6, 24, -10);
    ctx.lineTo(8, -42);
    ctx.lineTo(8, -60);
    ctx.closePath();
    blob(ctx, hexToRgba(c.aura, 0.85), '#0b1020', 3);
    ctx.restore();
    ctx.fillStyle = '#7c5a3a';
    ctx.fillRect(-9, -68, 18, 10);
  },
  injector: (ctx, c) => {
    rr(ctx, -10, -80, 20, 70, 6);
    blob(ctx, hexToRgba(c.aura, 0.9), '#0b1020', 3);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-2, -104, 4, 26);
    rr(ctx, -16, -12, 32, 10, 3);
    blob(ctx, c.metal, '#0b1020', 2);
  },
  wrench: (ctx, c) => {
    rr(ctx, -7, -120, 14, 130, 6);
    blob(ctx, c.metal, '#0b1020', 3);
    ctx.beginPath();
    ctx.arc(0, -130, 22, 0, TAU);
    blob(ctx, c.metal, '#0b1020', 3);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(-7, -156, 14, 26);
  },
  bombs: (ctx) => {
    ctx.beginPath();
    ctx.arc(0, -22, 22, 0, TAU);
    blob(ctx, '#1f2937', '#0b1020', 3);
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, -40);
    ctx.quadraticCurveTo(18, -56, 10, -64);
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = '#fb923c';
    ctx.shadowBlur = 16;
    star(ctx, 10, -66, 8, 5);
    blob(ctx, '#fde047', null);
    ctx.restore();
  },
  lute: (ctx, c) => {
    ctx.beginPath();
    ctx.ellipse(0, -30, 30, 38, 0, 0, TAU);
    blob(ctx, '#b45309', '#0b1020', 3);
    ctx.beginPath();
    ctx.arc(0, -34, 9, 0, TAU);
    blob(ctx, '#1c1917', null);
    rr(ctx, -6, -140, 12, 100, 4);
    blob(ctx, '#78350f', '#0b1020', 3);
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = 1.5;
    for (const dx of [-3, 0, 3]) {
      ctx.beginPath();
      ctx.moveTo(dx, -138);
      ctx.lineTo(dx, -14);
      ctx.stroke();
    }
  },
};

function star(ctx, x, y, r, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

function shield(ctx, c) {
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.quadraticCurveTo(38, -42, 40, -20);
  ctx.quadraticCurveTo(38, 26, 0, 50);
  ctx.quadraticCurveTo(-38, 26, -40, -20);
  ctx.quadraticCurveTo(-38, -42, 0, -46);
  ctx.closePath();
  const g = ctx.createLinearGradient(-40, -40, 40, 40);
  g.addColorStop(0, shade(c.main, 0.25));
  g.addColorStop(1, shade(c.main, -0.3));
  blob(ctx, g, '#0b1020', 4);
  ctx.strokeStyle = c.trim;
  ctx.lineWidth = 5;
  ctx.stroke();
  star(ctx, 0, -2, 14, 4);
  blob(ctx, c.trim, null);
}

// ── Outfits ─────────────────────────────────────────────────────────────
function cape(ctx, c, { tattered = false, sway = 0 } = {}) {
  ctx.beginPath();
  ctx.moveTo(-30, -172);
  ctx.quadraticCurveTo(-70 - sway, -90, -62 - sway, -6);
  if (tattered) {
    for (let i = 0; i < 5; i++) ctx.lineTo(-62 - sway + i * 12, i % 2 ? -26 : -2);
  } else ctx.quadraticCurveTo(-30, 6, -4, -10);
  ctx.quadraticCurveTo(-10, -90, 22, -172);
  ctx.closePath();
  const g = ctx.createLinearGradient(-60, -170, 0, 0);
  g.addColorStop(0, shade(c.trim, -0.1));
  g.addColorStop(1, shade(c.trim, -0.55));
  blob(ctx, g, '#0b1020', 4);
}

function torso(ctx, outfit, c) {
  const outline = '#0b1020';
  switch (outfit) {
    case 'plate': {
      rr(ctx, -38, -178, 76, 86, 18);
      const g = ctx.createLinearGradient(-38, -178, 38, -92);
      g.addColorStop(0, shade(c.metal, 0.2));
      g.addColorStop(1, shade(c.metal, -0.35));
      blob(ctx, g, outline);
      ctx.fillStyle = c.main;
      rr(ctx, -16, -170, 32, 70, 8);
      ctx.fill();
      ctx.strokeStyle = c.trim;
      ctx.lineWidth = 4;
      ctx.stroke();
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sx * 38, -168, 24, 16, sx * 0.3, 0, TAU);
        blob(ctx, shade(c.metal, 0.05), outline);
      }
      rr(ctx, -40, -104, 80, 14, 6);
      blob(ctx, c.trim, outline, 3);
      break;
    }
    case 'robe':
    case 'priest': {
      ctx.beginPath();
      ctx.moveTo(-32, -178);
      ctx.lineTo(32, -178);
      ctx.lineTo(54, -14);
      ctx.quadraticCurveTo(0, 0, -54, -14);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -178, 0, 0);
      g.addColorStop(0, c.main);
      g.addColorStop(1, shade(c.main, -0.45));
      blob(ctx, g, outline);
      ctx.strokeStyle = c.trim;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-14, -178);
      ctx.lineTo(outfit === 'priest' ? -16 : -6, -10);
      ctx.moveTo(14, -178);
      ctx.lineTo(outfit === 'priest' ? 16 : 6, -10);
      ctx.stroke();
      rr(ctx, -36, -116, 72, 12, 6);
      blob(ctx, c.accent, outline, 3);
      if (outfit === 'priest') {
        ctx.save();
        ctx.translate(0, -140);
        star(ctx, 0, 0, 12, 4);
        blob(ctx, '#fde68a', outline, 2);
        ctx.restore();
      }
      break;
    }
    case 'gi': {
      rr(ctx, -34, -176, 68, 84, 16);
      blob(ctx, c.main, outline);
      ctx.strokeStyle = shade(c.main, 0.45);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-22, -176);
      ctx.lineTo(10, -120);
      ctx.moveTo(22, -176);
      ctx.lineTo(-6, -138);
      ctx.stroke();
      rr(ctx, -36, -112, 72, 14, 6);
      blob(ctx, c.trim, outline, 3);
      ctx.fillStyle = c.trim;
      ctx.beginPath();
      ctx.moveTo(-30, -100);
      ctx.lineTo(-44, -66);
      ctx.lineTo(-24, -98);
      ctx.fill();
      break;
    }
    case 'tech': {
      rr(ctx, -34, -178, 68, 88, 14);
      const g = ctx.createLinearGradient(-34, -178, 34, -90);
      g.addColorStop(0, shade(c.dark, 0.2));
      g.addColorStop(1, c.dark);
      blob(ctx, g, outline);
      ctx.save();
      ctx.shadowColor = c.aura;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = c.aura;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-24, -166);
      ctx.lineTo(-10, -140);
      ctx.lineTo(-10, -104);
      ctx.moveTo(24, -166);
      ctx.lineTo(10, -140);
      ctx.lineTo(10, -104);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -150, 9, 0, TAU);
      blob(ctx, c.aura, null);
      ctx.restore();
      for (const sx of [-1, 1]) {
        rr(ctx, sx * 38 - 16, -182, 32, 24, 8);
        blob(ctx, c.main, outline, 3);
      }
      break;
    }
    case 'dark': {
      rr(ctx, -34, -176, 68, 86, 14);
      const g = ctx.createLinearGradient(0, -176, 0, -90);
      g.addColorStop(0, c.dark);
      g.addColorStop(1, '#05030c');
      blob(ctx, g, outline);
      ctx.strokeStyle = c.trim;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -170);
      ctx.lineTo(0, -98);
      ctx.stroke();
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * 22, -180);
        ctx.lineTo(sx * 66, -196);
        ctx.lineTo(sx * 50, -168);
        ctx.lineTo(sx * 60, -160);
        ctx.lineTo(sx * 30, -156);
        ctx.closePath();
        blob(ctx, shade(c.main, -0.2), outline, 3);
      }
      rr(ctx, -36, -106, 72, 12, 6);
      blob(ctx, c.trim, outline, 3);
      break;
    }
    case 'ranger':
    case 'leather':
    case 'cloak':
    default: {
      rr(ctx, -34, -176, 68, 86, 16);
      const g = ctx.createLinearGradient(0, -176, 0, -90);
      g.addColorStop(0, c.main);
      g.addColorStop(1, shade(c.main, -0.35));
      blob(ctx, g, outline);
      ctx.fillStyle = shade(c.main, -0.5);
      rr(ctx, -26, -170, 52, 70, 12);
      ctx.fill();
      ctx.fillStyle = c.main;
      rr(ctx, -20, -168, 40, 64, 10);
      ctx.fill();
      rr(ctx, -38, -110, 76, 14, 6);
      blob(ctx, '#3f2d1d', outline, 3);
      rr(ctx, -8, -112, 16, 18, 3);
      blob(ctx, c.trim, outline, 2);
      if (outfit === 'ranger') {
        ctx.strokeStyle = '#3f2d1d';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(-30, -176);
        ctx.lineTo(30, -104);
        ctx.stroke();
      }
    }
  }
}

function headgear(ctx, outfit, c, cls, hx, hy, r) {
  const outline = '#0b1020';
  switch (outfit) {
    case 'plate': {
      ctx.beginPath();
      ctx.arc(hx, hy, r + 8, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineWidth = 12;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.lineWidth = 8;
      ctx.strokeStyle = c.metal;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx - 8, hy - r - 6);
      ctx.quadraticCurveTo(hx - 30, hy - r - 50, hx - 60, hy - r - 30);
      ctx.quadraticCurveTo(hx - 30, hy - r - 26, hx + 8, hy - r - 6);
      ctx.closePath();
      blob(ctx, c.trim, outline, 3);
      break;
    }
    case 'robe': {
      ctx.beginPath();
      ctx.moveTo(hx - r - 20, hy - r * 0.55);
      ctx.quadraticCurveTo(hx, hy - r * 0.9, hx + r + 20, hy - r * 0.55);
      ctx.lineTo(hx + r * 0.5, hy - r * 0.75);
      ctx.quadraticCurveTo(hx + 10, hy - r * 2.2, hx - r * 0.9, hy - r * 2.3);
      ctx.quadraticCurveTo(hx - r * 0.2, hy - r * 1.6, hx - r * 0.5, hy - r * 0.75);
      ctx.closePath();
      blob(ctx, shade(c.main, -0.15), outline, 4);
      ctx.save();
      ctx.shadowColor = c.aura;
      ctx.shadowBlur = 14;
      star(ctx, hx - r * 0.1, hy - r * 1.25, 9, 4);
      blob(ctx, c.aura, null);
      ctx.restore();
      break;
    }
    case 'cloak': {
      ctx.beginPath();
      ctx.arc(hx, hy, r + 14, Math.PI * 0.75, Math.PI * 2.25);
      ctx.lineWidth = 20;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.lineWidth = 15;
      ctx.strokeStyle = shade(c.main, -0.25);
      ctx.stroke();
      break;
    }
    case 'gi': {
      ctx.lineWidth = 9;
      ctx.strokeStyle = outline;
      ctx.beginPath();
      ctx.arc(hx, hy, r + 2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.strokeStyle = c.trim;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.8, hy - r * 0.7);
      ctx.quadraticCurveTo(hx - r * 1.5, hy - r * 0.4, hx - r * 1.7, hy - r * 0.1);
      ctx.stroke();
      break;
    }
    case 'priest': {
      ctx.save();
      ctx.shadowColor = '#fde68a';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(hx, hy - r - 16, r * 0.75, 12, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'dark': {
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + sx * r * 0.45, hy - r * 0.8);
        ctx.quadraticCurveTo(hx + sx * r * 1.2, hy - r * 1.3, hx + sx * r * 0.95, hy - r * 1.9);
        ctx.quadraticCurveTo(hx + sx * r * 0.85, hy - r * 1.3, hx + sx * r * 0.15, hy - r * 0.95);
        ctx.closePath();
        blob(ctx, '#1c1917', outline, 3);
      }
      break;
    }
    case 'tech': {
      ctx.save();
      ctx.shadowColor = c.aura;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = c.aura;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(hx, hy, r + 9, Math.PI * 1.1, Math.PI * 1.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx + r * 0.5, hy - r * 0.85);
      ctx.lineTo(hx + r * 0.75, hy - r * 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx + r * 0.75, hy - r * 1.6, 6, 0, TAU);
      blob(ctx, c.aura, null);
      ctx.restore();
      break;
    }
    case 'ranger': {
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 0.78, r * 1.05, r * 0.3, -0.1, Math.PI, TAU);
      blob(ctx, shade(c.main, -0.2), outline, 4);
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.4, hy - r * 0.95);
      ctx.quadraticCurveTo(hx - r * 1.4, hy - r * 1.8, hx - r * 1.7, hy - r * 1.3);
      ctx.quadraticCurveTo(hx - r * 1.1, hy - r * 1.3, hx - r * 0.3, hy - r * 0.85);
      blob(ctx, c.trim, outline, 2);
      break;
    }
    case 'leather':
    default:
      if (cls?.category === 'shadow') {
        ctx.beginPath();
        ctx.ellipse(hx, hy + r * 0.45, r * 0.95, r * 0.42, 0, 0, Math.PI);
        blob(ctx, hexToRgba('#0f172a', 0.92), outline, 3);
      }
  }
}

function face(ctx, avatar, hx, hy, r, c, seed) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, TAU);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    const s = Math.max((r * 2) / avatar.width, (r * 2) / avatar.height);
    ctx.drawImage(avatar, hx - (avatar.width * s) / 2, hy - (avatar.height * s) / 2, avatar.width * s, avatar.height * s);
    // A soft rim light makes the picture read as a round head rather than a sticker.
    const g = ctx.createRadialGradient(hx - r * 0.35, hy - r * 0.4, r * 0.2, hx, hy, r * 1.05);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.7, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
  } else {
    const rng = createRng(seed);
    ctx.fillStyle = c.skin;
    ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
    ctx.fillStyle = shade(c.accent, -0.3);
    ctx.beginPath();
    ctx.ellipse(hx - r * 0.1, hy - r * 0.75, r * 1.1, r * 0.6, -0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0b1020';
    const ey = hy + r * 0.05;
    for (const ex of [hx + r * 0.05, hx + r * 0.5]) {
      ctx.beginPath();
      ctx.ellipse(ex, ey, r * 0.1, r * 0.16, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(hx + r * 0.08, ey - r * 0.06, r * 0.04, 0, TAU);
    ctx.arc(hx + r * 0.53, ey - r * 0.06, r * 0.04, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(hx + r * 0.3, hy + r * 0.35, r * 0.12, 0.2, Math.PI - 0.2 - rng.next() * 0.3);
    ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#0b1020';
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = c.trim;
  ctx.stroke();
}

function aura(ctx, color, strength = 1, y = -150, r = 190) {
  const g = ctx.createRadialGradient(0, y, 10, 0, y, r);
  g.addColorStop(0, hexToRgba(color, 0.32 * strength));
  g.addColorStop(0.6, hexToRgba(color, 0.12 * strength));
  g.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-r, y - r, r * 2, r * 2);
}

function groundShadow(ctx, w = 70) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 4, w, 14, 0, 0, TAU);
  ctx.fill();
}

/**
 * Draws a player fighter.
 * opts: { x, y (feet), scale, facing (1 = faces right), avatar, classKey, pose, palette, seed, glow }
 */
export function drawFighter(
  ctx,
  { x, y, scale = 1, facing = 1, avatar = null, classKey = null, pose = 'idle', palette = null, seed = 1, aura: auraOn = true },
) {
  const cls = CLASS_BY_KEY[classKey] ?? null;
  const c = fighterColors(cls, palette ?? avatarPalette(avatar), seed);
  const P = POSES[pose] ?? POSES.idle;
  const outfit = cls?.outfit ?? 'leather';
  const weapon = cls?.weapon ?? 'sword';
  const outline = '#0b1020';

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);
  groundShadow(ctx, P.down ? 130 : 70);
  if (P.down) {
    // Knocked out: lying on the ground, desaturated.
    ctx.translate(-20, -30);
    ctx.rotate(-1.42);
    ctx.globalAlpha = 0.75;
  }
  ctx.translate(P.dx, P.dy);
  if (auraOn && !P.down) aura(ctx, c.aura, pose === 'cast' || pose === 'victory' ? 1.6 : 1);

  ctx.save();
  ctx.translate(0, -95);
  ctx.rotate(P.lean);
  ctx.translate(0, 95);

  if (['cloak', 'dark', 'priest'].includes(outfit) || cls?.category === 'warrior')
    cape(ctx, c, { tattered: outfit === 'dark', sway: pose === 'attack' ? 18 : 0 });

  // Back arm and back leg (darker, behind the body)
  const shoulderY = -166;
  const [bax, bay] = armEnd(-22, shoulderY, P.back, 70);
  limb(ctx, -22, shoulderY, bax, bay, 20, shade(c.main, -0.35), outline);
  if (weapon === 'sword_shield') {
    ctx.save();
    ctx.translate(bax + 6, bay - 8);
    shield(ctx, c);
    ctx.restore();
  } else if (weapon === 'daggers' || weapon === 'claws' || weapon === 'fists' || weapon === 'gauntlet') {
    ctx.save();
    ctx.translate(bax, bay);
    ctx.rotate(P.weapon * 0.6);
    WEAPONS[weapon](ctx, { ...c, metal: shade(c.metal, -0.2) });
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(bax, bay, 11, 0, TAU);
  blob(ctx, shade(c.skin, -0.2), outline, 3);

  const legSpread = P.legs * 70;
  limb(ctx, -12, -92, -12 - legSpread, -10, 24, shade(c.dark, -0.1), outline);
  rr(ctx, -12 - legSpread - 18, -18, 36, 20, 8);
  blob(ctx, '#1f2937', outline, 3);

  torso(ctx, outfit, c);

  limb(ctx, 12, -92, 12 + legSpread, -10, 24, c.dark, outline);
  rr(ctx, 12 + legSpread - 14, -18, 38, 20, 8);
  blob(ctx, '#273449', outline, 3);
  if (outfit === 'robe' || outfit === 'priest') {
    // Robe skirt covers the legs again.
    ctx.beginPath();
    ctx.moveTo(-44, -96);
    ctx.lineTo(44, -96);
    ctx.lineTo(56 + legSpread * 0.3, -16);
    ctx.quadraticCurveTo(0, -4, -56 - legSpread * 0.3, -16);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -96, 0, 0);
    g.addColorStop(0, shade(c.main, -0.15));
    g.addColorStop(1, shade(c.main, -0.5));
    blob(ctx, g, outline);
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-54 - legSpread * 0.3, -20);
    ctx.quadraticCurveTo(0, -8, 54 + legSpread * 0.3, -20);
    ctx.stroke();
  }

  // Head
  const hx = 4;
  const hy = -232;
  const r = 56;
  ctx.fillStyle = c.skin;
  rr(ctx, -10, -186, 20, 16, 4);
  ctx.fill();
  if (outfit === 'cloak') {
    ctx.beginPath();
    ctx.arc(hx, hy + 6, r + 20, 0, TAU);
    blob(ctx, shade(c.main, -0.35), outline, 4);
  }
  face(ctx, avatar, hx, hy, r, c, seed);
  headgear(ctx, outfit, c, cls, hx, hy, r);

  // Front arm with the weapon
  const [fax, fay] = armEnd(22, shoulderY, P.front, 72);
  if (P.glow) {
    ctx.save();
    const g = ctx.createRadialGradient(fax, fay, 2, fax, fay, 70);
    g.addColorStop(0, hexToRgba('#ffffff', 0.9));
    g.addColorStop(0.25, hexToRgba(c.aura, 0.7));
    g.addColorStop(1, hexToRgba(c.aura, 0));
    ctx.fillStyle = g;
    ctx.fillRect(fax - 70, fay - 70, 140, 140);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(fax, fay);
  ctx.rotate(P.weapon);
  (WEAPONS[weapon] ?? WEAPONS.sword)(ctx, c);
  ctx.restore();
  limb(ctx, 22, shoulderY, fax, fay, 21, c.main, outline);
  ctx.beginPath();
  ctx.arc(22, shoulderY, 15, 0, TAU);
  blob(ctx, outfit === 'plate' ? c.metal : shade(c.main, 0.1), outline, 3);
  ctx.beginPath();
  ctx.arc(fax, fay, 12, 0, TAU);
  blob(ctx, ['gauntlet', 'fists'].includes(weapon) ? c.trim : c.skin, outline, 3);

  ctx.restore(); // lean

  if (P.flash) {
    ctx.globalCompositeOperation = 'source-atop';
  }
  ctx.restore();
  if (P.flash) hitFlash(ctx, x, y, scale, P.flash);
}

function hitFlash(ctx, x, y, scale, color) {
  ctx.save();
  ctx.translate(x, y - 150 * scale);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 150 * scale);
  g.addColorStop(0, hexToRgba(color, 0.35));
  g.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-150 * scale, -150 * scale, 300 * scale, 300 * scale);
  ctx.restore();
}

// ── Monsters ────────────────────────────────────────────────────────────
function eye(ctx, x, y, r, color = '#fef08a') {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#0b1020';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.15, y, r * 0.3, r * 0.55, 0, 0, TAU);
  ctx.fill();
}

const MONSTERS = {
  beast(ctx, d, l, t) {
    const o = '#0b1020';
    ctx.beginPath();
    ctx.moveTo(-110, -70);
    ctx.quadraticCurveTo(-150, -120, -170, -150 + t * 10);
    ctx.quadraticCurveTo(-140, -100, -118, -96);
    blob(ctx, d, o, 4);
    for (const [lx, w] of [
      [-80, 22],
      [-40, 20],
      [50, 22],
      [85, 20],
    ]) {
      rr(ctx, lx - w / 2, -70, w, 72, 9);
      blob(ctx, shade(d, lx < 0 ? -0.2 : 0), o, 4);
    }
    ctx.beginPath();
    ctx.ellipse(0, -100, 120, 52, -0.05, 0, TAU);
    const g = ctx.createLinearGradient(0, -150, 0, -50);
    g.addColorStop(0, shade(d, 0.2));
    g.addColorStop(1, shade(d, -0.3));
    blob(ctx, g, o, 5);
    ctx.strokeStyle = hexToRgba(l, 0.6);
    ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-60 + i * 30, -146);
      ctx.lineTo(-48 + i * 30, -122);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(80, -140);
    ctx.quadraticCurveTo(170, -170, 190, -110);
    ctx.lineTo(176, -86);
    ctx.quadraticCurveTo(130, -70, 92, -84);
    ctx.closePath();
    blob(ctx, shade(d, 0.1), o, 5);
    for (const ex of [105, 135]) {
      ctx.beginPath();
      ctx.moveTo(ex, -152);
      ctx.lineTo(ex + 12, -196);
      ctx.lineTo(ex + 26, -150);
      blob(ctx, shade(d, -0.1), o, 4);
    }
    ctx.fillStyle = '#f8fafc';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(140 + i * 11, -92);
      ctx.lineTo(145 + i * 11, -76);
      ctx.lineTo(150 + i * 11, -92);
      ctx.fill();
    }
    eye(ctx, 158, -128, 9, l);
  },
  golem(ctx, d, l) {
    const o = '#0b1020';
    for (const sx of [-1, 1]) {
      rr(ctx, sx * 50 - 24, -90, 48, 92, 12);
      blob(ctx, shade(d, -0.2), o, 5);
    }
    ctx.beginPath();
    ctx.moveTo(-90, -250);
    ctx.lineTo(90, -260);
    ctx.lineTo(110, -100);
    ctx.lineTo(-100, -90);
    ctx.closePath();
    const g = ctx.createLinearGradient(-90, -260, 110, -90);
    g.addColorStop(0, shade(d, 0.25));
    g.addColorStop(1, shade(d, -0.35));
    blob(ctx, g, o, 6);
    ctx.save();
    ctx.shadowColor = l;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = l;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-50, -230);
    ctx.lineTo(-10, -180);
    ctx.lineTo(-40, -130);
    ctx.moveTo(30, -220);
    ctx.lineTo(10, -170);
    ctx.lineTo(50, -120);
    ctx.stroke();
    ctx.restore();
    for (const sx of [-1, 1]) {
      rr(ctx, sx * 120 - 30, -250, 60, 150, 20);
      blob(ctx, shade(d, sx > 0 ? 0.05 : -0.15), o, 5);
      rr(ctx, sx * 120 - 36, -110, 72, 50, 14);
      blob(ctx, shade(d, -0.25), o, 5);
    }
    rr(ctx, -40, -310, 80, 64, 14);
    blob(ctx, shade(d, 0.1), o, 5);
    eye(ctx, -14, -280, 9, l);
    eye(ctx, 18, -280, 9, l);
  },
  ghost(ctx, d, l, t) {
    const o = '#0b1020';
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = l;
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.moveTo(-70, -120);
    ctx.quadraticCurveTo(-80, -300, 0, -300);
    ctx.quadraticCurveTo(80, -300, 70, -120);
    for (let i = 0; i <= 6; i++) ctx.lineTo(70 - i * 23.3, -40 + (i % 2 ? -30 : 0) + Math.sin(t + i) * 8);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -300, 0, -40);
    g.addColorStop(0, hexToRgba(l, 0.9));
    g.addColorStop(1, hexToRgba(d, 0.25));
    blob(ctx, g, hexToRgba(o, 0.6), 4);
    ctx.restore();
    ctx.fillStyle = '#0b1020';
    for (const ex of [-24, 24]) {
      ctx.beginPath();
      ctx.ellipse(ex, -220, 14, 22, 0, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(0, -170, 18, 26, 0, 0, TAU);
    ctx.fill();
    eye(ctx, -24, -222, 5, '#ffffff');
    eye(ctx, 24, -222, 5, '#ffffff');
  },
  serpent(ctx, d, l) {
    const o = '#0b1020';
    ctx.lineCap = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-170, -20);
      ctx.bezierCurveTo(-80, -10, -120, -110, -20, -100);
      ctx.bezierCurveTo(60, -95, 20, -220, 90, -230);
    };
    path();
    ctx.strokeStyle = o;
    ctx.lineWidth = 56;
    ctx.stroke();
    path();
    ctx.strokeStyle = d;
    ctx.lineWidth = 46;
    ctx.stroke();
    path();
    ctx.setLineDash([10, 18]);
    ctx.strokeStyle = l;
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.ellipse(110, -240, 52, 34, -0.3, 0, TAU);
    blob(ctx, shade(d, 0.1), o, 5);
    eye(ctx, 122, -256, 8, l);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(140, -224);
    ctx.lineTo(146, -200);
    ctx.lineTo(152, -226);
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(158, -232);
    ctx.lineTo(190, -228);
    ctx.lineTo(198, -238);
    ctx.moveTo(190, -228);
    ctx.lineTo(198, -220);
    ctx.stroke();
  },
  bird(ctx, d, l, t) {
    const o = '#0b1020';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -180);
      ctx.quadraticCurveTo(sx * 150, -300 - t * 20, sx * 220, -220);
      ctx.quadraticCurveTo(sx * 150, -200, sx * 160, -150);
      ctx.quadraticCurveTo(sx * 90, -170, 0, -140);
      ctx.closePath();
      blob(ctx, shade(d, sx < 0 ? -0.25 : 0.05), o, 5);
      ctx.strokeStyle = hexToRgba(l, 0.7);
      ctx.lineWidth = 3;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(sx * 30 * i, -170);
        ctx.lineTo(sx * (60 + 40 * i), -230 + i * 8);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.ellipse(0, -150, 50, 70, 0, 0, TAU);
    blob(ctx, d, o, 5);
    ctx.beginPath();
    ctx.ellipse(0, -140, 30, 46, 0, 0, TAU);
    ctx.fillStyle = hexToRgba(l, 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(20, -230, 36, 0, TAU);
    blob(ctx, shade(d, 0.1), o, 5);
    ctx.beginPath();
    ctx.moveTo(48, -236);
    ctx.lineTo(90, -222);
    ctx.lineTo(48, -212);
    blob(ctx, '#f59e0b', o, 3);
    eye(ctx, 30, -238, 8, l);
    for (const lx of [-16, 16]) {
      limb(ctx, lx, -84, lx + 6, -10, 8, '#f59e0b', o);
    }
  },
  sprite(ctx, d, l, t) {
    const o = '#0b1020';
    ctx.save();
    ctx.globalAlpha = 0.75;
    for (const sx of [-1, 1]) {
      for (const [w, h, yy] of [
        [90, 60, -220],
        [70, 40, -170],
      ]) {
        ctx.beginPath();
        ctx.ellipse(sx * (w * 0.7), yy - t * 6, w * 0.7, h * 0.7, sx * 0.5, 0, TAU);
        ctx.fillStyle = hexToRgba(l, 0.45);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(l, 0.9);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.save();
    ctx.shadowColor = l;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.moveTo(0, -240);
    ctx.quadraticCurveTo(36, -160, 18, -110);
    ctx.lineTo(-18, -110);
    ctx.quadraticCurveTo(-36, -160, 0, -240);
    blob(ctx, d, o, 4);
    ctx.beginPath();
    ctx.arc(0, -258, 30, 0, TAU);
    blob(ctx, shade(l, 0.3), o, 4);
    ctx.restore();
    eye(ctx, -10, -260, 6, '#0b1020');
    eye(ctx, 12, -260, 6, '#0b1020');
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = hexToRgba(l, 0.9);
      ctx.beginPath();
      ctx.arc(Math.cos(i * 0.9 + t) * 90, -180 + Math.sin(i * 1.7) * 90, 3 + (i % 3), 0, TAU);
      ctx.fill();
    }
  },
  insect(ctx, d, l) {
    const o = '#0b1020';
    for (let i = 0; i < 3; i++) {
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-30 + i * 30, -70);
        ctx.lineTo(-50 + i * 30 + sx * 40, -110 + (sx > 0 ? 40 : 0));
        ctx.lineTo(-60 + i * 30 + sx * 30, 0);
        ctx.strokeStyle = o;
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.strokeStyle = shade(d, -0.2);
        ctx.lineWidth = 6;
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.moveTo(-60, -90);
    ctx.bezierCurveTo(-130, -110, -160, -200, -110, -250);
    ctx.lineTo(-90, -240);
    ctx.bezierCurveTo(-120, -190, -100, -130, -40, -110);
    ctx.closePath();
    blob(ctx, shade(d, 0.1), o, 4);
    ctx.save();
    ctx.shadowColor = l;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(-110, -250);
    ctx.lineTo(-74, -266);
    ctx.lineTo(-96, -232);
    blob(ctx, l, o, 3);
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(-10, -90, 80, 38, 0, 0, TAU);
    blob(ctx, d, o, 5);
    ctx.beginPath();
    ctx.ellipse(76, -100, 40, 32, 0, 0, TAU);
    blob(ctx, shade(d, 0.15), o, 5);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(100, -100 + sx * 16);
      ctx.quadraticCurveTo(150, -100 + sx * 40, 160, -100 + sx * 6);
      ctx.lineTo(112, -100 + sx * 6);
      blob(ctx, shade(d, -0.2), o, 3);
    }
    eye(ctx, 90, -112, 7, l);
  },
  slime(ctx, d, l, t) {
    const o = '#0b1020';
    ctx.beginPath();
    ctx.moveTo(-130, 0);
    ctx.bezierCurveTo(-150, -150, -60, -220 - t * 10, 0, -220 - t * 10);
    ctx.bezierCurveTo(70, -220, 150, -150, 130, 0);
    ctx.closePath();
    const g = ctx.createRadialGradient(-30, -150, 10, 0, -100, 170);
    g.addColorStop(0, shade(l, 0.3));
    g.addColorStop(0.5, l);
    g.addColorStop(1, d);
    ctx.save();
    ctx.shadowColor = l;
    ctx.shadowBlur = 30;
    blob(ctx, g, o, 5);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-50, -160, 22, 12, -0.5, 0, TAU);
    ctx.fill();
    eye(ctx, -24, -110, 12, '#fff');
    eye(ctx, 34, -110, 12, '#fff');
    ctx.strokeStyle = o;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(6, -80, 22, 0.2, Math.PI - 0.2);
    ctx.stroke();
  },
  humanoid(ctx, d, l) {
    const o = '#0b1020';
    ctx.beginPath();
    ctx.moveTo(-40, -200);
    ctx.quadraticCurveTo(-90, -100, -76, 0);
    ctx.lineTo(-30, -20);
    ctx.lineTo(-30, -200);
    blob(ctx, shade(d, -0.3), o, 4);
    for (const sx of [-1, 1]) {
      limb(ctx, sx * 16, -100, sx * 30, -8, 24, shade(d, -0.2), o);
    }
    rr(ctx, -42, -210, 84, 116, 18);
    const g = ctx.createLinearGradient(0, -210, 0, -94);
    g.addColorStop(0, shade(d, 0.2));
    g.addColorStop(1, shade(d, -0.3));
    blob(ctx, g, o, 5);
    ctx.strokeStyle = l;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-30, -200);
    ctx.lineTo(30, -110);
    ctx.stroke();
    limb(ctx, -30, -196, -60, -120, 20, shade(d, -0.15), o);
    limb(ctx, 30, -196, 80, -150, 20, d, o);
    ctx.save();
    ctx.translate(84, -150);
    ctx.rotate(1.2);
    blade(ctx, { len: 120, w: 14, color: '#cbd5e1', guard: l, curve: 14 });
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, -252, 46, 0, TAU);
    blob(ctx, shade(d, -0.1), o, 5);
    ctx.beginPath();
    ctx.ellipse(0, -248, 40, 18, 0, 0, TAU);
    ctx.fillStyle = '#05030c';
    ctx.fill();
    eye(ctx, -14, -250, 6, l);
    eye(ctx, 16, -250, 6, l);
  },
  eldritch(ctx, d, l, t) {
    const o = '#0b1020';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.9 + (i / 6) * Math.PI * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -150);
      ctx.bezierCurveTo(
        Math.cos(a) * 120,
        -150 + Math.sin(a) * 60,
        Math.cos(a + 0.5) * 180,
        -150 + Math.sin(a) * 180 + t * 10,
        Math.cos(a) * 220,
        -150 + Math.sin(a + 0.3) * 160,
      );
      ctx.strokeStyle = o;
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = shade(d, 0.1);
      ctx.lineWidth = 15;
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-60 + i * 30, -80);
      ctx.quadraticCurveTo(-80 + i * 40, -30, -70 + i * 35 + Math.sin(i) * 20, 0);
      ctx.strokeStyle = shade(d, -0.2);
      ctx.lineWidth = 14;
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = l;
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.ellipse(0, -150, 100, 90, 0, 0, TAU);
    const g = ctx.createRadialGradient(0, -170, 10, 0, -150, 110);
    g.addColorStop(0, shade(d, 0.3));
    g.addColorStop(1, shade(d, -0.4));
    blob(ctx, g, o, 6);
    ctx.restore();
    eye(ctx, 0, -160, 34, l);
    for (const [ex, ey, er] of [
      [-60, -190, 10],
      [58, -196, 12],
      [-48, -110, 9],
      [62, -116, 8],
      [0, -222, 10],
    ])
      eye(ctx, ex, ey, er, l);
  },
  dragon(ctx, d, l, t) {
    const o = '#0b1020';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 20, -200);
      ctx.lineTo(sx * 120, -340 - t * 20);
      ctx.lineTo(sx * 260, -300);
      ctx.quadraticCurveTo(sx * 200, -250, sx * 230, -190);
      ctx.quadraticCurveTo(sx * 160, -210, sx * 150, -160);
      ctx.quadraticCurveTo(sx * 90, -190, sx * 40, -150);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(shade(d, sx < 0 ? -0.3 : 0), 0.95);
      blob(ctx, ctx.fillStyle, o, 5);
      ctx.strokeStyle = hexToRgba(l, 0.6);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx * 120, -330);
      ctx.lineTo(sx * 150, -170);
      ctx.moveTo(sx * 120, -330);
      ctx.lineTo(sx * 220, -200);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-80, -60);
    ctx.quadraticCurveTo(-200, -40, -240, -120);
    ctx.lineTo(-200, -110);
    ctx.quadraticCurveTo(-170, -80, -70, -100);
    blob(ctx, shade(d, -0.15), o, 5);
    for (const sx of [-1, 1]) {
      rr(ctx, sx * 60 - 24, -90, 48, 92, 14);
      blob(ctx, shade(d, -0.25), o, 5);
    }
    ctx.beginPath();
    ctx.ellipse(0, -130, 110, 80, 0, 0, TAU);
    const g = ctx.createLinearGradient(0, -210, 0, -50);
    g.addColorStop(0, shade(d, 0.2));
    g.addColorStop(1, shade(d, -0.4));
    blob(ctx, g, o, 6);
    ctx.beginPath();
    ctx.ellipse(10, -110, 60, 50, 0, 0, TAU);
    ctx.fillStyle = hexToRgba(l, 0.3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(60, -190);
    ctx.quadraticCurveTo(110, -280, 150, -290);
    ctx.lineTo(220, -270);
    ctx.lineTo(230, -240);
    ctx.lineTo(160, -230);
    ctx.quadraticCurveTo(120, -200, 100, -150);
    ctx.closePath();
    blob(ctx, shade(d, 0.05), o, 5);
    for (const hx of [150, 175]) {
      ctx.beginPath();
      ctx.moveTo(hx, -288);
      ctx.lineTo(hx - 20, -340);
      ctx.lineTo(hx + 8, -290);
      blob(ctx, '#e2e8f0', o, 3);
    }
    eye(ctx, 190, -266, 9, l);
    ctx.save();
    ctx.shadowColor = l;
    ctx.shadowBlur = 30;
    ctx.fillStyle = hexToRgba(l, 0.8);
    ctx.beginPath();
    ctx.moveTo(232, -246);
    ctx.quadraticCurveTo(280, -250, 300, -230 + t * 10);
    ctx.quadraticCurveTo(270, -236, 230, -238);
    ctx.fill();
    ctx.restore();
  },
  knight(ctx, d, l) {
    // A towering armoured champion: plated legs, tabard, pauldrons, great helm and a greatsword.
    const o = '#0b1020';
    ctx.beginPath();
    ctx.moveTo(-60, -250);
    ctx.quadraticCurveTo(-120, -120, -100, 0);
    ctx.lineTo(-40, -30);
    ctx.lineTo(-40, -250);
    blob(ctx, shade(d, -0.35), o, 4);
    for (const sx of [-1, 1]) {
      rr(ctx, sx * 26 - 20, -120, 40, 122, 10);
      blob(ctx, shade(d, sx < 0 ? -0.25 : -0.1), o, 5);
      rr(ctx, sx * 26 - 24, -20, 48, 22, 6);
      blob(ctx, shade(d, -0.4), o, 4);
    }
    rr(ctx, -62, -262, 124, 150, 22);
    const g = ctx.createLinearGradient(0, -262, 0, -112);
    g.addColorStop(0, shade(d, 0.25));
    g.addColorStop(1, shade(d, -0.3));
    blob(ctx, g, o, 6);
    ctx.beginPath();
    ctx.moveTo(-34, -200);
    ctx.lineTo(34, -200);
    ctx.lineTo(24, -60);
    ctx.lineTo(0, -40);
    ctx.lineTo(-24, -60);
    ctx.closePath();
    blob(ctx, hexToRgba(l, 0.55), o, 4);
    star(ctx, 0, -150, 16, 4);
    blob(ctx, l, null);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 66, -248, 40, 26, sx * 0.3, 0, TAU);
      blob(ctx, shade(d, 0.15), o, 5);
    }
    limb(ctx, -66, -240, -84, -150, 26, shade(d, -0.15), o);
    limb(ctx, 66, -240, 96, -170, 26, d, o);
    ctx.save();
    ctx.translate(100, -170);
    ctx.rotate(0.35);
    blade(ctx, { len: 230, w: 28, color: '#cbd5e1', guard: l, tip: 'point', glow: l });
    ctx.restore();
    rr(ctx, -38, -340, 76, 84, 20);
    blob(ctx, shade(d, 0.1), o, 5);
    ctx.fillStyle = '#05030c';
    rr(ctx, -28, -312, 56, 12, 5);
    ctx.fill();
    eye(ctx, -12, -306, 5, l);
    eye(ctx, 12, -306, 5, l);
    ctx.beginPath();
    ctx.moveTo(-6, -340);
    ctx.quadraticCurveTo(-30, -380, -60, -372);
    ctx.quadraticCurveTo(-30, -360, 6, -338);
    blob(ctx, l, o, 3);
  },
  hydra(ctx, d, l, t) {
    // Three necks rising from one heavy body; the middle head is the tallest.
    const o = '#0b1020';
    ctx.beginPath();
    ctx.moveTo(-90, -60);
    ctx.quadraticCurveTo(-210, -40, -230, -120 + t * 10);
    ctx.quadraticCurveTo(-180, -90, -80, -100);
    blob(ctx, shade(d, -0.2), o, 5);
    for (const lx of [-70, -20, 40, 90]) {
      rr(ctx, lx - 16, -70, 32, 72, 10);
      blob(ctx, shade(d, -0.25), o, 4);
    }
    ctx.beginPath();
    ctx.ellipse(10, -100, 130, 66, 0, 0, TAU);
    const g = ctx.createLinearGradient(0, -166, 0, -34);
    g.addColorStop(0, shade(d, 0.2));
    g.addColorStop(1, shade(d, -0.35));
    blob(ctx, g, o, 6);
    const heads = [
      [-70, -250, -0.5],
      [10, -300, 0],
      [95, -255, 0.45],
    ];
    for (const [hx, hy] of heads) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = o;
      ctx.lineWidth = 38;
      ctx.beginPath();
      ctx.moveTo(hx * 0.4 + 10, -140);
      ctx.quadraticCurveTo(hx * 1.1, (hy - 140) / 2 - 40, hx, hy + 20);
      ctx.stroke();
      ctx.strokeStyle = shade(d, 0.05);
      ctx.lineWidth = 30;
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(l, 0.5);
      ctx.lineWidth = 6;
      ctx.setLineDash([10, 12]);
      ctx.stroke();
      ctx.restore();
    }
    for (const [hx, hy, rot] of heads) {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(-26, 10);
      ctx.quadraticCurveTo(-20, -30, 20, -26);
      ctx.lineTo(52, -8);
      ctx.lineTo(40, 14);
      ctx.quadraticCurveTo(0, 30, -26, 10);
      blob(ctx, shade(d, 0.12), o, 4);
      ctx.fillStyle = '#f8fafc';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(24 + i * 8, 10);
        ctx.lineTo(28 + i * 8, 22);
        ctx.lineTo(32 + i * 8, 10);
        ctx.fill();
      }
      eye(ctx, 18, -10, 6, l);
      ctx.restore();
    }
  },
};
export const MONSTER_ARCHETYPES = Object.keys(MONSTERS);

/**
 * Where the head, body and top of each archetype sit (facing right, feet at the origin).
 * Boss traits (horns, wings, halos...) are placed with these anchors.
 */
const ANCHORS = {
  beast: { head: [150, -125, 40], body: [0, -105, 240, 100], top: -200 },
  golem: { head: [0, -282, 34], body: [0, -175, 200, 180], top: -315 },
  ghost: { head: [0, -235, 70], body: [0, -170, 150, 260], top: -305 },
  serpent: { head: [165, -240, 40], body: [60, -150, 210, 200], top: -285 },
  bird: { head: [25, -240, 36], body: [10, -170, 110, 150], top: -280 },
  sprite: { head: [0, -245, 32], body: [0, -180, 70, 140], top: -282 },
  insect: { head: [130, -100, 36], body: [40, -90, 170, 70], top: -165 },
  slime: { head: [0, -120, 90], body: [0, -115, 270, 220], top: -235 },
  humanoid: { head: [0, -252, 46], body: [0, -150, 90, 120], top: -300 },
  eldritch: { head: [0, -160, 100], body: [0, -160, 210, 210], top: -305 },
  dragon: { head: [195, -268, 40], body: [20, -110, 230, 160], top: -360 },
  knight: { head: [0, -300, 40], body: [0, -185, 130, 160], top: -345 },
  hydra: { head: [10, -300, 34], body: [10, -100, 260, 130], top: -340 },
};

function wingsTrait(ctx, kind, a, d, l, accent) {
  const [bx, by, bw, bh] = a.body;
  const y = by - bh * 0.3;
  const span = bw * 0.55 + 110;
  const o = '#0b1020';
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(bx + sx * bw * 0.12, y);
    ctx.scale(sx, 1);
    ctx.beginPath();
    if (kind === 'feather') {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(span * 0.5, -span * 0.75, span, -span * 0.55);
      for (let i = 0; i < 5; i++) ctx.quadraticCurveTo(span * (0.95 - i * 0.18), -span * (0.3 - i * 0.07), span * (0.86 - i * 0.18), -span * (0.18 - i * 0.07));
      ctx.lineTo(0, 30);
      ctx.closePath();
      blob(ctx, shade(accent ?? l, -0.15), o, 4);
      ctx.strokeStyle = hexToRgba('#ffffff', 0.35);
      ctx.lineWidth = 3;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(span * 0.1, -6);
        ctx.lineTo(span * (1 - i * 0.18), -span * (0.42 - i * 0.07));
        ctx.stroke();
      }
    } else if (kind === 'crystal') {
      ctx.moveTo(0, 0);
      ctx.lineTo(span * 0.45, -span * 0.85);
      ctx.lineTo(span * 0.62, -span * 0.35);
      ctx.lineTo(span * 1.02, -span * 0.6);
      ctx.lineTo(span * 0.75, -span * 0.05);
      ctx.lineTo(span * 0.4, span * 0.1);
      ctx.closePath();
      ctx.save();
      ctx.shadowColor = accent ?? l;
      ctx.shadowBlur = 24;
      blob(ctx, hexToRgba(accent ?? l, 0.55), hexToRgba('#ffffff', 0.8), 3);
      ctx.restore();
      ctx.strokeStyle = hexToRgba('#ffffff', 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(span * 0.1, 0);
      ctx.lineTo(span * 0.62, -span * 0.35);
      ctx.lineTo(span * 0.4, span * 0.1);
      ctx.stroke();
    } else {
      ctx.moveTo(0, 0);
      ctx.lineTo(span * 0.35, -span * 0.8);
      ctx.lineTo(span, -span * 0.55);
      ctx.quadraticCurveTo(span * 0.85, -span * 0.25, span * 0.95, -span * 0.02);
      ctx.quadraticCurveTo(span * 0.7, -span * 0.12, span * 0.62, span * 0.12);
      ctx.quadraticCurveTo(span * 0.4, -span * 0.02, span * 0.3, span * 0.2);
      ctx.closePath();
      blob(ctx, shade(d, -0.25), o, 4);
      ctx.strokeStyle = hexToRgba(accent ?? l, 0.55);
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [ex, ey] of [
        [span * 0.95, -span * 0.02],
        [span * 0.62, span * 0.12],
        [span * 0.3, span * 0.2],
      ]) {
        ctx.moveTo(span * 0.35, -span * 0.8);
        ctx.lineTo(ex, ey);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function flamesTrait(ctx, a, color, t) {
  const [bx, by, bw, bh] = a.body;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const fx = bx - bw * 0.55 + (i / 8) * bw * 1.1;
    const fh = 70 + ((i * 37 + Math.round(t * 50)) % 60);
    const base = by + bh * 0.45;
    const g = ctx.createLinearGradient(0, base, 0, base - fh - bh * 0.6);
    g.addColorStop(0, hexToRgba(color, 0.55));
    g.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(fx - 22, base);
    ctx.quadraticCurveTo(fx - 28, base - fh * 0.6, fx + (i % 2 ? 10 : -10), base - fh - bh * 0.6);
    ctx.quadraticCurveTo(fx + 28, base - fh * 0.6, fx + 22, base);
    ctx.fill();
  }
  ctx.restore();
}

function haloTrait(ctx, kind, a, color) {
  const [hx, hy, hr] = a.head;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  if (kind === 'thorns') {
    ctx.translate(hx, hy);
    const r = hr + 34;
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * TAU;
      const rad = i % 2 ? r : r + 22;
      ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    ctx.closePath();
    ctx.strokeStyle = hexToRgba(color, 0.85);
    ctx.lineWidth = 5;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(hx, hy - hr - 26, hr + 18, 12, 0, 0, TAU);
    ctx.strokeStyle = hexToRgba(color, 0.95);
    ctx.lineWidth = 7;
    ctx.stroke();
  }
  ctx.restore();
}

function hornsTrait(ctx, kind, a, color) {
  const [hx, hy, hr] = a.head;
  const o = '#0b1020';
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(hx + sx * hr * 0.55, hy - hr * 0.7);
    ctx.scale(sx, 1);
    ctx.beginPath();
    if (kind === 'curved') {
      ctx.moveTo(-8, 4);
      ctx.quadraticCurveTo(40, -10, 44, -60);
      ctx.quadraticCurveTo(30, -24, 10, -6);
      ctx.closePath();
      blob(ctx, color, o, 3);
    } else if (kind === 'antlers') {
      ctx.strokeStyle = o;
      ctx.lineCap = 'round';
      for (const [w, c] of [
        [12, o],
        [7, color],
      ]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(18, -50);
        ctx.lineTo(40, -80);
        ctx.moveTo(18, -50);
        ctx.lineTo(48, -48);
        ctx.moveTo(10, -26);
        ctx.lineTo(-6, -58);
        ctx.moveTo(30, -66);
        ctx.lineTo(26, -98);
        ctx.stroke();
      }
    } else {
      ctx.moveTo(-8, 4);
      ctx.lineTo(10, -70);
      ctx.lineTo(16, 0);
      ctx.closePath();
      blob(ctx, color, o, 3);
    }
    ctx.restore();
  }
}

function extraEyes(ctx, n, a, color) {
  const [hx, hy, hr] = a.head;
  const spots = [
    [0, -hr * 0.62, 7],
    [-hr * 0.45, -hr * 0.4, 5],
    [hr * 0.45, -hr * 0.4, 5],
  ];
  for (const [ex, ey, r] of spots.slice(0, n)) eye(ctx, hx + ex, hy + ey, r * Math.max(1, hr / 40), color);
}

function spikesTrait(ctx, a, d) {
  const [bx, by, bw, bh] = a.body;
  const o = '#0b1020';
  for (let i = 0; i < 6; i++) {
    const sx = bx - bw * 0.38 + (i / 5) * bw * 0.7;
    const sy = by - bh * 0.48 + Math.abs(i - 2.5) * 4;
    ctx.beginPath();
    ctx.moveTo(sx - 12, sy + 6);
    ctx.lineTo(sx - 2, sy - 34 - (i % 2) * 10);
    ctx.lineTo(sx + 12, sy + 6);
    blob(ctx, shade(d, 0.35), o, 3);
  }
}

function markTrait(ctx, kind, a, color) {
  const [bx, by, bw, bh] = a.body;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(bx, by, bw * 0.45, bh * 0.45, 0, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = hexToRgba(color, 0.55);
  ctx.fillStyle = hexToRgba(color, 0.45);
  ctx.lineWidth = 5;
  if (kind === 'stripes') {
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(bx + i * bw * 0.12 - 20, by - bh * 0.5);
      ctx.lineTo(bx + i * bw * 0.12 + 20, by + bh * 0.5);
      ctx.stroke();
    }
  } else if (kind === 'spots') {
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(bx + Math.cos(i * 2.4) * bw * 0.3, by + Math.sin(i * 1.7) * bh * 0.28, 6 + (i % 3) * 4, 0, TAU);
      ctx.fill();
    }
  } else {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      let x = bx - bw * 0.3 + i * bw * 0.2;
      let y = by - bh * 0.4;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (k % 2 ? 1 : -1) * 14;
        y += bh * 0.2;
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function runesTrait(ctx, a, color) {
  const [bx, by, bw, bh] = a.body;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = hexToRgba(color, 0.9);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(bx, by + bh * 0.5 + 6, bw * 0.62, 16, 0, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU;
    const rx = bx + Math.cos(ang) * bw * 0.62;
    const ry = by + bh * 0.5 + 6 + Math.sin(ang) * 16;
    ctx.beginPath();
    ctx.moveTo(rx - 6, ry - 8);
    ctx.lineTo(rx + 6, ry - 8);
    ctx.moveTo(rx, ry - 14);
    ctx.lineTo(rx, ry);
    ctx.stroke();
  }
  ctx.restore();
}

function chainsTrait(ctx, a, color) {
  const [bx, by, bw, bh] = a.body;
  ctx.save();
  ctx.strokeStyle = shade(color, -0.2);
  ctx.lineWidth = 4;
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      const x = bx - bw * 0.45 + u * bw * 0.9;
      const y = by - bh * 0.3 + k * bh * 0.35 + Math.sin(u * Math.PI) * 22;
      ctx.beginPath();
      ctx.ellipse(x, y, 11, 7, (i % 2) * 1.2, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function orbsTrait(ctx, n, a, color, t) {
  const [hx, hy, hr] = a.head;
  const [, by, bw] = a.body;
  const cx = hx * 0.5;
  const cy = (hy + by) / 2;
  const rx = Math.max(bw * 0.6, hr * 2) + 40;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + t * 0.8;
    const x = cx + Math.cos(ang) * rx;
    const y = cy + Math.sin(ang) * rx * 0.35 - 30;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(9, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(-9, 0);
    ctx.closePath();
    blob(ctx, hexToRgba(color, 0.9), '#ffffff', 2);
    ctx.restore();
  }
}

function crownTrait(ctx, kind, y) {
  ctx.save();
  ctx.shadowColor = '#f5c451';
  ctx.shadowBlur = 24;
  ctx.translate(0, y);
  ctx.beginPath();
  if (kind === 'spiked') {
    ctx.moveTo(-44, 0);
    for (let i = 0; i < 7; i++) {
      ctx.lineTo(-44 + i * 14.6 + 7, i % 2 ? -26 : -50);
      ctx.lineTo(-44 + (i + 1) * 14.6 - 3, -8);
    }
    ctx.lineTo(44, 0);
  } else if (kind === 'tall') {
    ctx.moveTo(-34, 0);
    ctx.lineTo(-40, -60);
    ctx.lineTo(-14, -34);
    ctx.lineTo(0, -76);
    ctx.lineTo(14, -34);
    ctx.lineTo(40, -60);
    ctx.lineTo(34, 0);
  } else {
    ctx.moveTo(-40, 0);
    ctx.lineTo(-44, -36);
    ctx.lineTo(-20, -14);
    ctx.lineTo(0, -44);
    ctx.lineTo(20, -14);
    ctx.lineTo(44, -36);
    ctx.lineTo(40, 0);
  }
  ctx.closePath();
  blob(ctx, '#f5c451', '#0b1020', 4);
  ctx.beginPath();
  ctx.arc(0, -14, 6, 0, TAU);
  ctx.fillStyle = '#f43f5e';
  ctx.fill();
  ctx.restore();
}

/**
 * Draws a monster. opts: { x, y (feet), scale, facing, archetype, palette:[dark, light], pose, boss, seed, traits }
 * `traits` gives bosses their own look: { crown, horns, wings, eyes, orbs, halo, runes, chains, flames, spikes, mark, size, accent }.
 */
export function drawMonster(
  ctx,
  { x, y, scale = 1, facing = -1, archetype = 'beast', palette = ['#1e293b', '#22d3ee'], pose = 'idle', boss = false, seed = 1, traits = null },
) {
  const [d, l] = palette;
  const P = POSES[pose] ?? POSES.idle;
  const t = createRng(seed).next();
  const tr = traits ?? {};
  const a = ANCHORS[archetype] ?? ANCHORS.beast;
  const accent = tr.accent ?? l;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing * (tr.size ?? 1), scale * (tr.size ?? 1));
  groundShadow(ctx, 150);
  if (boss) aura(ctx, accent, 1.8, -170, 300);
  if (P.down) {
    ctx.translate(0, -10);
    ctx.scale(1, 0.55);
    ctx.globalAlpha = 0.6;
  }
  ctx.translate(P.dx * 1.2, P.dy);
  ctx.rotate(P.lean * 0.6);
  // Behind the body.
  if (tr.flames) flamesTrait(ctx, a, accent, t);
  if (tr.halo === 'thorns') haloTrait(ctx, 'thorns', a, accent);
  if (tr.wings) wingsTrait(ctx, tr.wings, a, d, l, tr.accent);
  if (tr.runes) runesTrait(ctx, a, accent);
  (MONSTERS[archetype] ?? MONSTERS.beast)(ctx, d, l, t);
  // On top of the body.
  if (tr.mark) markTrait(ctx, tr.mark, a, accent);
  if (tr.spikes) spikesTrait(ctx, a, d);
  if (tr.chains) chainsTrait(ctx, a, '#cbd5e1');
  if (tr.horns) hornsTrait(ctx, tr.horns, a, shade(accent, -0.1));
  if (tr.eyes) extraEyes(ctx, Math.min(3, tr.eyes), a, accent);
  if (tr.halo === 'ring') haloTrait(ctx, 'ring', a, accent);
  if (tr.orbs) orbsTrait(ctx, Math.min(6, tr.orbs), a, accent, t);
  if (boss) crownTrait(ctx, tr.crown ?? 'classic', a.top - 30 - (tr.halo === 'ring' ? 30 : 0) - (tr.horns === 'antlers' ? 40 : 0));
  ctx.restore();
  if (P.flash) hitFlash(ctx, x, y, scale, P.flash);
}

/** Renders a fighter (player or monster) from an engine fighter's `look`. */
export function drawCombatant(ctx, fighter, { x, y, scale, facing, avatar = null, pose = 'idle', seed = 1 }) {
  const look = fighter.look ?? {};
  if (look.monster)
    return drawMonster(ctx, {
      x,
      y,
      scale: scale * (look.boss ? 0.95 : 0.8),
      facing,
      archetype: look.monster,
      palette: look.palette,
      pose,
      boss: look.boss,
      seed,
      traits: look.traits ?? null,
    });
  return drawFighter(ctx, { x, y, scale, facing, avatar, classKey: look.classKey, pose, seed });
}
