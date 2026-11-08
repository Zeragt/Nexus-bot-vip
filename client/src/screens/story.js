/** حوارات الحكاية بأسلوب الرواية المصورة: نقرة لتسريع النص، نقرة أخرى للسطر التالي. */
import { S, regionOf } from '../state.js';
import { esc, ico } from '../ui.js';
import { setTheme } from '../fx.js';

export function playStory(chapter, lines) {
  return new Promise((resolve) => {
    const region = regionOf(chapter.region);
    setTheme(region.id);
    const wrap = document.createElement('div');
    wrap.className = 'story-screen';
    document.body.appendChild(wrap);
    document.body.classList.add('overlay');
    let i = 0;
    let typing = null;

    const iconFor = (speaker) => S.content.SPEAKERS[speaker] || (chapter.boss ? region.boss.icon : 'hood');

    const finish = () => {
      clearInterval(typing);
      wrap.classList.add('out');
      setTimeout(() => {
        wrap.remove();
        if (!document.querySelector('.battle')) document.body.classList.remove('overlay');
      }, 250);
      resolve();
    };

    const show = () => {
      if (i >= lines.length) return finish();
      const line = lines[i];
      const isLyra = line.speaker.startsWith('ليرا');
      const isNarrator = line.speaker === 'الراوي';
      wrap.innerHTML = `
        <div class="story-top"><small>${esc(region.name)}</small><h2>${esc(chapter.title)}</h2>
          <button class="btn tiny ghost skip">تخطٍّ ${ico('player-next')}</button></div>
        <div class="story-stage ${isLyra ? 'ally' : isNarrator ? 'narrator' : 'foe'}">
          <div class="speaker-portrait" style="--c:${isLyra ? '#7dd3fc' : isNarrator ? '#e2e8f0' : region.boss.color}">${ico(iconFor(line.speaker))}</div>
        </div>
        <div class="dialog"><b class="speaker">${esc(line.speaker)}</b><p class="line"></p><span class="more">▼</span></div>`;
      wrap.querySelector('.skip').onclick = (e) => {
        e.stopPropagation();
        finish();
      };
      const p = wrap.querySelector('.line');
      let n = 0;
      clearInterval(typing);
      typing = setInterval(() => {
        n += 2;
        p.textContent = line.text.slice(0, n);
        if (n >= line.text.length) {
          clearInterval(typing);
          typing = null;
        }
      }, 22);
    };

    wrap.addEventListener('click', () => {
      if (typing) {
        clearInterval(typing);
        typing = null;
        wrap.querySelector('.line').textContent = lines[i].text;
        return;
      }
      i += 1;
      show();
    });
    show();
  });
}
