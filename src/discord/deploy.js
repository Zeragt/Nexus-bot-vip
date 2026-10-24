import crypto from 'node:crypto';
import { REST, Routes } from 'discord.js';
import { logger } from '../core/logger.js';
import { commandPayloads } from '../commands/index.js';
import { getSetting, setSetting } from '../services/settings.js';

/**
 * Registers slash commands. With GUILD_ID they appear instantly in that server;
 * without it they are global (Discord can take up to an hour to propagate).
 * The payload hash is stored so restarts don't re-upload unchanged commands.
 */
export async function deployCommands(env, { force = false, useCache = true } = {}) {
  const body = commandPayloads();
  const scope = env.GUILD_ID ? `guild:${env.GUILD_ID}` : 'global';
  const hash = crypto.createHash('sha256').update(JSON.stringify({ scope, body })).digest('hex');
  if (useCache && !force) {
    const prev = await getSetting('commands_hash', null).catch(() => null);
    if (prev === hash) {
      logger.info({ scope, count: body.length }, 'Slash commands unchanged; skipping deploy');
      return { skipped: true, count: body.length, scope };
    }
  }
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const route = env.GUILD_ID ? Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID) : Routes.applicationCommands(env.CLIENT_ID);
  const res = await rest.put(route, { body });
  if (useCache) await setSetting('commands_hash', hash).catch(() => {});
  logger.info({ scope, count: res.length }, 'Slash commands deployed');
  return { skipped: false, count: res.length, scope };
}
