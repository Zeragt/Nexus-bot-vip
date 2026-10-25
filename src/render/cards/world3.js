import { theme, hexToRgba, rarityColors, difficultyColors } from '../theme.js';
import { icon } from '../icons.js';
import {
  createCard,
  background,
  frame,
  panel,
  text,
  header,
  footer,
  bar,
  chipRow,
  hashSeed,
  toImage,
  emptyState,
  roundRect,
  divider,
  statTile,
} from '../draw.js';
import { fmt } from '../../utils/format.js';

const TIER_LABELS = { easy: 'سهلة', normal: 'عادية', hard: 'صعبة', elite: 'نخبوية', legendary: 'أسطورية' };
const KIND_ICONS = {
  hunt: 'swords',
  hunt_elite: 'skull',
  explore: 'compass',
  discover: 'eye',
  gather: 'pickaxe',
  deliver: 'bag',
  visit: 'pin',
  travel: 'map',
  work: 'briefcase',
  rp: 'chat',
  craft: 'hammer',
  buy: 'coin',
  use_item: 'flask',
  daily_reward: 'calendar',
  pvp_fight: 'swords',
  pvp_win: 'trophy',
  story_page: 'book',
  story_boss: 'crown',
  daily_board: 'check',
};

export const questIcon = (kind) => KIND_ICONS[kind] ?? 'scroll';

function untilText(date, now = Date.now()) {
  const ms = Math.max(0, new Date(date).getTime() - now);
  const h = Math.floor(ms / 3.6e6);
  const m = Math.floor((ms % 3.6e6) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)} يوم`;
  return h ? `${h} س ${m} د` : `${m} دقيقة`;
}

function questRow(ctx, W, y, h, q, n) {
  const c = difficultyColors[q.tier] ?? theme.cyan;
  const claimed = q.status === 'claimed';
  const ready = q.status === 'done';
  panel(ctx, 40, y, W - 80, h, {
    radius: 16,
    fill: ready ? hexToRgba(theme.success, 0.12) : 'rgba(12, 24, 70, 0.55)',
    stroke: ready ? hexToRgba(theme.success, 0.7) : theme.stroke,
  });
  ctx.save();
  ctx.globalAlpha = claimed ? 0.5 : 1;
  roundRect(ctx, W - 46, y + 12, 5, h - 24, 3);
  ctx.fillStyle = c;
  ctx.fill();
  // slot badge + icon
  const right = W - 66;
  roundRect(ctx, right - 50, y + h / 2 - 25, 50, 50, 13);
  ctx.fillStyle = hexToRgba(c, 0.14);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(c, 0.55);
  ctx.stroke();
  icon(ctx, questIcon(q.kind), right - 25, y + h / 2 - 4, 24, c, { glow: 8 });
  text(ctx, String(n), right - 25, y + h / 2 + 17, { size: 11, weight: 800, family: 'num', align: 'center', color: theme.textMute });
  const tx = right - 66;
  text(ctx, q.title, tx, y + 26, { size: 21, weight: 800, maxWidth: 470 });
  text(ctx, q.description, tx, y + 54, { size: 15, weight: 500, color: theme.textDim, maxWidth: 520 });
  const ratio = q.required ? Math.min(1, q.progress / q.required) : 0;
  bar(ctx, 300, y + h - 22, tx - 300, 8, claimed ? 1 : ratio, {
    colors: ready || claimed ? [theme.success, '#6ee7b7'] : [hexToRgba(c, 0.7), c],
    glow: ready,
  });
  // left column: status, progress, rewards
  const status = claimed ? ['مستلمة', theme.textMute] : ready ? ['جاهزة للاستلام', theme.success] : [TIER_LABELS[q.tier] ?? '', c];
  text(ctx, status[0], 64, y + 24, { size: 15, weight: 800, align: 'left', color: status[1] });
  text(ctx, `${fmt(Math.min(q.progress, q.required))} / ${fmt(q.required)}`, 280, y + h - 22, {
    size: 15,
    weight: 800,
    family: 'num',
    align: 'right',
    color: theme.text,
  });
  const r = q.rewards ?? {};
  chipRow(
    ctx,
    [
      r.xp > 0 && { label: `${fmt(r.xp)} XP`, color: theme.cyan, iconName: 'sparkle' },
      r.nx > 0 && { label: `${fmt(r.nx)} NX`, color: theme.gold, iconName: 'coin' },
      q.period === 'weekly' && { label: 'صندوق الأسبوع', color: rarityColors.epic, iconName: 'box' },
    ].filter(Boolean),
    270,
    y + 52,
    230,
    { size: 13, h: 26 },
  );
  ctx.restore();
}

/** /daily — the six daily quests, the weekly trio, the chest progress and the streak. */
export async function renderDailyBoard(b, now = Date.now()) {
  const W = 1000;
  const rowH = 96;
  const top = 132;
  const daily = b.daily ?? [];
  const weekly = b.weekly ?? [];
  const H = top + 40 + daily.length * (rowH + 10) + 70 + weekly.length * (rowH + 10) + 140;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(`daily-${b.dayKey}`), accent: theme.gold });
  frame(ctx, W, H, theme.gold);
  header(ctx, W, 'المهام اليومية', { subtitle: `تتجدد بعد ${untilText(b.resetsAt, now)}  •  ${b.dayKey}`, iconName: 'calendar', color: theme.gold });

  let y = top;
  const claimed = daily.filter((q) => q.status === 'claimed').length;
  text(ctx, 'لوحة اليوم', W - 50, y + 12, { size: 20, weight: 800, color: theme.gold });
  text(ctx, `${claimed}/${daily.length} مستلمة`, 50, y + 12, { size: 16, weight: 700, align: 'left', color: theme.textDim });
  y += 36;
  if (!daily.length) emptyState(ctx, W, y + 40, 'لا توجد مهام اليوم', 'scroll');
  daily.forEach((q, i) => questRow(ctx, W, y + i * (rowH + 10), rowH, q, i + 1));
  y += daily.length * (rowH + 10) + 14;

  divider(ctx, 60, W - 60, y, theme.violet);
  y += 26;
  text(ctx, 'مهام الأسبوع', W - 50, y + 4, { size: 20, weight: 800, color: theme.violet });
  text(ctx, `تتجدد بعد ${untilText(b.weekResetsAt, now)}`, 50, y + 4, { size: 15, weight: 600, align: 'left', color: theme.textDim });
  y += 30;
  weekly.forEach((q, i) => questRow(ctx, W, y + i * (rowH + 10), rowH, q, i + 1));
  y += weekly.length * (rowH + 10) + 10;

  const tw = (W - 80 - 32) / 3;
  statTile(ctx, W - 40 - tw, y, tw, 76, {
    label: 'صندوق اليوم',
    value: b.chestClaimed ? 'مستلم' : `${claimed}/${daily.length}`,
    iconName: 'box',
    color: b.chestClaimed ? theme.success : rarityColors.rare,
    sub: b.chestClaimed ? '' : 'أكمل الكل',
  });
  statTile(ctx, W - 40 - tw * 2 - 16, y, tw, 76, {
    label: 'السلسلة',
    value: `${b.streak} يوم`,
    iconName: 'flame',
    color: b.streak ? theme.warn : theme.textMute,
    sub: `الأفضل ${b.bestStreak}`,
  });
  statTile(ctx, 40, y, tw, 76, {
    label: 'التبديل',
    value: b.freeRerollsLeft ? `${b.freeRerollsLeft} مجاني` : b.rerollTokens ? `${b.rerollTokens} رمز` : `${fmt(b.nextRerollCost)} NX`,
    iconName: 'refresh',
    color: theme.cyan,
  });
  footer(ctx, W, H, `BOARDS ${fmt(b.completedBoards ?? 0)}`, 'تتغير المهام كل يوم حسب مستواك ومكانك');
  return toImage(canvas);
}

/** The server-wide daily goal: shared progress bar, top contributors and the player's share. */
export async function renderWorldGoal({ goal, character }) {
  const W = 1000;
  const H = 560;
  const { canvas, ctx } = createCard(W, H);
  const c = goal?.done ? theme.success : theme.cyan;
  background(ctx, W, H, { seed: hashSeed(`world-${goal?.day}`), accent: c });
  frame(ctx, W, H, c);
  header(ctx, W, 'هدف السيرفر اليومي', { subtitle: goal ? goal.day : '', iconName: 'globe', color: c });
  if (!goal) {
    emptyState(ctx, W, 260, 'لا يوجد هدف اليوم', 'globe');
    return toImage(canvas);
  }
  text(ctx, goal.title, W - 60, 160, { size: 30, weight: 800, maxWidth: W - 120 });
  text(ctx, goal.description, W - 60, 200, { size: 18, weight: 500, color: theme.textDim, maxWidth: W - 120 });
  const ratio = Math.min(1, goal.progress / goal.required);
  bar(ctx, 60, 240, W - 120, 22, ratio, { colors: goal.done ? [theme.success, '#6ee7b7'] : theme.xp });
  text(ctx, `${fmt(Math.min(goal.progress, goal.required))} / ${fmt(goal.required)}`, W / 2, 285, {
    size: 22,
    weight: 800,
    family: 'num',
    align: 'center',
    color: theme.text,
  });
  const tw = (W - 120 - 32) / 3;
  statTile(ctx, W - 60 - tw, 320, tw, 76, { label: 'مساهمتك', value: fmt(goal.mine), iconName: 'heart', color: theme.cyan, sub: character?.name ?? '' });
  statTile(ctx, W - 60 - tw * 2 - 16, 320, tw, 76, { label: 'المساهمون', value: fmt(goal.contributors), iconName: 'users', color: theme.violet });
  statTile(ctx, 60, 320, tw, 76, {
    label: 'الجائزة',
    value: `${fmt(goal.rewards?.nx ?? 0)} NX + صندوق`,
    iconName: 'box',
    color: theme.gold,
    sub: goal.claimed ? 'استلمتها' : goal.done && goal.mine ? 'جاهزة' : '',
  });
  text(ctx, 'أكثر المساهمين', W - 60, 430, { size: 18, weight: 800, color: theme.gold });
  goal.top.slice(0, 5).forEach((t, i) => {
    const x = W - 60 - i * 180;
    text(ctx, `${i + 1}. ${t.name}`, x, 466, { size: 16, weight: 700, maxWidth: 160 });
    text(ctx, fmt(t.amount), x, 492, { size: 15, weight: 700, family: 'num', align: 'right', color: theme.textDim });
  });
  footer(ctx, W, H, 'WORLD GOAL', goal.done ? 'اكتمل الهدف! المساهمون يستلمون عبر /daily world' : 'كل لاعب يساهم. حين يكتمل يستلم الجميع');
  return toImage(canvas);
}

const DEPTH_COLORS = { 1: '#34d399', 2: '#22d3ee', 3: '#a78bfa', 4: '#2dfcd2' };

/** /zone — the zones of the current location, how deep the player has gone, and the field conditions. */
export async function renderZones(z) {
  const W = 1000;
  const rowH = 104;
  const top = 214;
  const H = top + z.zones.length * (rowH + 12) + 70;
  const { canvas, ctx } = createCard(W, H);
  const pc = z.province?.color ?? theme.cyan;
  background(ctx, W, H, { seed: hashSeed(z.location.key), accent: pc });
  frame(ctx, W, H, pc);
  header(ctx, W, z.location.nameAr ?? z.location.name, {
    subtitle: z.province ? `${z.province.name}  •  ${z.weather?.text ?? ''}` : '',
    iconName: 'map',
    color: pc,
  });
  const tw = (W - 80 - 32) / 3;
  statTile(ctx, W - 40 - tw, 124, tw, 70, {
    label: 'الطقس',
    value: z.weather?.name ?? 'صحو',
    iconName: z.weather?.icon ?? 'sun',
    color: theme.cyan,
    sub: '',
  });
  statTile(ctx, W - 40 - tw * 2 - 16, 124, tw, 70, {
    label: 'إتقان المقاطعة',
    value: z.mastery?.name ?? '-',
    iconName: 'crown',
    color: theme.gold,
    sub: `${fmt(z.points ?? 0)} نقطة`,
  });
  statTile(ctx, 40, 124, tw, 70, { label: 'نقاط الاستكشاف هنا', value: fmt(z.explorePoints ?? 0), iconName: 'compass', color: theme.violet });
  z.zones.forEach((zone, i) => {
    const y = top + i * (rowH + 12);
    const c = DEPTH_COLORS[zone.depth] ?? theme.cyan;
    const locked = !zone.access.ok;
    const hidden = zone.depth === 4 && !zone.known;
    panel(ctx, 40, y, W - 80, rowH, {
      radius: 16,
      fill: zone.current ? hexToRgba(c, 0.16) : 'rgba(12, 24, 70, 0.55)',
      stroke: zone.current ? hexToRgba(c, 0.8) : theme.stroke,
    });
    ctx.save();
    ctx.globalAlpha = locked ? 0.55 : 1;
    icon(ctx, hidden ? 'lock' : zone.city ? 'city' : zone.depth === 4 ? 'eye' : 'mountain', W - 86, y + rowH / 2, 28, c, { glow: 10 });
    text(ctx, hidden ? '؟؟؟ منطقة مخفية' : zone.name, W - 124, y + 30, { size: 22, weight: 800, maxWidth: 420 });
    text(ctx, hidden ? 'استكشف أعمق لتعرف ما هنا' : (zone.description ?? ''), W - 124, y + 60, { size: 15, weight: 500, color: theme.textDim, maxWidth: 520 });
    const res = hidden ? [] : (zone.resourceNames ?? []).slice(0, 3);
    if (res.length) text(ctx, `موارد: ${res.join('، ')}`, W - 124, y + 86, { size: 13, weight: 600, color: theme.textMute, maxWidth: 520 });
    text(ctx, zone.depthLabel ?? '', 64, y + 28, { size: 15, weight: 800, align: 'left', color: c });
    const status = zone.current ? 'أنت هنا' : locked ? (zone.access.reasons[0] ?? 'مقفلة') : 'متاحة';
    text(ctx, status, 64, y + 58, {
      size: 14,
      weight: 700,
      align: 'left',
      color: zone.current ? c : locked ? theme.warn : theme.success,
      maxWidth: 300,
      dir: 'rtl',
    });
    if (zone.secretRead) text(ctx, 'كُشف سرّها', 64, y + 84, { size: 13, weight: 700, align: 'left', color: rarityColors.secret, dir: 'rtl' });
    ctx.restore();
  });
  footer(ctx, W, H, 'ZONES', 'استكشف لتفتح مناطق أعمق، واجمع مواردها للصناعة');
  return toImage(canvas);
}

/** /region — a province overview: mastery rank, weather, and each location's exploration. */
export async function renderProvince(p) {
  const W = 1000;
  const rowH = 80;
  const top = 230;
  const H = top + Math.max(1, p.locations.length) * (rowH + 10) + 70;
  const { canvas, ctx } = createCard(W, H);
  const c = p.province.color ?? theme.cyan;
  background(ctx, W, H, { seed: hashSeed(p.province.key), accent: c });
  frame(ctx, W, H, c);
  header(ctx, W, p.province.name, { subtitle: p.province.blurb ?? '', iconName: p.province.icon ?? 'globe', color: c });
  const next = p.mastery.next;
  text(ctx, `الإتقان: ${p.mastery.name}`, W - 60, 140, { size: 22, weight: 800, color: theme.gold });
  text(ctx, next ? `${fmt(p.points)} / ${fmt(next.min)} نحو ${next.name}` : `${fmt(p.points)} نقطة (الحد الأقصى)`, 60, 140, {
    size: 16,
    weight: 700,
    align: 'left',
    color: theme.textDim,
    dir: 'rtl',
  });
  bar(ctx, 60, 170, W - 120, 12, p.mastery.ratio ?? 1, { colors: [theme.gold, '#fde68a'] });
  text(ctx, `الطقس الآن: ${p.weather?.name ?? 'صحو'}${p.weather?.text ? `  •  ${p.weather.text}` : ''}`, W - 60, 202, {
    size: 16,
    weight: 600,
    color: theme.cyanSoft,
    maxWidth: W - 120,
  });
  if (!p.locations.length) emptyState(ctx, W, top + 40, 'لا توجد أماكن في هذه المقاطعة', 'map');
  p.locations.forEach((l, i) => {
    const y = top + i * (rowH + 10);
    panel(ctx, 40, y, W - 80, rowH, {
      radius: 14,
      fill: l.here ? hexToRgba(c, 0.16) : 'rgba(12, 24, 70, 0.55)',
      stroke: l.here ? hexToRgba(c, 0.8) : theme.stroke,
    });
    icon(ctx, l.here ? 'pin' : 'map', W - 80, y + rowH / 2, 24, c, { glow: 8 });
    text(ctx, l.name, W - 112, y + 28, { size: 21, weight: 800, maxWidth: 380 });
    text(ctx, `مستوى ${l.minLevel}+  •  خطر ${l.danger}/5${l.here ? '  •  أنت هنا' : ''}`, W - 112, y + 56, { size: 14, weight: 600, color: theme.textDim });
    text(ctx, `${l.found}/${l.zones} مناطق`, 64, y + 26, { size: 16, weight: 800, align: 'left', color: theme.text, dir: 'rtl' });
    text(ctx, l.hiddenFound ? 'المخفية مكتشفة' : `${fmt(l.points)} نقطة`, 64, y + 54, {
      size: 14,
      weight: 700,
      align: 'left',
      color: l.hiddenFound ? rarityColors.secret : theme.textMute,
      dir: 'rtl',
    });
    bar(ctx, 64, y + rowH - 12, 160, 5, l.zones ? l.found / l.zones : 0, { colors: [hexToRgba(c, 0.6), c], glow: false });
  });
  footer(ctx, W, H, 'PROVINCE', 'الإتقان يرفع الغنائم والجمع في كل أماكن المقاطعة');
  return toImage(canvas);
}

/** /craft list — recipes with their materials (have/need) and where they can be made. */
export async function renderRecipes({ recipes, page = 1, pages = 1, title = 'كتاب الوصفات', subtitle = '' }) {
  const W = 1000;
  const rowH = 100;
  const top = 128;
  const H = Math.max(360, top + Math.max(1, recipes.length) * (rowH + 10) + 70);
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: 4242 + page, accent: theme.warn });
  frame(ctx, W, H, theme.warn);
  header(ctx, W, title, { subtitle, iconName: 'hammer', color: theme.warn });
  if (!recipes.length) emptyState(ctx, W, top + 90, 'لا توجد وصفات هنا', 'hammer');
  recipes.forEach((r, i) => {
    const y = top + i * (rowH + 10);
    const c = rarityColors[r.rarity] ?? theme.cyan;
    panel(ctx, 40, y, W - 80, rowH, {
      radius: 16,
      fill: r.ready ? hexToRgba(theme.success, 0.1) : 'rgba(12, 24, 70, 0.55)',
      stroke: r.ready ? hexToRgba(theme.success, 0.6) : theme.stroke,
    });
    ctx.save();
    ctx.globalAlpha = r.levelOk ? 1 : 0.5;
    roundRect(ctx, W - 116, y + rowH / 2 - 26, 52, 52, 13);
    ctx.fillStyle = hexToRgba(c, 0.16);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(c, 0.6);
    ctx.stroke();
    icon(ctx, { weapon: 'sword', armor: 'armor', accessory: 'ring', consumable: 'flask', misc: 'box' }[r.type] ?? 'gem', W - 90, y + rowH / 2, 26, c, {
      glow: 8,
    });
    text(ctx, `${r.name}${r.quantity > 1 ? ` x${r.quantity}` : ''}`, W - 134, y + 26, { size: 21, weight: 800, maxWidth: 420, color: theme.text });
    const parts = r.inputs.map((x) => `${x.name} ${x.have}/${x.need}`);
    text(ctx, parts.join('  •  '), W - 134, y + 56, { size: 14, weight: 600, color: r.enough ? theme.success : theme.textDim, maxWidth: 560 });
    text(ctx, `${r.stationName}${r.here ? '' : ' (ليس هنا)'}  •  مستوى ${r.minLevel}${r.nx ? `  •  ${fmt(r.nx)} NX` : ''}`, W - 134, y + 82, {
      size: 13,
      weight: 600,
      color: r.here ? theme.textMute : theme.warn,
      maxWidth: 560,
    });
    const status = r.ready ? `جاهزة • حتى ${r.batches} مرات` : !r.levelOk ? 'مستواك أقل' : !r.enough ? 'ينقصك مواد' : !r.here ? 'اذهب للمحطة' : 'ينقصك NX';
    text(ctx, status, 64, y + rowH / 2, { size: 16, weight: 800, align: 'left', color: r.ready ? theme.success : theme.textMute, dir: 'rtl' });
    ctx.restore();
  });
  footer(ctx, W, H, pages > 1 ? `PAGE ${page} / ${pages}` : 'CRAFTING', 'الصناعة تحتاج المحطة المناسبة في مكانك');
  return toImage(canvas);
}
