import { loadAvatar } from '../render/index.js';
import { getAvatar } from '../services/characters.js';
import { avatarUrlFor } from '../core/ui.js';
import { app } from '../core/context.js';

const cache = new Map();
const TTL = 5 * 60 * 1000;

/** Character portrait: the uploaded character art if any, otherwise the player's Discord avatar. */
export async function characterImage(characterId, userId) {
  const key = `${characterId}:${userId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.img;
  let img = null;
  if (characterId) {
    const buf = await getAvatar(characterId).catch(() => null);
    if (buf) img = await loadAvatar(buf);
  }
  if (!img && userId && app.client) img = await loadAvatar(await avatarUrlFor(app.client, userId));
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(key, { img, at: Date.now() });
  return img;
}

export function forgetImage(characterId) {
  for (const k of cache.keys()) if (k.startsWith(`${characterId}:`)) cache.delete(k);
}

export async function userImage(userId) {
  return app.client ? loadAvatar(await avatarUrlFor(app.client, userId)) : null;
}
