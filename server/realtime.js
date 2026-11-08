/**
 * الاتصال الحي (WebSocket): من موجود معك في نفس النشاط، التحديات، والمبارزات بالأدوار.
 * كل نشاط (instance) في Discord غرفة مستقلة.
 */
import { WebSocketServer } from 'ws';
import { verifySession } from './auth.js';
import { createBattle, act, view } from './game/combat.js';

const TURN_MS = 30_000;
const CHALLENGE_MS = 30_000;
const RECONNECT_MS = 20_000;

export function attachRealtime(server, game, log = console) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname !== '/ws' && pathname !== '/.proxy/ws') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  const rooms = new Map(); // room -> Map(userId -> conn)
  const conns = new Map(); // userId -> conn
  const duels = new Map(); // duelId -> duel
  const userDuel = new Map(); // userId -> duelId
  const challenges = new Map(); // `${from}>${to}` -> expires

  const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const sendUser = (id, msg) => send(conns.get(id)?.ws, msg);

  async function presence(room) {
    try {
      await presenceInner(room);
    } catch (e) {
      log.error(e);
    }
  }

  async function presenceInner(room) {
    const members = rooms.get(room);
    if (!members) return;
    const list = await Promise.all(
      [...members.values()].map(async (c) => {
        const p = await game.store.get(c.user.id);
        return {
          id: c.user.id,
          name: p?.name || c.user.name,
          avatar: c.user.avatar,
          classKey: p?.classKey || null,
          level: p?.level || 0,
          rating: p?.rating || 0,
          busy: userDuel.has(c.user.id),
        };
      }),
    );
    for (const c of members.values()) send(c.ws, { type: 'presence', players: list });
  }

  function duelMsg(duel, type, events = [], extra = {}) {
    for (const side of ['a', 'b']) {
      const st = duel.st;
      sendUser(duel.ids[side], { type, battle: { ...view(st, side), deadline: duel.deadline }, events, ...extra });
    }
  }

  function armTimer(duel) {
    clearTimeout(duel.timer);
    if (duel.st.over) return;
    duel.deadline = Date.now() + TURN_MS;
    duel.timer = setTimeout(() => step(duel, duel.st.turn, { type: 'skill', id: 'strike' }, true), TURN_MS);
  }

  async function endDuel(duel, events) {
    clearTimeout(duel.timer);
    duels.delete(duel.id);
    userDuel.delete(duel.ids.a);
    userDuel.delete(duel.ids.b);
    const winnerId = duel.ids[duel.st.winner];
    const loserId = duel.ids[duel.st.winner === 'a' ? 'b' : 'a'];
    let result = null;
    try {
      result = await game.finishDuel(winnerId, loserId);
    } catch (e) {
      log.error(e);
    }
    duelMsg(duel, 'duel_end', events, { result: { ...result, winnerId, loserId } });
    presence(duel.room);
  }

  function step(duel, side, action, auto = false) {
    if (duel.st.over || duel.st.turn !== side) return;
    let events;
    try {
      events = act(duel.st, side, action);
    } catch (e) {
      return sendUser(duel.ids[side], { type: 'error', message: e.message });
    }
    if (auto) events.unshift({ t: 'auto', side });
    if (duel.st.over) return endDuel(duel, events);
    armTimer(duel);
    duelMsg(duel, 'duel_update', events);
  }

  async function startDuel(room, fromId, toId) {
    const [fa, fb] = await game.duelFighters(fromId, toId);
    const st = createBattle(fa, fb, 'pvp');
    const duel = { id: st.id, st, room, ids: { a: fromId, b: toId }, timer: null, deadline: 0, gone: {} };
    duels.set(duel.id, duel);
    userDuel.set(fromId, duel.id);
    userDuel.set(toId, duel.id);
    armTimer(duel);
    duelMsg(duel, 'duel_start');
    presence(room);
  }

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const user = verifySession(url.searchParams.get('token'));
    if (!user) {
      send(ws, { type: 'error', message: 'جلسة غير صالحة' });
      return ws.close();
    }
    const room = (url.searchParams.get('room') || 'lobby').slice(0, 64);
    const old = conns.get(user.id);
    if (old && old.ws !== ws) {
      old.replaced = true;
      old.ws.close();
    }
    const conn = { ws, user, room };
    conns.set(user.id, conn);
    if (!rooms.has(room)) rooms.set(room, new Map());
    rooms.get(room).set(user.id, conn);
    presence(room);

    // عاد أثناء مبارزة؟
    const dId = userDuel.get(user.id);
    if (dId && duels.has(dId)) {
      const duel = duels.get(dId);
      clearTimeout(duel.gone[user.id]);
      const side = duel.ids.a === user.id ? 'a' : 'b';
      send(ws, { type: 'duel_start', battle: { ...view(duel.st, side), deadline: duel.deadline }, events: [] });
    }

    const alive = setInterval(() => send(ws, { type: 'ping' }), 25_000);

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      try {
        if (msg.type === 'refresh') return presence(room);
        if (msg.type === 'challenge') {
          const to = String(msg.to || '');
          if (to === user.id) return;
          if (!rooms.get(room)?.has(to)) throw new Error('اللاعب ليس في هذا النشاط');
          if (userDuel.has(user.id) || userDuel.has(to)) throw new Error('أحدكما في مبارزة الآن');
          const me = await game.store.get(user.id);
          if (!me) throw new Error('أنشئ شخصيتك أولاً');
          challenges.set(`${user.id}>${to}`, Date.now() + CHALLENGE_MS);
          sendUser(to, { type: 'challenge', from: { id: user.id, name: me.name, level: me.level, classKey: me.classKey } });
          return send(ws, { type: 'info', message: 'تم إرسال التحدي' });
        }
        if (msg.type === 'accept' || msg.type === 'decline') {
          const from = String(msg.from || '');
          const key = `${from}>${user.id}`;
          const exp = challenges.get(key);
          challenges.delete(key);
          if (!exp || exp < Date.now()) throw new Error('انتهت صلاحية التحدي');
          if (msg.type === 'decline') return sendUser(from, { type: 'info', message: `${user.name} رفض التحدي` });
          if (userDuel.has(user.id) || userDuel.has(from)) throw new Error('أحدكما في مبارزة الآن');
          return await startDuel(room, from, user.id);
        }
        if (msg.type === 'duel_act') {
          const duel = duels.get(userDuel.get(user.id));
          if (!duel) throw new Error('لا توجد مبارزة');
          const side = duel.ids.a === user.id ? 'a' : 'b';
          if (msg.action?.type === 'surrender') {
            duel.st.over = true;
            duel.st.winner = side === 'a' ? 'b' : 'a';
            return endDuel(duel, [{ t: 'surrender', side }]);
          }
          return step(duel, side, msg.action || {});
        }
      } catch (e) {
        send(ws, { type: 'error', message: e.message });
      }
    });

    ws.on('close', () => {
      clearInterval(alive);
      if (conn.replaced) return;
      conns.delete(user.id);
      rooms.get(room)?.delete(user.id);
      if (rooms.get(room)?.size === 0) rooms.delete(room);
      else presence(room);
      const duel = duels.get(userDuel.get(user.id));
      if (duel) {
        // مهلة للعودة قبل الانسحاب التلقائي
        duel.gone[user.id] = setTimeout(() => {
          if (conns.has(user.id) || duel.st.over) return;
          const side = duel.ids.a === user.id ? 'a' : 'b';
          duel.st.over = true;
          duel.st.winner = side === 'a' ? 'b' : 'a';
          endDuel(duel, [{ t: 'surrender', side, disconnect: true }]);
        }, RECONNECT_MS);
      }
    });
  });

  return {
    close: () => {
      for (const d of duels.values()) clearTimeout(d.timer);
      wss.close();
    },
  };
}
