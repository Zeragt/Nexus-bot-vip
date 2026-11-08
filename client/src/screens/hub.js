import { api } from '../api.js';
import { S, on, classOf, regionOf, applyPlayer, refreshMe } from '../state.js';
import { esc, ico, bind, toast, fmt, pct, modal, confirmBox } from '../ui.js';
import { setTheme } from '../fx.js';
import { openBattle } from './battle.js';
import { playStory } from './story.js';

export const STAT_AR = { hp: 'الصحة', atk: 'الهجوم', def: 'الدفاع', spd: 'السرعة', crit: 'الحرجة %', mp: 'الطاقة' };

const TABS = [
  { id: 'world', name: 'العالم', icon: 'world' },
  { id: 'story', name: 'الحكاية', icon: 'open-book' },
  { id: 'hero', name: 'البطل', icon: 'backpack' },
  { id: 'shop', name: 'السوق', icon: 'shop' },
  { id: 'dailies', name: 'المهام', icon: 'checklist' },
  { id: 'arena', name: 'الساحة', icon: 'crossed-swords' },
];

let root = null;
let selRegion = null;
let lbBy = 'level';
let lbCache = null;

export function renderHub(el) {
  root = el;
  setTheme('hub');
  root.innerHTML = `
    <div class="hub">
      <header class="hud" id="hud"></header>
      <main class="tab-body" id="tab-body"></main>
      <nav class="tabs" id="tabs">
        ${TABS.map((t) => `<button class="tab" data-act="tab" data-id="${t.id}">${ico(t.icon)}<span>${t.name}</span><i class="dot" data-dot="${t.id}"></i></button>`).join('')}
      </nav>
    </div>`;
  bind(root.querySelector('#tabs'), { tab: ({ id }) => showTab(id) });
  bind(root.querySelector('#tab-body'), handlers);
  showTab(S.tab);
}

function showTab(id) {
  S.tab = id;
  if (id === 'arena') S.net?.send({ type: 'refresh' });
  refreshTab();
}

export function refreshTab() {
  if (!root || !S.player || !root.querySelector('#tab-body')) return;
  root.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.id === S.tab));
  renderHud();
  const body = root.querySelector('#tab-body');
  const fn = { world, story, hero, shop, dailies, arena }[S.tab] || world;
  body.innerHTML = fn();
  const ds = S.player.dailies;
  const claimable = ds && (ds.quests.some((q) => !q.claimed && q.progress >= q.target) || S.player.login.last !== S.player.today);
  root.querySelector('[data-dot="dailies"]')?.classList.toggle('on', !!claimable);
}

on.listen('presence', () => S.tab === 'arena' && refreshTab());
on.listen('online', () => renderHud());

function renderHud() {
  const p = S.player;
  if (!p) return;
  const c = classOf(p.classKey);
  const hud = root?.querySelector('#hud');
  if (!hud) return;
  hud.innerHTML = `
    <div class="hud-id" style="--c:${c.color}">
      <div class="avatar">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : ''}${ico(c.icon)}</div>
      <div><b>${esc(p.name)}</b><small>${esc(c.name)} · المستوى ${p.level}</small>
      <div class="xp">${p.level >= S.content.MAX_LEVEL ? '<div class="bar-fill" style="width:100%"></div>' : `<div class="bar-fill" style="width:${pct(p.xp, p.nextXp)}"></div>`}</div></div>
    </div>
    <div class="hud-res">
      <span class="res gold">${ico('two-coins')} ${fmt(p.gold)}</span>
      <span class="res">${ico('round-potion')} ${fmt(p.potions.potion_small || 0)}</span>
      <span class="res">${ico('health-potion')} ${fmt(p.potions.potion_big || 0)}</span>
      <span class="net ${S.online ? 'on' : ''}" title="${S.online ? 'متصل' : 'غير متصل'}"></span>
    </div>`;
}

// ───────────── العالم ─────────────
function world() {
  const p = S.player;
  const regions = S.content.REGIONS;
  if (!selRegion) selRegion = [...regions].reverse().find((r) => p.level >= r.levels[0])?.id || 'dawn';
  const r = regionOf(selRegion);
  setTheme(r.id);
  const unlocked = p.level >= r.levels[0];
  const bossCh = S.content.STORY.find((c) => c.region === r.id && c.boss);
  const bossOpen = p.story.done.includes(bossCh.id);
  return `
    <div class="map">
      ${regions.map((x, i) => {
        const open = p.level >= x.levels[0];
        return `<button class="map-node ${x.id === selRegion ? 'on' : ''} ${open ? '' : 'locked'}" data-act="region" data-id="${x.id}" style="--c:${x.colors[1]}">
          <span class="node-ring">${ico(open ? x.icon : 'padlock')}</span><b>${esc(x.name)}</b><small>م ${x.levels[0]}–${x.levels[1]}</small></button>${i < regions.length - 1 ? '<i class="map-link"></i>' : ''}`;
      }).join('')}
    </div>
    <section class="panel region-panel" style="--c:${r.colors[1]}">
      <h2>${ico(r.icon)} ${esc(r.name)}</h2>
      <p class="muted">${esc(r.desc)}</p>
      <h3>سكان المنطقة</h3>
      <div class="mon-row">
        ${r.monsters.map((m) => `<div class="mon" style="--c:${m.color}">${ico(m.icon)}<small>${esc(m.name)}</small></div>`).join('')}
        <div class="mon boss" style="--c:${r.boss.color}">${ico(r.boss.icon)}<small>${esc(r.boss.name)}</small></div>
      </div>
      <div class="row gap wrap">
        <button class="btn primary big" data-act="explore" ${unlocked ? '' : 'disabled'}>${ico('crossed-swords')} استكشف وقاتل</button>
        <button class="btn danger big" data-act="regionBoss" ${unlocked && bossOpen ? '' : 'disabled'} title="${bossOpen ? '' : 'اهزم الزعيم في الحكاية أولاً'}">${ico(r.boss.icon)} تحدَّ الزعيم</button>
      </div>
      ${unlocked ? '' : `<p class="warn">${ico('padlock')} تحتاج المستوى ${r.levels[0]}.</p>`}
      ${unlocked && !bossOpen ? `<p class="muted small">الزعيم يصبح قابلاً للتحدي المتكرر بعد هزيمته في الحكاية.</p>` : ''}
    </section>`;
}

// ───────────── الحكاية ─────────────
function story() {
  setTheme('hub');
  const p = S.player;
  const chapters = S.content.STORY;
  const done = new Set(p.story.done);
  const firstOpen = chapters.find((c) => !done.has(c.id));
  return `<div class="story-list">
    <div class="shards">${S.content.REGIONS.map((r) => {
      const bc = chapters.find((c) => c.region === r.id && c.boss);
      return `<span class="shard ${done.has(bc.id) ? 'got' : ''}" style="--c:${r.colors[1]}" title="${esc(r.shard)}">${ico('cut-diamond')}</span>`;
    }).join('')}<small class="muted">الشظايا المستعادة</small></div>
    ${S.content.REGIONS.map((r) => `
      <section class="panel act" style="--c:${r.colors[1]}"><h3>${ico(r.icon)} ${esc(r.name)}</h3>
      ${chapters.filter((c) => c.region === r.id).map((c, i) => {
        const idx = chapters.indexOf(c);
        const prevDone = idx === 0 || done.has(chapters[idx - 1].id);
        const open = prevDone && p.level >= r.levels[0];
        const isDone = done.has(c.id);
        const state = isDone ? 'done' : open ? 'open' : 'locked';
        const need = !prevDone ? 'أكمل الفصل السابق' : p.level < r.levels[0] ? `المستوى ${r.levels[0]}` : '';
        return `<button class="chapter ${state} ${c === firstOpen && open ? 'next' : ''}" data-act="chapter" data-id="${c.id}" ${open || isDone ? '' : 'disabled'}>
          <span class="ch-num">${idx + 1}</span>
          <span class="ch-title"><b>${esc(c.title)}</b><small>${c.boss ? `زعيم: ${esc(r.boss.name)}` : esc(c.enemy.name)}</small></span>
          <span class="ch-state">${isDone ? ico('check-mark') : open ? ico(c.boss ? 'crowned-skull' : 'sword-brandish') : `${ico('padlock')}<small>${need}</small>`}</span>
        </button>`;
      }).join('')}</section>`).join('')}
  </div>`;
}

// ───────────── البطل ─────────────
const itemStats = (it) => Object.entries(it.stats).map(([k, v]) => `<span>${STAT_AR[k]} +${v}</span>`).join('');
const rarity = (r) => S.content.RARITIES[r];

function itemCard(it, { equipped = false } = {}) {
  const r = rarity(it.rarity);
  return `<button class="item r-${it.rarity}" style="--c:${r.color}" data-act="item" data-uid="${it.uid}" data-eq="${equipped ? 1 : ''}">
    ${ico(it.icon)}<span class="item-tier">${it.tier}</span></button>`;
}

function hero() {
  setTheme('hub');
  const p = S.player;
  const c = classOf(p.classKey);
  const st = p.statsTotal;
  return `
    <div class="hero-grid">
      <section class="panel hero-card" style="--c:${c.color}">
        <div class="hero-portrait">${ico(c.icon, 'hero-ico')}</div>
        <h2>${esc(p.name)}</h2><p class="muted">${esc(c.name)} · المستوى ${p.level}</p>
        <div class="xp-line">${p.level >= S.content.MAX_LEVEL ? 'أقصى مستوى!' : `الخبرة ${fmt(p.xp)} / ${fmt(p.nextXp)}`}</div>
        <div class="stats">${Object.keys(STAT_AR).map((k) => `<div><small>${STAT_AR[k]}</small><b>${fmt(st[k])}</b></div>`).join('')}</div>
        <div class="passive">${ico('star-swirl')} <b>${esc(c.passive.name)}:</b> ${esc(c.passive.desc)}</div>
        <div class="record">
          <span>${ico('skull-crossed-bones')} ${fmt(p.stats.kills)} وحش</span>
          <span>${ico('crowned-skull')} ${fmt(p.stats.bosses)} زعيم</span>
          <span>${ico('crossed-swords')} ${fmt(p.stats.duelsWon)}/${fmt(p.stats.duelsLost)} مبارزات</span>
          <span>${ico('laurel-crown')} ${fmt(p.rating)} تصنيف</span>
        </div>
      </section>
      <section class="panel">
        <h3>العتاد</h3>
        <div class="equip">
          ${['weapon', 'armor', 'charm'].map((slot) => {
            const it = p.equip[slot];
            return `<div class="slot"><small>${S.content.SLOT_NAMES[slot]}</small>${it ? itemCard(it, { equipped: true }) : `<div class="item empty">${ico(slot === 'weapon' ? 'broadsword' : slot === 'armor' ? 'chest-armor' : 'ring')}</div>`}</div>`;
          }).join('')}
        </div>
        <h3>المهارات</h3>
        <div class="skill-list">
          ${c.skills.map((s) => `<div class="skill-chip ${s.unlock > p.level ? 'locked' : ''}" title="${esc(s.desc)}">${ico(s.unlock > p.level ? 'padlock' : s.icon)}<span>${esc(s.name)}</span><small>${s.unlock > p.level ? `م${s.unlock}` : `${s.cost} طاقة`}</small></div>`).join('')}
        </div>
        <h3>الحقيبة <small class="muted">${p.bag.length}/${S.content.BAG_LIMIT}</small>
          ${p.bag.some((i) => i.rarity === 'common') ? '<button class="btn tiny" data-act="sellCommon">بيع الشائع</button>' : ''}</h3>
        <div class="bag">${p.bag.length ? [...p.bag].sort((a, b) => rarity(b.rarity).order - rarity(a.rarity).order || b.tier - a.tier).map((it) => itemCard(it)).join('') : '<p class="muted">الحقيبة فارغة. الوحوش تُسقط الأدوات!</p>'}</div>
        <h3>الجرعات</h3>
        <div class="row gap wrap">${S.content.SHOP.filter((s) => !s.chest).map((s) => `<span class="res">${ico(s.icon)} ${esc(s.name)}: ${fmt(p.potions[s.id] || 0)}</span>`).join('')}</div>
        <div class="danger-zone"><button class="btn tiny ghost" data-act="reset">حذف الشخصية والبدء من جديد</button></div>
      </section>
    </div>`;
}

function showItem(uid, equipped) {
  const p = S.player;
  const it = equipped ? Object.values(p.equip).find((x) => x?.uid === uid) : p.bag.find((x) => x.uid === uid);
  if (!it) return;
  const r = rarity(it.rarity);
  const cur = p.equip[it.slot];
  const cmp = !equipped && cur ? `<div class="cmp"><small>المجهّز حالياً: ${esc(cur.name)}</small>${itemStats(cur)}</div>` : '';
  const m = modal(`
    <div class="item-detail" style="--c:${r.color}">
      <div class="item big r-${it.rarity}">${ico(it.icon)}</div>
      <h2 style="color:${r.color}">${esc(it.name)}</h2>
      <p class="muted">${r.name} · ${S.content.SLOT_NAMES[it.slot]} · الدرجة ${it.tier}</p>
      <div class="item-stats">${itemStats(it)}</div>${cmp}
      <div class="row gap center">
        ${equipped ? '<button class="btn" data-a="unequip">نزع</button>' : `<button class="btn primary" data-a="equip">تجهيز</button><button class="btn" data-a="sell">بيع (${fmt(r.sell * it.tier)} ذهب)</button>`}
        <button class="btn ghost" data-close>إغلاق</button>
      </div>
    </div>`);
  m.el.querySelectorAll('[data-a]').forEach((b) => {
    b.onclick = async () => {
      try {
        if (b.dataset.a === 'equip') applyPlayer(await api('/equip', { uid }));
        if (b.dataset.a === 'unequip') applyPlayer(await api('/unequip', { slot: it.slot }));
        if (b.dataset.a === 'sell') {
          const r2 = await api('/sell', { uid });
          applyPlayer(r2.player);
          toast(`بعت الأداة مقابل ${r2.gold} ذهبة`, 'good');
        }
        m.close();
      } catch (e) {
        toast(e.message, 'error');
      }
    };
  });
}

// ───────────── السوق ─────────────
function shop() {
  setTheme('hub');
  const p = S.player;
  return `<div class="shop-grid">${S.content.SHOP.map((s) => `
    <section class="panel shop-item">
      <div class="shop-ico">${ico(s.icon)}</div>
      <b>${esc(s.name)}</b><p class="muted small">${esc(s.desc)}</p>
      <div class="row gap center">
        <button class="btn primary" data-act="buy" data-id="${s.id}" data-qty="1" ${p.gold < s.price ? 'disabled' : ''}>${ico('two-coins')} ${fmt(s.price)}</button>
        ${s.chest ? '' : `<button class="btn" data-act="buy" data-id="${s.id}" data-qty="5" ${p.gold < s.price * 5 ? 'disabled' : ''}>×5</button>`}
      </div>
      ${s.chest ? '' : `<small class="muted">لديك ${fmt(p.potions[s.id] || 0)}</small>`}
    </section>`).join('')}
    <section class="panel shop-note"><h3>${ico('scroll-unfurled')} نصائح</h3>
      <p class="muted small">يمكنك استخدام ${S.content.POTIONS_PER_BATTLE} جرعات كحد أقصى في كل معركة ضد الوحوش. المبارزات بين اللاعبين بدون جرعات.</p>
      <p class="muted small">الندرة: ${Object.values(S.content.RARITIES).map((r) => `<b style="color:${r.color}">${r.name}</b>`).join(' · ')}</p>
    </section>
  </div>`;
}

// ───────────── المهام ─────────────
function dailies() {
  setTheme('hub');
  const p = S.player;
  const ds = p.dailies;
  const loginDone = p.login.last === p.today;
  const all = ds.quests.every((q) => q.claimed);
  return `<div class="dailies">
    <section class="panel login-card">
      <div>${ico('sun')}</div>
      <div><b>مكافأة الدخول اليومية</b><p class="muted small">سلسلة الأيام: ${fmt(p.login.streak)} ${p.login.streak >= 7 ? '🔥' : ''}</p></div>
      <button class="btn primary" data-act="login" ${loginDone ? 'disabled' : ''}>${loginDone ? 'تم الاستلام' : 'استلم'}</button>
    </section>
    ${ds.quests.map((q, i) => `
      <section class="panel quest ${q.claimed ? 'claimed' : q.progress >= q.target ? 'ready' : ''}">
        <div class="q-main"><b>${esc(q.text)}</b>
          <div class="bar q-bar"><div class="bar-fill" style="width:${pct(q.progress, q.target)}"></div><span class="bar-text">${fmt(q.progress)} / ${fmt(q.target)}</span></div>
          <small class="muted">${ico('two-coins')} ${fmt(q.reward.gold)} · ${ico('star-formation')} ${fmt(q.reward.xp)} خبرة</small></div>
        <button class="btn ${q.progress >= q.target && !q.claimed ? 'primary' : ''}" data-act="claim" data-i="${i}" ${q.claimed || q.progress < q.target ? 'disabled' : ''}>${q.claimed ? ico('check-mark') : 'استلم'}</button>
      </section>`).join('')}
    <section class="panel bonus ${all && !ds.bonusClaimed ? 'ready' : ''}">
      ${ico('open-treasure-chest')}
      <div><b>الصندوق الكبير</b><p class="muted small">أكمل المهام الثلاث لتحصل على أداة نادرة وجرعة كبرى.</p></div>
      <button class="btn primary" data-act="bonus" ${all && !ds.bonusClaimed ? '' : 'disabled'}>${ds.bonusClaimed ? 'تم' : 'افتح'}</button>
    </section>
    <p class="muted small center">تتجدد المهام كل يوم عند منتصف الليل (UTC).</p>
  </div>`;
}

// ───────────── الساحة ─────────────
function arena() {
  setTheme('hub');
  const me = S.user.id;
  const players = S.presence;
  if (!lbCache) loadLeaderboard();
  return `<div class="arena">
    <section class="panel">
      <h2>${ico('crossed-swords')} في هذا النشاط الآن</h2>
      <p class="muted small">ادعُ أصدقاءك للانضمام إلى النشاط في القناة، ثم تحدّهم هنا. الخاسر يفقد 30% من خبرة مستواه وقد تسقط أداة من حقيبته للفائز.</p>
      <div class="players">
        ${players.length ? players.map((pl) => {
          const c = pl.classKey ? classOf(pl.classKey) : null;
          return `<div class="player-row" style="--c:${c?.color || '#64748b'}">
            <span class="avatar small">${pl.avatar ? `<img src="${esc(pl.avatar)}" alt="">` : ''}${ico(c?.icon || 'person')}</span>
            <span class="pl-name"><b>${esc(pl.name)}</b><small>${c ? `${esc(c.name)} · م${pl.level} · ${fmt(pl.rating)}` : 'لم ينشئ شخصية'}</small></span>
            ${pl.id === me ? '<span class="tag">أنت</span>' : pl.busy ? '<span class="tag">في مبارزة</span>' : c ? `<button class="btn primary" data-act="challenge" data-id="${esc(pl.id)}">${ico('crossed-swords')} تحدٍّ</button>` : ''}
          </div>`;
        }).join('') : '<p class="muted">لا أحد هنا بعد.</p>'}
      </div>
    </section>
    <section class="panel">
      <h2>${ico('trophy-cup')} المتصدرون</h2>
      <div class="row gap"><button class="btn tiny ${lbBy === 'level' ? 'primary' : ''}" data-act="lb" data-by="level">المستوى</button>
      <button class="btn tiny ${lbBy === 'rating' ? 'primary' : ''}" data-act="lb" data-by="rating">تصنيف المبارزات</button></div>
      <ol class="lb">${(lbCache || []).map((x, i) => {
        const c = classOf(x.classKey);
        return `<li class="${x.id === me ? 'me' : ''}"><span class="rank">${i + 1}</span>${ico(c?.icon || 'person', '', `color:${c?.color}`)}<b>${esc(x.name)}</b><small>${lbBy === 'rating' ? `${fmt(x.rating)} تصنيف` : `المستوى ${x.level}`}</small></li>`;
      }).join('') || '<p class="muted">جارٍ التحميل...</p>'}</ol>
    </section>
  </div>`;
}

async function loadLeaderboard() {
  try {
    lbCache = await api(`/leaderboard?by=${lbBy}`);
    if (S.tab === 'arena') refreshTab();
  } catch {
    lbCache = [];
  }
}

// ───────────── الأحداث ─────────────
async function startBattle(body) {
  try {
    const r = await api('/battle/start', body);
    openBattle(r.battle, r.events, { mode: 'pve' });
  } catch (e) {
    toast(e.message, 'error');
  }
}

const handlers = {
  region: ({ id }) => {
    selRegion = id;
    refreshTab();
  },
  explore: () => startBattle({ type: 'explore', regionId: selRegion }),
  regionBoss: () => startBattle({ type: 'region_boss', regionId: selRegion }),
  chapter: async ({ id }) => {
    const ch = S.content.STORY.find((c) => c.id === id);
    await playStory(ch, ch.lines);
    startBattle({ type: 'story', chapterId: id });
  },
  item: ({ uid, eq }) => showItem(uid, !!eq),
  sellCommon: async () => {
    const uids = S.player.bag.filter((i) => i.rarity === 'common').map((i) => i.uid);
    if (!(await confirmBox(`بيع ${uids.length} أدوات شائعة؟`, 'بيع'))) return;
    try {
      const r = await api('/sell', { uids });
      applyPlayer(r.player);
      toast(`حصلت على ${r.gold} ذهبة`, 'good');
    } catch (e) {
      toast(e.message, 'error');
    }
  },
  reset: async () => {
    if (!(await confirmBox('سيتم حذف شخصيتك وكل تقدمك نهائياً. متأكد؟', 'احذف'))) return;
    await api('/character/reset', { confirm: 'RESET' });
    location.reload();
  },
  buy: async ({ id, qty }) => {
    try {
      const r = await api('/shop/buy', { id, qty: Number(qty) });
      applyPlayer(r.player);
      if (r.item) showItem(r.item.uid, false);
      else toast('تم الشراء', 'good');
    } catch (e) {
      toast(e.message, 'error');
    }
  },
  login: async () => {
    try {
      const r = await api('/login-reward', {});
      applyPlayer(r.player);
      toast(`+${r.reward.gold} ذهبة${r.reward.potions ? ' وجرعة كبرى' : ''} (اليوم ${r.streak})`, 'good');
    } catch (e) {
      toast(e.message, 'error');
    }
  },
  claim: async ({ i }) => {
    try {
      const r = await api('/dailies/claim', { index: Number(i) });
      applyPlayer(r.player);
      toast(`+${r.reward.gold} ذهبة · +${r.reward.xp} خبرة${r.levelUps ? ' · ارتقيت مستوى!' : ''}`, 'good');
    } catch (e) {
      toast(e.message, 'error');
    }
  },
  bonus: async () => {
    try {
      const r = await api('/dailies/bonus', {});
      applyPlayer(r.player);
      if (r.item) showItem(r.item.uid, false);
    } catch (e) {
      toast(e.message, 'error');
    }
  },
  challenge: ({ id }) => S.net.send({ type: 'challenge', to: id }),
  lb: ({ by }) => {
    lbBy = by;
    lbCache = null;
    refreshTab();
  },
};

export { refreshMe };
