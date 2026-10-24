import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { CHAPTERS, CHAPTER_BY_KEY, chapterAt } from '../content/story/index.js';
import { BOSS_TUNE } from '../content/story/balance.js';
import { CLASS_BY_KEY } from '../content/classes.js';
import { combat as C } from '../config/game.js';
import { spawnEnemy } from '../engine/enemies.js';
import { defaultRng } from '../engine/rng.js';
import { requireByUser, spendEnergy } from './characters.js';
import { grantRewards, describeRewards } from './rewards.js';
import { adjustFactionRep } from './factions.js';
import { startScriptedFight } from './combat.js';
import { getSetting } from './settings.js';
import { audit } from './audit.js';

function mapProgress(r) {
  return {
    chapter: r?.chapter ?? 0,
    choices: r?.choices ?? {},
    readPages: r?.read_pages ?? {},
    bossAttempts: r?.boss_attempts ?? 0,
  };
}

export async function progressOf(characterId, db = getPool(), { lock = false } = {}) {
  await db.query('INSERT INTO character_story (character_id) VALUES ($1) ON CONFLICT DO NOTHING', [characterId]);
  const { rows } = await db.query(`SELECT * FROM character_story WHERE character_id = $1${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  return mapProgress(rows[0]);
}

async function assertEnabled() {
  if (!(await getSetting('story_enabled', true))) throw new UserError('القصة متوقفة مؤقتاً بأمر الإدارة');
}

/**
 * Where a character stands: the chapter they are on, and what blocks them
 * (a pending choice from the previous chapter, a level requirement, or being elsewhere).
 */
export function storyStatus(ch, progress) {
  const done = progress.chapter >= CHAPTERS.length;
  const prev = progress.chapter > 0 ? chapterAt(progress.chapter - 1) : null;
  const pendingChoice = prev?.choice && progress.choices[prev.key] == null ? prev : null;
  const current = done ? null : chapterAt(progress.chapter);
  const blockers = [];
  if (current && ch.level < current.level) blockers.push(`تحتاج إلى المستوى ${current.level} لبدء هذا الفصل (مستواك ${ch.level})`);
  return { done, current, pendingChoice, blockers, completed: progress.chapter, total: CHAPTERS.length };
}

/** A chapter is readable once reached; finished chapters stay readable forever. */
export function canRead(progress, chapter) {
  return chapter.index <= progress.chapter;
}

let locationCache = null;
/** Name and region of a location key (locations rarely change; cached for the process). */
export async function locationInfo(key) {
  if (!locationCache) {
    const { rows } = await getPool().query('SELECT key, name_ar, region FROM locations');
    locationCache = Object.fromEntries(rows.map((r) => [r.key, { nameAr: r.name_ar, region: r.region }]));
  }
  return locationCache[key] ?? { nameAr: key, region: null };
}

export function isAtLocation(ch, chapter, chapterRegion = null) {
  const here = ch.location;
  if (!here) return false;
  if (here.key === chapter.location) return true;
  // City chapters can be played from anywhere inside the city walls.
  return (chapterRegion === 'city' || chapter.location === 'nexus_city') && here.region === 'city';
}

export async function overview(userId) {
  await assertEnabled();
  const ch = await requireByUser(userId);
  const progress = await progressOf(ch.id);
  return { ch, progress, status: storyStatus(ch, progress) };
}

export async function readPage(userId, chapterKey, page) {
  await assertEnabled();
  const ch = await requireByUser(userId);
  const chapter = CHAPTER_BY_KEY[chapterKey];
  if (!chapter) throw new UserError('هذا الفصل غير موجود');
  const progress = await progressOf(ch.id);
  if (!canRead(progress, chapter)) throw new UserError('لم تصل إلى هذا الفصل بعد. أكمل الفصول السابقة أولاً');
  const status = storyStatus(ch, progress);
  if (chapter.index === progress.chapter && status.blockers.length) throw new UserError(status.blockers.join('\n'));
  if (status.pendingChoice && chapter.index === progress.chapter) {
    throw new UserError(`عليك أن تحسم قرار «${status.pendingChoice.title}» قبل أن تكمل. استخدم /story current`);
  }
  const total = chapter.pages.length;
  const p = Math.min(Math.max(1, page), total);
  if ((progress.readPages[chapter.key] ?? 0) < p) {
    await getPool().query(
      `UPDATE character_story SET read_pages = read_pages || jsonb_build_object($2::text, $3::int), updated_at = now() WHERE character_id = $1`,
      [ch.id, chapter.key, p],
    );
  }
  return { ch, chapter, page: p, total, progress, completed: chapter.index < progress.chapter };
}

/** Records the decision that closes a chapter and pays its faction reputation. */
export async function makeChoice(userId, chapterKey, optionIndex) {
  await assertEnabled();
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const chapter = CHAPTER_BY_KEY[chapterKey];
    if (!chapter?.choice) throw new UserError('لا يوجد قرار في هذا الفصل');
    const progress = await progressOf(ch.id, db, { lock: true });
    if (chapter.index >= progress.chapter) throw new UserError('هذا القرار يُتخذ بعد هزيمة زعيم الفصل');
    if (progress.choices[chapter.key] != null) throw new UserError('لقد اتخذت هذا القرار من قبل، والقصة لا تعود إلى الوراء');
    const option = chapter.choice.options[optionIndex];
    if (!option) throw new UserError('خيار غير صالح');
    await db.query(`UPDATE character_story SET choices = choices || jsonb_build_object($2::text, $3::int), updated_at = now() WHERE character_id = $1`, [
      ch.id,
      chapter.key,
      optionIndex,
    ]);
    if (option.rep) {
      const f = (await db.query('SELECT id FROM factions WHERE key = $1', [option.rep[0]])).rows[0];
      if (f) await adjustFactionRep(db, ch.id, f.id, option.rep[1]);
    }
    await audit(
      { actorId: userId, action: 'story_chapter', targetType: 'character', targetId: ch.id, after: { chapter: chapter.key, choice: optionIndex } },
      db,
    );
    return { ch, chapter, option };
  });
}

// Bosses are built like a strong hunt monster of the chapter's level, on a toughness curve across
// the saga. BOSS_TUNE corrects each boss for its own skills and stat weights; it is generated by
// scripts/tune-bosses.js, which simulates hundreds of fights per chapter.
export const bossStatLevel = (level) => Math.round(level * 0.62 + 1);
export function bossHpMult(chapter) {
  return (1.5 + (chapter.index / 24) * 1.4) * (BOSS_TUNE[chapter.key] ?? 1);
}
const bossStatMult = (chapter) => Math.min(1.06, Math.max(1, chapter.boss.statMult ?? 1));

/** Spawns the chapter boss at the chapter's level (not the player's), so story fights stay tuned. */
export function spawnBoss(chapter, rng = defaultRng) {
  return spawnEnemy(
    { ...chapter.boss, hpMult: bossHpMult(chapter), statMult: bossStatMult(chapter) },
    { playerLevel: chapter.level, boss: true, statLevel: bossStatLevel(chapter.level) },
    rng,
  );
}

export async function startBossFight(userId, rng = defaultRng) {
  await assertEnabled();
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const progress = await progressOf(ch.id, db, { lock: true });
    const status = storyStatus(ch, progress);
    if (status.done) throw new UserError('أكملت القصة الكبرى كاملة. انتظر الأجزاء القادمة!');
    if (status.pendingChoice) throw new UserError(`احسم قرار «${status.pendingChoice.title}» أولاً عبر /story current`);
    if (status.blockers.length) throw new UserError(status.blockers.join('\n'));
    const chapter = status.current;
    const loc = await locationInfo(chapter.location);
    if (!isAtLocation(ch, chapter, loc.region)) {
      throw new UserError(`زعيم هذا الفصل ينتظرك في **${loc.nameAr}**. سافر إليه عبر /travel ثم عد إلى /story fight`);
    }
    if (ch.hp < ch.maxHp * 0.5) throw new UserError('صحتك أقل من النصف. زعماء القصة لا يرحمون: استرح أو استخدم جرعة أولاً');
    await spendEnergy(db, ch, C.huntEnergyCost);
    const enemy = spawnBoss(chapter, rng);
    return startScriptedFight(db, ch, enemy, { locationKey: chapter.location, story: { chapter: chapter.key, index: chapter.index } }, rng);
  });
}

/**
 * Called by the combat service when a story fight ends (inside its transaction).
 * A win completes the chapter and pays its rewards once; a loss counts an attempt.
 */
export async function onStoryFight(db, state, playerFighter, won) {
  const chapter = CHAPTER_BY_KEY[state.story.chapter];
  if (!chapter || typeof playerFighter?.id !== 'number') return null;
  const progress = await progressOf(playerFighter.id, db, { lock: true });
  if (!won) {
    await db.query('UPDATE character_story SET boss_attempts = boss_attempts + 1, updated_at = now() WHERE character_id = $1', [playerFighter.id]);
    return { won: false, chapter, attempts: progress.bossAttempts + 1 };
  }
  if (chapter.index !== progress.chapter) return { won: true, chapter, replay: true };
  await db.query('UPDATE character_story SET chapter = chapter + 1, boss_attempts = 0, updated_at = now() WHERE character_id = $1', [playerFighter.id]);
  const items = [];
  for (const [key, quantity] of chapter.rewards.items ?? []) {
    const it = (await db.query('SELECT id, name_ar FROM items WHERE key = $1', [key])).rows[0];
    if (it) items.push({ itemId: it.id, name: it.name_ar, quantity });
  }
  let factionId = null;
  if (chapter.rewards.factionRep) factionId = (await db.query('SELECT id FROM factions WHERE key = $1', [chapter.rewards.factionRep[0]])).rows[0]?.id ?? null;
  const rewards = await grantRewards(db, playerFighter.id, {
    xp: chapter.rewards.xp,
    nx: chapter.rewards.nx,
    reputation: 10 + chapter.index * 4,
    items,
    factionId,
    factionRep: chapter.rewards.factionRep?.[1] ?? 0,
    kind: 'story',
    note: `القصة: ${chapter.title}`,
  });
  await audit(
    {
      actorId: null,
      action: 'story_chapter',
      targetType: 'character',
      targetId: playerFighter.id,
      after: { chapter: chapter.key, attempts: progress.bossAttempts + 1 },
    },
    db,
  );
  return { won: true, chapter, rewards, text: describeRewards(rewards), next: chapterAt(chapter.index + 1), hasChoice: Boolean(chapter.choice) };
}

/** Server-wide progress for the chapters screen. */
export async function storyLeaders(limit = 5) {
  const { rows } = await getPool().query(
    `SELECT c.name, c.class_key, s.chapter FROM character_story s JOIN characters c ON c.id = s.character_id
     WHERE s.chapter > 0 ORDER BY s.chapter DESC, s.updated_at ASC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ name: r.name, className: CLASS_BY_KEY[r.class_key]?.nameAr ?? null, chapter: r.chapter }));
}

/** Staff tool: sets how many chapters a character has completed (0 restarts the saga). */
export async function setStoryProgress(characterId, chapters, { actorId, reason }) {
  const n = Math.max(0, Math.min(CHAPTERS.length, chapters));
  const keep = CHAPTERS.slice(0, n).map((c) => c.key);
  await getPool().query('INSERT INTO character_story (character_id) VALUES ($1) ON CONFLICT DO NOTHING', [characterId]);
  const before = await progressOf(characterId);
  // Decisions of chapters that are no longer completed are forgotten.
  const choices = Object.fromEntries(Object.entries(before.choices).filter(([k]) => keep.includes(k)));
  await getPool().query('UPDATE character_story SET chapter = $2, choices = $3, boss_attempts = 0, updated_at = now() WHERE character_id = $1', [
    characterId,
    n,
    JSON.stringify(choices),
  ]);
  await audit({
    actorId,
    action: 'admin_action',
    targetType: 'character',
    targetId: characterId,
    before: { chapter: before.chapter },
    after: { chapter: n },
    reason: reason ?? 'story progress',
  });
}
