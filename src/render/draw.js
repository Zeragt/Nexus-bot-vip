import { createCanvas } from '@napi-rs/canvas';
import { registerFonts, font } from './fonts.js';
import { theme, hexToRgba } from './theme.js';
import { icon } from './icons.js';
import { createRng } from '../engine/rng.js';

registerFonts();

/** Characters the bundled fonts can't draw (emoji, dingbats) are removed instead of rendering as boxes. */
export function safe(text) {
  return (
    String(text ?? '')
      // eslint-disable-next-line no-misleading-character-class -- stripping joiners/variation selectors is the point
      .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0E\uFE0F\u20E3\u200D]/gu, '')
      .replace(/[\u2600-\u27BF\u2B00-\u2BFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      // Keep "/slash commands" readable inside Arabic sentences (bidi would otherwise flip the slash).
      .replace(/\/[a-z][a-z0-9_-]*(?: [a-z][a-z0-9_-]*)*/gi, (m) => `\u200E${m}\u200E`)
      // Signed numbers (+3, -20) keep their sign on the left.
      // (A trailing % already shapes correctly; wrapping it would flip it.)
      .replace(/(^|\s)([+\-\u2212]\d[\d,.]*)(?![\d,.%])/g, (_m, pre, num) => `${pre}\u200E${num}\u200E`)
  );
}

export function createCard(width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'middle';
  return { canvas, ctx, width, height };
}

// WebP keeps cards sharp at ~1/8 of the PNG size and encodes ~5x faster; PNG stays available.
const FORMAT = (process.env.IMAGE_FORMAT || 'webp').toLowerCase() === 'png' ? 'png' : 'webp';
export const IMAGE_EXT = FORMAT;

export function toImage(canvas) {
  return FORMAT === 'png' ? canvas.encode('png') : canvas.encode('webp', 92);
}

export function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Deep-space backdrop: gradient, two soft nebula glows, a seeded star field,
 * a faint hex lattice and a vignette. Seeded so a given card always looks the same.
 */
export function background(ctx, w, h, { seed = 1, accent = theme.cyan, secondary = theme.royal } = {}) {
  const rng = createRng(seed);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, theme.bg1);
  g.addColorStop(0.55, theme.bg0);
  g.addColorStop(1, '#060b26');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const glow = (x, y, r, color, a) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hexToRgba(color, a));
    rg.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  };
  glow(w * rng.range(0.65, 0.95), h * rng.range(0.0, 0.3), Math.max(w, h) * 0.55, secondary, 0.38);
  glow(w * rng.range(0.05, 0.35), h * rng.range(0.7, 1.0), Math.max(w, h) * 0.5, accent, 0.16);
  glow(w * rng.range(0.3, 0.7), h * rng.range(0.3, 0.7), Math.max(w, h) * 0.35, theme.violet, 0.08);

  // Hex lattice
  ctx.save();
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.035)';
  ctx.lineWidth = 1;
  const s = 34;
  const hh = s * Math.sqrt(3);
  for (let row = -1; row * hh * 0.5 < h + hh; row++) {
    for (let col = -1; col * s * 1.5 < w + s * 2; col++) {
      const cx = col * s * 1.5;
      const cy = row * hh + (col % 2 ? hh / 2 : 0);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = cx + s * 0.5 * Math.cos(a);
        const py = cy + s * 0.5 * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  // Stars
  const count = Math.round((w * h) / 2600);
  for (let i = 0; i < count; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const r = rng.next() < 0.92 ? rng.range(0.4, 1.1) : rng.range(1.3, 2);
    ctx.fillStyle = `rgba(${rng.next() < 0.3 ? '160, 240, 255' : '220, 230, 255'}, ${rng.range(0.25, 0.9)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (r > 1.6) {
      ctx.strokeStyle = 'rgba(160, 240, 255, 0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x - r * 3, y);
      ctx.lineTo(x + r * 3, y);
      ctx.moveTo(x, y - r * 3);
      ctx.lineTo(x, y + r * 3);
      ctx.stroke();
    }
  }

  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,8,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** Outer frame: thin glowing border with corner brackets. */
export function frame(ctx, w, h, color = theme.cyan) {
  ctx.save();
  roundRect(ctx, 6, 6, w - 12, h - 12, 22);
  ctx.strokeStyle = hexToRgba(color, 0.25);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(color, 0.9);
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  const L = 38;
  const m = 6;
  const corners = [
    [m, m, 1, 1],
    [w - m, m, -1, 1],
    [m, h - m, 1, -1],
    [w - m, h - m, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * L, y);
    ctx.lineTo(x + dx * 14, y);
    ctx.quadraticCurveTo(x, y, x, y + dy * 14);
    ctx.lineTo(x, y + dy * L);
    ctx.stroke();
  }
  ctx.restore();
}

/** Glass panel. */
export function panel(ctx, x, y, w, h, { radius = 18, fill = theme.panel, stroke = theme.stroke, glow = null, accentTop = null } = {}) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 24;
  }
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  const sheen = ctx.createLinearGradient(x, y, x, y + h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.06)');
  sheen.addColorStop(0.4, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (accentTop) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, hexToRgba(accentTop, 0));
    g.addColorStop(0.5, hexToRgba(accentTop, 0.95));
    g.addColorStop(1, hexToRgba(accentTop, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x + radius, y, w - radius * 2, 2);
  }
  ctx.restore();
}

/**
 * Text with sensible defaults for Arabic (RTL, right aligned). Shrinks the font until it
 * fits `maxWidth`, then ellipsizes as a last resort. Returns the drawn width.
 */
const RTL_CHARS = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

export function text(ctx, str, x, y, opts = {}) {
  const {
    size = 24,
    weight = 700,
    color = theme.text,
    align = 'right',
    family = 'ar',
    maxWidth = 0,
    minSize = Math.max(10, size * 0.6),
    glow = 0,
    glowColor = null,
    dir = family === 'num' ? 'ltr' : 'rtl',
    baseline = 'middle',
    alpha = 1,
  } = opts;
  let s = safe(str);
  if (!s) return 0;
  ctx.save();
  // Text without any Arabic ("+3", "325 NX") reads left-to-right even inside RTL layouts.
  ctx.direction = RTL_CHARS.test(s) ? dir : 'ltr';
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.globalAlpha = alpha;
  let fs = size;
  ctx.font = font(fs, weight, family);
  if (maxWidth > 0) {
    while (ctx.measureText(s).width > maxWidth && fs > minSize) {
      fs -= 1;
      ctx.font = font(fs, weight, family);
    }
    if (ctx.measureText(s).width > maxWidth) {
      while (s.length > 1 && ctx.measureText(`${s}\u2026`).width > maxWidth) s = s.slice(0, -1);
      s = `${s.trimEnd()}\u2026`;
    }
  }
  if (glow) {
    ctx.shadowColor = glowColor ?? color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  const width = ctx.measureText(s).width;
  ctx.restore();
  return width;
}

export function measure(ctx, str, { size = 24, weight = 700, family = 'ar' } = {}) {
  ctx.save();
  ctx.font = font(size, weight, family);
  const w = ctx.measureText(safe(str)).width;
  ctx.restore();
  return w;
}

/** Word-wraps into at most `maxLines` lines, ellipsizing the last one. */
export function wrap(ctx, str, maxWidth, { size = 20, weight = 500, family = 'ar', maxLines = 3 } = {}) {
  ctx.save();
  ctx.font = font(size, weight, family);
  const words = safe(str).split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !cur) cur = test;
    else {
      lines.push(cur);
      cur = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  const consumed = lines.join(' ').split(' ').length;
  if (consumed < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}\u2026`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}\u2026`;
  }
  ctx.restore();
  return lines;
}

export function paragraph(ctx, str, x, y, maxWidth, { size = 20, weight = 500, color = theme.textDim, lineHeight = 1.55, maxLines = 3, align = 'right' } = {}) {
  const lines = wrap(ctx, str, maxWidth, { size, weight, maxLines });
  lines.forEach((line, i) => text(ctx, line, x, y + i * size * lineHeight, { size, weight, color, align }));
  return lines.length * size * lineHeight;
}

/**
 * Progress bar. RTL by default: it fills from the right edge, matching Arabic reading order.
 */
export function bar(ctx, x, y, w, h, ratio, { colors = theme.xp, track = 'rgba(255,255,255,0.07)', rtl = true, glow = true } = {}) {
  const r = Math.max(0, Math.min(1, ratio || 0));
  ctx.save();
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = track;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (r > 0) {
    const fw = Math.max(h, w * r);
    const fx = rtl ? x + w - fw : x;
    const g = ctx.createLinearGradient(rtl ? x + w : x, 0, rtl ? x : x + w, 0);
    g.addColorStop(0, colors[1]);
    g.addColorStop(1, colors[0]);
    if (glow) {
      ctx.shadowColor = colors[1];
      ctx.shadowBlur = 12;
    }
    roundRect(ctx, fx, y, fw, h, h / 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, fx + 2, y + 2, fw - 4, Math.max(1, h / 2 - 2), h / 4);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
  }
  ctx.restore();
}

/** Labelled vital bar: label on the right, "value / max" on the left. */
export function vitalBar(ctx, x, y, w, { label, value, max, colors, iconName, h = 16 }) {
  const iconX = x + w - 12;
  if (iconName) icon(ctx, iconName, iconX, y - 14, 20, colors[1], { glow: 8 });
  text(ctx, label, iconName ? iconX - 20 : x + w, y - 14, { size: 19, weight: 700, color: theme.text });
  text(ctx, `${Math.round(value)} / ${Math.round(max)}`, x, y - 14, { size: 16, weight: 600, family: 'num', align: 'left', color: theme.textDim });
  bar(ctx, x, y, w, h, max ? value / max : 0, { colors });
}

/** Rounded pill label. Draws from the right edge `x` leftwards (RTL flow). Returns its width. */
export function chip(ctx, label, x, y, { color = theme.cyan, size = 17, iconName = null, h = 34, fill = null, align = 'right' } = {}) {
  const s = safe(label);
  if (!s) return 0;
  const tw = measure(ctx, s, { size, weight: 700 });
  const pad = 14;
  const iw = iconName ? size + 8 : 0;
  const w = tw + pad * 2 + iw;
  const left = align === 'right' ? x - w : x;
  ctx.save();
  roundRect(ctx, left, y - h / 2, w, h, h / 2);
  ctx.fillStyle = fill ?? hexToRgba(color, 0.14);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, 0.55);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  if (iconName) icon(ctx, iconName, left + w - pad - size / 2, y, size, color);
  text(ctx, s, left + w - pad - iw, y + 1, { size, weight: 700, color: theme.text });
  return w;
}

/** Lays out chips right-to-left on one line, skipping those that don't fit. */
export function chipRow(ctx, items, right, y, maxWidth, opts = {}) {
  let x = right;
  const gap = 10;
  for (const it of items) {
    if (!it || !it.label) continue;
    const w = measure(ctx, it.label, { size: opts.size ?? 17 }) + 28 + (it.iconName ? (opts.size ?? 17) + 8 : 0);
    if (right - (x - w) > maxWidth) break;
    chip(ctx, it.label, x, y, { ...opts, ...it });
    x -= w + gap;
  }
}

function hexPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Hexagonal portrait with a glowing ring. Falls back to a generated sigil. */
export function portrait(ctx, image, cx, cy, r, { color = theme.cyan, seed = 1, label = '' } = {}) {
  ctx.save();
  hexPath(ctx, cx, cy, r + 10);
  ctx.fillStyle = hexToRgba(color, 0.12);
  ctx.fill();
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  hexPath(ctx, cx, cy, r + 4);
  ctx.strokeStyle = hexToRgba(color, 0.95);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  hexPath(ctx, cx, cy, r);
  ctx.clip();
  if (image) {
    const scale = Math.max((r * 2) / image.width, (r * 2) / image.height);
    const iw = image.width * scale;
    const ih = image.height * scale;
    ctx.drawImage(image, cx - iw / 2, cy - ih / 2, iw, ih);
  } else {
    sigil(ctx, cx, cy, r, { seed, color, label });
  }
  ctx.restore();

  ctx.save();
  hexPath(ctx, cx, cy, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** Procedural emblem: concentric rings, rotating spokes and the first letter. */
export function sigil(ctx, cx, cy, r, { seed = 1, color = theme.cyan, label = '' } = {}) {
  const rng = createRng(seed);
  const g = ctx.createRadialGradient(cx, cy - r * 0.3, 0, cx, cy, r * 1.2);
  g.addColorStop(0, hexToRgba(color, 0.45));
  g.addColorStop(0.6, '#0b1648');
  g.addColorStop(1, '#050a24');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r * 1.5, cy - r * 1.5, r * 3, r * 3);
  ctx.save();
  ctx.strokeStyle = hexToRgba(color, 0.5);
  ctx.lineWidth = 1.4;
  const spokes = rng.int(5, 9);
  const rot = rng.next() * Math.PI;
  for (let i = 0; i < spokes; i++) {
    const a = rot + (Math.PI * 2 * i) / spokes;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25);
    ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
    ctx.stroke();
  }
  for (const f of [0.35, 0.6, 0.85]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  const letter = [...safe(label)][0];
  if (letter) text(ctx, letter, cx, cy + r * 0.04, { size: r * 0.8, weight: 800, align: 'center', color: theme.ice, glow: 18, glowColor: color });
}

/** Six-axis stat radar. */
export function radar(ctx, cx, cy, r, values, { max = 30, labels = {}, icons = {}, color = theme.cyan } = {}) {
  const keys = Object.keys(values);
  const n = keys.length;
  const pt = (i, f) => {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    return [cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f];
  };
  ctx.save();
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, ring / 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(103,232,249,${ring === 4 ? 0.35 : 0.12})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i, 1);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(103,232,249,0.12)';
    ctx.stroke();
  }
  const top = Math.max(max, ...Object.values(values));
  ctx.beginPath();
  keys.forEach((k, i) => {
    const [x, y] = pt(i, Math.max(0.06, values[k] / top));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, hexToRgba(color, 0.15));
  g.addColorStop(1, hexToRgba(color, 0.45));
  ctx.fillStyle = g;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  keys.forEach((k, i) => {
    const [x, y] = pt(i, Math.max(0.06, values[k] / top));
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = theme.ice;
    ctx.fill();
  });
  ctx.restore();
  keys.forEach((k, i) => {
    const [x, y] = pt(i, 1.28);
    if (icons[k]) icon(ctx, icons[k], x, y - 16, 20, color, { glow: 6 });
    text(ctx, labels[k] ?? k, x, y + 6, { size: 16, weight: 700, align: 'center', color: theme.textDim });
    text(ctx, String(values[k]), x, y + 26, { size: 17, weight: 700, align: 'center', family: 'num', color: theme.text });
  });
}

/** Circular level gauge with XP arc. */
export function levelRing(ctx, cx, cy, r, level, ratio, { color = theme.cyan } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 16, 50, 0.8)';
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.stroke();
  const start = -Math.PI / 2;
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, theme.royalSoft);
  g.addColorStop(1, color);
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, start + Math.PI * 2 * Math.max(0.01, Math.min(1, ratio)));
  ctx.strokeStyle = g;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.restore();
  text(ctx, 'LEVEL', cx, cy - r * 0.38, { size: r * 0.2, weight: 600, family: 'num', align: 'center', color: theme.textDim });
  text(ctx, String(level), cx, cy + r * 0.1, { size: r * 0.62, weight: 800, family: 'num', align: 'center', color: theme.text, glow: 14, glowColor: color });
}

/** Standard card header: icon badge + Arabic title on the right, brand on the left. */
export function header(ctx, w, title, { subtitle = '', iconName = 'sparkle', color = theme.cyan, y = 58 } = {}) {
  const right = w - 44;
  ctx.save();
  ctx.beginPath();
  ctx.arc(right - 26, y, 26, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(color, 0.14);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, 0.7);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  icon(ctx, iconName, right - 26, y, 26, color, { glow: 10 });
  text(ctx, title, right - 66, y - (subtitle ? 10 : 0), { size: 34, weight: 800, maxWidth: w - 420, glow: 10, glowColor: hexToRgba(color, 0.6) });
  if (subtitle) text(ctx, subtitle, right - 66, y + 24, { size: 17, weight: 500, color: theme.textDim, maxWidth: w - 420 });
  brand(ctx, 44, y);
  const g = ctx.createLinearGradient(40, 0, w - 40, 0);
  g.addColorStop(0, hexToRgba(color, 0));
  g.addColorStop(0.5, hexToRgba(color, 0.55));
  g.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(40, y + 50, w - 80, 1.5);
}

export function brand(ctx, x, y) {
  text(ctx, 'NEXUS', x, y - 6, { size: 24, weight: 800, family: 'num', align: 'left', color: theme.text, glow: 12, glowColor: theme.cyan });
  text(ctx, 'ROLEPLAY  WORLD', x + 1, y + 18, { size: 10, weight: 600, family: 'num', align: 'left', color: theme.cyanSoft, alpha: 0.75 });
}

export function footer(ctx, w, h, left = '', right = '') {
  if (right) text(ctx, right, w - 44, h - 30, { size: 15, weight: 500, color: theme.textMute });
  if (left) text(ctx, left, 44, h - 30, { size: 13, weight: 600, family: 'num', align: 'left', color: theme.textMute });
}

/** Five-point star rating (difficulty etc.). Drawn right-to-left. */
export function stars(ctx, count, total, right, y, { size = 16, color = theme.gold } = {}) {
  for (let i = 0; i < total; i++) {
    const cx = right - size / 2 - i * (size + 4);
    icon(ctx, 'star', cx, y, size, i < count ? color : 'rgba(255,255,255,0.18)', { fill: i < count ? color : null, width: 1.5 });
  }
}

/** Compact stat box: icon, label and a big value. */
export function statTile(ctx, x, y, w, h, { label, value, iconName, color = theme.cyan, sub = '' }) {
  panel(ctx, x, y, w, h, { radius: 14, fill: 'rgba(12, 24, 70, 0.6)' });
  icon(ctx, iconName, x + w - 26, y + h / 2, 22, color, { glow: 8 });
  text(ctx, label, x + w - 48, y + h / 2 - 12, { size: 15, weight: 600, color: theme.textDim, maxWidth: w - 60 });
  text(ctx, String(value), x + w - 48, y + h / 2 + 13, { size: 20, weight: 800, color: theme.text, maxWidth: w - 60 });
  if (sub) text(ctx, sub, x + 14, y + h / 2 + 13, { size: 13, weight: 600, align: 'left', color: theme.textMute, dir: 'rtl' });
}

export function divider(ctx, x1, x2, y, color = theme.cyan) {
  const g = ctx.createLinearGradient(x1, 0, x2, 0);
  g.addColorStop(0, hexToRgba(color, 0));
  g.addColorStop(0.5, hexToRgba(color, 0.4));
  g.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x1, y, x2 - x1, 1);
}

/** Rarity-coloured item tile with an icon and an optional quantity badge. */
export function itemTile(ctx, x, y, size, { color, iconName, qty = 0, equipped = false, dim = false }) {
  ctx.save();
  ctx.globalAlpha = dim ? 0.4 : 1;
  roundRect(ctx, x, y, size, size, 14);
  const g = ctx.createLinearGradient(x, y, x, y + size);
  g.addColorStop(0, hexToRgba(color, 0.28));
  g.addColorStop(1, 'rgba(8, 14, 44, 0.9)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, 0.85);
  ctx.lineWidth = 1.6;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();
  icon(ctx, iconName, x + size / 2, y + size / 2, size * 0.46, color, { glow: 10, width: 1.8 });
  if (qty > 1) {
    const label = qty > 999 ? '999+' : `x${qty}`;
    const bw = measure(ctx, label, { size: 13, family: 'num' }) + 12;
    roundRect(ctx, x + 6, y + size - 26, bw, 20, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    text(ctx, label, x + 6 + bw / 2, y + size - 16, { size: 13, weight: 700, family: 'num', align: 'center' });
  }
  if (equipped) {
    ctx.beginPath();
    ctx.arc(x + size - 12, y + 12, 9, 0, Math.PI * 2);
    ctx.fillStyle = theme.cyan;
    ctx.fill();
    icon(ctx, 'check', x + size - 12, y + 12, 12, '#04101f', { width: 3 });
  }
}

/** Faint large icon used as a watermark. */
export function watermark(ctx, name, cx, cy, size, color = theme.cyan) {
  ctx.save();
  ctx.globalAlpha = 0.06;
  icon(ctx, name, cx, cy, size, color, { width: 1 });
  ctx.restore();
}

export function emptyState(ctx, w, y, message, iconName = 'sparkle') {
  icon(ctx, iconName, w / 2, y, 54, theme.textMute, { width: 1.4 });
  text(ctx, message, w / 2, y + 56, { size: 22, weight: 600, align: 'center', color: theme.textDim });
}
