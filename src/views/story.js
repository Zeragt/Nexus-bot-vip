import { ButtonStyle } from 'discord.js';
import { card, row, button, select } from '../core/ui.js';
import { cid } from '../core/customId.js';
import { UserError } from '../core/errors.js';
import { ACTS, CHAPTERS, CHAPTER_BY_KEY, fillStory } from '../content/story/index.js';
import { CLASS_BY_KEY } from '../content/classes.js';
import { renderStoryPage, renderChapterCover, renderChoice, renderChapterList } from '../render/index.js';
import { overview, readPage, progressOf, storyStatus, isAtLocation, storyLeaders, locationInfo } from '../services/story.js';
import { listFactions } from '../services/factions.js';
import { requireByUser } from '../services/characters.js';
import { characterImage } from './avatars.js';
import { hasArt } from './art.js';

async function locationName(key) {
  return (await locationInfo(key)).nameAr;
}

let factionNames = null;
async function factionName(key) {
  if (!factionNames) factionNames = Object.fromEntries((await listFactions()).map((f) => [f.key, f.name_ar]));
  return factionNames[key] ?? key;
}

const fill = (ch) => (t) => fillStory(t, { name: ch.name, className: CLASS_BY_KEY[ch.classKey]?.nameAr });

function navRow(owner, chapter) {
  return row(
    button(cid('st', 'cur', owner), 'فصلي الحالي', ButtonStyle.Secondary, { emoji: '📖' }),
    button(cid('st', 'list', owner, chapter?.act.number ?? 1), 'كل الفصول', ButtonStyle.Secondary, { emoji: '🗂️' }),
    button(cid('st', 'bosses', owner, 1), 'قاعة الزعماء', ButtonStyle.Secondary, { emoji: '👑' }),
  );
}

async function coverCard(ch, progress, status, chapter) {
  return renderChapterCover({
    act: chapter.act,
    chapter,
    boss: chapter.boss,
    avatar: await characterImage(ch.id, ch.userId),
    classKey: ch.classKey,
    heroName: ch.name,
    locationName: await locationName(chapter.location),
    status,
    blockers: status.blockers,
    here: isAtLocation(ch, chapter, (await locationInfo(chapter.location)).region),
    attempts: progress.bossAttempts,
    readPages: progress.readPages[chapter.key] ?? 0,
  });
}

/** The chapter the player is on: its cover, or the decision they still owe. */
export async function currentMessage(userId) {
  const { ch, progress, status } = await overview(userId);
  if (status.pendingChoice) return choiceMessage(ch, progress, status.pendingChoice);
  if (status.done) {
    const last = CHAPTERS.at(-1);
    return pageMessage(userId, last.key, 0, { victory: true });
  }
  const chapter = status.current;
  const read = progress.readPages[chapter.key] ?? 0;
  const canFight = !status.blockers.length;
  const buttons = [
    button(
      cid('st', 'read', userId, chapter.key, Math.min(chapter.pages.length, read + 1)),
      read ? `تابع القراءة (${read}/${chapter.pages.length})` : 'ابدأ القراءة',
      ButtonStyle.Primary,
      {
        emoji: '📜',
        disabled: !canFight,
      },
    ),
    button(cid('st', 'fight', userId), `واجه ${chapter.boss.name}`.slice(0, 80), ButtonStyle.Danger, { emoji: '⚔️', disabled: !canFight }),
  ];
  if (hasArt(`story/${chapter.key}.webp`)) buttons.push(button(cid('st', 'poster', userId, chapter.key), 'ملصق الفصل', ButtonStyle.Secondary, { emoji: '🖼️' }));
  return {
    content: status.blockers.length ? `🔒 ${status.blockers.join('\n')}` : null,
    files: [card(await coverCard(ch, progress, status, chapter), 'story')],
    components: [row(...buttons), navRow(userId, chapter)],
  };
}

/** One page; page 0 with `victory` shows the chapter's victory text. */
export async function pageMessage(userId, chapterKey, page, { victory = false, rewards = null } = {}) {
  const chapter = CHAPTER_BY_KEY[chapterKey];
  if (!chapter) throw new UserError('هذا الفصل غير موجود');
  let ch;
  let progress;
  let p = page;
  if (victory) {
    ch = await requireByUser(userId);
    progress = await progressOf(ch.id);
    if (chapter.index >= progress.chapter) throw new UserError('لم تهزم زعيم هذا الفصل بعد');
  } else {
    const res = await readPage(userId, chapterKey, page);
    ch = res.ch;
    progress = res.progress;
    p = res.page;
  }
  const f = fill(ch);
  const total = chapter.pages.length;
  const pg = victory ? null : chapter.pages[p - 1];
  const buf = await renderStoryPage({
    act: chapter.act,
    chapter,
    page: p,
    total,
    text: f(victory ? chapter.victory : pg.text),
    speaker: pg?.speaker ? f(pg.speaker) : null,
    mode: victory ? 'victory' : 'page',
    rewards,
    avatar: await characterImage(ch.id, userId),
    classKey: ch.classKey,
    locationName: await locationName(chapter.location),
  });
  const done = chapter.index < progress.chapter;
  const rows = [];
  if (!victory) {
    const nav = [
      button(cid('st', 'read', userId, chapter.key, Math.max(1, p - 1)), 'السابق', ButtonStyle.Secondary, { emoji: '◀️', disabled: p <= 1 }),
      button(cid('st', 'read', userId, chapter.key, Math.min(total, p + 1)), 'التالي', ButtonStyle.Primary, { emoji: '▶️', disabled: p >= total }),
    ];
    if (p >= total && !done) nav.push(button(cid('st', 'fight', userId), `واجه ${chapter.boss.name}`.slice(0, 80), ButtonStyle.Danger, { emoji: '⚔️' }));
    if (p >= total && done) nav.push(button(cid('st', 'win', userId, chapter.key), 'خاتمة الفصل', ButtonStyle.Success, { emoji: '🏆' }));
    rows.push(row(...nav));
  } else {
    const next = CHAPTERS[chapter.index + 1];
    const pending = chapter.choice && progress.choices[chapter.key] == null;
    if (pending) rows.push(row(button(cid('st', 'cur', userId), 'القرار ينتظرك', ButtonStyle.Danger, { emoji: '⚖️' })));
    else if (next && next.index === progress.chapter)
      rows.push(row(button(cid('st', 'cur', userId), `الفصل التالي: ${next.title}`.slice(0, 80), ButtonStyle.Success, { emoji: '➡️' })));
  }
  rows.push(navRow(userId, chapter));
  return { files: [card(buf, 'story')], components: rows };
}

export async function choiceMessage(ch, progress, chapter) {
  const chosen = progress.choices[chapter.key] ?? null;
  const options = await Promise.all(
    chapter.choice.options.map(async (o) => ({ ...o, result: fill(ch)(o.result), repLabel: o.rep ? await factionName(o.rep[0]) : null })),
  );
  const buf = await renderChoice({ act: chapter.act, chapter, prompt: fill(ch)(chapter.choice.prompt), options, chosen });
  const rows = [];
  if (chosen == null) {
    rows.push(
      row(
        ...chapter.choice.options.map((o, i) =>
          button(cid('st', 'choose', ch.userId, chapter.key, i), `${i + 1}. ${o.label}`.slice(0, 80), i === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
        ),
      ),
    );
  } else {
    rows.push(row(button(cid('st', 'cur', ch.userId), 'تابع القصة', ButtonStyle.Success, { emoji: '➡️' })));
  }
  rows.push(navRow(ch.userId, chapter));
  return { files: [card(buf, 'story')], components: rows };
}

export async function listMessage(userId, actNumber = null) {
  const ch = await requireByUser(userId);
  const progress = await progressOf(ch.id);
  const status = storyStatus(ch, progress);
  const n = actNumber ?? status.current?.act.number ?? ACTS.length;
  const act = ACTS[n - 1];
  if (!act) throw new UserError('هذا الجزء غير موجود');
  const chapters = CHAPTERS.filter((c) => c.act.number === n).map((c) => {
    const choice = c.choice && progress.choices[c.key] != null ? c.choice.options[progress.choices[c.key]]?.label : null;
    return {
      ...c,
      bossName: c.boss.name,
      choiceLabel: choice,
      state: c.index < progress.chapter ? 'done' : c.index === progress.chapter ? 'current' : 'locked',
    };
  });
  const buf = await renderChapterList({ act: { ...act, number: n }, chapters, leaders: await storyLeaders(6), total: CHAPTERS.length });
  const readable = chapters.filter((c) => c.state !== 'locked');
  const rows = [
    row(
      ...ACTS.map((a, i) =>
        button(cid('st', 'list', userId, i + 1), `الجزء ${i + 1}`, i + 1 === n ? ButtonStyle.Primary : ButtonStyle.Secondary, { disabled: i + 1 === n }),
      ),
    ),
  ];
  if (readable.length) {
    rows.push(
      row(
        select(
          cid('st', 'open', userId),
          'أعد قراءة فصل',
          readable.map((c) => ({ label: `${c.index + 1}. ${c.title}`, value: c.key, description: c.state === 'done' ? 'مكتمل' : 'الفصل الحالي' })),
        ),
      ),
    );
  }
  rows.push(navRow(userId, chapters[0]));
  return { files: [card(buf, 'story')], components: rows };
}

/** The story's bosses, now part of the hall of 100 (each with its own look). */
export async function bossesMessage(userId, page = 1) {
  const { hallMessage } = await import('./expansion.js');
  return hallMessage(userId, page, 'story');
}

/** Follow-up after a story fight ends. */
export async function storyResultMessage(userId, result) {
  if (!result) return null;
  if (result.won && !result.replay) return pageMessage(userId, result.chapter.key, 0, { victory: true, rewards: result.text });
  if (!result.won) {
    return {
      content: `💀 سقطت أمام **${result.chapter.boss.name}** (المحاولة ${result.attempts}). استرح، طوّر مهاراتك عبر /class loadout، ثم عد.`,
      components: [row(button(cid('st', 'cur', userId), 'العودة إلى الفصل', ButtonStyle.Secondary, { emoji: '📖' }))],
    };
  }
  return null;
}
