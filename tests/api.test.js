/**
 * اختبار تكامل عبر HTTP + WebSocket. يستخدم PostgreSQL إن وُجد TEST_DATABASE_URL
 * (تحذير: يحذف جدول players في تلك القاعدة)، وإلا يستخدم مخزن الذاكرة.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';

process.env.ALLOW_GUEST = '1';
process.env.SESSION_SECRET = 'test-secret-test-secret-123456';
const { createApp } = await import('../server/index.js');
const { PgStore, MemoryStore } = await import('../server/store.js');
const { attachRealtime } = await import('../server/realtime.js');

let server;
let base;
let store;

before(async () => {
  if (process.env.TEST_DATABASE_URL) {
    store = new PgStore(process.env.TEST_DATABASE_URL);
    await store.pool.query('DROP TABLE IF EXISTS players');
  } else store = new MemoryStore(null);
  const { app, game } = await createApp({ store, log: { error() {}, warn() {} } });
  server = http.createServer(app);
  attachRealtime(server, game, { error() {} });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => setTimeout(r, 200));
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  await store.close();
});

async function call(path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

async function guest(id, cls) {
  const { data } = await call('/api/guest', { body: { id, name: id } });
  await call('/api/character', { token: data.session, body: { classKey: cls } });
  return data;
}

test('المسارات تتطلب جلسة صالحة', async () => {
  assert.equal((await call('/api/me')).status, 401);
  assert.equal((await call('/api/me', { token: 'bad.token' })).status, 401);
});

test('دورة لعب كاملة عبر الـ API', async () => {
  const g = await guest('alice', 'ranger');
  const me = await call('/api/me', { token: g.session });
  assert.equal(me.data.player.classKey, 'ranger');
  const content = await call('/api/content');
  assert.equal(content.data.CLASSES.length, 8);

  const buy = await call('/api/shop/buy', { token: g.session, body: { id: 'potion_small', qty: 2 } });
  assert.equal(buy.data.player.potions.potion_small, 5);
  const poor = await call('/api/shop/buy', { token: g.session, body: { id: 'chest', qty: 1 } });
  assert.equal(poor.status, 400);

  const login = await call('/api/login-reward', { token: g.session, body: {} });
  assert.equal(login.data.streak, 1);
  assert.equal((await call('/api/login-reward', { token: g.session, body: {} })).status, 400);

  const start = await call('/api/battle/start', { token: g.session, body: { type: 'explore', regionId: 'dawn' } });
  assert.equal(start.status, 200);
  const locked = await call('/api/battle/start', { token: g.session, body: { type: 'explore', regionId: 'rift' } });
  assert.equal(locked.data.battle?.id, start.data.battle.id); // معركة جارية تُعاد كما هي
  let result = null;
  for (let i = 0; i < 300 && !result; i++) {
    const r = await call('/api/battle/act', { token: g.session, body: { action: { type: 'skill', id: 'strike' } } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    result = r.data.result;
  }
  assert.ok(result);
  const lb = await call('/api/leaderboard', { token: g.session });
  assert.ok(lb.data.some((x) => x.id === 'guest_alice'));
});

test('مبارزة حية عبر WebSocket', async () => {
  const a = await guest('duelA', 'assassin');
  const b = await guest('duelB', 'cleric');
  const wsUrl = base.replace('http', 'ws');
  const open = (s) => new Promise((resolve) => {
    const ws = new WebSocket(`${wsUrl}/ws?token=${encodeURIComponent(s)}&room=r1`);
    ws.msgs = [];
    ws.on('message', (m) => ws.msgs.push(JSON.parse(m)));
    ws.on('open', () => resolve(ws));
  });
  const wait = (ws, type, ms = 3000) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const i = ws.msgs.findIndex((m) => m.type === type);
      if (i >= 0) {
        clearInterval(iv);
        resolve(ws.msgs.splice(i, 1)[0]);
      } else if (Date.now() - t0 > ms) {
        clearInterval(iv);
        reject(new Error(`timeout ${type}`));
      }
    }, 10);
  });
  const wa = await open(a.session);
  const wb = await open(b.session);
  await wait(wa, 'presence');
  wa.send(JSON.stringify({ type: 'challenge', to: 'guest_duelB' }));
  const ch = await wait(wb, 'challenge');
  assert.equal(ch.from.id, 'guest_duelA');
  wb.send(JSON.stringify({ type: 'accept', from: 'guest_duelA' }));
  let st = await wait(wa, 'duel_start');
  await wait(wb, 'duel_start');
  // من عليه الدور يستسلم
  const loserWs = st.battle.turn === st.battle.you ? wa : wb;
  loserWs.send(JSON.stringify({ type: 'duel_act', action: { type: 'surrender' } }));
  const end = await wait(wa, 'duel_end');
  assert.ok(end.result.winnerId);
  st = null;
  wa.close();
  wb.close();
});
