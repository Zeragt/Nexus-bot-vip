import { api } from '../api.js';
import { S, applyPlayer } from '../state.js';
import { esc, ico, bind, toast } from '../ui.js';

const STAT_NAMES = { hp: 'الصحة', atk: 'الهجوم', def: 'الدفاع', spd: 'السرعة', crit: 'الحرجة' };
const STAT_MAX = { hp: 150, atk: 18, def: 14, spd: 14, crit: 20 };

export function renderCreate(root, done) {
  const classes = S.content.CLASSES;
  let sel = classes[0].key;

  const detail = (c) => `
    <div class="cls-detail" style="--c:${c.color}">
      <div class="cls-hero">${ico(c.icon, 'hero-ico')}</div>
      <h2>${esc(c.name)} <span class="tag">${esc(c.role)}</span></h2>
      <p class="muted">${esc(c.blurb)}</p>
      <div class="stat-bars">
        ${Object.keys(STAT_NAMES).map((k) => `<div class="sb"><span>${STAT_NAMES[k]}</span><div class="sb-track"><div style="width:${Math.min(100, (c.base[k] / STAT_MAX[k]) * 100)}%"></div></div></div>`).join('')}
      </div>
      <div class="passive">${ico('star-swirl')} <b>${esc(c.passive.name)}:</b> ${esc(c.passive.desc)}</div>
      <div class="skill-list">
        ${c.skills.map((s) => `<div class="skill-chip" title="${esc(s.desc)}">${ico(s.icon)}<span>${esc(s.name)}</span><small>م${s.unlock}</small></div>`).join('')}
      </div>
    </div>`;

  root.innerHTML = `
    <div class="create">
      <header class="create-head"><div class="logo small">NEXUS</div><h1>اختر طريقك يا حامل الشرارة</h1>
      <p class="muted">انكسر قلب النيكسس إلى ست شظايا. اختر فئتك وابدأ الرحلة لاستعادتها.</p></header>
      <div class="create-body">
        <div class="cls-grid">
          ${classes.map((c) => `<button class="cls-card ${c.key === sel ? 'on' : ''}" data-act="pick" data-key="${c.key}" style="--c:${c.color}">
              ${ico(c.icon, 'cls-ico')}<b>${esc(c.name)}</b><small>${esc(c.role)}</small></button>`).join('')}
        </div>
        <div class="cls-side">
          <div id="cls-detail">${detail(classes[0])}</div>
          <label class="name-field">اسم البطل<input id="hero-name" maxlength="24" value="${esc(S.user.name)}" /></label>
          <button class="btn primary big" data-act="go">${ico('portal')} ادخل البوابة</button>
        </div>
      </div>
    </div>`;

  bind(root.querySelector('.create'), {
    pick: ({ key }) => {
      sel = key;
      root.querySelectorAll('.cls-card').forEach((b) => b.classList.toggle('on', b.dataset.key === key));
      root.querySelector('#cls-detail').innerHTML = detail(classes.find((c) => c.key === key));
    },
    go: async (_, btn) => {
      btn.disabled = true;
      try {
        const p = await api('/character', { classKey: sel, name: root.querySelector('#hero-name').value.trim() });
        applyPlayer(p);
        toast('بدأت رحلتك! افتح "الحكاية" للفصل الأول.', 'good', 4000);
        S.tab = 'story';
        done();
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    },
  });
}
