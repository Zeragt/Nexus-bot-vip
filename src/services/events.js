import crypto from 'node:crypto';
import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { defaultRng } from '../engine/rng.js';
import { requireByUser, saveVitals } from './characters.js';
import { grantRewards, describeRewards } from './rewards.js';
import { audit } from './audit.js';

function mapEvent(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    locationId: r.location_id,
    location: r.loc_name ?? null,
    status: r.status,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    currentPhase: r.current_phase,
    maxParticipants: r.max_participants,
    xpReward: r.xp_reward,
    nxReward: r.nx_reward,
    rewardItems: r.reward_items ?? [],
    enemies: r.enemies ?? [],
    objectives: r.objectives,
    channelId: r.channel_id,
    messageId: r.message_id,
    rewardsPaid: r.rewards_paid,
    participants: r.participant_count ?? 0,
  };
}

const SELECT = `SELECT e.*, l.name_ar AS loc_name,
  (SELECT count(*)::int FROM event_participants p WHERE p.event_id = e.id) AS participant_count
  FROM events e LEFT JOIN locations l ON l.id = e.location_id`;

export async function getEvent(id, db = getPool()) {
  const { rows } = await db.query(`${SELECT} WHERE e.id = $1`, [Number(id) || 0]);
  if (!rows[0]) return null;
  const ev = mapEvent(rows[0]);
  ev.phases = (await db.query('SELECT * FROM event_phases WHERE event_id = $1 ORDER BY position', [ev.id])).rows;
  return ev;
}

export async function listEvents({ includeEnded = false } = {}) {
  const { rows } = await getPool().query(
    `${SELECT} ${includeEnded ? '' : "WHERE e.status IN ('scheduled','active')"} ORDER BY (e.status = 'active') DESC, e.starts_at LIMIT 15`,
  );
  return rows.map(mapEvent);
}

export async function eventAutocomplete(query) {
  const { rows } = await getPool().query(
    "SELECT id, title, status FROM events WHERE status <> 'cancelled' AND title ILIKE $1 ORDER BY starts_at DESC LIMIT 25",
    [`%${query ?? ''}%`],
  );
  const label = { scheduled: 'قادم', active: 'جارٍ', ended: 'انتهى' };
  return rows.map((r) => ({ name: `#${r.id} ${r.title} (${label[r.status] ?? r.status})`.slice(0, 100), value: String(r.id) }));
}

export async function createEvent(data, { actorId }) {
  if (!(data.endsAt > data.startsAt)) throw new UserError('وقت النهاية يجب أن يكون بعد البداية');
  return tx(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO events (title, description, location_id, status, starts_at, ends_at, max_participants, xp_reward, nx_reward, reward_items, enemies, objectives, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        data.title,
        data.description ?? '',
        data.locationId ?? null,
        data.startsAt <= new Date() ? 'active' : 'scheduled',
        data.startsAt,
        data.endsAt,
        data.maxParticipants ?? null,
        data.xp ?? 0,
        data.nx ?? 0,
        JSON.stringify(data.rewardItems ?? []),
        JSON.stringify(data.enemies ?? []),
        data.objectives ?? '',
        actorId,
      ],
    );
    const id = rows[0].id;
    const phases = data.phases?.length ? data.phases : [];
    for (const [i, p] of phases.entries()) {
      await db.query('INSERT INTO event_phases (event_id, position, title, description, choices) VALUES ($1,$2,$3,$4,$5)', [
        id,
        i + 1,
        p.title,
        p.description ?? '',
        JSON.stringify(p.choices ?? []),
      ]);
    }
    if (phases.length && data.startsAt <= new Date()) await activatePhase(db, id, 1);
    await audit({ actorId, action: 'event_created', targetType: 'event', targetId: id, after: { title: data.title } }, db);
    return getEvent(id, db);
  });
}

async function activatePhase(db, eventId, position) {
  await db.query("UPDATE event_phases SET status = 'active' WHERE event_id = $1 AND position = $2", [eventId, position]);
  await db.query('UPDATE events SET current_phase = $2 WHERE id = $1', [eventId, position]);
}

export async function addPhase(eventId, { title, description, choices }, { actorId }) {
  return tx(async (db) => {
    const ev = await getEvent(eventId, db);
    if (!ev) throw new UserError('الحدث غير موجود');
    if (ev.status === 'ended' || ev.status === 'cancelled') throw new UserError('الحدث انتهى');
    const pos = ev.phases.length + 1;
    await db.query('INSERT INTO event_phases (event_id, position, title, description, choices) VALUES ($1,$2,$3,$4,$5)', [
      eventId,
      pos,
      title,
      description ?? '',
      JSON.stringify(choices ?? []),
    ]);
    if (ev.status === 'active' && ev.currentPhase === 0) await activatePhase(db, eventId, pos);
    await audit({ actorId, action: 'admin_action', targetType: 'event', targetId: eventId, after: { phase: title }, reason: 'phase added' }, db);
    return getEvent(eventId, db);
  });
}

export async function join(userId, eventId) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db);
    const ev = (await db.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [eventId])).rows[0];
    if (!ev || !['scheduled', 'active'].includes(ev.status)) throw new UserError('هذا الحدث غير متاح للانضمام');
    const count = (await db.query('SELECT count(*)::int AS n FROM event_participants WHERE event_id = $1', [eventId])).rows[0].n;
    if (ev.max_participants && count >= ev.max_participants) throw new UserError('اكتمل عدد المشاركين');
    const res = await db.query('INSERT INTO event_participants (event_id, character_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eventId, ch.id]);
    if (!res.rowCount) throw new UserError('أنت مشارك في هذا الحدث بالفعل');
    return { event: ev, character: ch, count: count + 1 };
  });
}

export async function leave(userId, eventId) {
  const ch = await requireByUser(userId);
  const { rowCount } = await getPool().query(
    "DELETE FROM event_participants p USING events e WHERE p.event_id = e.id AND e.id = $1 AND p.character_id = $2 AND e.status IN ('scheduled','active')",
    [eventId, ch.id],
  );
  if (!rowCount) throw new UserError('لست مشاركاً في هذا الحدث');
}

/** Participants vote on the active phase's choices; the result shapes the next phase. */
export async function vote(userId, eventId, choiceIndex) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db);
    const ev = await getEvent(eventId, db);
    if (!ev || ev.status !== 'active') throw new UserError('الحدث غير جارٍ');
    const phase = ev.phases.find((p) => p.position === ev.currentPhase && p.status === 'active');
    if (!phase || !phase.choices.length) throw new UserError('لا يوجد تصويت في هذه المرحلة');
    if (!(choiceIndex >= 0 && choiceIndex < phase.choices.length)) throw new UserError('خيار غير صالح');
    const res = await db.query(
      `UPDATE event_participants SET choices = jsonb_set(choices, ARRAY[$3::text], to_jsonb($4::int)) WHERE event_id = $1 AND character_id = $2`,
      [eventId, ch.id, String(phase.position), choiceIndex],
    );
    if (!res.rowCount) throw new UserError('انضم إلى الحدث أولاً لتصوّت');
    return { choice: phase.choices[choiceIndex], phase };
  });
}

/** Resolves the current phase (tallying votes into its outcome) and activates the next one. */
export async function advance(eventId, { actorId, note = null }) {
  return tx(async (db) => {
    const ev = await getEvent(eventId, db);
    if (!ev || ev.status !== 'active') throw new UserError('الحدث غير جارٍ');
    const phase = ev.phases.find((p) => p.position === ev.currentPhase);
    let outcome = null;
    if (phase) {
      const tally = (
        await db.query(
          `SELECT (choices->>$2)::int AS c, count(*)::int AS n FROM event_participants WHERE event_id = $1 AND choices ? $2 GROUP BY 1 ORDER BY 2 DESC`,
          [eventId, String(phase.position)],
        )
      ).rows;
      const winner = tally[0] ? phase.choices[tally[0].c] : null;
      outcome = { tally: Object.fromEntries(tally.map((t) => [phase.choices[t.c], t.n])), winner, note };
      await db.query("UPDATE event_phases SET status = 'resolved', outcome = $2 WHERE id = $1", [phase.id, JSON.stringify(outcome)]);
    }
    const next = ev.phases.find((p) => p.position === ev.currentPhase + 1);
    if (next) await activatePhase(db, eventId, next.position);
    await audit(
      { actorId, action: 'admin_action', targetType: 'event', targetId: eventId, after: { resolved: phase?.title, outcome }, reason: 'phase advanced' },
      db,
    );
    return { event: await getEvent(eventId, db), resolved: phase, outcome, next };
  });
}

export async function addContribution(eventId, characterId, amount, { actorId }) {
  const { rowCount } = await getPool().query('UPDATE event_participants SET contribution = contribution + $3 WHERE event_id = $1 AND character_id = $2', [
    eventId,
    characterId,
    amount,
  ]);
  if (!rowCount) throw new UserError('هذه الشخصية ليست مشاركة في الحدث');
  await audit({
    actorId,
    action: 'admin_action',
    targetType: 'event',
    targetId: eventId,
    after: { characterId, contribution: amount },
    reason: 'contribution',
  });
}

/**
 * Ends an event and pays every participant once (rewards_paid makes it idempotent).
 * Top contributors get a 50% bonus.
 */
export async function endEvent(eventId, { actorId, cancel = false }) {
  return tx(async (db) => {
    const ev = (await db.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [eventId])).rows[0];
    if (!ev || ['ended', 'cancelled'].includes(ev.status)) throw new UserError('الحدث منتهٍ بالفعل');
    await db.query("UPDATE event_phases SET status = 'resolved' WHERE event_id = $1 AND status = 'active'", [eventId]);
    if (cancel) {
      await db.query("UPDATE events SET status = 'cancelled' WHERE id = $1", [eventId]);
      await audit({ actorId, action: 'event_ended', targetType: 'event', targetId: eventId, reason: 'cancelled' }, db);
      return { event: await getEvent(eventId, db), paid: 0 };
    }
    await db.query("UPDATE events SET status = 'ended', ends_at = LEAST(ends_at, now()) WHERE id = $1", [eventId]);
    let paid = 0;
    if (!ev.rewards_paid) {
      const parts = (await db.query('SELECT character_id, contribution FROM event_participants WHERE event_id = $1 ORDER BY contribution DESC', [eventId]))
        .rows;
      const top = parts.length ? parts[0].contribution : 0;
      const items = [];
      for (const ri of ev.reward_items ?? []) {
        const it = (await db.query('SELECT id, name_ar FROM items WHERE key = $1', [ri.key])).rows[0];
        if (it) items.push({ itemId: it.id, name: it.name_ar, quantity: ri.quantity ?? 1 });
      }
      for (const p of parts) {
        const bonus = top > 0 && p.contribution === top ? 1.5 : 1;
        await grantRewards(db, p.character_id, {
          xp: Math.round(ev.xp_reward * bonus),
          nx: Math.round(ev.nx_reward * bonus),
          items,
          kind: 'event_reward',
          note: `مكافأة حدث: ${ev.title}`,
        });
        paid++;
      }
      await db.query('UPDATE events SET rewards_paid = TRUE WHERE id = $1', [eventId]);
    }
    await audit({ actorId, action: 'event_ended', targetType: 'event', targetId: eventId, after: { paid } }, db);
    return { event: await getEvent(eventId, db), paid };
  });
}

export async function setEventMessage(eventId, channelId, messageId) {
  await getPool().query('UPDATE events SET channel_id = $2, message_id = $3 WHERE id = $1', [eventId, channelId, messageId]);
}

/** Scheduler: start due events, auto-end expired ones. */
export async function tickEvents() {
  const db = getPool();
  const started = (await db.query("UPDATE events SET status = 'active' WHERE status = 'scheduled' AND starts_at <= now() RETURNING id")).rows;
  for (const { id } of started) {
    await tx(async (c) => {
      const first = (await c.query("SELECT position FROM event_phases WHERE event_id = $1 AND status = 'pending' ORDER BY position LIMIT 1", [id])).rows[0];
      if (first) await activatePhase(c, id, first.position);
    });
  }
  const due = (await db.query("SELECT id FROM events WHERE status = 'active' AND ends_at <= now()")).rows;
  const ended = [];
  for (const { id } of due) {
    try {
      ended.push(await endEvent(id, { actorId: 'scheduler' }));
    } catch {
      // already ended concurrently
    }
  }
  return { started: started.map((s) => s.id), ended };
}

// Random events -----------------------------------------------------------

/** Rolls each enabled definition (respecting probability and cooldown) and returns one to spawn. */
export async function rollRandomEvent(rng = defaultRng) {
  const { rows } = await getPool().query(
    `SELECT * FROM random_event_definitions WHERE enabled
       AND (last_triggered_at IS NULL OR last_triggered_at < now() - make_interval(mins => cooldown_minutes))`,
  );
  const shuffled = [...rows].sort(() => rng.next() - 0.5);
  return shuffled.find((d) => rng.chance(d.probability)) ?? null;
}

export async function spawnRandomEvent(def, { channelId, locationKey }, rng = defaultRng) {
  return tx(async (db) => {
    const key = locationKey ?? (def.location_keys.length ? rng.pick(def.location_keys) : null);
    const loc = key ? (await db.query('SELECT id, name_ar, key FROM locations WHERE key = $1', [key])).rows[0] : null;
    const id = crypto.randomUUID();
    await db.query(
      'INSERT INTO random_event_instances (id, def_key, location_id, channel_id, expires_at) VALUES ($1,$2,$3,$4, now() + make_interval(mins => $5))',
      [id, def.key, loc?.id ?? null, channelId, def.duration_minutes],
    );
    await db.query('UPDATE random_event_definitions SET last_triggered_at = now() WHERE key = $1', [def.key]);
    return { id, def, location: loc };
  });
}

export async function setRandomEventMessage(id, messageId) {
  await getPool().query('UPDATE random_event_instances SET message_id = $2 WHERE id = $1', [id, messageId]);
}

const rollRange = (r, rng) => (Array.isArray(r) ? rng.int(r[0], r[1]) : Number(r) || 0);

/** First N characters standing in the right location can claim the reward. */
export async function claimRandomEvent(instanceId, userId, rng = defaultRng) {
  return tx(async (db) => {
    const inst = (
      await db.query(
        `SELECT i.*, d.name_ar, d.rewards, d.max_claims, l.name_ar AS loc_name FROM random_event_instances i
         JOIN random_event_definitions d ON d.key = i.def_key LEFT JOIN locations l ON l.id = i.location_id
         WHERE i.id = $1 FOR UPDATE OF i`,
        [instanceId],
      )
    ).rows[0];
    if (!inst || new Date(inst.expires_at) < new Date()) throw new UserError('انتهى هذا الحدث');
    const ch = await requireByUser(userId, db, { lock: true });
    if (inst.location_id && ch.location?.id !== inst.location_id) throw new UserError(`يجب أن تكون في ${inst.loc_name} لتشارك. سافر عبر /travel`);
    const claims = (await db.query('SELECT count(*)::int AS n FROM random_event_claims WHERE instance_id = $1', [instanceId])).rows[0].n;
    if (claims >= inst.max_claims) throw new UserError('سبقك آخرون... نفدت المكافآت');
    const ins = await db.query('INSERT INTO random_event_claims (instance_id, character_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [instanceId, ch.id]);
    if (!ins.rowCount) throw new UserError('شاركت في هذا الحدث بالفعل');
    const r = inst.rewards ?? {};
    const items = [];
    for (const [key, qty] of r.items ?? []) {
      const it = (await db.query('SELECT id, name_ar FROM items WHERE key = $1', [key])).rows[0];
      if (it) items.push({ itemId: it.id, name: it.name_ar, quantity: qty });
    }
    if (r.heal) await saveVitals(db, ch, { hp: ch.maxHp, energy: ch.maxEnergy });
    const summary = await grantRewards(db, ch.id, {
      xp: rollRange(r.xp, rng),
      nx: rollRange(r.nx, rng),
      reputation: r.reputation ?? 0,
      items,
      kind: 'random_event',
      note: `حدث: ${inst.name_ar}`,
    });
    return {
      name: inst.name_ar,
      summary,
      text: [r.heal ? 'شفاء كامل' : null, describeRewards(summary)].filter(Boolean).join('  •  '),
      remaining: inst.max_claims - claims - 1,
      character: ch,
    };
  });
}

export async function listRandomEventDefs() {
  const { rows } = await getPool().query('SELECT * FROM random_event_definitions ORDER BY key');
  return rows;
}

export async function setRandomEventEnabled(key, enabled, { actorId }) {
  const { rowCount } = await getPool().query('UPDATE random_event_definitions SET enabled = $2 WHERE key = $1', [key, enabled]);
  if (!rowCount) throw new UserError('الحدث العشوائي غير موجود');
  await audit({ actorId, action: 'admin_action', targetType: 'random_event', targetId: key, after: { enabled } });
}
