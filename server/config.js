import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** قارئ بسيط لملف .env بدون مكتبات خارجية. */
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const val = m[2].replace(/^['"]|['"]$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadDotEnv();

const env = process.env;
const bool = (v) => /^(1|true|yes|on)$/i.test(v || '');

export const config = {
  port: Number(env.PORT || env.SERVER_PORT || 3001),
  clientId: env.DISCORD_CLIENT_ID || env.VITE_DISCORD_CLIENT_ID || '',
  clientSecret: env.DISCORD_CLIENT_SECRET || '',
  databaseUrl: env.DATABASE_URL || '',
  sessionSecret: env.SESSION_SECRET || '',
  allowGuest: bool(env.ALLOW_GUEST),
  devDataFile: path.join(ROOT, 'data', 'dev-players.json'),
  distDir: path.join(ROOT, 'client', 'dist'),
};

export function checkConfig(log = console) {
  const problems = [];
  if (!config.clientId) problems.push('DISCORD_CLIENT_ID غير موجود');
  if (!config.clientSecret) problems.push('DISCORD_CLIENT_SECRET غير موجود');
  if (!config.sessionSecret || config.sessionSecret.length < 16) {
    problems.push('SESSION_SECRET قصير أو مفقود (سيتم استخدام مفتاح مؤقت)');
  }
  if (!config.databaseUrl) problems.push('DATABASE_URL غير موجود: البيانات تحفظ في ملف محلي (للتجربة فقط)');
  for (const p of problems) log.warn(`⚠️  ${p}`);
}
