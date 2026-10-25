import { recordProgress } from './quests.js';
import { trackDaily, trackWorld } from './dailies.js';
import { logger } from '../core/logger.js';

/** Game events that also advance hand-made quest objectives (/gm quest). */
const CLASSIC = { hunt: 'defeat', work: 'work', travel: 'visit' };

/**
 * One entry point for "the player did something": hand-made quests, daily and weekly boards,
 * and the server-wide goal all listen here. Runs inside the caller's transaction, wrapped in a
 * savepoint so a quest bookkeeping problem can never undo the action itself (a hunt, a trade...).
 *
 * kinds: hunt, hunt_elite, explore, discover, gather, travel, visit, work, rp, craft, buy,
 *        use_item, pvp_fight, pvp_win, story_page, story_boss, daily_reward, daily_board
 */
export async function track(db, characterId, kind, { target = null, amount = 1 } = {}) {
  if (!characterId || !(amount > 0)) return { done: [] };
  await db.query('SAVEPOINT nx_track');
  try {
    const classic = CLASSIC[kind];
    if (classic === 'defeat' || classic === 'work') await recordProgress(db, characterId, classic, target ?? 'any', amount);
    if (classic === 'visit' && target) await recordProgress(db, characterId, 'visit', target, 1);
    const done = await trackDaily(db, characterId, kind, target, amount);
    if (kind === 'travel' && target) done.push(...(await trackDaily(db, characterId, 'visit', target, 1)));
    await trackWorld(db, characterId, kind, amount);
    await db.query('RELEASE SAVEPOINT nx_track');
    return { done };
  } catch (err) {
    await db.query('ROLLBACK TO SAVEPOINT nx_track').catch(() => {});
    logger.warn({ err: err.message, kind, characterId }, 'quest tracking failed');
    return { done: [] };
  }
}
