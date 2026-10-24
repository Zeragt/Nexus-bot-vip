import crypto from 'node:crypto';
import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { app } from '../core/context.js';
import { combat as C } from '../config/game.js';
import { duration } from '../utils/format.js';
import { createFighter, createBattle, performAction, timeoutTurn, chooseAiAction, passivesFromSkills, CombatError, activeFighter } from '../engine/combat.js';
import { enemiesFor, spawnEnemy, rollLoot } from '../engine/enemies.js';
import { defaultRng } from '../engine/rng.js';
import { requireByUser, loadCharacter, saveVitals, spendEnergy } from './characters.js';
import { activeStatusEffects, removeItem } from './inventory.js';
import { grantRewards, describeRewards } from './rewards.js';
import { recordProgress } from './quests.js';
import { audit } from './audit.js';
import { pathBonus } from '../content/classGen.js';

async function characterSkills(db, characterId) {
  const { rows } = await db.query(
    'SELECT s.*, cs.rank, cs.equipped FROM character_skills cs JOIN skills s ON s.id = cs.skill_id WHERE cs.character_id = $1 ORDER BY s.required_level DESC, s.id',
    [characterId],
  );
  return rows.map(mapSkill);
}

export function mapSkill(s) {
  return {
    key: s.key,
    name: s.name_ar,
    type: s.type,
    energyCost: s.energy_cost,
    cooldownTurns: s.cooldown_turns,
    power: s.power,
    scalingStat: s.scaling_stat,
    effectKey: s.effect_key,
    effectChance: s.effect_chance,
    effectTurns: s.effect_turns,
    target: s.target,
    rank: s.rank ?? 1,
    element: s.element ?? null,
    extra: s.extra ?? {},
    equipped: s.equipped ?? true,
  };
}

/** Consumables usable mid-fight (healing/energy/cleanse), capped to keep fights about skill. */
async function combatItems(db, characterId) {
  const { rows } = await db.query(
    `SELECT i.key, i.name_ar, i.use_effect, ii.quantity FROM inventory_items ii JOIN items i ON i.id = ii.item_id
     WHERE ii.character_id = $1 AND i.usable AND i.use_effect IS NOT NULL
       AND (i.use_effect ? 'heal' OR i.use_effect ? 'energy' OR i.use_effect ? 'cleanse')
     ORDER BY i.value DESC LIMIT 4`,
    [characterId],
  );
  return Object.fromEntries(
    rows.map((r) => [
      r.key,
      { name: r.name_ar, qty: Math.min(r.quantity, 3), heal: r.use_effect.heal ?? 0, energy: r.use_effect.energy ?? 0, cleanse: Boolean(r.use_effect.cleanse) },
    ]),
  );
}

export async function buildFighter(db, ch) {
  const owned = await characterSkills(db, ch.id);
  // Classed characters fight with their loadout; passives always apply.
  const skills = ch.classKey ? owned.filter((s) => s.type === 'passive' || s.equipped) : owned;
  return createFighter({
    id: ch.id,
    userId: ch.userId,
    name: ch.name,
    level: ch.level,
    hp: ch.hp,
    maxHp: ch.maxHp,
    energy: ch.energy,
    maxEnergy: ch.maxEnergy,
    stats: ch.stats,
    skills,
    passives: passivesFromSkills(skills, pathBonus(ch.subclassKey)),
    items: await combatItems(db, ch.id),
    effects: await activeStatusEffects(db, ch.id),
    look: { classKey: ch.classKey, subclassKey: ch.subclassKey },
  });
}

function mapSession(r) {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    channelId: r.channel_id,
    messageId: r.message_id,
    challengerId: r.challenger_id,
    opponentId: r.opponent_id,
    winnerId: r.winner_id,
    state: r.state,
    turnDeadline: r.turn_deadline,
    createdAt: r.created_at,
  };
}

export async function getSession(id, db = getPool()) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await db.query('SELECT * FROM combat_sessions WHERE id = $1', [id]);
  return rows[0] ? mapSession(rows[0]) : null;
}

async function inCombat(db, characterId) {
  return (await db.query('SELECT session_id FROM combat_locks WHERE character_id = $1', [characterId])).rows[0]?.session_id ?? null;
}

export async function challenge(userId, targetUserId, channelId) {
  if (userId === targetUserId) throw new UserError('لا يمكنك تحدي نفسك');
  const left = await app.cooldowns.remaining(`u:${userId}`, 'challenge');
  if (left > 0) throw new UserError(`انتظر ${duration(left)} قبل إرسال تحدٍّ جديد`);
  const db = getPool();
  const ch = await requireByUser(userId, db);
  const target = await requireByUser(targetUserId, db).catch(() => {
    throw new UserError('هذا المستخدم لا يملك شخصية في نكسس');
  });
  if (await inCombat(db, ch.id)) throw new UserError('أنت في قتال بالفعل');
  if (await inCombat(db, target.id)) throw new UserError(`${target.name} في قتال آخر الآن`);
  if (ch.location?.id !== target.location?.id) throw new UserError(`${target.name} ليس في نفس موقعك (${target.location?.nameAr ?? 'مجهول'})`);
  if (ch.hp < ch.maxHp * 0.2) throw new UserError('صحتك منخفضة جداً للقتال. استرح أو استخدم جرعة');
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO combat_sessions (id, kind, status, channel_id, challenger_id, opponent_id, turn_deadline)
     VALUES ($1, 'pvp', 'pending', $2, $3, $4, now() + make_interval(secs => $5))`,
    [id, channelId, ch.id, target.id, C.challengeSeconds],
  );
  await app.cooldowns.set(`u:${userId}`, 'challenge', 30_000, { persist: false });
  return { id, challenger: ch, opponent: target };
}

export async function setMessage(sessionId, channelId, messageId) {
  await getPool().query('UPDATE combat_sessions SET channel_id = $2, message_id = $3 WHERE id = $1', [sessionId, channelId, messageId]);
}

async function lockFighters(db, sessionId, ids) {
  for (const cid of ids) {
    try {
      await db.query('SAVEPOINT lockf');
      await db.query('INSERT INTO combat_locks (character_id, session_id) VALUES ($1, $2)', [cid, sessionId]);
      await db.query('RELEASE SAVEPOINT lockf');
    } catch (err) {
      await db.query('ROLLBACK TO SAVEPOINT lockf');
      if (err.code === '23505') throw new UserError('أحد الطرفين دخل قتالاً آخر');
      throw err;
    }
  }
}

export async function respond(sessionId, userId, accept, rng = defaultRng) {
  return tx(async (db) => {
    const row = (await db.query('SELECT * FROM combat_sessions WHERE id = $1 FOR UPDATE', [sessionId])).rows[0];
    if (!row || row.status !== 'pending') throw new UserError('هذا التحدي لم يعد صالحاً');
    const opp = await loadCharacter(db, row.opponent_id, { lock: true });
    if (!opp || opp.userId !== userId) throw new UserError('هذا التحدي ليس موجهاً إليك');
    if (new Date(row.turn_deadline) < new Date()) {
      await db.query("UPDATE combat_sessions SET status = 'expired', finished_at = now() WHERE id = $1", [sessionId]);
      throw new UserError('انتهت مهلة التحدي');
    }
    if (!accept) {
      await db.query("UPDATE combat_sessions SET status = 'declined', finished_at = now() WHERE id = $1", [sessionId]);
      return { declined: true, session: mapSession(row) };
    }
    const chal = await loadCharacter(db, row.challenger_id, { lock: true });
    if (!chal) throw new UserError('صاحب التحدي لم يعد موجوداً');
    await lockFighters(db, sessionId, [chal.id, opp.id]);
    const state = createBattle(await buildFighter(db, chal), await buildFighter(db, opp), rng);
    const saved = await saveState(db, sessionId, state, 'active');
    await audit({ actorId: userId, action: 'combat_started', targetType: 'combat', targetId: sessionId, after: { a: chal.code, b: opp.code } }, db);
    return { declined: false, session: saved };
  });
}

async function saveState(db, sessionId, state, status = 'active') {
  const { rows } = await db.query(
    `UPDATE combat_sessions SET state = $2, status = $3, version = version + 1,
       turn_deadline = CASE WHEN $3 = 'active' THEN now() + make_interval(secs => $4) ELSE NULL END
     WHERE id = $1 RETURNING *`,
    [sessionId, JSON.stringify(state), status, C.turnSeconds],
  );
  return mapSession(rows[0]);
}

/** Lets monsters take their turns until it's a player's move (or the fight ends). */
function runAi(state, rng) {
  let s = state;
  let guard = 0;
  while (!s.finished && activeFighter(s).ai && guard++ < 6) s = performAction(s, chooseAiAction(s, rng), rng);
  return s;
}

export async function act(sessionId, userId, action, rng = defaultRng) {
  return tx(async (db) => {
    const row = (await db.query('SELECT * FROM combat_sessions WHERE id = $1 FOR UPDATE', [sessionId])).rows[0];
    if (!row || row.status !== 'active') throw new UserError('هذا القتال انتهى');
    const current = activeFighter(row.state);
    if (current.userId !== userId) {
      const isParticipant = row.state.fighters.some((f) => f.userId === userId);
      throw new UserError(isParticipant ? 'ليس دورك الآن' : 'أنت لست طرفاً في هذا القتال');
    }
    let state;
    try {
      state = runAi(performAction(row.state, action, rng), rng);
    } catch (err) {
      if (err instanceof CombatError) throw new UserError(err.userMessage);
      throw err;
    }
    if (state.finished) return finalize(db, row, state);
    return { session: await saveState(db, sessionId, state, 'active'), finished: false };
  });
}

/** Ends a fight: persists HP/energy, consumes used items, pays rewards, releases locks. */
async function finalize(db, row, state, rng = defaultRng) {
  const winnerFighter = state.winner != null ? state.fighters[state.winner] : null;
  const summary = { rewards: null, loot: [], text: null };
  for (const f of state.fighters) {
    if (typeof f.id !== 'number') continue;
    const ch = await loadCharacter(db, f.id, { lock: true });
    if (!ch) continue;
    await saveVitals(db, ch, { hp: Math.max(1, f.hp), energy: f.energy });
    for (const [key, n] of Object.entries(f.itemsUsed)) {
      const item = (await db.query('SELECT id FROM items WHERE key = $1', [key])).rows[0];
      if (item && n > 0) await removeItem(db, f.id, item.id, n).catch(() => {});
    }
    if (state.winner == null || state.reason === 'flee') continue;
    const won = winnerFighter?.id === f.id;
    await db.query(`UPDATE characters SET ${won ? 'combat_wins = combat_wins + 1' : 'combat_losses = combat_losses + 1'} WHERE id = $1`, [f.id]);
  }

  const loser = state.winner != null ? state.fighters[1 - state.winner] : null;
  if (state.story) {
    // Story bosses pay chapter rewards instead of hunt loot; losses only count an attempt.
    const { onStoryFight } = await import('./story.js');
    const player = state.fighters.find((f) => typeof f.id === 'number');
    summary.story = await onStoryFight(db, state, player, winnerFighter === player && state.reason !== 'flee');
    summary.rewards = summary.story?.rewards ?? null;
  } else if (winnerFighter && typeof winnerFighter.id === 'number' && state.reason !== 'flee') {
    if (row.kind === 'pve') {
      const enemyKey = loser.id.replace('enemy:', '');
      const locKey = state.locationKey ?? row.state?.locationKey;
      const template = enemiesFor(locKey).find((e) => e.key === enemyKey);
      const lootKeys = template ? rollLoot(template, rng) : [];
      const items = [];
      for (const key of lootKeys) {
        const it = (await db.query('SELECT id, name_ar FROM items WHERE key = $1', [key])).rows[0];
        if (it) items.push({ itemId: it.id, name: it.name_ar, quantity: 1 });
      }
      summary.rewards = await grantRewards(db, winnerFighter.id, {
        xp: 15 + loser.level * 6,
        nx: 8 + loser.level * 4,
        items,
        kind: 'hunt',
        note: `غنيمة: ${loser.name}`,
      });
      await recordProgress(db, winnerFighter.id, 'defeat', locKey);
    } else {
      summary.rewards = await pvpRewards(db, winnerFighter, loser);
    }
  }
  if (summary.rewards) summary.text = describeRewards(summary.rewards);

  const winnerId = winnerFighter && typeof winnerFighter.id === 'number' ? winnerFighter.id : null;
  state.rewardText = summary.text;
  if (summary.story) state.storyResult = { won: summary.story.won, chapter: summary.story.chapter.key, replay: Boolean(summary.story.replay) };
  await db.query(`UPDATE combat_sessions SET state = $2, status = 'finished', winner_id = $3, finished_at = now(), turn_deadline = NULL WHERE id = $1`, [
    row.id,
    JSON.stringify(state),
    winnerId,
  ]);
  for (const f of state.fighters)
    if (typeof f.id === 'number')
      await db.query('INSERT INTO combat_participants (session_id, character_id, side, final_hp) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [
        row.id,
        f.id,
        state.fighters.indexOf(f),
        f.hp,
      ]);
  await db.query('DELETE FROM combat_locks WHERE session_id = $1', [row.id]);
  await audit(
    { actorId: null, action: 'combat_finished', targetType: 'combat', targetId: row.id, after: { winner: winnerFighter?.name ?? null, reason: state.reason } },
    db,
  );
  const fresh = (await db.query('SELECT * FROM combat_sessions WHERE id = $1', [row.id])).rows[0];
  return { session: mapSession(fresh), finished: true, summary };
}

/**
 * PvP XP with anti-farming: no reward for beating the same opponent within the window,
 * a daily cap per character, and nothing for forfeits/timeouts right after accepting.
 */
async function pvpRewards(db, winner, loser) {
  const pairKey = [winner.id, loser.id].sort((a, b) => a - b).join(':');
  const recent = await db.query(`SELECT 1 FROM cooldowns WHERE subject = $1 AND key = 'pvp_reward' AND expires_at > now()`, [`pair:${pairKey}`]);
  if (recent.rowCount) return null;
  const today = await db.query(
    `SELECT count(*)::int AS n FROM combat_sessions WHERE kind = 'pvp' AND status = 'finished' AND winner_id = $1
       AND finished_at > now() - interval '24 hours' AND (state->>'rewardText') IS NOT NULL`,
    [winner.id],
  );
  if (today.rows[0].n >= C.pvpDailyRewardCap) return null;
  await db.query(
    `INSERT INTO cooldowns (subject, key, expires_at) VALUES ($1, 'pvp_reward', now() + make_interval(hours => $2))
     ON CONFLICT (subject, key) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [`pair:${pairKey}`, C.pvpSameOpponentCooldownHours],
  );
  return grantRewards(db, winner.id, { xp: C.pvpXp(loser.level), kind: 'pvp', note: `انتصار على ${loser.name}` });
}

export async function forfeit(userId) {
  const ch = await requireByUser(userId);
  const sid = await inCombat(getPool(), ch.id);
  if (!sid) throw new UserError('لست في قتال حالياً');
  const s = await getSession(sid);
  const turnOwner = activeFighter(s.state).userId === userId;
  if (!turnOwner) {
    // Allow surrender out of turn: swap the active side for the forfeit action.
    return tx(async (db) => {
      const row = (await db.query('SELECT * FROM combat_sessions WHERE id = $1 FOR UPDATE', [sid])).rows[0];
      const state = structuredClone(row.state);
      state.active = state.fighters.findIndex((f) => f.userId === userId);
      return finalize(db, row, performAction(state, { type: 'forfeit' }));
    });
  }
  return act(sid, userId, { type: 'forfeit' });
}

/** Starts a PvE fight against a monster from the current location. */
export async function hunt(userId, rng = defaultRng) {
  const left = await app.cooldowns.remaining(`u:${userId}`, 'hunt');
  if (left > 0) throw new UserError(`استعد قليلاً قبل الصيد التالي (${duration(left)})`);
  const result = await tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const pool = enemiesFor(ch.location?.key);
    if (!pool.length) throw new UserError('لا توجد مخلوقات معادية هنا. اذهب إلى البراري: الغابة، الجبال، البحيرة، الصحراء، الأطلال...');
    if (await inCombat(db, ch.id)) throw new UserError('أنت في قتال بالفعل');
    if (ch.hp < ch.maxHp * 0.2) throw new UserError('صحتك منخفضة جداً. استرح أو استخدم جرعة شفاء');
    await spendEnergy(db, ch, C.huntEnergyCost);
    const template = rng.pick(pool);
    const enemy = spawnEnemy(template, { playerLevel: ch.level, danger: ch.location.danger }, rng);
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO combat_sessions (id, kind, status, challenger_id) VALUES ($1, 'pve', 'active', $2)`, [id, ch.id]);
    await lockFighters(db, id, [ch.id]);
    let state = createBattle(await buildFighter(db, ch), enemy, rng);
    state.locationKey = ch.location.key;
    state = runAi(state, rng);
    if (state.finished) {
      const row = (await db.query('SELECT * FROM combat_sessions WHERE id = $1', [id])).rows[0];
      return finalize(db, row, state, rng);
    }
    return { session: await saveState(db, id, state, 'active'), finished: false };
  });
  await app.cooldowns.set(`u:${userId}`, 'hunt', C.huntCooldownSeconds * 1000, { persist: false });
  return result;
}

/** Starts a one-off PvE fight against a prepared enemy (story bosses). Runs inside the caller's transaction. */
export async function startScriptedFight(db, ch, enemy, extra = {}, rng = defaultRng) {
  if (await inCombat(db, ch.id)) throw new UserError('أنت في قتال بالفعل');
  const id = crypto.randomUUID();
  await db.query(`INSERT INTO combat_sessions (id, kind, status, challenger_id) VALUES ($1, 'pve', 'active', $2)`, [id, ch.id]);
  await lockFighters(db, id, [ch.id]);
  let state = Object.assign(createBattle(await buildFighter(db, ch), enemy, rng), extra);
  state = runAi(state, rng);
  if (state.finished) {
    const row = (await db.query('SELECT * FROM combat_sessions WHERE id = $1', [id])).rows[0];
    return finalize(db, row, state, rng);
  }
  return { session: await saveState(db, id, state, 'active'), finished: false };
}

/** Scheduler: expire stale challenges and resolve turns whose timer ran out. */
export async function processTimeouts(rng = defaultRng) {
  const db = getPool();
  await db.query("UPDATE combat_sessions SET status = 'expired', finished_at = now() WHERE status = 'pending' AND turn_deadline < now()");
  const { rows } = await db.query("SELECT id FROM combat_sessions WHERE status = 'active' AND turn_deadline < now() LIMIT 20");
  const updated = [];
  for (const { id } of rows) {
    const res = await tx(async (c) => {
      const row = (await c.query("SELECT * FROM combat_sessions WHERE id = $1 AND status = 'active' AND turn_deadline < now() FOR UPDATE SKIP LOCKED", [id]))
        .rows[0];
      if (!row) return null;
      const state = runAi(timeoutTurn(row.state, rng), rng);
      if (state.finished) return finalize(c, row, state, rng);
      return { session: await saveState(c, id, state, 'active'), finished: false };
    });
    if (res) updated.push(res);
  }
  return updated;
}

export async function currentSessionFor(userId) {
  const ch = await requireByUser(userId);
  const sid = await inCombat(getPool(), ch.id);
  return sid ? getSession(sid) : null;
}
