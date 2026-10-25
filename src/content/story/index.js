import act1 from './act1.js';
import act2 from './act2.js';
import act3 from './act3.js';
import act4 from './act4.js';
import act5 from './act5.js';
import act6 from './act6.js';
import act7 from './act7.js';
import act8 from './act8.js';
import act9 from './act9.js';

export const ACTS = [act1, act2, act3, act4, act5, act6, act7, act8, act9];

/** Flat, ordered list of chapters; `index` is the 0-based position, `act` the parent act. */
export const CHAPTERS = ACTS.flatMap((act, a) =>
  act.chapters.map((ch) => ({ ...ch, act: { key: act.key, title: act.title, subtitle: act.subtitle, number: a + 1 } })),
).map((ch, index) => ({ ...ch, index }));

export const CHAPTER_BY_KEY = Object.fromEntries(CHAPTERS.map((c) => [c.key, c]));

export function chapterAt(index) {
  return CHAPTERS[index] ?? null;
}

/** Replace `{name}` and `{class}` placeholders. */
export function fillStory(text, { name, className }) {
  return String(text ?? '')
    .replaceAll('{name}', name)
    .replaceAll('{class}', className ?? 'مغامر');
}

export function storyStats() {
  let pages = 0;
  let chars = 0;
  for (const c of CHAPTERS) {
    pages += c.pages.length;
    for (const p of c.pages) chars += p.text.length;
    chars += c.victory.length;
  }
  return { acts: ACTS.length, chapters: CHAPTERS.length, pages, chars };
}
