import crypto from 'node:crypto';
import { getPool, tx } from '../db/pool.js';
import { cooldowns } from '../config/game.js';
import { grantXp } from './characters.js';
import { getSetting } from './settings.js';
import { locationByChannelName } from './world.js';

const RP = cooldowns.rpXp;

/** XP for one message: grows with length, capped per message. Pure for testing. */
export function rpXpFor(length) {
  if (length < RP.minLength) return 0;
  return Math.min(RP.maxPerMessage, RP.base + Math.floor(length / 100) * RP.perHundredChars);
}

const normalize = (t) => t.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Passive RP activity XP with anti-farming:
 *  - only in RP channels (configured list, or channels matching a location),
 *  - minimum length, per-character cooldown, daily cap, duplicate-text detection.
 * Tupperbox: proxied messages arrive via webhook and are ignored (never punished);
 * the author's original message (seen before Tupperbox deletes it) is what counts,
 * so proxying does not double-count.
 */
export async function handleRpMessage(message, now = new Date()) {
  if (message.author?.bot || message.webhookId || !message.guildId) return null;
  if (!(await getSetting('rp_xp_enabled', true))) return null;
  const channelIds = (await getSetting('rp_channel_ids', [])) ?? [];
  const isRpChannel = channelIds.length
    ? channelIds.includes(message.channelId) || channelIds.includes(message.channel?.parentId)
    : Boolean(await locationByChannelName(message.channel?.name));
  if (!isRpChannel) return null;
  const content = String(message.content ?? '');
  // Without the Message Content intent, content is empty: count a flat minimum instead.
  const length = content ? content.replace(/<a?:\w+:\d+>|https?:\/\/\S+/g, '').trim().length : RP.minLength;
  const xp = rpXpFor(length);
  if (!xp) return null;
  const hash = content ? crypto.createHash('sha1').update(normalize(content)).digest('hex').slice(0, 16) : null;
  const day = now.toISOString().slice(0, 10);

  return tx(async (db) => {
    const ch = (await db.query('SELECT id FROM characters WHERE user_id = $1 ORDER BY slot LIMIT 1', [message.author.id])).rows[0];
    if (!ch) return null;
    const act = (
      await db.query(
        `INSERT INTO rp_activity (character_id, day) VALUES ($1, $2) ON CONFLICT (character_id, day) DO UPDATE SET messages = rp_activity.messages
         RETURNING *`,
        [ch.id, day],
      )
    ).rows[0];
    await db.query('SELECT 1 FROM rp_activity WHERE character_id = $1 AND day = $2 FOR UPDATE', [ch.id, day]);
    const since = act.last_rewarded_at ? (now - new Date(act.last_rewarded_at)) / 1000 : Infinity;
    const blocked = since < RP.cooldownSeconds || act.xp_awarded >= RP.dailyCap || (hash && hash === act.last_hash);
    if (blocked) {
      await db.query('UPDATE rp_activity SET messages = messages + 1 WHERE character_id = $1 AND day = $2', [ch.id, day]);
      return null;
    }
    const amount = Math.min(xp, RP.dailyCap - act.xp_awarded);
    await db.query(
      'UPDATE rp_activity SET messages = messages + 1, xp_awarded = xp_awarded + $3, last_rewarded_at = $4, last_hash = $5 WHERE character_id = $1 AND day = $2',
      [ch.id, day, amount, now, hash],
    );
    const res = await grantXp(db, ch.id, amount);
    return { characterId: ch.id, xp: res.gained, levelsGained: res.levelsGained, level: res.level };
  });
}

export async function rpStats(characterId) {
  const { rows } = await getPool().query('SELECT * FROM rp_activity WHERE character_id = $1 AND day = CURRENT_DATE', [characterId]);
  return rows[0] ?? { messages: 0, xp_awarded: 0 };
}
