import { loadImage } from '@napi-rs/canvas';
import { logger } from '../core/logger.js';

const cache = new Map();
const MAX = 300;
const TTL = 60 * 60 * 1000;

/**
 * Loads an image from a Buffer or an https URL (Discord CDN avatars). Never throws:
 * a missing avatar must not break a card, the renderer falls back to a sigil.
 */
export async function loadAvatar(source) {
  if (!source) return null;
  if (Buffer.isBuffer(source)) {
    try {
      return await loadImage(source);
    } catch {
      return null;
    }
  }
  const url = String(source);
  if (!/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//.test(url)) return null;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.img;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const img = await loadImage(Buffer.from(await res.arrayBuffer()));
    if (cache.size >= MAX) cache.delete(cache.keys().next().value);
    cache.set(url, { img, at: Date.now() });
    return img;
  } catch (err) {
    logger.debug({ err: err.message }, 'Avatar load failed');
    return null;
  }
}

/** Downloads a user-supplied image, center-crops and stores it as a 256×256 PNG. */
export async function normalizeAvatar(url, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('download failed');
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) throw new Error('too large');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error('too large');
  const img = await loadImage(buf);
  const size = 256;
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const s = Math.max(size / img.width, size / img.height);
  ctx.drawImage(img, (size - img.width * s) / 2, (size - img.height * s) / 2, img.width * s, img.height * s);
  return c.encode('png');
}
