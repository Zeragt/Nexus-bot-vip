import { theme, hexToRgba, rarityColors } from '../theme.js';
import { icon } from '../icons.js';
import { createCard, frame, panel, text, paragraph, toImage, header, footer, bar, hashSeed, roundRect, stars, chip } from '../draw.js';
import { drawMonster } from '../sprites.js';
import { sceneImage } from '../sceneCache.js';
import { sceneFor } from '../scenes.js';

const TIER_COLORS = { easy: '#34d399', normal: '#38bdf8', hard: '#f472b6' };
const TIER_NAMES = { easy: 'سهل', normal: 'متوسط', hard: 'صعب' };

async function backdrop(ctx, W, H, scene, dim) {
  ctx.drawImage(await sceneImage(scene, W, H), 0, 0);
  ctx.fillStyle = `rgba(4, 7, 22, ${dim})`;
  ctx.fillRect(0, 0, W, H);
}

function contractRow(ctx, c, x, y, w, h, weekly) {
  const color = c.done ? theme.success : weekly ? theme.gold : (TIER_COLORS[c.tier] ?? theme.cyan);
  panel(ctx, x, y, w, h, { radius: 14, fill: c.done ? 'rgba(16, 60, 44, 0.55)' : 'rgba(10, 18, 56, 0.7)', stroke: hexToRgba(color, c.done ? 0.7 : 0.4) });
  const right = x + w - 18;
  icon(ctx, c.done ? 'check' : weekly ? 'crown' : 'scroll', right - 14, y + 26, 22, color, { glow: 6 });
  text(ctx, c.title, right - 38, y + 26, { size: 19, weight: 800, maxWidth: w - 250, color: c.done ? theme.textDim : theme.text });
  const label = weekly ? 'أسبوعي' : (TIER_NAMES[c.tier] ?? c.tier);
  chip(ctx, label, right - 38, y + h - 22, { color, size: 13, h: 24 });
  text(ctx, `${Math.min(c.progress, c.required)} / ${c.required}`, x + 18, y + 24, { size: 20, weight: 800, family: 'num', align: 'left', color, dir: 'ltr' });
  text(ctx, `+${c.xp} XP  •  +${c.nx} NX`, x + 18, y + 48, { size: 13, weight: 600, family: 'num', align: 'left', color: theme.textMute, dir: 'ltr' });
  bar(ctx, x + 150, y + h - 16, w - 300, 6, c.required ? Math.min(1, c.progress / c.required) : 0, {
    colors: c.done ? [theme.success, '#6ee7b7'] : [color, theme.cyanSoft],
    glow: false,
  });
}

/** Daily + weekly contracts board. */
export async function renderContracts({ name, daily, weekly, streak, bestStreak, clearedToday, dailyResetIn, weeklyResetIn, rerollCost }) {
  const W = 1000;
  const rh = 76;
  const H = 210 + daily.length * (rh + 8) + 60 + weekly.length * (rh + 8) + 80;
  const { canvas, ctx } = createCard(W, H);
  await backdrop(ctx, W, H, 'city', 0.72);
  frame(ctx, W, H, theme.gold);
  const doneDaily = daily.filter((c) => c.done).length;
  header(ctx, W, 'عقود اليوم', { subtitle: `${name} • ${doneDaily}/${daily.length} منجزة • تتجدد بعد ${dailyResetIn}`, iconName: 'scroll', color: theme.gold });

  // Streak strip.
  panel(ctx, 40, 122, W - 80, 52, { radius: 14, fill: 'rgba(60, 40, 6, 0.45)', stroke: hexToRgba(theme.gold, 0.45) });
  icon(ctx, 'flame', W - 70, 148, 22, streak > 0 ? '#fb923c' : theme.textMute, { glow: 8 });
  text(ctx, `سلسلة المواظبة: ${streak} يوم`, W - 92, 148, { size: 19, weight: 800, color: streak > 0 ? '#fdba74' : theme.textDim });
  text(ctx, clearedToday ? 'أنهيت عقود اليوم!' : 'أنهِ كل العقود لتحصل على صندوق العقود', W / 2 - 40, 148, {
    size: 15,
    weight: 600,
    align: 'center',
    color: clearedToday ? theme.success : theme.textDim,
  });
  text(ctx, `أفضل سلسلة ${bestStreak}  •  التبديل ${rerollCost ? `${rerollCost} NX` : 'مجاني'}`, 64, 148, {
    size: 14,
    weight: 600,
    align: 'left',
    color: theme.textMute,
  });

  let y = 190;
  daily.forEach((c) => {
    contractRow(ctx, c, 40, y, W - 80, rh, false);
    y += rh + 8;
  });
  y += 12;
  text(ctx, `عقود الأسبوع • تتجدد بعد ${weeklyResetIn}`, W - 48, y + 14, { size: 20, weight: 800, color: theme.gold });
  y += 40;
  weekly.forEach((c) => {
    contractRow(ctx, c, 40, y, W - 80, rh, true);
    y += rh + 8;
  });
  footer(ctx, W, H, 'CONTRACTS', 'كل سابع يوم متتالٍ يمنحك صندوق المواظبة');
  return toImage(canvas);
}

/** One boss: big sprite on its home scene, lore, skills, loot, and why it can or cannot be fought. */
export async function renderBossCard({ boss, number, total = 100, kind, locationName, sealed, blockers = [], record, rewards, skills = [], loot = [] }) {
  const W = 1280;
  const H = 720;
  const { canvas, ctx } = createCard(W, H);
  await backdrop(ctx, W, H, sceneFor(boss.location), sealed ? 0.78 : 0.5);
  const color = sealed ? '#64748b' : boss.palette[1];
  const palette = sealed ? ['#05060f', '#1e293b'] : boss.palette;
  const scale = boss.archetype === 'dragon' || boss.archetype === 'hydra' ? 0.95 : 1.25;
  drawMonster(ctx, { x: 330, y: 610, scale, facing: 1, archetype: boss.archetype, palette, boss: !sealed, seed: hashSeed(boss.key), traits: boss.look });
  header(ctx, W, sealed ? 'زعيم مختوم' : boss.name, {
    subtitle: `#${number} من ${total} • ${kind === 'story' ? 'زعيم القصة' : 'زعيم المنطقة'} • ${locationName}`,
    iconName: 'crown',
    color,
  });
  const x = 640;
  const pw = W - x - 40;
  panel(ctx, x, 130, pw, H - 170, { radius: 20, fill: 'rgba(6, 10, 34, 0.78)', stroke: hexToRgba(color, 0.55) });
  const right = x + pw - 28;
  let y = 170;
  if (boss.title && !sealed) {
    text(ctx, boss.title, right, y, { size: 22, weight: 800, color });
    y += 34;
  }
  text(ctx, `المستوى ${boss.level}`, right, y, { size: 18, weight: 700, color: theme.text });
  if (boss.tier) stars(ctx, boss.tier, 5, right - 150, y, { size: 16, color: theme.gold });
  y += 30;
  if (!sealed) {
    y += paragraph(ctx, boss.lore ?? '', right, y + 4, pw - 56, { size: 17, maxLines: 4 }) + 8;
    if (skills.length) {
      text(ctx, 'المهارات', right, y + 6, { size: 15, weight: 800, color: theme.textMute });
      text(ctx, skills.join('  •  '), right - 80, y + 6, { size: 15, weight: 600, color, maxWidth: pw - 140 });
      y += 32;
    }
    if (loot.length) {
      text(ctx, 'الغنائم', right, y + 6, { size: 15, weight: 800, color: theme.textMute });
      let lx = right - 80;
      for (const it of loot.slice(0, 5)) {
        const c = rarityColors[it.rarity] ?? theme.cyan;
        const w = chip(ctx, it.name, lx, y + 6, { color: c, size: 13, h: 26 });
        lx -= (w ?? 120) + 8;
        if (lx < x + 120) break;
      }
    }
  } else {
    paragraph(ctx, 'ظل غامض لا يُعرف عنه شيء بعد. تقدّم في القصة ليظهر.', right, y + 4, pw - 56, { size: 18, maxLines: 2 });
  }
  // Record and state.
  const boxY = H - 230;
  panel(ctx, x + 20, boxY, pw - 40, 170, { radius: 16, fill: 'rgba(12, 24, 70, 0.55)' });
  if (record) {
    text(ctx, `انتصارات: ${record.kills ?? 0}  •  محاولات: ${record.attempts ?? 0}`, right - 10, boxY + 28, { size: 16, weight: 700, color: theme.textDim });
  }
  if (rewards) {
    text(ctx, `المكافأة: +${rewards.xp} XP  •  +${rewards.nx} NX${record?.kills ? '' : '  (ضعف عند أول انتصار)'}`, right - 10, boxY + 58, {
      size: 16,
      weight: 700,
      color: theme.gold,
      maxWidth: pw - 80,
    });
  }
  const ready = !sealed && !blockers.length;
  const lines = ready ? ['جاهز للقتال! /boss fight'] : blockers.length ? blockers : [];
  lines.slice(0, 3).forEach((l, i) => {
    text(ctx, l, right - 10, boxY + 92 + i * 26, { size: 16, weight: 700, color: ready ? theme.success : theme.warn, maxWidth: pw - 80 });
  });
  frame(ctx, W, H, color);
  return toImage(canvas);
}

/** Everything a place offers: resources, hidden landmarks, bosses, creatures, and what is still sealed. */
export async function renderRegion(v) {
  const W = 1280;
  const H = 720;
  const { canvas, ctx } = createCard(W, H);
  await backdrop(ctx, W, H, sceneFor(v.location.key), 0.6);
  const color = v.sealed ? theme.warn : theme.cyan;
  header(ctx, W, v.location.nameAr, {
    subtitle: v.sealed ? `مختوم حتى الفصل ${v.location.requiredChapter}` : `خطر ${v.location.danger} • ${v.here ? 'أنت هنا' : 'لست هنا'}`,
    iconName: 'map',
    color,
  });
  paragraph(ctx, v.theme ?? '', W - 48, 140, W - 96, { size: 17, maxLines: 2, color: theme.textDim });

  const colW = (W - 120) / 3;
  const top = 200;
  const colH = H - top - 70;
  const cols = [W - 40 - colW, W - 60 - colW * 2, W - 80 - colW * 3];
  const titleAt = (cx, label, iconName, c) => {
    icon(ctx, iconName, cx + colW - 28, top + 26, 20, c, { glow: 6 });
    text(ctx, label, cx + colW - 50, top + 26, { size: 19, weight: 800, color: c });
  };
  cols.forEach((cx) => panel(ctx, cx, top, colW, colH, { radius: 18, fill: 'rgba(6, 10, 34, 0.72)' }));

  // Resources.
  titleAt(cols[0], 'الموارد', 'gem', '#34d399');
  let y = top + 64;
  for (const g of v.gather.slice(0, 7)) {
    const c = g.locked ? theme.textMute : (rarityColors[g.rarity] ?? theme.cyan);
    text(ctx, g.locked ? `${g.name} (الفصل ${g.chapter})` : g.name, cols[0] + colW - 24, y, { size: 16, weight: 700, color: c, maxWidth: colW - 110 });
    text(ctx, `${Math.round(g.chance * 100)}%`, cols[0] + 22, y, { size: 15, weight: 700, family: 'num', align: 'left', color: theme.textMute });
    if (g.locked) icon(ctx, 'lock', cols[0] + 70, y, 14, theme.textMute);
    y += 34;
  }
  if (!v.gather.length) text(ctx, 'لا توجد موارد هنا', cols[0] + colW / 2, y, { size: 16, align: 'center', color: theme.textMute });

  // Landmarks.
  const found = v.landmarks.filter((l) => l.found).length;
  titleAt(cols[1], `المعالم ${found}/${v.landmarks.length}`, 'flag', theme.gold);
  y = top + 64;
  for (const l of v.landmarks.slice(0, 7)) {
    const label = l.found ? l.name : l.locked ? `مختوم (الفصل ${l.chapter})` : '؟؟؟ لم يُكتشف بعد';
    text(ctx, label, cols[1] + colW - 24, y, { size: 16, weight: 700, color: l.found ? theme.gold : theme.textMute, maxWidth: colW - 48 });
    y += 34;
  }
  if (v.stats.mastered) chip(ctx, 'أتقنت المنطقة', cols[1] + colW - 24, top + colH - 30, { color: theme.gold, size: 14, iconName: 'trophy', h: 28 });

  // Bosses and creatures.
  titleAt(cols[2], 'الزعماء والمخلوقات', 'skull', '#fb7185');
  y = top + 64;
  for (const b of v.bosses) {
    const c = b.sealed ? theme.textMute : b.kills ? theme.success : '#fb7185';
    text(ctx, b.sealed ? `زعيم مختوم (الفصل ${b.chapter})` : `${b.name} • م${b.level}`, cols[2] + colW - 24, y, {
      size: 16,
      weight: 800,
      color: c,
      maxWidth: colW - 48,
    });
    y += 32;
  }
  y += 6;
  for (const m of v.monsters.slice(0, 5)) {
    text(ctx, m, cols[2] + colW - 24, y, { size: 15, weight: 600, color: theme.textDim, maxWidth: colW - 48 });
    y += 28;
  }

  const ev = `أحداث مفتوحة ${v.events.open}/${v.events.total}`;
  const next = Number.isFinite(v.nextUnlock) ? ` • محتوى جديد بعد الفصل ${v.nextUnlock}` : ' • كل محتوى المنطقة مفتوح';
  footer(ctx, W, H, `EXPLORED ${v.stats.explored} • GATHERED ${v.stats.gathered} • HUNTED ${v.stats.hunted}`, `${ev}${next}`);
  frame(ctx, W, H, color);
  return toImage(canvas);
}

/** Hall of bosses page: a grid of sprites with their own traits; undefeated ones are silhouettes. */
export async function renderBossHall({ bosses, beaten, total, page, pages, filterLabel }) {
  const W = 1280;
  const H = 720;
  const { canvas, ctx } = createCard(W, H);
  await backdrop(ctx, W, H, 'abyss', 0.4);
  header(ctx, W, 'قاعة الزعماء المئة', { subtitle: `هزمت ${beaten} من ${total} • ${filterLabel}`, iconName: 'crown', color: theme.gold });
  const cols = 5;
  const rows = Math.max(1, Math.ceil(bosses.length / cols));
  const cw = (W - 80) / cols;
  const rh = (H - 170) / rows;
  bosses.forEach((b, i) => {
    const col = i % cols;
    const r = Math.floor(i / cols);
    const cx = W - 40 - cw * col - cw / 2;
    const top = 128 + r * rh;
    const c = b.defeated ? theme.gold : b.sealed ? '#334155' : '#fb7185';
    panel(ctx, cx - cw / 2 + 6, top, cw - 12, rh - 12, { radius: 16, fill: 'rgba(6,8,28,0.7)', stroke: hexToRgba(c, 0.6) });
    const palette = b.defeated ? b.palette : b.sealed ? ['#05060f', '#111827'] : ['#0b0f1f', hexToRgba(b.palette[1], 0.5)];
    const big = ['dragon', 'hydra'].includes(b.archetype);
    const scale = (rh / 520) * (big ? 0.6 : 0.78);
    // Unbeaten bosses keep their silhouette (horns, wings, crown) but not their colours.
    const traits = b.defeated ? b.look : { ...b.look, accent: b.sealed ? '#1e293b' : '#475569', flames: false };
    ctx.save();
    roundRect(ctx, cx - cw / 2 + 6, top, cw - 12, rh - 12, 16);
    ctx.clip();
    drawMonster(ctx, { x: cx, y: top + rh - 64, scale, facing: -1, archetype: b.archetype, palette, boss: b.defeated, seed: hashSeed(b.key), traits });
    ctx.restore();
    text(ctx, b.defeated || !b.sealed ? b.name : '؟؟؟', cx, top + rh - 38, {
      size: 15,
      weight: 800,
      align: 'center',
      maxWidth: cw - 24,
      color: b.defeated ? theme.text : theme.textMute,
    });
    roundRect(ctx, cx - cw / 2 + 14, top + 10, 46, 22, 11);
    ctx.fillStyle = hexToRgba(c, 0.25);
    ctx.fill();
    text(ctx, `#${b.number}`, cx - cw / 2 + 37, top + 21, { size: 12, weight: 800, family: 'num', align: 'center', color: theme.text });
    text(ctx, b.kind === 'story' ? 'قصة' : 'منطقة', cx + cw / 2 - 18, top + 21, { size: 12, weight: 700, color: theme.textMute });
  });
  if (pages > 1) text(ctx, `${page} / ${pages}`, 44, H - 30, { size: 14, family: 'num', align: 'left', color: theme.textMute });
  frame(ctx, W, H, theme.gold);
  return toImage(canvas);
}
