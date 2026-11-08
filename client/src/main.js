import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/700.css';
import '@fontsource/tajawal/900.css';
import './styles.css';
import { api } from './api.js';
import { login } from './discord.js';
import { connect } from './net.js';
import { startSky } from './fx.js';
import { esc, toast, modal, ico } from './ui.js';
import { S, on, refreshMe } from './state.js';
import { renderCreate } from './screens/create.js';
import { renderHub, refreshTab } from './screens/hub.js';
import { openBattle, pvpUpdate, pvpEnd } from './screens/battle.js';

const app = document.getElementById('app');

function fatal(msg) {
  app.innerHTML = `<div class="boot"><div class="logo">NEXUS</div><div class="boot-sub error">${esc(msg)}</div>
    <button class="btn primary" id="retry">إعادة المحاولة</button></div>`;
  document.getElementById('retry').addEventListener('click', () => location.reload());
}

// صور الأفاتار التي تفشل في التحميل تُزال لتظهر أيقونة الفئة بدلها
document.addEventListener('error', (e) => e.target?.tagName === 'IMG' && e.target.closest('.avatar') && e.target.remove(), true);

function onSocket(msg) {
  switch (msg.type) {
    case 'presence':
      S.presence = msg.players;
      on.emit('presence');
      break;
    case 'challenge': {
      const cls = S.content.CLASSES.find((c) => c.key === msg.from.classKey);
      const m = modal(
        `<div class="challenge">${ico(cls?.icon || 'crossed-swords', 'xl', `color:${cls?.color}`)}
         <h2>تحدٍّ!</h2><p><b>${esc(msg.from.name)}</b> (المستوى ${msg.from.level}) يتحداك إلى مبارزة.</p>
         <p class="muted small">الخاسر يفقد 30% من خبرة مستواه، وقد تسقط أداة من حقيبته للفائز.</p>
         <div class="row gap center"><button class="btn primary" data-a="accept">${ico('crossed-swords')} قبول</button>
         <button class="btn" data-a="decline">رفض</button></div></div>`,
      );
      const timer = setTimeout(() => m.close(), 30000);
      m.el.querySelectorAll('[data-a]').forEach((b) => {
        b.onclick = () => {
          clearTimeout(timer);
          S.net.send({ type: b.dataset.a, from: msg.from.id });
          m.close();
        };
      });
      break;
    }
    case 'duel_start':
      openBattle(msg.battle, msg.events, { mode: 'pvp' });
      break;
    case 'duel_update':
      pvpUpdate(msg.battle, msg.events);
      break;
    case 'duel_end':
      pvpEnd(msg.battle, msg.events, msg.result);
      break;
    case 'info':
      toast(msg.message);
      break;
    case 'error':
      toast(msg.message, 'error');
      break;
    default:
  }
}

async function boot() {
  startSky();
  try {
    const [{ user, room }, content] = await Promise.all([login(), api('/content')]);
    S.user = user;
    S.room = room;
    S.content = content;
    await refreshMe();
    S.net = connect(room, onSocket, (ok) => {
      S.online = ok;
      on.emit('online');
    });
    if (!S.player) renderCreate(app, () => renderHub(app));
    else {
      renderHub(app);
      if (S.player.inBattle) {
        const r = await api('/battle');
        if (r.battle) openBattle(r.battle, [], { mode: 'pve' });
      }
    }
  } catch (e) {
    console.error(e);
    fatal(e.message || 'تعذر الاتصال بالخادم');
  }
}

on.listen('player', () => refreshTab());
boot();
