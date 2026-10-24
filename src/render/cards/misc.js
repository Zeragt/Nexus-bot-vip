import { theme, hexToRgba, rarityColors, tierColors } from '../theme.js';
import { ITEM_ICONS, icon } from '../icons.js';
import { RARITY_LABELS } from '../../config/game.js';
import {
  createCard,
  background,
  frame,
  panel,
  text,
  header,
  footer,
  paragraph,
  bar,
  chip,
  chipRow,
  itemTile,
  hashSeed,
  toImage,
  emptyState,
  portrait,
  statTile,
  divider,
} from '../draw.js';
import { fmt, compact } from '../../utils/format.js';

/** NPC shop: two columns of priced item rows. */
export async function renderShop({ npcName, npcTitle, color = theme.gold, items, nx, page = 1, pages = 1 }) {
  const W = 1000;
  const rows = Math.max(1, Math.ceil(items.length / 2));
  const H = 200 + rows * 104 + 50;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(npcName), accent: color });
  frame(ctx, W, H, color);
  header(ctx, W, `متجر ${npcName}`, { subtitle: npcTitle, iconName: 'coin', color });
  chip(ctx, `رصيدك ${compact(nx)} NX`, W - 44, 150, { color: theme.gold, iconName: 'coin', size: 16 });
  if (!items.length) emptyState(ctx, W, 240, 'المتجر فارغ حالياً', 'coin');
  const cw = (W - 80 - 14) / 2;
  items.forEach((it, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = W - 40 - cw - col * (cw + 14);
    const y = 190 + row * 104;
    const rc = rarityColors[it.rarity] ?? theme.cyan;
    const soldOut = it.stock === 0;
    panel(ctx, x, y, cw, 92, { radius: 16, fill: 'rgba(12,24,70,0.62)' });
    itemTile(ctx, x + cw - 80, y + 12, 68, { color: rc, iconName: ITEM_ICONS[it.type] ?? 'box', dim: soldOut });
    text(ctx, it.name, x + cw - 92, y + 30, { size: 19, weight: 800, maxWidth: cw - 230 });
    text(ctx, RARITY_LABELS[it.rarity], x + cw - 92, y + 58, { size: 14, weight: 700, color: rc });
    if (it.stock != null)
      text(ctx, soldOut ? 'نفد' : `متبقي ${it.stock}`, x + cw - 180, y + 58, { size: 13, weight: 600, color: soldOut ? theme.danger : theme.textMute });
    text(ctx, fmt(it.price), x + 18, y + 34, { size: 22, weight: 800, family: 'num', align: 'left', color: nx >= it.price ? theme.gold : theme.danger });
    text(ctx, 'NX', x + 18, y + 62, { size: 13, weight: 700, family: 'num', align: 'left', color: theme.textMute });
  });
  footer(ctx, W, H, pages > 1 ? `PAGE ${page} / ${pages}` : 'NEXUS', 'اشترِ عبر /shop buy');
  return toImage(canvas);
}

/** Guild profile. */
export async function renderGuild({
  name,
  tag,
  description,
  color = theme.cyan,
  level,
  xp,
  xpNeed,
  treasury,
  reputation,
  members,
  maxMembers,
  leader,
  topMembers = [],
  createdAt,
}) {
  const W = 1000;
  const H = 600;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(name), accent: color, secondary: color });
  frame(ctx, W, H, color);
  // Emblem
  const cx = W - 150;
  const cy = 150;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 95);
  ctx.lineTo(cx + 82, cy - 60);
  ctx.lineTo(cx + 72, cy + 40);
  ctx.lineTo(cx, cy + 100);
  ctx.lineTo(cx - 72, cy + 40);
  ctx.lineTo(cx - 82, cy - 60);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx, cy - 95, cx, cy + 100);
  g.addColorStop(0, hexToRgba(color, 0.45));
  g.addColorStop(1, 'rgba(8,14,44,0.95)');
  ctx.fillStyle = g;
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  text(ctx, tag.toUpperCase(), cx, cy - 6, { size: 34, weight: 900, family: 'num', align: 'center', glow: 14, glowColor: color, maxWidth: 140 });
  text(ctx, `LV ${level}`, cx, cy + 42, { size: 16, weight: 700, family: 'num', align: 'center', color });

  text(ctx, name, W - 280, 90, { size: 44, weight: 800, maxWidth: 640, glow: 14, glowColor: color });
  text(ctx, `القائد: ${leader}`, W - 280, 138, { size: 19, weight: 600, color: theme.textDim, maxWidth: 640 });
  paragraph(ctx, description || 'نقابة بلا شعار... بعد.', W - 280, 182, 640, { size: 18, maxLines: 2 });
  text(ctx, 'خبرة النقابة', W - 280, 258, { size: 15, weight: 700, color: theme.textDim });
  text(ctx, `${fmt(xp)} / ${fmt(xpNeed)}`, 60, 258, { size: 14, weight: 600, family: 'num', align: 'left', color: theme.textDim });
  bar(ctx, 60, 272, W - 340, 12, xp / xpNeed, { colors: [color, theme.ice] });

  const tw = (W - 80 - 36) / 4;
  [
    { label: 'الخزينة', value: `${compact(treasury)} NX`, iconName: 'coin', color: theme.gold },
    { label: 'السمعة', value: fmt(reputation), iconName: 'crown', color: theme.violet },
    { label: 'الأعضاء', value: `${members} / ${maxMembers}`, iconName: 'users', color },
    { label: 'التأسيس', value: createdAt ?? '-', iconName: 'calendar', color: theme.royalSoft },
  ].forEach((t, i) => statTile(ctx, W - 40 - tw - i * (tw + 12), 306, tw, 74, t));

  panel(ctx, 40, 398, W - 80, 160, { radius: 18 });
  text(ctx, 'أبرز الأعضاء', W - 64, 424, { size: 18, weight: 800 });
  const mw = (W - 120) / 5;
  topMembers.slice(0, 5).forEach((m, i) => {
    const x = W - 60 - mw / 2 - i * mw;
    portrait(ctx, m.avatar ?? null, x, 488, 32, { color: m.role === 'leader' ? theme.gold : color, seed: hashSeed(m.name), label: m.name });
    text(ctx, m.name, x, 538, { size: 15, weight: 700, align: 'center', maxWidth: mw - 12 });
  });
  footer(ctx, W, H, 'NEXUS GUILD', '');
  return toImage(canvas);
}

/** Event banner with phase timeline. */
export async function renderEvent({
  title,
  description,
  status,
  location,
  startsAt,
  endsAt,
  participants,
  maxParticipants,
  phases = [],
  currentPhase = 0,
  rewards = {},
}) {
  const W = 1000;
  const H = 560;
  const color = status === 'active' ? '#ff4fa3' : status === 'ended' ? theme.textMute : theme.violet;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(title), accent: color, secondary: theme.violet });
  frame(ctx, W, H, color);
  header(ctx, W, title, { subtitle: [location && `في ${location}`, `من ${startsAt} إلى ${endsAt}`].filter(Boolean).join('  •  '), iconName: 'flag', color });
  const statusLabel = { scheduled: 'قادم', active: 'جارٍ الآن', ended: 'انتهى', cancelled: 'أُلغي' }[status];
  chipRow(
    ctx,
    [
      { label: statusLabel, color },
      { label: `${participants}${maxParticipants ? ` / ${maxParticipants}` : ''} مشارك`, iconName: 'users', color: theme.cyan },
      rewards.xp > 0 && { label: `${fmt(rewards.xp)} XP`, color: theme.cyan, iconName: 'sparkle' },
      rewards.nx > 0 && { label: `${fmt(rewards.nx)} NX`, color: theme.gold, iconName: 'coin' },
    ],
    W - 44,
    152,
    W - 88,
  );
  paragraph(ctx, description, W - 50, 204, W - 100, { size: 20, maxLines: 3, color: theme.text });

  panel(ctx, 40, 310, W - 80, 200, { radius: 18 });
  text(ctx, 'مراحل الحدث', W - 64, 338, { size: 18, weight: 800 });
  const list = phases.length ? phases : [{ position: 1, title: 'المرحلة الأولى', status: 'pending' }];
  const n = Math.min(list.length, 5);
  const x1 = W - 120;
  const x2 = 120;
  const y = 410;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
  list.slice(0, n).forEach((p, i) => {
    const x = n === 1 ? W / 2 : x1 - ((x1 - x2) * i) / (n - 1);
    const done = p.status === 'resolved';
    const active = p.position === currentPhase && status === 'active';
    const c = done ? theme.success : active ? color : 'rgba(255,255,255,0.3)';
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, active ? 18 : 13, 0, Math.PI * 2);
    ctx.fillStyle = done || active ? c : '#0b1240';
    ctx.shadowColor = c;
    ctx.shadowBlur = active ? 20 : 0;
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    if (done) icon(ctx, 'check', x, y, 14, '#04101f', { width: 3 });
    text(ctx, p.title, x, y + 40, { size: 15, weight: 700, align: 'center', maxWidth: 160, color: active ? theme.text : theme.textDim });
    if (p.outcome?.winner)
      text(ctx, `اختار المشاركون: ${p.outcome.winner}`, x, y + 64, { size: 12, weight: 600, align: 'center', maxWidth: 170, color: theme.textMute });
  });
  footer(ctx, W, H, 'NEXUS EVENT', status === 'ended' ? '' : 'انضم عبر الزر أو /event join');
  return toImage(canvas);
}

/** Achievement badge wall. */
export async function renderAchievements({ name, achievements }) {
  const W = 1000;
  const cols = 3;
  const rows = Math.ceil(achievements.length / cols);
  const H = 160 + rows * 132 + 40;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(`${name}ach`), accent: theme.gold });
  frame(ctx, W, H, theme.gold);
  const unlocked = achievements.filter((a) => a.unlocked).length;
  header(ctx, W, `إنجازات ${name}`, { subtitle: `${unlocked} من ${achievements.length} مفتوحة`, iconName: 'trophy', color: theme.gold });
  const cw = (W - 80 - (cols - 1) * 14) / cols;
  achievements.forEach((a, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = W - 40 - cw - col * (cw + 14);
    const y = 140 + row * 132;
    const tc = tierColors[a.tier] ?? theme.gold;
    ctx.save();
    ctx.globalAlpha = a.unlocked ? 1 : 0.45;
    panel(ctx, x, y, cw, 118, { radius: 18, stroke: a.unlocked ? hexToRgba(tc, 0.75) : theme.stroke, glow: a.unlocked ? tc : null });
    ctx.restore();
    const bx = x + cw - 54;
    ctx.save();
    ctx.globalAlpha = a.unlocked ? 1 : 0.4;
    ctx.beginPath();
    ctx.arc(bx, y + 59, 32, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(tc, 0.18);
    ctx.fill();
    ctx.strokeStyle = tc;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    icon(ctx, a.unlocked ? 'trophy' : 'lock', bx, y + 59, 28, a.unlocked ? tc : theme.textMute, { glow: a.unlocked ? 10 : 0 });
    text(ctx, a.name, x + cw - 100, y + 36, { size: 19, weight: 800, maxWidth: cw - 120, alpha: a.unlocked ? 1 : 0.6 });
    paragraph(ctx, a.description, x + cw - 100, y + 66, cw - 120, { size: 14, maxLines: 2, color: theme.textDim });
    if (!a.unlocked && a.progress != null) bar(ctx, x + 16, y + 102, cw - 132, 6, a.progress, { glow: false });
  });
  return toImage(canvas);
}

/** Two-sided trade window. */
export async function renderTrade({ left, right, status = 'open', expiresIn }) {
  const W = 1000;
  const H = 560;
  const { canvas, ctx } = createCard(W, H);
  const color = status === 'completed' ? theme.success : status === 'cancelled' || status === 'expired' ? theme.danger : theme.cyan;
  background(ctx, W, H, { seed: hashSeed(left.name + right.name), accent: color });
  frame(ctx, W, H, color);
  const sub = {
    open: 'أضف الأغراض أو NX ثم أكّد. أي تعديل يلغي التأكيدات.',
    completed: 'تمت الصفقة بنجاح!',
    cancelled: 'أُلغيت الصفقة',
    expired: 'انتهت مهلة الصفقة',
  }[status];
  header(ctx, W, 'نافذة التداول', { subtitle: sub, iconName: 'swap', color });
  const pw = (W - 80 - 70) / 2;
  const sides = [
    { s: right, x: W - 40 - pw },
    { s: left, x: 40 },
  ];
  for (const { s, x } of sides) {
    const c = s.confirmed ? theme.success : theme.royalSoft;
    panel(ctx, x, 136, pw, 370, { radius: 20, stroke: hexToRgba(c, s.confirmed ? 0.9 : 0.4), glow: s.confirmed ? c : null });
    portrait(ctx, s.avatar ?? null, x + pw - 50, 186, 30, { color: c, seed: hashSeed(s.name), label: s.name });
    text(ctx, s.name, x + pw - 96, 176, { size: 22, weight: 800, maxWidth: pw - 210 });
    text(ctx, s.confirmed ? 'أكّد الصفقة' : 'لم يؤكد بعد', x + pw - 96, 204, { size: 14, weight: 700, color: s.confirmed ? theme.success : theme.textMute });
    divider(ctx, x + 20, x + pw - 20, 236, c);
    let y = 266;
    if (s.nx > 0) {
      icon(ctx, 'coin', x + pw - 40, y, 22, theme.gold);
      text(ctx, `${fmt(s.nx)} NX`, x + pw - 62, y, { size: 20, weight: 800, color: theme.gold });
      y += 44;
    }
    for (const it of s.items.slice(0, 5)) {
      const rc = rarityColors[it.rarity] ?? theme.cyan;
      icon(ctx, ITEM_ICONS[it.type] ?? 'box', x + pw - 40, y, 22, rc);
      text(ctx, it.name, x + pw - 62, y, { size: 18, weight: 700, color: theme.text, maxWidth: pw - 150 });
      text(ctx, `x${it.quantity}`, x + 24, y, { size: 17, weight: 700, family: 'num', align: 'left', color: rc });
      y += 40;
    }
    if (s.items.length > 5) text(ctx, `+${s.items.length - 5} أغراض أخرى`, x + pw - 40, y, { size: 15, weight: 600, color: theme.textMute });
    if (!s.nx && !s.items.length) text(ctx, 'لا شيء معروض بعد', x + pw / 2, 360, { size: 18, weight: 600, align: 'center', color: theme.textMute });
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(W / 2, 320, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#081038';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  icon(ctx, 'swap', W / 2, 320, 26, color, { glow: 10 });
  if (expiresIn) footer(ctx, W, H, 'NEXUS TRADE', `تنتهي المهلة ${expiresIn}`);
  return toImage(canvas);
}

/** Wallet with recent transactions. */
export async function renderWallet({ name, code, nx, rank, streak = 0, transactions = [] }) {
  const W = 1000;
  const H = 300 + Math.max(1, transactions.length) * 54 + 40;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(`${code}wallet`), accent: theme.gold });
  frame(ctx, W, H, theme.gold);
  header(ctx, W, `محفظة ${name}`, { subtitle: code, iconName: 'coin', color: theme.gold });
  panel(ctx, 40, 130, W - 80, 120, { radius: 20, accentTop: theme.gold });
  text(ctx, 'الرصيد الحالي', W - 70, 162, { size: 18, weight: 700, color: theme.textDim });
  text(ctx, `${fmt(nx)} NX`, W - 70, 210, { size: 46, weight: 900, family: 'num', align: 'right', dir: 'ltr', color: theme.gold, glow: 18 });
  if (rank) text(ctx, `#${rank}`, 74, 176, { size: 30, weight: 800, family: 'num', align: 'left', color: theme.text });
  text(ctx, rank ? 'ترتيبك بين الأثرياء' : '', 74, 214, { size: 14, weight: 600, align: 'left', color: theme.textDim, dir: 'rtl' });
  if (streak) chip(ctx, `سلسلة يومية ${streak}`, 420, 190, { color: theme.cyan, iconName: 'flame', size: 15 });
  text(ctx, 'آخر المعاملات', W - 50, 280, { size: 18, weight: 800 });
  if (!transactions.length) text(ctx, 'لا توجد معاملات بعد', W / 2, 330, { size: 18, weight: 600, align: 'center', color: theme.textMute });
  transactions.forEach((t, i) => {
    const y = 316 + i * 54;
    panel(ctx, 40, y - 22, W - 80, 46, { radius: 12, fill: 'rgba(12,24,70,0.5)' });
    const inbound = t.direction === 'in';
    icon(ctx, inbound ? 'check' : 'swap', W - 66, y, 18, inbound ? theme.success : theme.danger);
    text(ctx, t.label, W - 90, y, { size: 17, weight: 700, maxWidth: 560 });
    text(ctx, `${inbound ? '+' : '-'}${fmt(t.amount)}`, 64, y, {
      size: 18,
      weight: 800,
      family: 'num',
      align: 'left',
      color: inbound ? theme.success : theme.danger,
    });
    text(ctx, t.when, 200, y, { size: 13, weight: 500, align: 'left', color: theme.textMute, dir: 'rtl' });
  });
  return toImage(canvas);
}

/** Onboarding card for /start. */
export async function renderWelcome({ userName, avatar, hasCharacter }) {
  const W = 1000;
  const H = 560;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: 4242 });
  frame(ctx, W, H);
  // Gate rings
  const cx = W / 2;
  const cy = 170;
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 120 - i * 22, 120 - i * 22, 0, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(i % 2 ? theme.royalSoft : theme.cyan, 0.7 - i * 0.12);
    ctx.lineWidth = 2;
    ctx.shadowColor = theme.cyan;
    ctx.shadowBlur = 20;
    ctx.setLineDash(i % 2 ? [10, 8] : []);
    ctx.stroke();
    ctx.restore();
  }
  portrait(ctx, avatar, cx, cy, 50, { label: userName, seed: hashSeed(userName) });
  text(ctx, 'مرحباً بك في نكسس', cx, 330, { size: 46, weight: 800, align: 'center', glow: 18, glowColor: theme.cyan });
  text(ctx, `${userName}، العالم الذي تلتقي فيه كل الأبعاد بانتظارك`, cx, 378, {
    size: 21,
    weight: 500,
    align: 'center',
    color: theme.textDim,
    maxWidth: W - 120,
  });
  const steps = hasCharacter
    ? [
        ['map', 'استكشف', '/travel'],
        ['scroll', 'المهام', '/quest board'],
        ['swords', 'القتال', '/hunt'],
        ['users', 'النقابات', '/guild'],
      ]
    : [
        ['sparkle', 'أنشئ شخصيتك', '/character create'],
        ['map', 'استكشف العالم', '/travel'],
        ['scroll', 'اقبل مهمة', '/quest board'],
        ['users', 'انضم لنقابة', '/guild'],
      ];
  const sw = (W - 80 - 36) / 4;
  steps.forEach(([ic, label, cmd], i) => {
    const x = W - 40 - sw - i * (sw + 12);
    panel(ctx, x, 420, sw, 96, { radius: 16 });
    icon(ctx, ic, x + sw / 2, 448, 24, theme.cyan, { glow: 8 });
    text(ctx, label, x + sw / 2, 480, { size: 17, weight: 800, align: 'center' });
    text(ctx, cmd, x + sw / 2, 502, { size: 13, weight: 600, family: 'num', align: 'center', color: theme.textMute });
  });
  return toImage(canvas);
}

/** Lore entry, styled like an archive page. */
export async function renderLore({ title, category, content, author }) {
  const W = 1000;
  const H = 560;
  const { canvas, ctx } = createCard(W, H);
  background(ctx, W, H, { seed: hashSeed(title), accent: theme.violet, secondary: theme.royal });
  frame(ctx, W, H, theme.violet);
  header(ctx, W, title, { subtitle: `أرشيف نكسس  •  ${category}`, iconName: 'book', color: '#a5b4fc' });
  panel(ctx, 40, 130, W - 80, 380, { radius: 20, fill: 'rgba(10, 16, 52, 0.7)' });
  paragraph(ctx, content, W - 76, 172, W - 152, { size: 21, weight: 500, color: theme.text, maxLines: 10, lineHeight: 1.65 });
  if (author) footer(ctx, W, H, 'NEXUS ARCHIVE', `دوّنه ${author}`);
  return toImage(canvas);
}
