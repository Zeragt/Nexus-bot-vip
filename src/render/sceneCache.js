import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { drawScene } from './scenes.js';

export const ASSET_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');
const cache = new Map();
const MAX = 24;

function remember(key, value) {
  if (cache.size >= MAX) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

/** Loads a pre-rendered asset (assets/<rel>) once; null when the file isn't there. */
export async function assetImage(rel) {
  const key = `asset:${rel}`;
  if (cache.has(key)) return cache.get(key);
  const file = path.join(ASSET_DIR, rel);
  let img = null;
  try {
    if (fs.existsSync(file)) img = await loadImage(await fs.promises.readFile(file));
  } catch {
    img = null;
  }
  return remember(key, img);
}

/**
 * Background for a scene at the requested size. Uses the high-resolution painting from
 * `assets/scenes` when it was built (sharper, and no drawing cost per card), otherwise
 * paints it on the fly. Either way the result is cached.
 */
export async function sceneImage(scene, w, h, { arena = false, seed = 1 } = {}) {
  const key = `scene:${scene}:${w}x${h}:${arena}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const pre = await assetImage(`scenes/${scene}${arena ? '-arena' : ''}.webp`);
  if (pre) ctx.drawImage(pre, 0, 0, w, h);
  else drawScene(ctx, w, h, scene, { arena, seed });
  return remember(key, c);
}
