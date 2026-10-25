import { createRng } from '../engine/rng.js';
import { hexToRgba } from './theme.js';

/**
 * Painted backdrops for every region of Nexus. Each scene is layered parallax art
 * (sky, far shapes, mid shapes, ground, particles) drawn from a seed, so the same
 * place always looks the same. Used by the combat arena, location cards and story pages;
 * `scripts/build-assets.js` pre-renders them in high resolution.
 */

const TAU = Math.PI * 2;

const SKIES = {
  city: ['#0b1446', '#1d2f8f', '#f472b6'],
  forest: ['#03140f', '#0f3d2e', '#1d6b4f'],
  mountains: ['#0b1028', '#2b3a72', '#a5b4fc'],
  lake: ['#020617', '#0c2a4a', '#7dd3fc'],
  desert: ['#2a0f05', '#b4531f', '#fde68a'],
  ruins: ['#0f0a1e', '#3b2a5c', '#c4b5fd'],
  gate: ['#0a0220', '#3b0764', '#e879f9'],
  crystal: ['#07041a', '#2e1065', '#f0abfc'],
  ash: ['#140303', '#5c1206', '#fb923c'],
  sky: ['#1e3a8a', '#60a5fa', '#fef3c7'],
  sunken: ['#020b1a', '#0e4a5c', '#5eead4'],
  citadel: ['#030208', '#1e1030', '#f43f5e'],
  abyss: ['#000000', '#12002a', '#a855f7'],
  frost: ['#0b1a2e', '#3b6c96', '#e0f2fe'],
  ember: ['#1a0402', '#7c1d0a', '#fb923c'],
  emerald: ['#021a0e', '#0b4d2c', '#86efac'],
  clockwork: ['#140d04', '#5c3b10', '#fbbf24'],
  marsh: ['#0b1206', '#2d3a12', '#a3a33a'],
  starfall: ['#02030f', '#1e1b4b', '#fde68a'],
  mirror: ['#0b0f1a', '#475569', '#f1f5f9'],
  bones: ['#0c0a09', '#44403c', '#e7e5e4'],
  spire: ['#1c1405', '#a16207', '#fef9c3'],
  origin: ['#fafaf9', '#e7e5e4', '#fde68a'],
};

export const SCENE_OF_LOCATION = {
  nexus_city: 'city',
  central_plaza: 'city',
  cafe: 'city',
  tavern: 'city',
  market: 'city',
  library: 'city',
  blacksmith: 'city',
  residential: 'city',
  forest: 'forest',
  mountains: 'mountains',
  lake: 'lake',
  desert: 'desert',
  ruins: 'ruins',
  dimensional_gate: 'gate',
  crystal_caverns: 'crystal',
  ashen_wastes: 'ash',
  sky_archipelago: 'sky',
  sunken_kingdom: 'sunken',
  shadow_citadel: 'citadel',
  the_abyss: 'abyss',
  frost_reach: 'frost',
  ember_isles: 'ember',
  emerald_wilds: 'emerald',
  clockwork_bastion: 'clockwork',
  whispering_marsh: 'marsh',
  starfall_crater: 'starfall',
  mirror_realm: 'mirror',
  bone_sea: 'bones',
  celestial_spire: 'spire',
  the_origin: 'origin',
};
export const SCENES = Object.keys(SKIES);

export function sceneFor(locationKey) {
  return SCENE_OF_LOCATION[locationKey] ?? 'gate';
}

function sky(ctx, w, h, [top, mid, glow], horizon) {
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, top);
  g.addColorStop(0.7, mid);
  g.addColorStop(1, glow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function glowAt(ctx, x, y, r, color, a = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexToRgba(color, a));
  g.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function starsLayer(ctx, w, h, rng, n, color = '#ffffff') {
  for (let i = 0; i < n; i++) {
    const r = rng.next() < 0.92 ? rng.range(0.4, 1.3) : rng.range(1.5, 2.6);
    ctx.fillStyle = hexToRgba(color, rng.range(0.3, 0.95));
    ctx.beginPath();
    ctx.arc(rng.range(0, w), rng.range(0, h), r * (w / 1280), 0, TAU);
    ctx.fill();
  }
}

/** A jagged ridge line filled to the bottom. */
function ridge(ctx, w, h, rng, { base, amp, step, color, sharp = false }) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + step; x += step) {
    const y = base + (rng.next() - 0.5) * amp;
    if (sharp) ctx.lineTo(x - step / 2, base - amp * rng.range(0.3, 1));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function ground(ctx, w, h, horizon, colors, gridColor) {
  const g = ctx.createLinearGradient(0, horizon, 0, h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon, w, h - horizon);
  if (!gridColor) return;
  // Perspective grid for the arena floor.
  ctx.save();
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = Math.max(1, w / 1280);
  const vx = w / 2;
  for (let i = -14; i <= 14; i++) {
    ctx.beginPath();
    ctx.moveTo(vx + i * (w / 60), horizon);
    ctx.lineTo(vx + i * (w / 8), h);
    ctx.stroke();
  }
  for (let k = 1; k < 9; k++) {
    const y = horizon + (h - horizon) * Math.pow(k / 9, 1.8);
    ctx.globalAlpha = 0.3 + k * 0.07;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function particles(ctx, w, h, rng, n, color, { minY = 0, maxY = h, size = [1, 3], glow = true } = {}) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * (w / 1280);
  }
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = hexToRgba(color, rng.range(0.35, 0.95));
    ctx.beginPath();
    ctx.arc(rng.range(0, w), rng.range(minY, maxY), rng.range(size[0], size[1]) * (w / 1280), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function tree(ctx, x, y, s, color, rng) {
  ctx.fillStyle = color;
  ctx.fillRect(x - 6 * s, y - 120 * s, 12 * s, 120 * s);
  for (let i = 0; i < 4; i++) {
    const ty = y - 110 * s - i * 40 * s;
    const tw = (90 - i * 16) * s * rng.range(0.85, 1.15);
    ctx.beginPath();
    ctx.moveTo(x - tw, ty + 40 * s);
    ctx.lineTo(x, ty - 50 * s);
    ctx.lineTo(x + tw, ty + 40 * s);
    ctx.closePath();
    ctx.fill();
  }
}

function building(ctx, x, y, bw, bh, color, windowColor, rng, s) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - bh, bw, bh);
  const roof = rng.next();
  if (roof < 0.5) {
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, y - bh);
    ctx.lineTo(x + bw / 2, y - bh - bw * 0.6);
    ctx.lineTo(x + bw + 4 * s, y - bh);
    ctx.fill();
  } else if (roof < 0.75) {
    ctx.fillRect(x + bw / 2 - 2 * s, y - bh - 40 * s, 4 * s, 40 * s);
  }
  ctx.fillStyle = windowColor;
  for (let wy = y - bh + 12 * s; wy < y - 10 * s; wy += 18 * s) {
    for (let wx = x + 6 * s; wx < x + bw - 8 * s; wx += 14 * s) {
      if (rng.next() < 0.45) {
        ctx.globalAlpha = rng.range(0.4, 1);
        ctx.fillRect(wx, wy, 6 * s, 9 * s);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function pillar(ctx, x, y, pw, ph, color, broken, rng, s) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - ph, pw, ph);
  ctx.fillRect(x - 6 * s, y - ph - 10 * s, pw + 12 * s, 12 * s);
  ctx.fillRect(x - 8 * s, y - 12 * s, pw + 16 * s, 12 * s);
  if (broken) {
    ctx.fillStyle = 'rgba(0,0,0,0.0)';
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(x - 10 * s, y - ph - 12 * s);
    ctx.lineTo(x + pw * rng.range(0.2, 0.8), y - ph * rng.range(0.55, 0.8));
    ctx.lineTo(x + pw + 10 * s, y - ph * rng.range(0.6, 0.9));
    ctx.lineTo(x + pw + 10 * s, y - ph - 14 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function crystal(ctx, x, y, cw, chh, color, s, glow = true) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 30 * s;
  }
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + cw * 0.15, y - chh * 0.8);
  ctx.lineTo(x + cw * 0.5, y - chh);
  ctx.lineTo(x + cw * 0.85, y - chh * 0.75);
  ctx.lineTo(x + cw, y);
  ctx.closePath();
  const g = ctx.createLinearGradient(x, y - chh, x + cw, y);
  g.addColorStop(0, hexToRgba('#ffffff', 0.9));
  g.addColorStop(0.3, hexToRgba(color, 0.85));
  g.addColorStop(1, hexToRgba(color, 0.25));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function portal(ctx, x, y, r, color, rng) {
  glowAt(ctx, x, y, r * 2.4, color, 0.55);
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 26; i++) {
    ctx.rotate(rng.range(0.15, 0.35));
    ctx.strokeStyle = hexToRgba(i % 3 ? color : '#ffffff', rng.range(0.25, 0.8));
    ctx.lineWidth = rng.range(1, 4) * (r / 120);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * rng.range(0.3, 1), r * rng.range(0.6, 1.25), 0, rng.range(0, TAU), rng.range(0, TAU) + 1.6);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, hexToRgba(color, 0.9));
  g.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.5, r * 0.75, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function island(ctx, x, y, iw, color, top, rng, s) {
  ctx.beginPath();
  ctx.moveTo(x - iw / 2, y);
  ctx.quadraticCurveTo(x - iw * 0.3, y + iw * rng.range(0.5, 0.8), x, y + iw * rng.range(0.8, 1.1));
  ctx.quadraticCurveTo(x + iw * 0.3, y + iw * rng.range(0.5, 0.8), x + iw / 2, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(x, y, iw / 2, 10 * s, 0, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 3; i++) tree(ctx, x - iw * 0.3 + i * iw * 0.25, y, 0.25 * s * rng.range(0.7, 1.2), top, rng);
}

/**
 * Paints the scene into the whole canvas area (w×h).
 * `arena: true` adds a fighting floor (grid and spotlights) in the lower part.
 */
export function drawScene(ctx, w, h, scene, { seed = 1, arena = false } = {}) {
  const rng = createRng(seed * 7919 + scene.length);
  const s = w / 1280;
  const pal = SKIES[scene] ?? SKIES.gate;
  const horizon = h * (arena ? 0.62 : 0.66);
  sky(ctx, w, h, pal, horizon);

  switch (scene) {
    case 'city': {
      starsLayer(ctx, w, horizon, rng, 160 * s);
      glowAt(ctx, w * 0.78, h * 0.2, 140 * s, '#fde68a', 0.5);
      ctx.fillStyle = '#fef9c3';
      ctx.beginPath();
      ctx.arc(w * 0.78, h * 0.2, 36 * s, 0, TAU);
      ctx.fill();
      for (const [layer, col, win] of [
        [0, '#1a2563', '#93c5fd'],
        [1, '#111947', '#fde68a'],
        [2, '#0a0f33', '#f472b6'],
      ]) {
        let x = -20 * s;
        while (x < w) {
          const bw = rng.range(40, 90) * s;
          const bh = rng.range(80, 240) * s * (1 - layer * 0.15) + (layer === 0 ? 60 * s : 0);
          building(ctx, x, horizon + layer * 14 * s, bw, bh, col, win, rng, s);
          x += bw + rng.range(2, 14) * s;
        }
      }
      // The Nexus spire.
      ctx.fillStyle = '#0d1640';
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - 30 * s, horizon);
      ctx.lineTo(w * 0.5, horizon - 380 * s);
      ctx.lineTo(w * 0.5 + 30 * s, horizon);
      ctx.fill();
      glowAt(ctx, w * 0.5, horizon - 380 * s, 60 * s, '#22d3ee', 0.9);
      ground(ctx, w, h, horizon, ['#1e1b4b', '#05030f'], arena ? 'rgba(34,211,238,0.22)' : null);
      particles(ctx, w, h, rng, 40, '#f472b6', { minY: 0, maxY: horizon });
      break;
    }
    case 'forest': {
      for (let i = 0; i < 6; i++) glowAt(ctx, rng.range(0, w), rng.range(0, horizon), rng.range(80, 200) * s, '#34d399', 0.12);
      for (const [n, sc, col] of [
        [24, 0.9, '#0b2a20'],
        [18, 1.3, '#072018'],
        [12, 1.9, '#03120c'],
      ]) {
        for (let i = 0; i < n; i++) tree(ctx, rng.range(-40, w + 40), horizon + rng.range(0, 30) * s * sc, sc * s * rng.range(0.8, 1.2), col, rng);
      }
      ground(ctx, w, h, horizon, ['#0a2b1d', '#020a06'], arena ? 'rgba(52,211,153,0.18)' : null);
      particles(ctx, w, h, rng, 120, '#bef264', { size: [1, 3.5] });
      break;
    }
    case 'mountains': {
      starsLayer(ctx, w, horizon, rng, 220 * s);
      ridge(ctx, w, h, rng, { base: horizon - 220 * s, amp: 120 * s, step: 140 * s, color: '#3b4a85', sharp: true });
      ridge(ctx, w, h, rng, { base: horizon - 120 * s, amp: 90 * s, step: 110 * s, color: '#25305e', sharp: true });
      ridge(ctx, w, h, rng, { base: horizon - 40 * s, amp: 50 * s, step: 80 * s, color: '#151c3d', sharp: true });
      ctx.save();
      ctx.strokeStyle = '#e0e7ff';
      ctx.shadowColor = '#a5b4fc';
      ctx.shadowBlur = 20 * s;
      ctx.lineWidth = 3 * s;
      let lx = w * rng.range(0.2, 0.8);
      let ly = 0;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      while (ly < horizon - 200 * s) {
        lx += rng.range(-40, 40) * s;
        ly += rng.range(20, 50) * s;
        ctx.lineTo(lx, ly);
      }
      ctx.stroke();
      ctx.restore();
      ground(ctx, w, h, horizon, ['#1e2547', '#05070f'], arena ? 'rgba(165,180,252,0.2)' : null);
      particles(ctx, w, h, rng, 160, '#ffffff', { size: [1, 2.5], glow: false });
      break;
    }
    case 'lake': {
      starsLayer(ctx, w, horizon, rng, 260 * s);
      glowAt(ctx, w * 0.3, h * 0.22, 160 * s, '#e0f2fe', 0.45);
      ctx.fillStyle = '#f0f9ff';
      ctx.beginPath();
      ctx.arc(w * 0.3, h * 0.22, 48 * s, 0, TAU);
      ctx.fill();
      ridge(ctx, w, h, rng, { base: horizon - 30 * s, amp: 40 * s, step: 90 * s, color: '#071a2e' });
      const g = ctx.createLinearGradient(0, horizon, 0, h);
      g.addColorStop(0, '#0c4a6e');
      g.addColorStop(1, '#020617');
      ctx.fillStyle = g;
      ctx.fillRect(0, horizon, w, h - horizon);
      ctx.strokeStyle = 'rgba(224,242,254,0.35)';
      for (let i = 0; i < 60; i++) {
        const y = rng.range(horizon, h);
        const x = w * 0.3 + rng.range(-80, 80) * s * (1 + (y - horizon) / 200);
        ctx.lineWidth = rng.range(1, 3) * s;
        ctx.beginPath();
        ctx.moveTo(x - 30 * s, y);
        ctx.lineTo(x + 30 * s, y);
        ctx.stroke();
      }
      if (arena) ground(ctx, w, h, h * 0.8, ['rgba(12,74,110,0.0)', 'rgba(2,6,23,0.5)'], 'rgba(125,211,252,0.12)');
      particles(ctx, w, h, rng, 40, '#7dd3fc', { minY: horizon - 80 * s, maxY: h });
      break;
    }
    case 'desert': {
      glowAt(ctx, w * 0.65, horizon - 60 * s, 300 * s, '#fde68a', 0.6);
      ctx.fillStyle = '#fff7ed';
      ctx.beginPath();
      ctx.arc(w * 0.65, horizon - 60 * s, 70 * s, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#7c2d12';
      for (const [px, ph] of [
        [0.2, 160],
        [0.31, 110],
        [0.85, 130],
      ]) {
        ctx.beginPath();
        ctx.moveTo(w * px - ph * s, horizon);
        ctx.lineTo(w * px, horizon - ph * s);
        ctx.lineTo(w * px + ph * s, horizon);
        ctx.fill();
      }
      for (const [base, col] of [
        [horizon, '#c2410c'],
        [horizon + 40 * s, '#9a3412'],
        [horizon + 100 * s, '#7c2d12'],
      ]) {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 20 * s) ctx.lineTo(x, base + Math.sin(x / (160 * s) + rng.next()) * 26 * s);
        ctx.lineTo(w, h);
        ctx.fillStyle = col;
        ctx.fill();
      }
      if (arena) ground(ctx, w, h, h * 0.78, ['rgba(124,45,18,0)', 'rgba(40,10,0,0.5)'], 'rgba(253,230,138,0.15)');
      particles(ctx, w, h, rng, 120, '#fde68a', { size: [0.5, 1.8], glow: false });
      break;
    }
    case 'ruins': {
      starsLayer(ctx, w, horizon, rng, 200 * s);
      glowAt(ctx, w * 0.5, horizon, 400 * s, '#a78bfa', 0.25);
      ridge(ctx, w, h, rng, { base: horizon - 50 * s, amp: 50 * s, step: 120 * s, color: '#1c1433' });
      for (let i = 0; i < 9; i++) {
        const x = (i / 9) * w + rng.range(-20, 20) * s;
        const far = i % 2 === 0;
        pillar(ctx, x, horizon + (far ? 0 : 30 * s), (far ? 26 : 40) * s, rng.range(120, 260) * s, far ? '#2e2650' : '#1a1430', rng.next() < 0.6, rng, s);
      }
      ground(ctx, w, h, horizon + 20 * s, ['#1e1633', '#05030c'], arena ? 'rgba(196,181,253,0.18)' : null);
      particles(ctx, w, h, rng, 60, '#c4b5fd');
      break;
    }
    case 'crystal': {
      ctx.fillStyle = '#05020f';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= w; x += 40 * s) ctx.lineTo(x, rng.range(40, 140) * s);
      ctx.lineTo(w, 0);
      ctx.fill();
      for (let i = 0; i < 18; i++)
        crystal(
          ctx,
          rng.range(-30, w),
          horizon + rng.range(0, 40) * s,
          rng.range(40, 110) * s,
          rng.range(120, 320) * s,
          ['#f0abfc', '#67e8f9', '#c084fc'][i % 3],
          s,
        );
      ground(ctx, w, h, horizon + 20 * s, ['#1a0b33', '#030108'], arena ? 'rgba(240,171,252,0.2)' : null);
      for (let i = 0; i < 8; i++) crystal(ctx, rng.range(0, w), h - rng.range(0, 30) * s, rng.range(30, 70) * s, rng.range(50, 120) * s, '#e879f9', s);
      particles(ctx, w, h, rng, 90, '#f0abfc');
      break;
    }
    case 'ash': {
      glowAt(ctx, w * 0.5, horizon, 500 * s, '#ef4444', 0.35);
      ridge(ctx, w, h, rng, { base: horizon - 80 * s, amp: 120 * s, step: 160 * s, color: '#3b0a05', sharp: true });
      ctx.save();
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 30 * s;
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(w * 0.7 - 60 * s, horizon - 80 * s);
      ctx.lineTo(w * 0.7, horizon - 260 * s);
      ctx.lineTo(w * 0.7 + 60 * s, horizon - 80 * s);
      ctx.fill();
      ctx.restore();
      ridge(ctx, w, h, rng, { base: horizon - 10 * s, amp: 40 * s, step: 100 * s, color: '#1c0503' });
      ground(ctx, w, h, horizon, ['#2a0a05', '#080100'], arena ? 'rgba(251,146,60,0.22)' : null);
      ctx.strokeStyle = 'rgba(251,146,60,0.7)';
      ctx.lineWidth = 2 * s;
      for (let i = 0; i < 12; i++) {
        let x = rng.range(0, w);
        let y = rng.range(horizon + 20 * s, h);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += rng.range(-40, 40) * s;
          y += rng.range(-8, 8) * s;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      particles(ctx, w, h, rng, 200, '#fdba74', { size: [0.8, 2.5] });
      break;
    }
    case 'sky': {
      glowAt(ctx, w * 0.2, h * 0.15, 260 * s, '#fef3c7', 0.7);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = hexToRgba('#ffffff', rng.range(0.25, 0.7));
        const cx = rng.range(0, w);
        const cy = rng.range(h * 0.1, h * 0.9);
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.arc(cx + k * 30 * s, cy + rng.range(-10, 10) * s, rng.range(20, 50) * s, 0, TAU);
          ctx.fill();
        }
      }
      for (let i = 0; i < 6; i++) island(ctx, rng.range(0, w), rng.range(h * 0.2, h * 0.55), rng.range(90, 200) * s, '#4b3a2a', '#4ade80', rng, s);
      ctx.strokeStyle = 'rgba(254,243,199,0.6)';
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h * 0.5);
      ctx.quadraticCurveTo(w * 0.5, h * 0.35, w * 0.9, h * 0.48);
      ctx.stroke();
      if (arena) {
        island(ctx, w / 2, h * 0.8, w * 1.1, '#3f2d1d', '#22c55e', rng, s);
        ground(ctx, w, h, h * 0.8, ['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)'], 'rgba(254,243,199,0.18)');
      }
      break;
    }
    case 'sunken': {
      for (let i = 0; i < 9; i++) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#a5f3fc';
        const x = rng.range(0, w);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 60 * s, 0);
        ctx.lineTo(x + 220 * s, h);
        ctx.lineTo(x + 100 * s, h);
        ctx.fill();
        ctx.restore();
      }
      for (let i = 0; i < 7; i++) {
        const x = (i / 7) * w + rng.range(0, 60) * s;
        building(ctx, x, horizon + 20 * s, rng.range(60, 110) * s, rng.range(120, 300) * s, '#0b3442', '#5eead4', rng, s);
      }
      ground(ctx, w, h, horizon, ['#0b3442', '#01080d'], arena ? 'rgba(94,234,212,0.18)' : null);
      ctx.strokeStyle = 'rgba(165,243,252,0.6)';
      for (let i = 0; i < 70; i++) {
        ctx.lineWidth = s;
        ctx.beginPath();
        ctx.arc(rng.range(0, w), rng.range(0, h), rng.range(2, 7) * s, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    case 'citadel': {
      glowAt(ctx, w * 0.5, h * 0.25, 280 * s, '#f43f5e', 0.35);
      ctx.fillStyle = '#fecdd3';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.22, 54 * s, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#030208';
      const bx = w * 0.5;
      for (const [dx, tw, th] of [
        [-260, 50, 300],
        [-170, 70, 380],
        [-60, 120, 470],
        [80, 80, 400],
        [190, 60, 320],
      ]) {
        ctx.fillRect(bx + dx * s, horizon - th * s, tw * s, th * s);
        ctx.beginPath();
        ctx.moveTo(bx + dx * s - 8 * s, horizon - th * s);
        ctx.lineTo(bx + (dx + tw / 2) * s, horizon - (th + 90) * s);
        ctx.lineTo(bx + (dx + tw + 8) * s, horizon - th * s);
        ctx.fill();
      }
      ctx.fillStyle = '#f43f5e';
      for (let i = 0; i < 24; i++) ctx.fillRect(bx + rng.range(-250, 260) * s, horizon - rng.range(60, 400) * s, 4 * s, 8 * s);
      ground(ctx, w, h, horizon, ['#100818', '#000000'], arena ? 'rgba(244,63,94,0.2)' : null);
      particles(ctx, w, h, rng, 50, '#fb7185');
      break;
    }
    case 'abyss': {
      starsLayer(ctx, w, h, rng, 120 * s, '#d8b4fe');
      portal(ctx, w * 0.5, h * 0.35, 200 * s, '#a855f7', rng);
      for (let i = 0; i < 9; i++) {
        const x = rng.range(0, w);
        const y = rng.range(0, horizon);
        glowAt(ctx, x, y, 20 * s, '#f0abfc', 0.6);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(x, y, 3 * s, 8 * s, 0, 0, TAU);
        ctx.fill();
      }
      ground(ctx, w, h, horizon, ['#12002a', '#000000'], arena ? 'rgba(168,85,247,0.25)' : null);
      particles(ctx, w, h, rng, 120, '#c084fc');
      break;
    }
    case 'frost': {
      starsLayer(ctx, w, horizon, rng, 140 * s, '#e0f2fe');
      // Aurora ribbons.
      for (const [col, yy] of [
        ['#5eead4', 0.18],
        ['#a78bfa', 0.28],
      ]) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 30 * s;
        ctx.lineWidth = 18 * s;
        ctx.beginPath();
        ctx.moveTo(0, h * yy);
        for (let x = 0; x <= w; x += 60 * s) ctx.lineTo(x, h * yy + Math.sin(x / (140 * s) + rng.next()) * 30 * s);
        ctx.stroke();
        ctx.restore();
      }
      ridge(ctx, w, h, rng, { base: horizon - 180 * s, amp: 110 * s, step: 150 * s, color: '#9cc3e4', sharp: true });
      ridge(ctx, w, h, rng, { base: horizon - 70 * s, amp: 60 * s, step: 100 * s, color: '#5d8bb3', sharp: true });
      for (let i = 0; i < 10; i++)
        crystal(ctx, rng.range(0, w), horizon + rng.range(0, 30) * s, rng.range(30, 70) * s, rng.range(60, 160) * s, '#bae6fd', s, false);
      ground(ctx, w, h, horizon, ['#cfe6f7', '#5d7f9c'], arena ? 'rgba(12,42,67,0.25)' : null);
      particles(ctx, w, h, rng, 220, '#ffffff', { size: [1, 3], glow: false });
      break;
    }
    case 'ember': {
      glowAt(ctx, w * 0.35, horizon - 40 * s, 420 * s, '#f97316', 0.4);
      for (const [x, ph] of [
        [0.18, 220],
        [0.48, 330],
        [0.82, 260],
      ]) {
        ctx.fillStyle = '#1f0703';
        ctx.beginPath();
        ctx.moveTo(w * x - ph * 0.9 * s, horizon + 10 * s);
        ctx.lineTo(w * x - 26 * s, horizon - ph * s);
        ctx.lineTo(w * x + 26 * s, horizon - ph * s);
        ctx.lineTo(w * x + ph * 0.9 * s, horizon + 10 * s);
        ctx.fill();
        glowAt(ctx, w * x, horizon - ph * s, 70 * s, '#fdba74', 0.8);
        ctx.fillStyle = 'rgba(40,20,20,0.5)';
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.arc(w * x + rng.range(-30, 30) * s, horizon - ph * s - (40 + k * 45) * s, (24 + k * 14) * s, 0, TAU);
          ctx.fill();
        }
      }
      ground(ctx, w, h, horizon, ['#7c1d0a', '#140302'], arena ? 'rgba(251,146,60,0.25)' : null);
      ctx.strokeStyle = 'rgba(253,186,116,0.8)';
      ctx.lineWidth = 3 * s;
      for (let i = 0; i < 9; i++) {
        const y = rng.range(horizon + 30 * s, h);
        ctx.beginPath();
        ctx.moveTo(rng.range(0, w), y);
        ctx.quadraticCurveTo(rng.range(0, w), y + rng.range(-20, 20) * s, rng.range(0, w), y + rng.range(-10, 10) * s);
        ctx.stroke();
      }
      particles(ctx, w, h, rng, 180, '#fb923c', { size: [0.8, 2.6] });
      break;
    }
    case 'emerald': {
      for (let i = 0; i < 8; i++) glowAt(ctx, rng.range(0, w), rng.range(0, horizon), rng.range(100, 240) * s, '#4ade80', 0.14);
      // Giant trunks.
      for (let i = 0; i < 5; i++) {
        const x = (i / 5) * w + rng.range(0, 80) * s;
        const tw = rng.range(60, 120) * s;
        ctx.fillStyle = '#1f2d14';
        ctx.fillRect(x, 0, tw, horizon + 20 * s);
        ctx.fillStyle = 'rgba(134,239,172,0.12)';
        ctx.fillRect(x + tw * 0.15, 0, tw * 0.12, horizon);
      }
      for (const [n, sc, col] of [
        [16, 1.1, '#0b3d22'],
        [10, 1.7, '#052414'],
      ]) {
        for (let i = 0; i < n; i++) tree(ctx, rng.range(-40, w + 40), horizon + rng.range(0, 30) * s * sc, sc * s * rng.range(0.8, 1.2), col, rng);
      }
      ground(ctx, w, h, horizon, ['#0d4a2a', '#021008'], arena ? 'rgba(134,239,172,0.2)' : null);
      particles(ctx, w, h, rng, 140, '#bbf7d0', { size: [1, 3.5] });
      break;
    }
    case 'clockwork': {
      glowAt(ctx, w * 0.5, horizon - 100 * s, 380 * s, '#f59e0b', 0.3);
      const gearAt = (cx, cy, r, col) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * TAU;
          const rr = k % 2 ? r : r * 1.14;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1a1105';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.35, 0, TAU);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.12, 0, TAU);
        ctx.fill();
        ctx.restore();
      };
      for (let i = 0; i < 7; i++) gearAt(rng.range(0, w), rng.range(h * 0.1, horizon), rng.range(40, 130) * s, i % 2 ? '#3b2508' : '#5c3b10');
      for (let i = 0; i < 8; i++) {
        const x = (i / 8) * w + rng.range(0, 40) * s;
        building(ctx, x, horizon + 10 * s, rng.range(50, 100) * s, rng.range(140, 320) * s, '#2a1a06', '#fbbf24', rng, s);
      }
      ground(ctx, w, h, horizon, ['#3b2508', '#0a0602'], arena ? 'rgba(251,191,36,0.22)' : null);
      particles(ctx, w, h, rng, 70, '#fde68a', { size: [0.8, 2] });
      break;
    }
    case 'marsh': {
      for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#d9f99d';
        ctx.fillRect(0, horizon - rng.range(40, 200) * s, w, rng.range(20, 60) * s);
        ctx.restore();
      }
      for (let i = 0; i < 14; i++) {
        const x = rng.range(0, w);
        const th = rng.range(100, 260) * s;
        ctx.strokeStyle = '#1a2008';
        ctx.lineWidth = rng.range(6, 14) * s;
        ctx.beginPath();
        ctx.moveTo(x, horizon + 20 * s);
        ctx.quadraticCurveTo(x + rng.range(-40, 40) * s, horizon - th / 2, x + rng.range(-60, 60) * s, horizon - th);
        ctx.stroke();
      }
      const g = ctx.createLinearGradient(0, horizon, 0, h);
      g.addColorStop(0, '#2d3a12');
      g.addColorStop(1, '#050803');
      ctx.fillStyle = g;
      ctx.fillRect(0, horizon, w, h - horizon);
      if (arena) ground(ctx, w, h, h * 0.8, ['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)'], 'rgba(217,249,157,0.12)');
      for (let i = 0; i < 26; i++) glowAt(ctx, rng.range(0, w), rng.range(horizon - 60 * s, h), rng.range(6, 16) * s, '#bef264', 0.8);
      break;
    }
    case 'starfall': {
      starsLayer(ctx, w, horizon, rng, 320 * s, '#fef9c3');
      ctx.save();
      for (let i = 0; i < 7; i++) {
        const x = rng.range(0, w);
        const y = rng.range(0, horizon * 0.7);
        const g = ctx.createLinearGradient(x, y, x - 180 * s, y - 90 * s);
        g.addColorStop(0, 'rgba(254,249,195,0.95)');
        g.addColorStop(1, 'rgba(254,249,195,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 180 * s, y - 90 * s);
        ctx.stroke();
      }
      ctx.restore();
      ridge(ctx, w, h, rng, { base: horizon - 30 * s, amp: 50 * s, step: 110 * s, color: '#110f2e' });
      ground(ctx, w, h, horizon, ['#1e1b4b', '#020208'], arena ? 'rgba(253,230,138,0.2)' : null);
      ctx.fillStyle = '#05040f';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, horizon + (h - horizon) * 0.5, w * 0.32, (h - horizon) * 0.22, 0, 0, TAU);
      ctx.fill();
      glowAt(ctx, w * 0.5, horizon + (h - horizon) * 0.5, 160 * s, '#fde68a', 0.3);
      particles(ctx, w, h, rng, 60, '#fde68a');
      break;
    }
    case 'mirror': {
      for (let i = 0; i < 16; i++) {
        const x = rng.range(-40, w);
        const y = rng.range(0, horizon);
        const mw = rng.range(40, 120) * s;
        const mh = rng.range(120, 320) * s;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rng.range(-0.3, 0.3));
        const g = ctx.createLinearGradient(0, 0, mw, mh);
        g.addColorStop(0, 'rgba(241,245,249,0.45)');
        g.addColorStop(0.5, 'rgba(148,163,184,0.15)');
        g.addColorStop(1, 'rgba(241,245,249,0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, mw, mh);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2 * s;
        ctx.strokeRect(0, 0, mw, mh);
        ctx.restore();
      }
      ground(ctx, w, h, horizon, ['#94a3b8', '#1e293b'], arena ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)');
      particles(ctx, w, h, rng, 80, '#ffffff', { size: [0.8, 2] });
      break;
    }
    case 'bones': {
      ctx.strokeStyle = '#d6d3d1';
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        // Giant ribs rising from the sea.
        const x = (i / 6) * w + rng.range(0, 60) * s;
        const rh = rng.range(160, 320) * s;
        ctx.lineWidth = rng.range(10, 18) * s;
        ctx.beginPath();
        ctx.moveTo(x, horizon + 20 * s);
        ctx.quadraticCurveTo(x + 90 * s, horizon - rh, x + 170 * s, horizon - rh * 0.6);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      ground(ctx, w, h, horizon, ['#a8a29e', '#292524'], arena ? 'rgba(12,10,9,0.25)' : null);
      ctx.fillStyle = 'rgba(245,245,244,0.55)';
      for (let i = 0; i < 90; i++) {
        ctx.beginPath();
        ctx.ellipse(rng.range(0, w), rng.range(horizon, h), rng.range(4, 14) * s, rng.range(2, 5) * s, rng.range(0, TAU), 0, TAU);
        ctx.fill();
      }
      particles(ctx, w, h, rng, 50, '#e7e5e4', { glow: false });
      break;
    }
    case 'spire': {
      glowAt(ctx, w * 0.5, h * 0.1, 360 * s, '#fef9c3', 0.8);
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = hexToRgba('#ffffff', rng.range(0.25, 0.6));
        const cx = rng.range(0, w);
        const cy = rng.range(horizon * 0.6, horizon + 40 * s);
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.arc(cx + k * 34 * s, cy + rng.range(-10, 10) * s, rng.range(24, 54) * s, 0, TAU);
          ctx.fill();
        }
      }
      ctx.save();
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 40 * s;
      const sg = ctx.createLinearGradient(0, 0, 0, horizon);
      sg.addColorStop(0, '#fef3c7');
      sg.addColorStop(1, '#ca8a04');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - 70 * s, horizon);
      ctx.lineTo(w * 0.5 - 14 * s, 0);
      ctx.lineTo(w * 0.5 + 14 * s, 0);
      ctx.lineTo(w * 0.5 + 70 * s, horizon);
      ctx.fill();
      ctx.restore();
      ground(ctx, w, h, horizon, ['#fde68a', '#78350f'], arena ? 'rgba(120,53,15,0.25)' : null);
      particles(ctx, w, h, rng, 90, '#fef08a');
      break;
    }
    case 'origin': {
      ctx.save();
      for (let i = 0; i < 40; i++) {
        ctx.strokeStyle = hexToRgba(['#f472b6', '#38bdf8', '#facc15', '#4ade80', '#a78bfa'][i % 5], rng.range(0.25, 0.7));
        ctx.lineWidth = rng.range(1, 3) * s;
        ctx.beginPath();
        ctx.moveTo(w * 0.5, horizon * 0.55);
        ctx.quadraticCurveTo(rng.range(0, w), rng.range(0, h), rng.range(-50, w + 50), rng.range(-50, h + 50));
        ctx.stroke();
      }
      ctx.restore();
      glowAt(ctx, w * 0.5, horizon * 0.55, 200 * s, '#fde68a', 0.85);
      ground(ctx, w, h, horizon, ['#f5f5f4', '#d6d3d1'], arena ? 'rgba(68,64,60,0.18)' : null);
      particles(ctx, w, h, rng, 70, '#fde68a', { size: [1, 2.5] });
      break;
    }
    case 'gate':
    default: {
      starsLayer(ctx, w, horizon, rng, 260 * s, '#f5d0fe');
      ridge(ctx, w, h, rng, { base: horizon - 30 * s, amp: 80 * s, step: 120 * s, color: '#14062b', sharp: true });
      portal(ctx, w * 0.5, horizon - 150 * s, 170 * s, '#e879f9', rng);
      for (const sx of [-1, 1]) pillar(ctx, w * 0.5 + sx * 230 * s - 25 * s, horizon + 10 * s, 50 * s, 330 * s, '#1a0a33', false, rng, s);
      ground(ctx, w, h, horizon, ['#1b0838', '#030008'], arena ? 'rgba(232,121,249,0.22)' : null);
      particles(ctx, w, h, rng, 100, '#f0abfc');
    }
  }

  if (arena) {
    // Spotlights on the two fighting positions.
    for (const fx of [0.27, 0.73]) {
      const g = ctx.createRadialGradient(w * fx, h * 0.86, 4, w * fx, h * 0.86, 220 * s);
      g.addColorStop(0, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }
  // Vignette.
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}
