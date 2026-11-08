/**
 * المهام اليومية: ثلاث مهام تتغير كل يوم (بتوقيت UTC)، ومكافأة دخول يومية متصاعدة.
 */
import { createHash } from 'node:crypto';
import { DAILY_TEMPLATES, DAILY_COUNT } from './content.js';

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

function seeded(seed) {
  let h = createHash('sha256').update(seed).digest();
  let i = 0;
  return () => {
    if (i + 4 > h.length) {
      h = createHash('sha256').update(h).digest();
      i = 0;
    }
    const v = h.readUInt32BE(i) / 2 ** 32;
    i += 4;
    return v;
  };
}

export function generateDailies(playerId, level, day = today()) {
  const r = seeded(`${playerId}:${day}`);
  const pool = [...DAILY_TEMPLATES];
  const quests = [];
  while (quests.length < DAILY_COUNT && pool.length) {
    const t = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const [a, b] = t.range;
    let n = a + Math.floor(r() * (b - a + 1));
    if (t.id === 'gold') n = Math.round((n * (1 + level / 10)) / 10) * 10;
    quests.push({
      id: t.id,
      event: t.event,
      text: t.text.replace('{n}', n),
      target: n,
      progress: 0,
      claimed: false,
      reward: { gold: 60 + level * 12, xp: 40 + level * 18 },
    });
  }
  return { day, quests, bonusClaimed: false };
}

/** يتأكد أن مهام اليوم موجودة (ويجددها إن تغير اليوم). */
export function ensureDailies(p, now = Date.now()) {
  const d = today(now);
  if (!p.dailies || p.dailies.day !== d) p.dailies = generateDailies(p.id, p.level, d);
  return p.dailies;
}

/** يسجّل حدثاً في تقدم المهام. */
export function track(p, event, amount = 1) {
  const ds = ensureDailies(p);
  for (const q of ds.quests) if (q.event === event && !q.claimed) q.progress = Math.min(q.target, q.progress + amount);
}

export function loginReward(streak, level) {
  return { gold: 50 + Math.min(streak, 7) * 25 + level * 5, potions: streak % 3 === 0 ? 1 : 0 };
}
