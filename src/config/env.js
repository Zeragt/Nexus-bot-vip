import { dotenvResult, PROJECT_ROOT } from './dotenv.js';
import { z } from 'zod';

const snowflake = z.string().regex(/^\d{15,22}$/, 'must be a Discord ID');
const idList = z
  .string()
  .optional()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(snowflake));
const bool = (def) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  DISCORD_TOKEN: z.string().min(50, 'DISCORD_TOKEN looks invalid'),
  CLIENT_ID: snowflake,
  GUILD_ID: z
    .string()
    .optional()
    .transform((v) => (v ? v.trim() : ''))
    .pipe(z.union([z.literal(''), snowflake])),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// URL'),
  DIRECT_URL: z.string().optional().default(''),
  DATABASE_SSL: z.enum(['auto', 'require', 'disable']).optional().default('auto'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).optional().default(5),
  LOG_CHANNEL_ID: z.string().optional().default(''),
  OWNER_USER_ID: idList,
  ADMIN_ROLE_ID: idList,
  MODERATOR_ROLE_ID: idList,
  EVENT_MANAGER_ROLE_ID: idList,
  LORE_MANAGER_ROLE_ID: idList,
  TRUST_DISCORD_ADMINISTRATOR: bool(true),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('production'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional().default('info'),
  LOG_PRETTY: bool(true),
  DEPLOY_COMMANDS: bool(true),
  RUN_MIGRATIONS: bool(true),
  ENABLE_MESSAGE_CONTENT: bool(true),
});

let cached;

/** Parses and validates process.env once. Throws a readable error listing every bad key. */
export function loadEnv(source = process.env) {
  if (cached && source === process.env) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // Say where we looked, and which key names were found (never values), so a hosting misconfiguration is obvious.
    const hint =
      source !== process.env
        ? ''
        : dotenvResult.file
          ? `\nRead ${dotenvResult.file}: found ${dotenvResult.keys.length} keys${dotenvResult.keys.length ? ` (${dotenvResult.keys.join(', ')})` : ''}.`
          : `\nNo .env file found next to index.js (${PROJECT_ROOT}). Create a file named exactly ".env" there, or set the variables in the hosting panel.`;
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}${hint}`);
  }
  const env = parsed.data;
  env.DIRECT_URL = env.DIRECT_URL || env.DATABASE_URL;
  if (source === process.env) cached = env;
  return env;
}

/** Database settings only, so scripts like migrate don't need a Discord token. */
export function loadDbEnv(source = process.env) {
  const url = source.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error('DATABASE_URL is missing or not a postgres:// URL');
  return {
    DATABASE_URL: url,
    DIRECT_URL: source.DIRECT_URL || url,
    DATABASE_SSL: source.DATABASE_SSL || 'auto',
    DATABASE_POOL_MAX: Number(source.DATABASE_POOL_MAX) || 5,
  };
}
