import { describe, it, expect } from 'vitest';
import { cid, parseCid } from '../../src/core/customId.js';
import { resolveRoles, can, CAPABILITIES } from '../../src/core/permissions.js';
import { CooldownManager, RateLimiter, KeyedMutex } from '../../src/core/cooldowns.js';
import { parseAmount, cleanText, characterSchema, slugify } from '../../src/utils/validation.js';
import { UserError, translateDbError } from '../../src/core/errors.js';
import { loadEnv } from '../../src/config/env.js';
import { buildPoolConfig } from '../../src/db/pool.js';
import { scrub } from '../../src/core/logger.js';
import { parseKv } from '../../src/commands/admin.js';
import { rpXpFor } from '../../src/services/rpActivity.js';
import { cooldowns } from '../../src/config/game.js';

describe('customId', () => {
  it('round-trips', () => {
    expect(parseCid(cid('pf', 'stats', 12, '123'))).toEqual({ handler: 'pf', action: 'stats', args: ['12', '123'] });
  });
  it('rejects separators and overlong ids', () => {
    expect(() => cid('a', 'b', 'x:y')).toThrow();
    expect(() => cid('a', 'b', 'x'.repeat(120))).toThrow();
  });
});

describe('permissions', () => {
  const config = {
    ownerIds: ['1'],
    adminRoleIds: ['10'],
    moderatorRoleIds: ['20'],
    eventManagerRoleIds: ['30'],
    loreManagerRoleIds: ['40'],
    trustDiscordAdmin: false,
  };
  it('resolves roles by ID only', () => {
    expect([...resolveRoles({ userId: '1' }, config)]).toEqual(['owner']);
    expect(resolveRoles({ userId: '2', roleIds: ['20', '40'] }, config)).toEqual(new Set(['moderator', 'loreManager']));
  });
  it('ignores Discord Administrator unless trusted', () => {
    expect(resolveRoles({ userId: '2', isDiscordAdmin: true }, config).size).toBe(0);
    expect(resolveRoles({ userId: '2', isDiscordAdmin: true }, { ...config, trustDiscordAdmin: true }).has('admin')).toBe(true);
  });
  it('maps capabilities', () => {
    expect(can(new Set(['moderator']), 'deleteCharacters')).toBe(false);
    expect(can(new Set(['admin']), 'deleteCharacters')).toBe(true);
    expect(can(new Set(['loreManager']), 'manageLore')).toBe(true);
    expect(can(new Set(), 'viewLogs')).toBe(false);
    for (const roles of Object.values(CAPABILITIES)) expect(roles).toContain('owner');
    expect(() => can(new Set(['owner']), 'nope')).toThrow();
  });
});

describe('cooldowns and limiters', () => {
  it('cooldown manager tracks time', async () => {
    let t = 1000;
    const cd = new CooldownManager({ now: () => t });
    expect(await cd.consume('u', 'k', 500)).toBe(0);
    expect(await cd.consume('u', 'k', 500)).toBe(500);
    t += 600;
    expect(await cd.remaining('u', 'k')).toBe(0);
  });
  it('rate limiter blocks bursts', () => {
    let t = 0;
    const rl = new RateLimiter({ limit: 3, windowMs: 1000, now: () => t });
    expect([rl.hit('a'), rl.hit('a'), rl.hit('a'), rl.hit('a')]).toEqual([true, true, true, false]);
    t = 1500;
    expect(rl.hit('a')).toBe(true);
  });
  it('keyed mutex serialises per key', async () => {
    const m = new KeyedMutex();
    const order = [];
    const slow = (label, ms) =>
      m.run('k', async () => {
        order.push(`${label}+`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${label}-`);
      });
    await Promise.all([slow('a', 30), slow('b', 1)]);
    expect(order).toEqual(['a+', 'a-', 'b+', 'b-']);
  });
  it('keyed mutex survives a throwing task', async () => {
    const m = new KeyedMutex();
    await expect(
      m.run('k', async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    expect(await m.run('k', async () => 5)).toBe(5);
  });
});

describe('validation', () => {
  it('parses amounts', () => {
    expect(parseAmount('1,500')).toBe(1500);
    expect(parseAmount('1.5k')).toBe(1500);
    expect(parseAmount('2m')).toBe(2_000_000);
    expect(parseAmount('٣٠٠')).toBe(300);
    for (const bad of ['-5', '0', '1.5', 'abc', '', '99999999999']) expect(() => parseAmount(bad), bad).toThrow(UserError);
  });
  it('cleans text and defuses mass mentions', () => {
    expect(cleanText('hi\u0000 @everyone')).not.toContain('\u0000');
    expect(cleanText('@everyone')).not.toBe('@everyone');
  });
  it('validates character input', () => {
    expect(characterSchema.safeParse({ name: 'كايل' }).success).toBe(true);
    expect(characterSchema.safeParse({ name: '' }).success).toBe(false);
  });
  it('slugifies Arabic and English', () => {
    expect(slugify('Origin of Nexus!')).toBe('origin-of-nexus');
    expect(slugify('أصل نكسس')).toBe('أصل-نكسس');
  });
  it('admin key=value parser', () => {
    expect(parseKv('heal=50, buff=attack_up, minutes=20')).toEqual({ heal: 50, buff: 'attack_up', minutes: 20 });
    expect(parseKv('')).toEqual({});
  });
  it('rp xp ignores short messages and caps long ones', () => {
    expect(rpXpFor(5)).toBe(0);
    expect(rpXpFor(cooldowns.rpXp.minLength)).toBeGreaterThan(0);
    expect(rpXpFor(100000)).toBe(cooldowns.rpXp.maxPerMessage);
  });
});

describe('errors', () => {
  it('translates unique violations into friendly messages', () => {
    expect(translateDbError({ code: '23505' })).toBeTruthy();
    expect(translateDbError(new Error('boom'))).toBeFalsy();
  });
});

describe('env and db config', () => {
  const base = {
    DISCORD_TOKEN: 'x'.repeat(70),
    CLIENT_ID: '123456789012345678',
    DATABASE_URL: 'postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require&channel_binding=require',
  };
  it('parses a minimal env with defaults', () => {
    const env = loadEnv({ ...base, ADMIN_ROLE_ID: '123456789012345678, 223456789012345678' });
    expect(env.ADMIN_ROLE_ID).toHaveLength(2);
    expect(env.RUN_MIGRATIONS).toBe(true);
    expect(env.DIRECT_URL).toBe(base.DATABASE_URL);
  });
  it('lists every invalid key', () => {
    expect(() => loadEnv({ ...base, CLIENT_ID: 'abc', ADMIN_ROLE_ID: 'role-name' })).toThrow(/CLIENT_ID[\s\S]*ADMIN_ROLE_ID/);
  });
  it('enables TLS for Neon and strips libpq-only params', () => {
    const cfg = buildPoolConfig(base.DATABASE_URL);
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true });
    expect(cfg.connectionString).not.toMatch(/sslmode|channel_binding/);
    expect(buildPoolConfig('postgres://u:p@localhost/db').ssl).toBe(false);
  });
  it('scrubs credentials from messages', () => {
    expect(scrub('failed postgres://user:secret@host/db')).not.toContain('secret');
  });
});
