import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { app } from '../core/context.js';
import { cooldowns as CD } from '../config/game.js';
import { duration } from '../utils/format.js';
import { defaultRng } from '../engine/rng.js';
import { requireByUser, spendEnergy, grantXp } from './characters.js';
import { credit } from './economy.js';
import { adjustFactionRep } from './factions.js';
import { recordProgress } from './quests.js';
import { track } from './progress.js';
import { checkAchievements } from './achievements.js';
import { getSetting } from './settings.js';

export async function listJobs() {
  const { rows } = await getPool().query(
    'SELECT j.*, f.name_ar AS faction_name FROM jobs j LEFT JOIN factions f ON f.id = j.faction_id ORDER BY j.min_level, j.base_pay',
  );
  return rows;
}

export async function getJob(input, db = getPool()) {
  const { rows } = await db.query('SELECT * FROM jobs WHERE key = $1 OR name_ar = $1 OR lower(name) = lower($1) LIMIT 1', [String(input ?? '').trim()]);
  return rows[0] ?? null;
}

export const jobLevelFor = (xp) => 1 + Math.floor(Math.sqrt(xp / 25));

/** Pay formula: base × job level bonus × main stat bonus, with a small luck-driven tip. */
export function computePay(job, { jobLevel, statValue, luck }, rng = defaultRng) {
  const levelBonus = 1 + (jobLevel - 1) * 0.06;
  const statBonus = 1 + statValue * 0.015;
  let pay = Math.round(job.base_pay * levelBonus * statBonus * rng.range(0.9, 1.1));
  const tip = rng.chance(Math.min(0.35, 0.05 + luck * 0.01)) ? Math.round(pay * rng.range(0.2, 0.6)) : 0;
  pay += tip;
  return { pay, tip };
}

export async function selectJob(userId, input) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const job = await getJob(input, db);
    if (!job) throw new UserError('لم أجد هذه الوظيفة');
    if (ch.job?.id === job.id) throw new UserError(`أنت تعمل ${job.name_ar} بالفعل`);
    if (ch.level < job.min_level) throw new UserError(`تحتاج إلى المستوى ${job.min_level} لهذه الوظيفة`);
    if (ch.jobChangedAt) {
      const left = new Date(ch.jobChangedAt).getTime() + CD.jobChangeHours * 3.6e6 - Date.now();
      if (left > 0) throw new UserError(`يمكنك تغيير وظيفتك بعد ${duration(left)}`);
    }
    await db.query('UPDATE characters SET job_id = $2, job_changed_at = now() WHERE id = $1', [ch.id, job.id]);
    await db.query('INSERT INTO character_jobs (character_id, job_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ch.id, job.id]);
    return job;
  });
}

export async function work(userId, rng = defaultRng) {
  const ch0 = await requireByUser(userId);
  if (!ch0.job) throw new UserError('ليس لديك وظيفة. اختر واحدة عبر /job select');
  const job = await getJob(ch0.job.key);
  const left = await app.cooldowns.remaining(`c:${ch0.id}`, `job:${job.key}`);
  if (left > 0) throw new UserError(`أنت متعب من الوردية السابقة. عُد بعد ${duration(left)}`);
  const result = await tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    await spendEnergy(db, ch, job.energy_cost);
    const cj = (await db.query('SELECT * FROM character_jobs WHERE character_id = $1 AND job_id = $2 FOR UPDATE', [ch.id, job.id])).rows[0] ?? {
      job_xp: 0,
      job_level: 1,
      shifts: 0,
    };
    const mult = Number(await getSetting('nx_multiplier', 1)) || 1;
    const { pay, tip } = computePay(job, { jobLevel: cj.job_level, statValue: ch.stats[job.main_stat] ?? 0, luck: ch.stats.luck }, rng);
    const total = Math.floor(pay * mult);
    await credit(db, ch.id, total, 'job', `وردية عمل: ${job.name_ar}`);
    const jobXp = cj.job_xp + 10;
    const jobLevel = jobLevelFor(jobXp);
    await db.query(
      `INSERT INTO character_jobs (character_id, job_id, job_level, job_xp, shifts) VALUES ($1,$2,$3,$4,1)
       ON CONFLICT (character_id, job_id) DO UPDATE SET job_level = $3, job_xp = $4, shifts = character_jobs.shifts + 1`,
      [ch.id, job.id, jobLevel, jobXp],
    );
    await db.query('UPDATE characters SET shifts_worked = shifts_worked + 1 WHERE id = $1', [ch.id]);
    const xp = await grantXp(db, ch.id, job.xp_reward);
    if (job.faction_id) await adjustFactionRep(db, ch.id, job.faction_id, 2);
    await recordProgress(db, ch.id, 'work', job.key);
    const contracts = await track(db, ch.id, 'work', { key: job.key });
    const unlocked = await checkAchievements(db, ch.id);
    return { job, pay: total, tip, xp, jobLevel, jobLevelUp: jobLevel > cj.job_level, energyLeft: ch.energy, unlocked, contracts };
  });
  await app.cooldowns.set(`c:${ch0.id}`, `job:${job.key}`, job.cooldown_seconds * 1000);
  return result;
}

export async function jobHistory(characterId) {
  const { rows } = await getPool().query('SELECT cj.*, j.name_ar FROM character_jobs cj JOIN jobs j ON j.id = cj.job_id WHERE cj.character_id = $1', [
    characterId,
  ]);
  return rows;
}
