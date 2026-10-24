import { theme, difficultyColors, rarityColors } from '../theme.js';
import { icon } from '../icons.js';
import { DIFFICULTY_LABELS, DIFFICULTY_STARS } from '../../config/game.js';
import { createCard, background, frame, panel, text, header, footer, paragraph, bar, stars, chip, hashSeed, toImage, emptyState, roundRect } from '../draw.js';
import { fmt } from '../../utils/format.js';

function rewardChips(ctx, q, right, y, maxW) {
  let x = right;
  const items = [
    q.xp > 0 && { label: `${fmt(q.xp)} XP`, color: theme.cyan, iconName: 'sparkle' },
    q.nx > 0 && { label: `${fmt(q.nx)} NX`, color: theme.gold, iconName: 'coin' },
    q.reputation > 0 && { label: `+${q.reputation} سمعة`, color: theme.violet, iconName: 'crown' },
    ...(q.items ?? [])
      .slice(0, 2)
      .map((it) => ({ label: `${it.name}${it.quantity > 1 ? ` x${it.quantity}` : ''}`, color: rarityColors[it.rarity] ?? theme.cyan, iconName: 'gem' })),
  ].filter(Boolean);
  for (const c of items) {
    const w = chip(ctx, c.label, x, y, { ...c, size: 14, h: 28 });
    x -= w + 8;
    if (right - x > maxW) break;
  }
}

/** The 📜 QUEST BOARD — a pinned-notice wall of available quests. */
export async function renderQuestBoard({ quests, page = 1, pages = 1, playerLevel = null }) {
  const W = 1000;
  const cardH = 150;
  const top = 150;
  const H = top + Math.max(1, quests.length) * (cardH + 14) + 50;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: 31337, accent: theme.gold });
  frame(ctx, W, H, theme.gold);
  text(ctx, 'QUEST BOARD', W / 2, 52, { size: 34, weight: 900, family: 'num', align: 'center', color: theme.gold, glow: 18 });
  text(ctx, 'لوحة المهام', W / 2, 96, { size: 22, weight: 800, align: 'center', color: theme.text });
  icon(ctx, 'scroll', W / 2 - 190, 52, 30, theme.gold, { glow: 10 });
  icon(ctx, 'scroll', W / 2 + 190, 52, 30, theme.gold, { glow: 10 });

  if (!quests.length) emptyState(ctx, W, top + 50, 'لا توجد مهام معلّقة حالياً', 'scroll');

  quests.forEach((q, i) => {
    const y = top + i * (cardH + 14);
    const dc = difficultyColors[q.difficulty] ?? theme.cyan;
    const locked = playerLevel != null && playerLevel < q.minLevel;
    panel(ctx, 40, y, W - 80, cardH, { radius: 18, accentTop: dc, fill: 'rgba(14, 24, 66, 0.7)' });
    ctx.save();
    ctx.globalAlpha = locked ? 0.55 : 1;
    // pin
    ctx.beginPath();
    ctx.arc(W / 2, y + 2, 6, 0, Math.PI * 2);
    ctx.fillStyle = dc;
    ctx.shadowColor = dc;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
    text(ctx, q.title, W - 66, y + 36, { size: 24, weight: 800, maxWidth: 560 });
    text(ctx, q.code, 66, y + 36, { size: 15, weight: 700, family: 'num', align: 'left', color: theme.textMute });
    stars(ctx, DIFFICULTY_STARS[q.difficulty] ?? 1, 5, W - 66, y + 70, { size: 15, color: dc });
    text(ctx, DIFFICULTY_LABELS[q.difficulty], W - 170, y + 70, { size: 15, weight: 700, color: dc });
    const meta = [q.location && `في ${q.location}`, q.giver && `من ${q.giver}`, `المستوى ${q.minLevel}+`, q.repeatable && 'قابلة للتكرار']
      .filter(Boolean)
      .join('  •  ');
    text(ctx, meta, W - 260, y + 70, { size: 15, weight: 500, color: locked ? theme.warn : theme.textDim, maxWidth: 640 });
    rewardChips(ctx, q, W - 66, y + 114, W - 140);
  });
  footer(ctx, W, H, pages > 1 ? `PAGE ${page} / ${pages}` : 'NEXUS', 'اضغط «قبول» أو استخدم /quest accept');
  return toImage(canvas);
}

const STATUS = {
  active: ['قيد التنفيذ', theme.cyan],
  pending_review: ['بانتظار المراجعة', theme.warn],
  completed: ['مكتملة', theme.success],
  abandoned: ['متروكة', theme.textMute],
  failed: ['فشلت', theme.danger],
  expired: ['منتهية', theme.textMute],
  available: ['متاحة', theme.gold],
};

/** Quest detail with objective checklist and progress. */
export async function renderQuest({ quest, objectives, status = 'available', expiresAt = null }) {
  const W = 1000;
  const H = 330 + objectives.length * 66 + 120;
  const dc = difficultyColors[quest.difficulty] ?? theme.cyan;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(quest.code), accent: dc });
  frame(ctx, W, H, dc);
  header(ctx, W, quest.title, {
    subtitle: `${quest.code}  •  ${DIFFICULTY_LABELS[quest.difficulty]}${quest.location ? `  •  ${quest.location}` : ''}`,
    iconName: 'scroll',
    color: dc,
  });
  const [label, color] = STATUS[status] ?? STATUS.available;
  chip(ctx, label, W - 44, 146, { color, size: 15, h: 30 });
  stars(ctx, DIFFICULTY_STARS[quest.difficulty] ?? 1, 5, 200, 146, { size: 18, color: dc });
  if (expiresAt) text(ctx, 'لها وقت محدد', W - 210, 146, { size: 15, weight: 600, color: theme.warn });
  paragraph(ctx, quest.description, W - 50, 196, W - 100, { size: 19, maxLines: 3, color: theme.text });

  const oy = 300;
  panel(ctx, 40, oy - 16, W - 80, objectives.length * 66 + 30, { radius: 18 });
  objectives.forEach((o, i) => {
    const y = oy + 16 + i * 66;
    ctx.save();
    roundRect(ctx, W - 92, y - 14, 28, 28, 8);
    ctx.fillStyle = o.done ? theme.success : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = o.done ? theme.success : theme.stroke;
    ctx.stroke();
    ctx.restore();
    if (o.done) icon(ctx, 'check', W - 78, y, 18, '#04101f', { width: 3 });
    text(ctx, o.description, W - 108, y, { size: 19, weight: 700, color: o.done ? theme.textDim : theme.text, maxWidth: 560 });
    const kindLabel = { manual: 'مراجعة إدارية', collect: 'جمع', visit: 'زيارة', defeat: 'قتال', work: 'عمل' }[o.kind];
    text(ctx, kindLabel, W - 108, y + 24, { size: 13, weight: 600, color: theme.textMute });
    text(ctx, `${o.current} / ${o.requiredCount}`, 66, y, {
      size: 17,
      weight: 700,
      family: 'num',
      align: 'left',
      color: o.done ? theme.success : theme.textDim,
    });
    bar(ctx, 140, y - 4, 200, 10, o.current / o.requiredCount, { colors: o.done ? ['#10b981', '#6ee7b7'] : theme.xp, glow: false });
  });

  const ry = oy + objectives.length * 66 + 50;
  text(ctx, 'المكافآت', W - 50, ry, { size: 18, weight: 800 });
  rewardChips(ctx, { xp: quest.xpReward, nx: quest.nxReward, reputation: quest.reputationReward, items: quest.items }, W - 140, ry, W - 200);
  return toImage(canvas);
}
