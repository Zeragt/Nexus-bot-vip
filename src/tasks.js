import { app } from './core/context.js';
import { logger } from './core/logger.js';
import { info } from './core/ui.js';
import { getPool } from './db/pool.js';
import { processTimeouts } from './services/combat.js';
import { expireTrades } from './services/trades.js';
import { tickEvents, rollRandomEvent, spawnRandomEvent, setRandomEventMessage } from './services/events.js';
import { expireQuests } from './services/quests.js';
import { getSetting } from './services/settings.js';
import { refreshCombatMessage } from './commands/combat.js';
import { refreshEventMessage, randomEventMessage } from './commands/event.js';
import { defaultRng } from './engine/rng.js';

async function fetchMessage(channelId, messageId) {
  if (!channelId || !messageId || !app.client) return null;
  const channel = await app.client.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased() ? channel.messages.fetch(messageId).catch(() => null) : null;
}

export async function combatTimeoutsTask() {
  for (const res of await processTimeouts()) await refreshCombatMessage(res);
}

export async function tradeExpiryTask() {
  for (const t of await expireTrades()) {
    const msg = await fetchMessage(t.channel_id, t.message_id);
    await msg?.edit({ ...info('⌛ انتهت مهلة هذه الصفقة.'), content: null, components: [] }).catch(() => {});
  }
}

export async function eventsTask() {
  const { started, ended } = await tickEvents();
  for (const id of started) await refreshEventMessage(id);
  for (const r of ended) await refreshEventMessage(r.event.id);
}

export async function questExpiryTask() {
  const n = await expireQuests();
  if (n) logger.info({ expired: n }, 'Quests expired');
}

/** Finds a channel for a random event: configured channels first, then a location's RP channel. */
async function randomEventChannel(def, rng) {
  const ids = (await getSetting('random_event_channel_ids', [])) ?? [];
  if (ids.length) return app.client.channels.fetch(rng.pick(ids)).catch(() => null);
  if (!def.location_keys?.length) return null;
  const { rows } = await getPool().query('SELECT channel_name FROM locations WHERE key = ANY($1::text[]) AND channel_name IS NOT NULL', [def.location_keys]);
  for (const { channel_name: name } of rows) {
    const ch = app.client.channels.cache.find((c) => c.isTextBased() && c.name === name);
    if (ch) return ch;
  }
  return null;
}

export async function randomEventsTask(rng = defaultRng) {
  if (!app.client?.isReady() || !(await getSetting('random_events_enabled', true))) return;
  const def = await rollRandomEvent(rng);
  if (!def) return;
  const channel = await randomEventChannel(def, rng);
  if (!channel?.isTextBased()) return;
  const inst = await spawnRandomEvent(def, { channelId: channel.id }, rng);
  const msg = await channel.send(await randomEventMessage(inst));
  await setRandomEventMessage(inst.id, msg.id);
  logger.info({ event: def.key, channel: channel.id }, 'Random event spawned');
}

export async function cleanupTask() {
  const db = getPool();
  await db.query('DELETE FROM cooldowns WHERE expires_at < now()');
  await db.query("DELETE FROM random_event_instances WHERE expires_at < now() - interval '1 day'");
  await db.query('DELETE FROM rp_activity WHERE day < CURRENT_DATE - 30');
  await db.query('DELETE FROM character_status_effects WHERE expires_at < now()');
  await db.query('DELETE FROM guild_invites WHERE expires_at < now()');
  app.cooldowns.sweep();
  app.commandLimiter.sweep?.();
  app.buttonLimiter.sweep?.();
}

export function registerTasks(scheduler) {
  return scheduler
    .add('combat_timeouts', 10_000, combatTimeoutsTask, { leaseMs: 60_000 })
    .add('trade_expiry', 60_000, tradeExpiryTask)
    .add('events', 60_000, eventsTask)
    .add('quest_expiry', 5 * 60_000, questExpiryTask)
    .add('random_events', 10 * 60_000, randomEventsTask)
    .add('cleanup', 60 * 60_000, cleanupTask);
}
