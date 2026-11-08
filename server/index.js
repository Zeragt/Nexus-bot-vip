import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, checkConfig } from './config.js';
import { createStore } from './store.js';
import { Game, GameError } from './game/service.js';
import { issueSession, exchangeCode, fetchDiscordUser, requireUser } from './auth.js';
import { attachRealtime } from './realtime.js';
import * as content from './game/content.js';
import { xpToNext } from './game/rules.js';

export async function createApp({ store = createStore(config), log = console } = {}) {
  await store.init();
  const game = new Game(store);
  const app = express();
  app.disable('x-powered-by');
  // بعض إعدادات Discord تمرر الطلبات بالبادئة /.proxy — نزيلها لتعمل المسارات نفسها
  app.use((req, res, next) => {
    if (req.url.startsWith('/.proxy/')) req.url = req.url.slice(7);
    next();
  });
  app.use(express.json({ limit: '32kb' }));

  const wrap = (fn) => async (req, res) => {
    try {
      res.json(await fn(req, res));
    } catch (e) {
      const status = e instanceof GameError || e.status ? e.status || 400 : 500;
      if (status >= 500) log.error(e);
      res.status(status).json({ error: status >= 500 ? 'خطأ في الخادم' : e.message });
    }
  };

  // ───── المصادقة ─────
  app.post('/api/token', wrap(async (req) => {
    const code = String(req.body?.code || '');
    if (!code) throw new GameError('code مفقود');
    const accessToken = await exchangeCode(code);
    const user = await fetchDiscordUser(accessToken);
    return { access_token: accessToken, session: issueSession(user), user };
  }));

  app.post('/api/guest', wrap(async (req) => {
    if (!config.allowGuest) throw new GameError('وضع الضيف معطّل', 403);
    const name = String(req.body?.name || 'ضيف').slice(0, 24);
    const id = `guest_${String(req.body?.id || Math.random().toString(36).slice(2, 10)).replace(/\W/g, '').slice(0, 16)}`;
    const user = { id, name, avatar: null, guest: true };
    return { session: issueSession(user), user };
  }));

  app.get('/api/config', (req, res) => res.json({ clientId: config.clientId, allowGuest: config.allowGuest }));

  // ───── المحتوى ─────
  const xpTable = Array.from({ length: content.MAX_LEVEL }, (_, i) => xpToNext(i + 1));
  const contentPayload = JSON.stringify({ ...content, xpTable });
  app.get('/api/content', (req, res) => res.type('json').send(contentPayload));

  // ───── اللاعب ─────
  app.get('/api/me', requireUser, wrap(async (req) => ({ user: req.user, player: await game.me(req.user.id) })));
  app.post('/api/character', requireUser, wrap((req) => game.createCharacter(req.user, req.body?.classKey, req.body?.name)));
  app.post('/api/character/reset', requireUser, wrap(async (req) => {
    if (req.body?.confirm !== 'RESET') throw new GameError('تأكيد مفقود');
    await game.resetCharacter(req.user.id);
    return { ok: true };
  }));

  // ───── المعارك ─────
  app.get('/api/battle', requireUser, wrap((req) => game.battleView(req.user.id)));
  app.post('/api/battle/start', requireUser, wrap((req) => game.startBattle(req.user.id, req.body || {})));
  app.post('/api/battle/act', requireUser, wrap((req) => game.battleAct(req.user.id, req.body?.action || {})));

  // ───── الحقيبة والمتجر ─────
  app.post('/api/equip', requireUser, wrap((req) => game.equip(req.user.id, req.body?.uid)));
  app.post('/api/unequip', requireUser, wrap((req) => game.unequip(req.user.id, req.body?.slot)));
  app.post('/api/sell', requireUser, wrap((req) => game.sell(req.user.id, req.body?.uids || req.body?.uid)));
  app.post('/api/shop/buy', requireUser, wrap((req) => game.buy(req.user.id, req.body?.id, req.body?.qty)));

  // ───── اليوميات والمتصدرون ─────
  app.post('/api/dailies/claim', requireUser, wrap((req) => game.claimDaily(req.user.id, Number(req.body?.index))));
  app.post('/api/dailies/bonus', requireUser, wrap((req) => game.claimDailyBonus(req.user.id)));
  app.post('/api/login-reward', requireUser, wrap((req) => game.claimLogin(req.user.id)));
  app.get('/api/leaderboard', requireUser, wrap((req) => game.leaderboard(req.query.by)));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // ───── الواجهة المبنية ─────
  if (fs.existsSync(config.distDir)) {
    app.use(express.static(config.distDir, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api|\/ws).*/, (req, res) => res.sendFile(path.join(config.distDir, 'index.html')));
  } else {
    app.get('/', (req, res) => res.type('text').send('الواجهة غير مبنية بعد. شغّل: npm run build'));
  }

  return { app, game, store };
}

async function main() {
  checkConfig();
  const { app, game } = await createApp();
  const server = http.createServer(app);
  attachRealtime(server, game);
  server.listen(config.port, () => console.log(`✅ Nexus Activity يعمل على المنفذ ${config.port}`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
