/**
 * المصادقة: الواجهة تحصل على code من Discord SDK، والخادم يبادله بـ access_token
 * (السر لا يغادر الخادم أبداً)، ثم يجلب هوية المستخدم ويصدر رمز جلسة موقّع.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

const secret = config.sessionSecret && config.sessionSecret.length >= 16 ? config.sessionSecret : randomBytes(32).toString('hex');
const SESSION_TTL = 1000 * 60 * 60 * 12;

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => createHmac('sha256', secret).update(data).digest('base64url');

export function issueSession(user) {
  const body = b64(JSON.stringify({ ...user, exp: Date.now() + SESSION_TTL }));
  return `${body}.${sign(body)}`;
}

export function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return { id: data.id, name: data.name, avatar: data.avatar, guest: !!data.guest };
  } catch {
    return null;
  }
}

export async function exchangeCode(code) {
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw Object.assign(new Error('فشل التحقق من Discord'), { status: 401 });
  return data.access_token;
}

export async function fetchDiscordUser(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw Object.assign(new Error('تعذر جلب بيانات المستخدم'), { status: 401 });
  const u = await res.json();
  const avatar = u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`
    : null;
  return { id: u.id, name: u.global_name || u.username, avatar };
}

export function requireUser(req, res, next) {
  const h = req.headers.authorization || '';
  const user = verifySession(h.startsWith('Bearer ') ? h.slice(7) : null);
  if (!user) return res.status(401).json({ error: 'انتهت الجلسة، أعد فتح النشاط' });
  req.user = user;
  next();
}
