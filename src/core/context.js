import { CooldownManager, RateLimiter, KeyedMutex } from './cooldowns.js';

/**
 * Process-wide singletons wired at boot (and replaced in tests).
 * Services import from here instead of reaching into Discord or env directly.
 */
export const app = {
  env: null,
  client: null,
  permConfig: {
    ownerIds: [],
    adminRoleIds: [],
    moderatorRoleIds: [],
    eventManagerRoleIds: [],
    loreManagerRoleIds: [],
    trustDiscordAdmin: true,
  },
  cooldowns: new CooldownManager(),
  commandLimiter: new RateLimiter({ limit: 6, windowMs: 10_000 }),
  buttonLimiter: new RateLimiter({ limit: 10, windowMs: 6_000 }),
  userLocks: new KeyedMutex(),
  /** Called by the audit service to mirror admin logs into a Discord channel. */
  logSink: null,
};
