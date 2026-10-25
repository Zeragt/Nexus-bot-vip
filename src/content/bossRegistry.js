// The hall of 100 bosses: 55 story bosses (one per chapter) and 45 region bosses.
// Story bosses without hand-made `look` traits get a stable one derived from their key,
// so every boss in the hall has a silhouette of its own.

import { CHAPTERS } from './story/index.js';
import { WORLD_BOSSES } from './bosses.js';

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

const pick = (h, shift, list) => list[(h >>> shift) % list.length];

/** Stable look traits from a key (used for story bosses that don't define their own). */
export function derivedLook(key, archetype) {
  const h = hash(key);
  const h2 = hash(`${key}:look`);
  const look = {
    crown: pick(h, 0, ['classic', 'spiked', 'tall']),
    horns: pick(h, 3, [null, 'curved', 'straight', 'antlers']),
    wings: archetype === 'bird' || archetype === 'dragon' ? null : pick(h, 6, [null, null, 'bat', 'feather', 'crystal']),
    eyes: (h >>> 9) % 4,
    orbs: (h >>> 12) % 6,
    halo: pick(h, 15, [null, 'ring', 'thorns']),
    runes: Boolean((h >>> 18) & 1),
    chains: Boolean((h >>> 19) & 1),
    flames: Boolean((h >>> 20) & 1),
    spikes: Boolean((h >>> 21) & 1),
    mark: pick(h2, 0, [null, 'stripes', 'spots', 'cracks']),
    size: 0.95 + ((h2 >>> 4) % 6) * 0.05,
  };
  return look;
}

/** A look's fingerprint: two bosses with the same signature would be drawn the same way. */
export function lookSignature(boss) {
  const t = boss.look ?? {};
  return JSON.stringify([
    boss.archetype,
    boss.palette,
    t.crown ?? 'classic',
    t.horns ?? null,
    t.wings ?? null,
    t.eyes ?? 0,
    t.orbs ?? 0,
    t.halo ?? null,
    Boolean(t.runes),
    Boolean(t.chains),
    Boolean(t.flames),
    Boolean(t.spikes),
    t.mark ?? null,
    t.accent ?? null,
  ]);
}

export const STORY_BOSSES = CHAPTERS.map((c) => ({
  ...c.boss,
  look: c.boss.look ?? derivedLook(c.boss.key, c.boss.archetype),
  kind: 'story',
  chapterIndex: c.index,
  chapterKey: c.key,
  chapterTitle: c.title,
  location: c.location,
  level: c.level,
  lore: c.boss.intro ?? '',
}));

export const ALL_BOSSES = [...STORY_BOSSES, ...WORLD_BOSSES.map((b) => ({ ...b, kind: 'world' }))].map((b, i) => ({ ...b, number: i + 1 }));
export const BOSS_BY_KEY = Object.fromEntries(ALL_BOSSES.map((b) => [b.key, b]));
