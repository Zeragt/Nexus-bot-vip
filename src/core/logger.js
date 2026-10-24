import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';
const pretty = !['0', 'false', 'no', 'off'].includes(String(process.env.LOG_PRETTY ?? 'true').toLowerCase());
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;

// Secrets must never reach the console, even if someone logs a whole config or error object.
const redact = {
  paths: [
    'token',
    '*.token',
    'DISCORD_TOKEN',
    '*.DISCORD_TOKEN',
    'password',
    '*.password',
    'connectionString',
    '*.connectionString',
    'DATABASE_URL',
    '*.DATABASE_URL',
    'DIRECT_URL',
    '*.DIRECT_URL',
    'headers.authorization',
  ],
  censor: '[redacted]',
};

export const logger = pino({
  level: isTest ? 'silent' : level,
  redact,
  base: undefined,
  transport: pretty && !isTest ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } : undefined,
});

/** Removes credentials from any string (e.g. a pg error that echoes the URL). */
export function scrub(text) {
  return String(text)
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgres://[redacted]')
    .replace(/[MN][A-Za-z\d_-]{23,}\.[\w-]{6}\.[\w-]{27,}/g, '[redacted-token]');
}
