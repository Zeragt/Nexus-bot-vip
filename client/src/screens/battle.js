/**
 * شاشة القتال: مشتركة بين معارك الوحوش (عبر HTTP) والمبارزات (عبر WebSocket).
 * الخادم يحسب كل شيء ويرسل أحداثاً، والواجهة تعرضها بالتتابع كحركات وأرقام طائرة.
 */
import { api } from '../api.js';
import { S, refreshMe, regionOf } from '../state.js';
import { esc, ico, bar, toast, modal, sleep, fmt, confirmBox } from '../ui.js';
import { setTheme } from '../fx.js';
import { playStory } from './story.js';

let B = null; // { el, battle, mode, busy, hp:{me,foe}, timer }

const sideKey = (s) => (s === B.battle.you ? 'me' : 'foe');
const statusInfo = (id) => S.content.STATUSES[id];

export function openBattle(battle, events = [], { mode }) {
  closeBattle();
  const el = document.createElement('div');
  el.className = `battle ${mode}`;
  document.body.appendChild(el);
  document.body.classList.add('overlay');
  B = { el, battle, mode, busy: false, hp: {}, timer: null };
  setTheme(battle.region || (mode === 'pvp' ? 'rift' : 'hub'));

  // صحة ما قبل الأحداث، حتى تتحرك الأشرطة من القيمة الصحيحة
  for (const k of ['me', 'foe']) B.hp[k] = { hp: battle[k].hp, mp: battle[k].mp };
  for (const k of ['me', 'foe']) {
    const first = events.find((e) => (e.t === 'dmg' || e.t === 'heal') && sideKey(e.target) === k);
    if (first) B.hp[k].hp = first.t === 'dmg' ? first.hp + first.amount : first.hp - first.amount;
  }
  render();
  play(events);
}

export function closeBattle() {
  if (!B) return;
  clearInterval(B.timer);
  B.el.remove();
  B = null;
  document.body.classList.remove('overlay');
}

function fighterHtml(k) {
  const f = B.battle[k];
  const hp = B.hp[k]?.hp ?? f.hp;
  const boss = f.kind === 'boss';
  return `
    <div class="fighter ${k} ${boss ? 'is-boss' : ''} ${f.kind === 'elite' ? 'is-elite' : ''} ${f.enraged ? 'enraged' : ''}" style="--c:${f.color}">
      <div class="f-card">
        <div class="f-name"><b>${esc(f.name)}</b><small>${boss ? 'زعيم · ' : f.kind === 'elite' ? 'نخبة · ' : ''}المستوى ${f.level}</small></div>
        ${bar(hp, f.maxHp, 'hp')}
        ${f.kind === 'player' ? bar(B.hp[k]?.mp ?? f.mp, f.maxMp, 'mp', false) : ''}
        <div class="f-status">${f.statuses.map((s) => {
          const info = statusInfo(s.id);
          return `<span class="st" style="--c:${info.color}" title="${esc(info.name)}">${ico(info.icon)}<small>${s.id === 'shield' ? fmt(s.value) : s.turns}</small></span>`;
        }).join('')}</div>
      </div>
      <div class="f-figure">
        <div class="f-aura"></div>
        ${ico(f.icon, 'f-ico')}
        <div class="f-float"></div>
      </div>
    </div>`;
}

function actionsHtml() {
  const b = B.battle;
  const me = b.me;
  const myTurn = b.turn === b.you && !b.over;
  const silenced = me.statuses.some((s) => s.id === 'silence');
  const skills = me.skills.map((s) => {
    const cd = s.ready;
    const dis = !myTurn || B.busy || cd > 0 || me.mp < s.cost || (silenced && s.id !== 'strike');
    return `<button class="skill k-${s.kind}" data-skill="${s.id}" ${dis ? 'disabled' : ''} title="${esc(s.desc || '')}">
      ${ico(s.icon)}<span>${esc(s.name)}</span><small>${s.cost ? `${s.cost} طاقة` : 'مجانية'}</small>${cd > 0 ? `<em class="cd">${cd}</em>` : ''}</button>`;
  }).join('');
  const potions = B.mode === 'pve'
    ? S.content.SHOP.filter((s) => !s.chest).map((s) => {
        const n = me.potions?.[s.id] || 0;
        const dis = !myTurn || B.busy || n <= 0 || me.potionsUsed >= b.potionLimit;
        return `<button class="potion" data-item="${s.id}" ${dis ? 'disabled' : ''} title="${esc(s.desc)}">${ico(s.icon)}<small>${n}</small></button>`;
      }).join('') + `<small class="muted">${me.potionsUsed}/${b.potionLimit}</small>`
    : '';
  return `<div class="skills">${skills}</div><div class="potions">${potions}</div>`;
}

function render() {
  const b = B.battle;
  const myTurn = b.turn === b.you;
  const region = b.region ? regionOf(b.region) : null;
  const title = B.mode === 'pvp' ? 'مبارزة' : region ? region.name : 'معركة';
  B.el.innerHTML = `
    <div class="b-top">
      <span class="b-title">${ico(B.mode === 'pvp' ? 'crossed-swords' : region?.icon || 'crossed-swords')} ${esc(title)}</span>
      <span class="turn ${myTurn ? 'mine' : ''}">${b.over ? 'انتهت' : myTurn ? 'دورك!' : 'دور الخصم...'}<em class="timer"></em></span>
      ${B.mode === 'pve' ? '<button class="btn tiny ghost" data-flee>هروب</button>' : '<button class="btn tiny ghost" data-surrender>استسلام</button>'}
    </div>
    <div class="stage">${fighterHtml('foe')}<div class="vs">VS</div>${fighterHtml('me')}</div>
    <div class="b-log"></div>
    <div class="b-actions">${actionsHtml()}</div>`;
  B.el.querySelector('.b-actions').addEventListener('click', onAction);
  B.el.querySelector('[data-flee]')?.addEventListener('click', () => send({ type: 'flee' }));
  B.el.querySelector('[data-surrender]')?.addEventListener('click', async () => {
    if (await confirmBox('الاستسلام يعتبر خسارة (تفقد 30% من خبرة المستوى). متأكد؟', 'استسلم')) send({ type: 'surrender' });
  });
  armTimer();
}

function armTimer() {
  clearInterval(B.timer);
  const t = B.el.querySelector('.timer');
  if (B.mode !== 'pvp' || !B.battle.deadline || B.battle.over) return;
  const tick = () => {
    const s = Math.max(0, Math.ceil((B.battle.deadline - Date.now()) / 1000));
    if (t) t.textContent = ` ${s}ث`;
  };
  tick();
  B.timer = setInterval(tick, 500);
}

function refreshActions() {
  const a = B.el.querySelector('.b-actions');
  if (a) a.innerHTML = actionsHtml();
}

function onAction(e) {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn.dataset.skill) send({ type: 'skill', id: btn.dataset.skill });
  if (btn.dataset.item) send({ type: 'item', id: btn.dataset.item });
}

async function send(action) {
  if (!B || B.busy) return;
  if (B.mode === 'pvp') {
    S.net.send({ type: 'duel_act', action });
    B.busy = true;
    refreshActions();
    setTimeout(() => {
      if (B && B.busy && !B.playing) {
        B.busy = false;
        refreshActions();
      }
    }, 3000);
    return;
  }
  B.busy = true;
  refreshActions();
  try {
    const r = await api('/battle/act', { action });
    await play(r.events, r.battle);
    if (r.result) showPveResult(r.result);
  } catch (err) {
    toast(err.message, 'error');
    if (err.status === 404) {
      closeBattle();
      refreshMe();
    }
  } finally {
    if (B) {
      B.busy = false;
      if (!B.battle.over) refreshActions();
    }
  }
}

// ───────────── عرض الأحداث ─────────────
function floatText(k, text, cls) {
  const box = B?.el.querySelector(`.fighter.${k} .f-float`);
  if (!box) return;
  const s = document.createElement('span');
  s.className = `fl ${cls}`;
  s.textContent = text;
  s.style.setProperty('--x', `${Math.round((Math.random() - 0.5) * 60)}px`);
  box.appendChild(s);
  setTimeout(() => s.remove(), 1300);
}

function pulse(k, cls, ms = 450) {
  const f = B?.el.querySelector(`.fighter.${k}`);
  if (!f) return;
  f.classList.remove(cls);
  void f.offsetWidth;
  f.classList.add(cls);
  setTimeout(() => f.classList.remove(cls), ms);
}

function setBar(k, type, value, max) {
  const el = B?.el.querySelector(`.fighter.${k} .bar.${type}`);
  if (!el) return;
  const w = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
  el.querySelector('.bar-fill').style.width = w;
  setTimeout(() => {
    const lag = el.querySelector('.bar-lag');
    if (lag) lag.style.width = w;
  }, 350);
  const txt = el.querySelector('.bar-text');
  if (txt) txt.textContent = `${fmt(Math.round(value))} / ${fmt(max)}`;
}

function log(html) {
  const l = B?.el.querySelector('.b-log');
  if (!l) return;
  const d = document.createElement('div');
  d.innerHTML = html;
  l.prepend(d);
  while (l.children.length > 4) l.lastChild.remove();
}

const nameOf = (k) => esc(B.battle[k].name);

async function play(events, finalBattle) {
  if (!B) return;
  B.playing = true;
  for (const e of events) {
    if (!B) return;
    const k = e.side ? sideKey(e.side) : null;
    const tk = e.target ? sideKey(e.target) : null;
    switch (e.t) {
      case 'skill':
        pulse(k, 'lunge', 420);
        log(`${ico(e.icon)} <b>${nameOf(k)}</b> استخدم <b>${esc(e.name)}</b>`);
        floatText(k, e.name, 'skillname');
        await sleep(260);
        break;
      case 'dmg':
        B.hp[tk].hp = e.hp;
        setBar(tk, 'hp', e.hp, B.battle[tk].maxHp);
        pulse(tk, e.crit ? 'hit-crit' : 'hit');
        if (e.crit) B.el.classList.add('shake'), setTimeout(() => B?.el.classList.remove('shake'), 300);
        floatText(tk, `${e.crit ? 'حرجة! ' : ''}-${fmt(e.amount)}`, e.status ? `dot s-${e.status}` : e.crit ? 'crit' : 'dmg');
        if (e.absorbed) floatText(tk, `🛡 ${fmt(e.absorbed)}`, 'absorb');
        await sleep(e.status ? 280 : 360);
        break;
      case 'heal':
        B.hp[tk].hp = e.hp;
        setBar(tk, 'hp', e.hp, B.battle[tk].maxHp);
        floatText(tk, `+${fmt(e.amount)}`, 'heal');
        pulse(tk, 'glow');
        await sleep(300);
        break;
      case 'miss':
        floatText(tk, 'تفادى!', 'miss');
        pulse(tk, 'dodge');
        await sleep(300);
        break;
      case 'status': {
        const info = statusInfo(e.status);
        floatText(tk, info.name, 'status');
        await sleep(200);
        break;
      }
      case 'skip':
        floatText(k, `${statusInfo(e.status).name}!`, 'status');
        log(`${ico(statusInfo(e.status).icon)} <b>${nameOf(k)}</b> فقد دوره`);
        await sleep(420);
        break;
      case 'enrage':
        floatText(tk, 'هيجان!', 'crit');
        log(`${ico('shouting')} <b>${nameOf(tk)}</b> دخل في حالة هيجان!`);
        B.el.classList.add('flash');
        setTimeout(() => B?.el.classList.remove('flash'), 600);
        await sleep(600);
        break;
      case 'item':
        floatText(k, e.name, 'skillname');
        log(`${ico(e.icon)} <b>${nameOf(k)}</b> استخدم ${esc(e.name)}`);
        await sleep(250);
        break;
      case 'flee':
        floatText(k, e.ok ? 'هرب!' : 'فشل الهروب', 'miss');
        await sleep(400);
        break;
      case 'cleanse':
        floatText(tk, 'تطهير', 'heal');
        break;
      case 'auto':
        log(`${ico('stopwatch')} انتهى وقت <b>${nameOf(k)}</b>، ضربة تلقائية`);
        break;
      case 'surrender':
        log(`${ico('broken-shield')} <b>${nameOf(k)}</b> ${e.disconnect ? 'غادر المبارزة' : 'استسلم'}`);
        break;
      case 'timeout':
        log('طالت المعركة! يفوز صاحب الصحة الأعلى.');
        break;
      default:
    }
  }
  B.playing = false;
  if (finalBattle && B) {
    B.battle = finalBattle;
    for (const k of ['me', 'foe']) B.hp[k] = { hp: finalBattle[k].hp, mp: finalBattle[k].mp };
    render();
  }
}

// ───────────── المبارزات ─────────────
export async function pvpUpdate(battle, events) {
  if (!B || B.mode !== 'pvp') return openBattle(battle, events, { mode: 'pvp' });
  B.busy = true;
  await play(events, battle);
  if (B) {
    B.busy = false;
    refreshActions();
  }
}

export async function pvpEnd(battle, events, result) {
  if (!B) openBattle(battle, [], { mode: 'pvp' });
  await play(events, battle);
  const won = result?.winnerId === S.user.id;
  const r = result || {};
  const drop = r.drop;
  const rar = drop ? S.content.RARITIES[drop.rarity] : null;
  const m = modal(`
    <div class="result ${won ? 'win' : 'lose'}">
      ${ico(won ? 'laurel-crown' : 'broken-shield', 'xl')}
      <h1>${won ? 'انتصار!' : 'هزيمة'}</h1>
      ${won
        ? `<p>${ico('star-formation')} +${fmt(r.winner?.xp)} خبرة · ${ico('two-coins')} +${fmt(r.winner?.gold)} ذهبة · +25 تصنيف</p>${r.winner?.levelUps ? '<p class="lvlup">ارتقيت مستوى!</p>' : ''}`
        : `<p class="bad">فقدت ${fmt(r.loser?.xpLost)} خبرة (30%) · -20 تصنيف</p>`}
      ${drop ? `<p>${won ? 'غنمت' : 'سقطت منك'}: <b style="color:${rar.color}">${esc(drop.name)}</b> (${rar.name})${r.dropLost && won ? ' — لكن حقيبتك ممتلئة!' : ''}</p>` : ''}
      <button class="btn primary" data-close>العودة</button>
    </div>`, { onClose: () => { closeBattle(); refreshMe(); } });
  void m;
}

// ───────────── نتيجة معارك الوحوش ─────────────
async function showPveResult(res) {
  const b = B.battle;
  const chapter = b.chapter ? S.content.STORY.find((c) => c.id === b.chapter) : null;
  const loot = res.loot.map((it) => {
    const r = S.content.RARITIES[it.rarity];
    return `<div class="loot r-${it.rarity}" style="--c:${r.color}">${ico(it.icon)}<b style="color:${r.color}">${esc(it.name)}</b><small>${r.name}</small></div>`;
  }).join('');
  const body = res.fled
    ? `${ico('run', 'xl')}<h1>هربت!</h1><p class="muted">لا مكافآت ولا خسائر.</p>`
    : res.win
      ? `${ico('laurel-crown', 'xl')}<h1>انتصار!</h1>
         <p>${ico('star-formation')} +${fmt(res.xp)} خبرة · ${ico('two-coins')} +${fmt(res.gold)} ذهبة</p>
         ${res.levelUps ? `<p class="lvlup">ارتقيت ${res.levelUps > 1 ? `${res.levelUps} مستويات` : 'مستوى'}!</p>` : ''}
         ${res.chapterDone ? `<p class="good">${ico('open-book')} اكتمل الفصل: ${esc(chapter?.title || '')}</p>` : ''}
         ${loot ? `<div class="loot-row">${loot}</div>` : ''}
         ${res.potion ? `<p class="small">${ico('round-potion')} وجدت جرعة شفاء صغرى</p>` : ''}
         ${res.bagFull ? '<p class="warn">حقيبتك ممتلئة! بعض الغنائم ضاعت.</p>' : ''}`
      : `${ico('skull-crossed-bones', 'xl')}<h1>سقطت...</h1><p class="bad">فقدت ${fmt(res.xpLost)} خبرة (10% من خبرة المستوى).</p><p class="muted">جرّب تحسين عتادك أو شراء جرعات.</p>`;
  modal(`<div class="result ${res.win ? 'win' : 'lose'}">${body}<button class="btn primary" data-close>متابعة</button></div>`, {
    onClose: async () => {
      closeBattle();
      await refreshMe();
      if (res.chapterDone && chapter?.outro) await playStory(chapter, chapter.outro);
      if (res.levelUps) toast('أصبحت أقوى! تفقد مهاراتك الجديدة في صفحة البطل.', 'good', 4000);
    },
  });
}
