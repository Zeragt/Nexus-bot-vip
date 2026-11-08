/** أدوات صغيرة للواجهة: هروب النصوص، الأيقونات، الإشعارات، النوافذ. */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** أيقونة من game-icons تُلوّن عبر CSS mask. */
// الرابط يجب أن يكون مطلقاً: url() داخل متغير CSS يُحلّ نسبةً لملف الأنماط لا للصفحة
const ART = new URL('art/', document.baseURI).href;
export const ico = (name, cls = '', style = '') =>
  `<i class="ico ${cls}" style="--src:url('${ART}${name}.svg');${style}"></i>`;

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const fmt = (n) => Number(n || 0).toLocaleString('ar-EG');
export const pct = (a, b) => `${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100))}%`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function toast(text, kind = 'info', ms = 2600) {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = esc(text);
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

/** نافذة منبثقة. يعيد دالة لإغلاقها. */
export function modal(html, { onClose, cls = '' } = {}) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${cls}">${html}</div>`;
  root.appendChild(wrap);
  const close = () => {
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 200);
    onClose?.();
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  return { el: wrap, close };
}

export function confirmBox(text, okText = 'تأكيد') {
  return new Promise((resolve) => {
    let ok = false;
    const m = modal(
      `<p class="confirm-text">${esc(text)}</p>
       <div class="row gap center"><button class="btn primary" data-ok>${esc(okText)}</button><button class="btn" data-close>إلغاء</button></div>`,
      { onClose: () => resolve(ok) },
    );
    m.el.querySelector('[data-ok]').onclick = () => {
      ok = true;
      m.close();
    };
  });
}

/** يربط أزرار data-act داخل عنصر بدوال. */
export function bind(root, handlers) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el) || el.disabled) return;
    const fn = handlers[el.dataset.act];
    if (fn) fn(el.dataset, el, e);
  });
}

export function bar(cur, max, cls, label = true) {
  return `<div class="bar ${cls}"><div class="bar-lag" style="width:${pct(cur, max)}"></div><div class="bar-fill" style="width:${pct(cur, max)}"></div>${
    label ? `<span class="bar-text">${fmt(Math.round(cur))} / ${fmt(max)}</span>` : ''
  }</div>`;
}
