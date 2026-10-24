/** Small seeded PRNG (mulberry32) so combat and loot can be replayed in tests. */
export function createRng(seed = Date.now() ^ (Math.random() * 0x7fffffff)) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p) => next() < p,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

export const defaultRng = createRng();
