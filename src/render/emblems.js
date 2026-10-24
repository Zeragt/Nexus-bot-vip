import { ELEMENTS, CLASS_BY_KEY } from '../content/classes.js';
import { PATHS, PATH_BY_KEY } from '../content/classGen.js';
import { icon } from './icons.js';
import { text, hashSeed } from './draw.js';
import { mix, shade } from './sprites.js';
import { createRng } from '../engine/rng.js';

// Each of the thirty paths has its own sign; the class gives the colours, the element the sparks.
const PATH_ICON = {
  vanguard: 'shield',
  executioner: 'sword',
  warden: 'lock',
  tempest: 'zap',
  sage: 'book',
  zealot: 'flame',
  phantom: 'moon',
  bulwark: 'armor',
  duelist: 'swords',
  seer: 'eye',
  reaver: 'skull',
  cyclone: 'swap',
  sentinel: 'target',
  weaver: 'sparkle',
  stalker: 'feather',
  martyr: 'heart',
  gambler: 'clover',
  tactician: 'brain',
  rampager: 'flask',
  mystic: 'gem',
  conqueror: 'flag',
  umbra: 'key',
  eclipse: 'coin',
  dawn: 'sun',
  titan: 'gate',
  comet: 'star',
  serpent: 'ring',
  eternal: 'hourglass',
  sovereign: 'crown',
  mythic: 'trophy',
};
// Frame shapes rotate through the paths so neighbours never share a silhouette.
const FRAMES = ['circle', 'hexagon', 'shield', 'diamond', 'octagon', 'star'];

function framePath(ctx, shape, r) {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    return;
  }
  if (shape === 'shield') {
    ctx.moveTo(-r * 0.86, -r * 0.82);
    ctx.lineTo(r * 0.86, -r * 0.82);
    ctx.quadraticCurveTo(r * 0.92, r * 0.3, 0, r);
    ctx.quadraticCurveTo(-r * 0.92, r * 0.3, -r * 0.86, -r * 0.82);
    ctx.closePath();
    return;
  }
  const n = { hexagon: 6, diamond: 4, octagon: 8, star: 16 }[shape];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rr = shape === 'star' && i % 2 ? r * 0.8 : r;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Tier gems around the crest: one per 15 levels of the path's unlock, plus one for late paths. */
function tierCount(minLevel) {
  return minLevel >= 60 ? 5 : minLevel >= 40 ? 4 : minLevel >= 30 ? 3 : minLevel >= 20 ? 2 : 1;
}

/**
 * Paints the crest of one path of one class, centred in a square of `size`.
 * `label` adds the subclass name on a ribbon (used by the art pack and the path card).
 */
export function drawEmblem(ctx, { classKey, pathKey, size = 512, x = 0, y = 0, label = null }) {
  const cls = CLASS_BY_KEY[classKey];
  const path = PATH_BY_KEY[pathKey];
  if (!cls || !path) return;
  const idx = PATHS.indexOf(path);
  const el = ELEMENTS[cls.element];
  const [c1, c2] = cls.colors;
  const rng = createRng(hashSeed(`${classKey}.${pathKey}`));
  const s = size / 512;
  const shape = FRAMES[idx % FRAMES.length];
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2 - (label ? 24 * s : 0));
  ctx.scale(s, s);

  // Aura.
  const aura = ctx.createRadialGradient(0, 0, 40, 0, 0, 250);
  aura.addColorStop(0, `${el.color}66`);
  aura.addColorStop(0.6, `${c2}22`);
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aura;
  ctx.fillRect(-256, -256, 512, 512);

  // Rays behind the frame; more rays for later paths.
  const rays = 12 + (idx % 5) * 4;
  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + rng.next() * 0.05;
    const len = 190 + rng.next() * 50;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.03) * 120, Math.sin(a - 0.03) * 120);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.lineTo(Math.cos(a + 0.03) * 120, Math.sin(a + 0.03) * 120);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? c2 : el.color;
    ctx.fill();
  }
  ctx.restore();

  // Outer frame with metal rim.
  const R = 176;
  framePath(ctx, shape, R + 14);
  const rim = ctx.createLinearGradient(0, -R, 0, R);
  rim.addColorStop(0, shade(c2, 0.35));
  rim.addColorStop(0.5, shade(c1, -0.35));
  rim.addColorStop(1, shade(c2, -0.1));
  ctx.fillStyle = rim;
  ctx.shadowColor = el.color;
  ctx.shadowBlur = 40;
  ctx.fill();
  ctx.shadowBlur = 0;
  framePath(ctx, shape, R);
  const field = ctx.createRadialGradient(-40, -60, 10, 0, 0, R * 1.2);
  field.addColorStop(0, mix(c1, '#ffffff', 0.08));
  field.addColorStop(0.55, shade(c1, -0.55));
  field.addColorStop(1, '#05060f');
  ctx.fillStyle = field;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `${c2}cc`;
  ctx.stroke();

  // Rune ring: dashes whose rhythm is unique per class and path.
  ctx.save();
  framePath(ctx, shape, R - 4);
  ctx.clip();
  ctx.strokeStyle = `${c2}88`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R - 26, 0, Math.PI * 2);
  ctx.stroke();
  const ticks = 24 + (idx % 6) * 6;
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    const long = rng.next() < 0.3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (R - 26), Math.sin(a) * (R - 26));
    ctx.lineTo(Math.cos(a) * (R - (long ? 50 : 38)), Math.sin(a) * (R - (long ? 50 : 38)));
    ctx.stroke();
  }
  // Inner sigil: a star polygon whose point count comes from the class.
  const pts = 5 + (hashSeed(classKey) % 4);
  const skip = 2;
  ctx.strokeStyle = `${el.color}55`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = ((i * skip) / pts) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * (R - 60);
    const py = Math.sin(a) * (R - 60);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // Element sparks.
  for (let i = 0; i < 40; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = 30 + rng.next() * (R - 40);
    const r = 1 + rng.next() * 3.2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fillStyle = rng.next() < 0.5 ? el.color : '#ffffff';
    ctx.globalAlpha = 0.25 + rng.next() * 0.6;
    ctx.fill();
  }
  ctx.restore();

  // Central sign.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, 74, 0, Math.PI * 2);
  const core = ctx.createRadialGradient(0, -20, 6, 0, 0, 74);
  core.addColorStop(0, shade(c2, 0.4));
  core.addColorStop(1, shade(c1, -0.4));
  ctx.fillStyle = core;
  ctx.shadowColor = el.color;
  ctx.shadowBlur = 30;
  ctx.fill();
  ctx.restore();
  icon(ctx, PATH_ICON[pathKey] ?? 'sparkle', 0, 0, 92, '#ffffff', { width: 2.2, glow: 18 });

  // Tier gems along the top of the frame.
  const n = tierCount(path.minLevel);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.24;
    const gx = Math.cos(a) * (R + 2);
    const gy = Math.sin(a) * (R + 2);
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = path.minLevel >= 50 ? '#f5c451' : el.color;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 16;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeStyle = '#0b1020';
    ctx.lineWidth = 2;
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
  }
  ctx.restore();

  if (label) {
    const cx = x + size / 2;
    const ry = y + size - 64 * s;
    ctx.save();
    ctx.fillStyle = 'rgba(6, 8, 26, 0.86)';
    ctx.strokeStyle = `${c2}aa`;
    ctx.lineWidth = 2 * s;
    const w = 380 * s;
    const h = 52 * s;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 - 18 * s, ry);
    ctx.lineTo(cx - w / 2, ry - h / 2);
    ctx.lineTo(cx + w / 2, ry - h / 2);
    ctx.lineTo(cx + w / 2 + 18 * s, ry);
    ctx.lineTo(cx + w / 2, ry + h / 2);
    ctx.lineTo(cx - w / 2, ry + h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    text(ctx, label, cx, ry + 9 * s, { size: 26 * s, weight: 800, align: 'center', color: '#ffffff', maxWidth: w - 20 * s });
  }
}

export { PATH_ICON };
