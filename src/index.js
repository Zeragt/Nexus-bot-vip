import { Client, GatewayIntentBits, Partials, Events, ActivityType, EmbedBuilder } from 'discord.js';
import { loadEnv } from './config/env.js';
import { logger, scrub } from './core/logger.js';
import { app } from './core/context.js';
import { CooldownManager, pgCooldownStore } from './core/cooldowns.js';
import { permissionConfigFromEnv } from './core/permissions.js';
import { createInteractionHandler } from './core/interactions.js';
import { Scheduler } from './core/scheduler.js';
import { initDb, waitForDb, closeDb, getPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { syncContent, syncWorldContent } from './services/content.js';
import { buildRegistry } from './commands/index.js';
import { deployCommands } from './discord/deploy.js';
import { registerTasks } from './tasks.js';
import { handleRpMessage } from './services/rpActivity.js';
import { ACTION_LABELS } from './services/audit.js';
import { COLORS } from './core/ui.js';

const DISALLOWED_INTENTS = 4014;

function makeClient(withMessageContent) {
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
  if (withMessageContent) intents.push(GatewayIntentBits.MessageContent);
  return new Client({
    intents,
    partials: [Partials.Channel],
    allowedMentions: { parse: [], repliedUser: false },
  });
}

/** Mirrors audit entries into LOG_CHANNEL_ID as compact embeds. */
function makeLogSink(env) {
  if (!env.LOG_CHANNEL_ID) return null;
  return async (entry) => {
    if (!app.client?.isReady()) return;
    const channel = await app.client.channels.fetch(env.LOG_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased()) return;
    const fmtJson = (v) => (v ? `\`\`\`json\n${JSON.stringify(v).slice(0, 900)}\n\`\`\`` : null);
    const embed = new EmbedBuilder()
      .setColor(entry.action.includes('deleted') || entry.action.includes('removed') ? COLORS.danger : COLORS.royal)
      .setTitle(`📋 ${ACTION_LABELS[entry.action] ?? entry.action}`)
      .setDescription(
        [
          entry.actorId ? `**المنفّذ:** ${/^\d+$/.test(entry.actorId) ? `<@${entry.actorId}>` : entry.actorId}` : null,
          entry.targetType ? `**الهدف:** ${entry.targetType} \`${entry.targetId ?? ''}\`` : null,
          entry.reason ? `**السبب:** ${entry.reason}` : null,
          entry.before ? `**قبل:**${fmtJson(entry.before)}` : null,
          entry.after ? `**بعد:**${fmtJson(entry.after)}` : null,
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 4000),
      )
      .setTimestamp(new Date());
    await channel.send({ embeds: [embed] });
  };
}

/** Retries transient network failures (Discord or DNS hiccups); a bad token or intents fail fast. */
async function loginWithRetry(client, token, attempts = 6) {
  for (let n = 1; ; n++) {
    try {
      return await client.login(token);
    } catch (err) {
      const fatal = err?.code === 'TokenInvalid' || err?.code === DISALLOWED_INTENTS || /token|disallowed intents/i.test(err?.message ?? '');
      if (fatal || n >= attempts) throw err;
      const wait = Math.min(30_000, 2_000 * 2 ** (n - 1));
      logger.warn({ attempt: n, err: scrub(err.message), retryInMs: wait }, 'Discord login failed; retrying');
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function login(env, registry) {
  const wire = (client) => {
    const onInteraction = createInteractionHandler(registry);
    client.on(Events.InteractionCreate, onInteraction);
    client.on(Events.MessageCreate, (message) => {
      handleRpMessage(message).catch((err) => logger.debug({ err: scrub(err.message) }, 'RP XP failed'));
    });
    client.once(Events.ClientReady, (c) => {
      logger.info({ user: c.user.tag, guilds: c.guilds.cache.size }, 'Nexus is online');
      c.user.setPresence({ activities: [{ name: 'عالم نكسس • /start', type: ActivityType.Playing }], status: 'online' });
    });
    client.on(Events.Error, (err) => logger.error({ err: scrub(err.message) }, 'Discord client error'));
    client.on(Events.Warn, (msg) => logger.warn(msg));
    client.on(Events.ShardDisconnect, (_e, id) => logger.warn({ shard: id }, 'Gateway disconnected; discord.js will reconnect'));
    return client;
  };

  let client = wire(makeClient(env.ENABLE_MESSAGE_CONTENT));
  try {
    await loginWithRetry(client, env.DISCORD_TOKEN);
  } catch (err) {
    const disallowed = err?.code === DISALLOWED_INTENTS || /disallowed intents/i.test(err?.message ?? '');
    if (!disallowed || !env.ENABLE_MESSAGE_CONTENT) throw err;
    logger.warn(
      'Message Content intent is not enabled in the Discord Developer Portal. Starting without it; RP XP will use a flat amount per message. ' +
        'Enable it under Bot → Privileged Gateway Intents, or set ENABLE_MESSAGE_CONTENT=false to silence this.',
    );
    await client.destroy().catch(() => {});
    client = wire(makeClient(false));
    await loginWithRetry(client, env.DISCORD_TOKEN);
  }
  return client;
}

export async function main() {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    logger.fatal(err.message);
    process.exit(1);
  }
  app.env = env;
  app.permConfig = permissionConfigFromEnv(env);
  logger.info({ node: process.version, env: env.NODE_ENV }, 'Starting Nexus');

  const pool = initDb(env.DATABASE_URL, { ssl: env.DATABASE_SSL, max: env.DATABASE_POOL_MAX });
  await waitForDb(pool);
  if (env.RUN_MIGRATIONS) {
    const applied = await migrate(pool);
    logger.info({ applied: applied.length }, applied.length ? 'Database migrated' : 'Database schema up to date');
  }
  // Class and path skills are generated from code; keep the skills table in step with it.
  const synced = await syncContent(pool);
  if (!synced.skipped) logger.info({ skills: synced.skills, fingerprint: synced.fingerprint }, 'Class content synced');
  // v3 items (materials, region gear, secret relics, loot boxes) and shop stock.
  await syncWorldContent(pool);
  app.cooldowns = new CooldownManager({ store: pgCooldownStore(pool) });
  app.logSink = makeLogSink(env);

  const registry = buildRegistry();
  if (env.DEPLOY_COMMANDS) {
    try {
      await deployCommands(env);
    } catch (err) {
      // A failed deploy shouldn't keep the bot offline: the previously registered commands still work.
      logger.error({ err: scrub(err.message) }, 'Slash command deploy failed');
    }
  }

  // Signal handlers go in before login so a stop during startup still closes the database cleanly.
  let scheduler = null;
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    await scheduler?.stop().catch(() => {});
    await app.client?.destroy().catch(() => {});
    await closeDb();
    logger.info('Goodbye');
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  app.client = await login(env, registry);
  scheduler = registerTasks(new Scheduler(getPool()));
  await scheduler.start();
}

process.on('unhandledRejection', (reason) => logger.error({ err: scrub(reason?.stack ?? String(reason)) }, 'Unhandled promise rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err: scrub(err.stack ?? err.message) }, 'Uncaught exception');
  process.exit(1);
});
