#!/usr/bin/env node
// Pre-renders Nexus's art into assets/. Everything here can also be drawn live by the bot;
// the files make cards faster to produce and give server staff ready-made art
// (wallpapers, class posters, chapter posters, monster portraits, and one crest per path,
// sized to work as Discord role icons).
//
//   node scripts/build-assets.js            build what is missing
//   node scripts/build-assets.js --force    rebuild everything
//   node scripts/build-assets.js --only=emblems,scenes
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { drawScene, SCENES, sceneFor } from '../src/render/scenes.js';
import { drawFighter, drawMonster } from '../src/render/sprites.js';
import { drawEmblem } from '../src/render/emblems.js';
import { text, paragraph, hashSeed } from '../src/render/draw.js';
import { hexToRgba } from '../src/render/theme.js';
import { CLASSES, CATEGORIES, ELEMENTS, ROLE_LABELS } from '../src/content/classes.js';
import { PATHS, subclassesOf } from '../src/content/classGen.js';
import { CHAPTERS } from '../src/content/story/index.js';
import { ENEMIES } from '../src/engine/enemies.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const args = process.argv.slice(2);
const force = args.includes('--force');
const only =
  args
    .find((a) => a.startsWith('--only='))
    ?.slice(7)
    .split(',') ?? null;
const want = (k) => !only || only.includes(k);
const SCENE_OF_CATEGORY = {
  warrior: 'mountains',
  shadow: 'citadel',
  ranger: 'forest',
  arcane: 'crystal',
  divine: 'sky',
  dark: 'ash',
  tech: 'city',
  rift: 'gate',
};

let written = 0;
let bytes = 0;
async function save(rel, canvas, quality = 92) {
  const file = path.join(ROOT, rel);
  if (!force && fs.existsSync(file)) {
    bytes += fs.statSync(file).size;
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = await canvas.encode('webp', quality);
  fs.writeFileSync(file, buf);
  written++;
  bytes += buf.length;
}

function vignette(ctx, w, h, strength = 0.65) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(2,3,12,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function sparks(ctx, w, h, color, seed, count = 220) {
  let x = seed;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const px = rnd() * w;
    const py = rnd() * h;
    const r = (0.6 + rnd() * 2.6) * (w / 1280);
    const g = ctx.createRadialGradient(px, py, 0, px, py, r * 4);
    g.addColorStop(0, hexToRgba(color, 0.9));
    g.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(px - r * 4, py - r * 4, r * 8, r * 8);
  }
  ctx.restore();
}

// 1. Scene backgrounds used by every card (1280×720), plain and arena.
async function scenes() {
  for (const scene of SCENES) {
    for (const arena of [false, true]) {
      const c = createCanvas(1280, 720);
      drawScene(c.getContext('2d'), 1280, 720, scene, { arena, seed: 1 });
      await save(`scenes/${scene}${arena ? '-arena' : ''}.webp`, c, 90);
    }
  }
}

// 2. 4K wallpapers of every region, with and without the arena floor.
async function wallpapers() {
  for (const scene of SCENES) {
    for (const arena of [false, true]) {
      const c = createCanvas(3840, 2160);
      const ctx = c.getContext('2d');
      drawScene(ctx, 3840, 2160, scene, { arena, seed: 7 });
      vignette(ctx, 3840, 2160, 0.5);
      await save(`art/wallpapers/${scene}${arena ? '-arena' : ''}-4k.webp`, c, 94);
    }
  }
}

// 3. A crest for each of the 1,650 paths (55 classes × 30), 512×512.
async function emblems() {
  for (const cls of CLASSES) {
    const subs = subclassesOf(cls);
    for (const [i, p] of PATHS.entries()) {
      const c = createCanvas(512, 512);
      drawEmblem(c.getContext('2d'), { classKey: cls.key, pathKey: p.key, size: 512, label: subs[i].name });
      await save(`art/emblems/${cls.key}/${p.key}.webp`, c, 95);
    }
  }
}

// 4. A poster per class (2560×1440): the class in its home region with its crests.
async function classPosters() {
  for (const cls of CLASSES) {
    const W = 2560;
    const H = 1440;
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');
    const cat = CATEGORIES[cls.category];
    const el = ELEMENTS[cls.element];
    drawScene(ctx, W, H, SCENE_OF_CATEGORY[cls.category] ?? 'gate', { seed: hashSeed(cls.key) });
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(4,7,22,0.05)');
    g.addColorStop(0.45, 'rgba(4,7,22,0.55)');
    g.addColorStop(1, 'rgba(4,7,22,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    sparks(ctx, W, H, el.color, hashSeed(cls.key), 140);
    drawFighter(ctx, { x: 620, y: H - 130, scale: 2.45, classKey: cls.key, pose: 'victory', seed: 11 });
    ctx.save();
    ctx.scale(2, 2);
    const right = W / 2 - 70;
    text(ctx, cat.name, right, 110, { size: 24, weight: 700, color: cat.color });
    text(ctx, cls.nameAr, right, 196, { size: 92, weight: 800, glow: 30, glowColor: hexToRgba(cls.colors[1], 0.8), maxWidth: 700 });
    text(ctx, cls.name.toUpperCase(), right, 252, { size: 30, weight: 700, family: 'num', color: cls.colors[1], dir: 'ltr' });
    text(ctx, `${ROLE_LABELS[cls.role]}  •  عنصر ${el.name}`, right, 304, { size: 26, weight: 700, color: el.color });
    paragraph(ctx, cls.description, right, 360, 640, { size: 26, weight: 500, color: '#e2e8f0', maxLines: 3, lineHeight: 1.6 });
    text(ctx, `«${cls.motto}»`, right, 500, { size: 28, weight: 700, color: '#fde68a', maxWidth: 640 });
    ctx.restore();
    // A row of the class's five most famous crests.
    ['vanguard', 'tempest', 'eclipse', 'eternal', 'mythic'].forEach((p, i) =>
      drawEmblem(ctx, { classKey: cls.key, pathKey: p, size: 220, x: W - 300 - i * 230, y: H - 320 }),
    );
    vignette(ctx, W, H, 0.45);
    await save(`art/classes/${cls.key}.webp`, c, 92);
  }
}

// 5. A poster per chapter (2560×1440): the hero facing the chapter boss in its location.
async function chapterPosters() {
  for (const ch of CHAPTERS) {
    const W = 2560;
    const H = 1440;
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');
    drawScene(ctx, W, H, sceneFor(ch.location), { seed: hashSeed(ch.key) });
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(4,7,22,0.85)');
    v.addColorStop(0.35, 'rgba(4,7,22,0.1)');
    v.addColorStop(1, 'rgba(4,7,22,0.85)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    sparks(ctx, W, H, ch.boss.palette[1], hashSeed(ch.key), 240);
    drawFighter(ctx, { x: 640, y: H - 200, scale: 2.2, facing: 1, classKey: CLASSES[ch.index % CLASSES.length].key, pose: 'attack', seed: ch.index });
    drawMonster(ctx, {
      x: W - 640,
      y: H - 200,
      scale: ch.boss.archetype === 'dragon' ? 1.5 : 1.9,
      facing: -1,
      archetype: ch.boss.archetype,
      palette: ch.boss.palette,
      boss: true,
      seed: hashSeed(ch.boss.key),
    });
    ctx.save();
    ctx.scale(2, 2);
    text(ctx, ch.act.title, W / 4, 70, { size: 26, weight: 700, align: 'center', color: '#a5b4fc' });
    text(ctx, `الفصل ${ch.index + 1}: ${ch.title}`, W / 4, 140, {
      size: 64,
      weight: 800,
      align: 'center',
      glow: 26,
      glowColor: hexToRgba(ch.boss.palette[1], 0.8),
      maxWidth: 1180,
    });
    text(ctx, ch.boss.name, W / 4, H / 2 - 40, { size: 40, weight: 800, align: 'center', color: '#fecdd3', glow: 18, glowColor: '#f43f5e' });
    ctx.restore();
    vignette(ctx, W, H, 0.4);
    await save(`art/story/${ch.key}.webp`, c, 92);
  }
}

// 6. A portrait of every creature and boss (1024×1024).
async function bestiary() {
  const seen = new Set();
  const list = [];
  for (const [loc, mobs] of Object.entries(ENEMIES)) for (const m of mobs) if (!seen.has(m.key) && seen.add(m.key)) list.push({ ...m, loc });
  for (const ch of CHAPTERS) list.push({ ...ch.boss, loc: ch.location, boss: true });
  for (const m of list) {
    const S = 1024;
    const c = createCanvas(S, S);
    const ctx = c.getContext('2d');
    drawScene(ctx, S * (16 / 9), S, sceneFor(m.loc), { seed: hashSeed(m.key) });
    ctx.fillStyle = 'rgba(4,7,22,0.35)';
    ctx.fillRect(0, 0, S, S);
    sparks(ctx, S, S, m.palette[1], hashSeed(m.key), 140);
    drawMonster(ctx, {
      x: S / 2,
      y: S - 170,
      scale: m.archetype === 'dragon' ? 1.2 : 1.75,
      facing: -1,
      archetype: m.archetype,
      palette: m.palette,
      boss: Boolean(m.boss),
      seed: hashSeed(m.key),
    });
    ctx.save();
    ctx.fillStyle = 'rgba(4,7,22,0.8)';
    ctx.fillRect(0, S - 120, S, 120);
    ctx.restore();
    text(ctx, m.name, S / 2, S - 50, { size: 52, weight: 800, align: 'center', color: '#fff', glow: 16, glowColor: m.palette[1], maxWidth: S - 80 });
    vignette(ctx, S, S, 0.4);
    await save(`art/bestiary/${m.boss ? 'bosses' : 'monsters'}/${m.key}.webp`, c, 92);
  }
}

const steps = { scenes, wallpapers, emblems, classes: classPosters, story: chapterPosters, bestiary };
const started = Date.now();
for (const [name, fn] of Object.entries(steps)) {
  if (!want(name)) continue;
  const t = Date.now();
  const before = bytes;
  await fn();
  console.log(`${name.padEnd(11)} ${((bytes - before) / 1e6).toFixed(1).padStart(7)} MB  ${((Date.now() - t) / 1000).toFixed(1)}s`);
}
console.log(`total       ${(bytes / 1e6).toFixed(1).padStart(7)} MB  (${written} files written, ${((Date.now() - started) / 1000).toFixed(0)}s)`);
