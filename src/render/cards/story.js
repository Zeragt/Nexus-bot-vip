import { theme, hexToRgba } from '../theme.js';
import { icon } from '../icons.js';
import { createCard, frame, panel, text, paragraph, wrap, chip, toImage, brand, roundRect, bar, hashSeed } from '../draw.js';
import { drawFighter, drawMonster } from '../sprites.js';
import { sceneImage } from '../sceneCache.js';
import { sceneFor } from '../scenes.js';

const W = 1280;
const H = 720;
const ACT_COLORS = ['#22d3ee', '#f59e0b', '#38bdf8', '#a78bfa'];
export const actColor = (n) => ACT_COLORS[(n - 1) % ACT_COLORS.length];

async function sceneBackdrop(ctx, locationKey, { dim = 0.5, seed = 1 } = {}) {
  ctx.drawImage(await sceneImage(sceneFor(locationKey), W, H, { seed }), 0, 0);
  ctx.fillStyle = `rgba(4, 7, 22, ${dim})`;
  ctx.fillRect(0, 0, W, H);
}

/** A sheet of old paper: the reading surface for story pages and codex entries. */
function parchment(ctx, x, y, w, h, color) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 22);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(14, 18, 48, 0.93)');
  g.addColorStop(1, 'rgba(8, 10, 30, 0.95)');
  ctx.fillStyle = g;
  ctx.shadowColor = hexToRgba(color, 0.6);
  ctx.shadowBlur = 30;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = hexToRgba(color, 0.55);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Inner rule and corner ornaments.
  roundRect(ctx, x + 12, y + 12, w - 24, h - 24, 14);
  ctx.strokeStyle = hexToRgba(color, 0.18);
  ctx.lineWidth = 1;
  ctx.stroke();
  for (const [cx, cy] of [
    [x + 12, y + 12],
    [x + w - 12, y + 12],
    [x + 12, y + h - 12],
    [x + w - 12, y + h - 12],
  ]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, 0.8);
    ctx.fill();
  }
  ctx.restore();
}

/** Lays out long text in the given box, shrinking the font until it fits. */
function fitParagraph(ctx, str, right, top, width, height, { color = theme.text, max = 30, min = 17, weight = 500 } = {}) {
  for (let size = max; size >= min; size -= 1) {
    const lh = 1.72;
    const lines = Math.floor(height / (size * lh));
    const used = wrap(ctx, str, width, { size, weight, maxLines: lines + 1 });
    if (used.length <= lines) {
      paragraph(ctx, str, right, top, width, { size, weight, color, lineHeight: lh, maxLines: lines });
      return size;
    }
  }
  paragraph(ctx, str, right, top, width, { size: min, weight, color, lineHeight: 1.7, maxLines: Math.floor(height / (min * 1.7)) });
  return min;
}

function pageDots(ctx, page, total, cx, y, color) {
  const gap = Math.min(22, 360 / Math.max(1, total));
  const start = cx + ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    ctx.arc(start - i * gap, y, i === page - 1 ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = i < page ? color : 'rgba(255,255,255,0.18)';
    ctx.fill();
  }
}

/**
 * One page of a chapter: the location behind, the hero on the left, the page on the right.
 * `view` = { act:{number,title}, chapter:{title,key,location,index}, page, total, text, speaker, avatar, classKey, heroName, locationName, mode }
 */
export async function renderStoryPage(view) {
  const { act, chapter, page, total, avatar = null, classKey = null, locationName = '' } = view;
  const color = actColor(act.number);
  const { canvas, ctx } = createCard(W, H);
  await sceneBackdrop(ctx, chapter.location, { dim: 0.35, seed: hashSeed(chapter.key) });
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(4,7,22,0.1)');
  g.addColorStop(0.35, 'rgba(4,7,22,0.45)');
  g.addColorStop(1, 'rgba(4,7,22,0.8)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const victory = view.mode === 'victory';
  const pose = victory ? 'victory' : view.speaker ? 'idle' : page % 3 === 0 ? 'cast' : 'idle';
  drawFighter(ctx, { x: 215, y: H - 46, scale: 1.25, avatar, classKey, pose, seed: hashSeed(chapter.key) + page });

  const px = 400;
  const pw = W - px - 36;
  const py = 96;
  const ph = H - py - 40;
  parchment(ctx, px, py, pw, ph, color);

  // Header above the page.
  chip(ctx, `الجزء ${act.number}`, W - 40, 44, { color, size: 15, h: 30, iconName: 'book' });
  text(ctx, chapter.title, W - 170, 52, { size: 30, weight: 800, maxWidth: 560, glow: 14, glowColor: hexToRgba(color, 0.6) });
  if (locationName) chip(ctx, locationName, px + 4, 44, { color: theme.textDim, size: 14, h: 28, iconName: 'pin', align: 'left' });

  const right = px + pw - 40;
  let top = py + 52;
  if (view.speaker) {
    icon(ctx, 'chat', right - 12, top - 8, 22, color, { glow: 8 });
    text(ctx, view.speaker, right - 34, top, { size: 21, weight: 800, color, maxWidth: pw - 120 });
    top += 42;
  } else if (victory) {
    icon(ctx, 'trophy', right - 12, top - 8, 22, theme.gold, { glow: 8 });
    text(ctx, 'النصر', right - 34, top, { size: 21, weight: 800, color: theme.gold });
    top += 42;
  }
  const bottom = py + ph - (view.rewards ? 118 : 70);
  fitParagraph(ctx, view.text, right, top, pw - 80, bottom - top, { color: theme.text });

  if (view.rewards) {
    panel(ctx, px + 30, py + ph - 108, pw - 60, 56, { radius: 14, fill: 'rgba(48, 34, 8, 0.6)', stroke: hexToRgba(theme.gold, 0.6) });
    icon(ctx, 'coin', px + pw - 58, py + ph - 80, 22, theme.gold);
    text(ctx, view.rewards, px + pw - 84, py + ph - 72, { size: 18, weight: 700, color: theme.gold, maxWidth: pw - 140 });
  }
  if (!victory) {
    pageDots(ctx, page, total, px + pw / 2, py + ph - 34, color);
    text(ctx, `${page} / ${total}`, px + 40, py + ph - 28, { size: 15, weight: 700, family: 'num', align: 'left', color: theme.textMute });
  }
  frame(ctx, W, H, color);
  brand(ctx, 30, H - 22);
  return toImage(canvas);
}

/**
 * Chapter cover: the hero facing the chapter's boss, with requirements and progress.
 * `view` = { act, chapter, boss, avatar, classKey, heroName, locationName, status:{completed,total}, blockers:[], here, attempts, readPages }
 */
export async function renderChapterCover(view) {
  const { act, chapter, boss } = view;
  const color = actColor(act.number);
  const { canvas, ctx } = createCard(W, H);
  await sceneBackdrop(ctx, chapter.location, { dim: 0.25, seed: hashSeed(chapter.key) });
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(4,7,22,0.85)');
  v.addColorStop(0.35, 'rgba(4,7,22,0.2)');
  v.addColorStop(0.7, 'rgba(4,7,22,0.25)');
  v.addColorStop(1, 'rgba(4,7,22,0.92)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  drawFighter(ctx, { x: 300, y: H - 130, scale: 1.05, avatar: view.avatar, classKey: view.classKey, facing: 1, pose: 'idle', seed: 7 });
  drawMonster(ctx, {
    x: W - 300,
    y: H - 130,
    scale: boss.archetype === 'dragon' ? 0.72 : 0.9,
    facing: -1,
    archetype: boss.archetype,
    palette: boss.palette,
    boss: true,
    seed: hashSeed(boss.key),
  });
  // VS spark between them.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = ctx.createRadialGradient(W / 2, H - 290, 0, W / 2, H - 290, 120);
  r.addColorStop(0, hexToRgba(color, 0.55));
  r.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = r;
  ctx.fillRect(W / 2 - 120, H - 410, 240, 240);
  ctx.restore();
  text(ctx, 'VS', W / 2, H - 276, { size: 54, weight: 800, family: 'num', align: 'center', color: '#fff', glow: 24, glowColor: color });

  chip(ctx, `${act.title}`, W / 2, 40, { color, size: 15, h: 30, iconName: 'book', align: 'center' });
  text(ctx, `الفصل ${chapter.index + 1}: ${chapter.title}`, W / 2, 104, {
    size: 44,
    weight: 800,
    align: 'center',
    maxWidth: 1100,
    glow: 18,
    glowColor: hexToRgba(color, 0.7),
  });
  text(ctx, boss.intro ?? '', W / 2, 146, { size: 19, weight: 600, align: 'center', color: theme.textDim, maxWidth: 1000 });

  text(ctx, view.heroName ?? '', 300, H - 92, { size: 24, weight: 800, align: 'center', maxWidth: 380 });
  text(ctx, boss.name, W - 300, H - 92, { size: 24, weight: 800, align: 'center', color: '#ff8fa3', maxWidth: 380 });
  text(ctx, `زعيم • المستوى ${chapter.level + (boss.levelOffset ?? 1)}`, W - 300, H - 64, { size: 15, weight: 700, align: 'center', color: theme.textDim });

  // Requirements strip.
  const items = [
    { label: `المستوى ${chapter.level}+`, ok: !view.blockers?.length, iconName: 'star' },
    { label: view.locationName ?? chapter.location, ok: view.here, iconName: 'pin' },
    { label: `قرأت ${view.readPages ?? 0} / ${chapter.pages.length}`, ok: (view.readPages ?? 0) >= chapter.pages.length, iconName: 'book' },
  ];
  let x = W / 2 + 290;
  for (const it of items) {
    x -= chip(ctx, it.label, x, H - 40, { color: it.ok ? theme.success : theme.textMute, size: 15, h: 30, iconName: it.ok ? 'check' : it.iconName }) + 12;
  }
  if (view.attempts) text(ctx, `محاولات سابقة: ${view.attempts}`, W / 2, H - 92, { size: 15, weight: 700, align: 'center', color: '#fca5a5' });

  // Overall progress across the saga.
  const st = view.status ?? { completed: 0, total: 25 };
  bar(ctx, 40, 22, 220, 10, st.completed / st.total, { colors: [color, '#fff'] });
  text(ctx, `${st.completed} / ${st.total}`, 40, 52, { size: 14, weight: 700, family: 'num', align: 'left', color: theme.textDim });
  frame(ctx, W, H, color);
  return toImage(canvas);
}

/** The decision that closes a chapter. `view` = { act, chapter, prompt, options:[{label,result}], chosen, avatar, classKey } */
export async function renderChoice(view) {
  const { act, chapter } = view;
  const color = actColor(act.number);
  const { canvas, ctx } = createCard(W, H);
  await sceneBackdrop(ctx, chapter.location, { dim: 0.62, seed: hashSeed(chapter.key) + 3 });
  chip(ctx, 'قرار مصيري', W / 2, 44, { color: theme.gold, size: 16, h: 32, iconName: 'flag', align: 'center' });
  text(ctx, chapter.title, W / 2, 104, { size: 40, weight: 800, align: 'center', glow: 16, glowColor: hexToRgba(color, 0.7), maxWidth: 1100 });
  paragraph(ctx, view.prompt, W / 2 + 470, 150, 940, { size: 21, weight: 600, color: theme.text, maxLines: 3, lineHeight: 1.6 });

  const n = view.options.length;
  const cw = (W - 80 - (n - 1) * 24) / n;
  view.options.forEach((o, i) => {
    const x = W - 40 - cw - i * (cw + 24);
    const y = 290;
    const chosen = view.chosen === i;
    const faded = view.chosen != null && !chosen;
    const c = chosen ? theme.gold : i === 0 ? color : '#f472b6';
    ctx.save();
    if (faded) ctx.globalAlpha = 0.45;
    parchment(ctx, x, y, cw, 340, c);
    text(ctx, `${i + 1}`, x + cw - 44, y + 58, { size: 40, weight: 800, family: 'num', align: 'center', color: c, glow: 12 });
    text(ctx, o.label, x + cw - 84, y + 56, { size: 26, weight: 800, maxWidth: cw - 120 });
    if (view.chosen != null) fitParagraph(ctx, o.result, x + cw - 36, y + 118, cw - 72, 170, { color: chosen ? theme.text : theme.textDim, max: 21, min: 15 });
    else paragraph(ctx, 'لكل قرار ثمن، ولن تستطيع العودة عنه.', x + cw - 36, y + 120, cw - 72, { size: 18, color: theme.textMute, maxLines: 2 });
    if (o.rep) chip(ctx, `${o.repLabel ?? o.rep[0]} (${o.rep[1]} سمعة)`, x + 30, y + 300, { color: c, size: 14, h: 28, iconName: 'shield', align: 'left' });
    if (chosen) chip(ctx, 'اخترت هذا', x + cw - 30, y + 300, { color: theme.gold, size: 14, h: 28, iconName: 'check' });
    ctx.restore();
  });
  frame(ctx, W, H, theme.gold);
  brand(ctx, 30, H - 22);
  return toImage(canvas);
}

/** All chapters of one act with their state. `view` = { act, chapters:[{index,title,level,state,bossName,choiceLabel}], leaders } */
export async function renderChapterList(view) {
  const { act } = view;
  const color = actColor(act.number);
  const { canvas, ctx } = createCard(W, H);
  await sceneBackdrop(ctx, view.chapters[0]?.location ?? 'nexus_city', { dim: 0.7, seed: act.number });
  text(ctx, act.title, W - 48, 70, { size: 38, weight: 800, glow: 16, glowColor: hexToRgba(color, 0.7), maxWidth: 900 });
  paragraph(ctx, act.subtitle, W - 48, 112, 900, { size: 18, color: theme.textDim, maxLines: 2 });
  const STATE = {
    done: { label: 'مكتمل', color: theme.success, icon: 'check' },
    current: { label: 'الفصل الحالي', color: theme.gold, icon: 'flame' },
    locked: { label: 'مقفل', color: theme.textMute, icon: 'lock' },
  };
  const top = 170;
  const rh = Math.min(70, (H - top - 40) / Math.max(1, view.chapters.length));
  view.chapters.forEach((c, i) => {
    const y = top + i * rh;
    const st = STATE[c.state];
    const listW = view.leaders?.length ? 820 : W - 80;
    const x = W - 40 - listW;
    panel(ctx, x, y, listW, rh - 10, {
      radius: 14,
      fill: c.state === 'current' ? 'rgba(48,34,8,0.55)' : 'rgba(6,10,34,0.7)',
      stroke: hexToRgba(st.color, 0.5),
    });
    text(ctx, `${c.index + 1}`, W - 74, y + rh / 2 + 4, { size: 24, weight: 800, family: 'num', align: 'center', color: st.color });
    text(ctx, c.state === 'locked' ? '؟؟؟' : c.title, W - 110, y + rh / 2 - 4, {
      size: 21,
      weight: 800,
      maxWidth: 420,
      color: c.state === 'locked' ? theme.textMute : theme.text,
    });
    text(ctx, c.state === 'locked' ? `يُفتح عند المستوى ${c.level}` : `المستوى ${c.level} • ${c.bossName}`, W - 110, y + rh / 2 + 20, {
      size: 14,
      weight: 600,
      color: theme.textDim,
      maxWidth: 420,
    });
    chip(ctx, st.label, x + 20, y + rh / 2 - 5, { color: st.color, size: 14, h: 28, iconName: st.icon, align: 'left' });
    if (c.choiceLabel)
      text(ctx, `قرارك: ${c.choiceLabel}`, x + 170, y + rh / 2, { size: 14, weight: 600, color: '#fde68a', align: 'left', dir: 'rtl', maxWidth: 220 });
  });
  if (view.leaders?.length) {
    const lx = 40;
    panel(ctx, lx, top, 340, 70 * Math.min(6, view.leaders.length) + 60, { radius: 18, fill: 'rgba(6,10,34,0.75)' });
    text(ctx, 'الأبعد في الحكاية', lx + 320, top + 36, { size: 19, weight: 800, color: theme.gold });
    view.leaders.slice(0, 6).forEach((l, i) => {
      const y = top + 80 + i * 70;
      text(ctx, l.name, lx + 320, y, { size: 18, weight: 700, maxWidth: 220 });
      text(ctx, l.className ?? 'بلا كلاس', lx + 320, y + 24, { size: 13, color: theme.textDim, maxWidth: 220 });
      text(ctx, `${l.chapter}/${view.total ?? 25}`, lx + 24, y + 10, { size: 18, weight: 800, family: 'num', align: 'left', color: theme.gold });
    });
  }
  frame(ctx, W, H, color);
  brand(ctx, 30, H - 22);
  return toImage(canvas);
}
