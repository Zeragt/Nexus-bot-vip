import { ButtonStyle } from 'discord.js';
import { card, row, button, select, pager } from '../core/ui.js';
import { cid } from '../core/customId.js';
import { UserError } from '../core/errors.js';
import { renderContracts, renderBossCard, renderRegion, renderBossHall, renderList, renderNotice } from '../render/index.js';
import { theme, rarityColors } from '../render/theme.js';
import { duration, fmt } from '../utils/format.js';
import { contractBoard, contractLeaders } from '../services/dailies.js';
import { bossesAt, bossHall, bossInfo, bossLeaders } from '../services/bosses.js';
import { regionOverview, landmarkJournal } from '../services/exploration.js';
import { recipeBook } from '../services/crafting.js';
import { describeContracts } from '../services/progress.js';
import { locationInfo } from '../services/story.js';
import { ALL_BOSSES } from '../content/bossRegistry.js';
import { MONSTER_SKILLS } from '../engine/enemies.js';
import { getPool } from '../db/pool.js';
import { RARITY_LABELS } from '../config/game.js';

const rewardTiles = (rewards) =>
  [
    rewards?.xp && { label: 'خبرة', value: `+${fmt(rewards.xp)} XP`, iconName: 'sparkle' },
    rewards?.nx && { label: 'NX', value: `+${fmt(rewards.nx)}`, iconName: 'coin', color: theme.gold },
    ...(rewards?.items ?? [])
      .slice(0, 4)
      .map((it) => ({ label: it.name, value: `x${it.quantity}`, iconName: 'gem', color: rarityColors[it.rarity] ?? theme.cyan })),
  ].filter(Boolean);

const withContracts = (text, contracts) => [text, describeContracts(contracts)].filter(Boolean).join('\n') || undefined;

// Daily contracts ---------------------------------------------------------------

export async function contractsMessage(userId, now = new Date()) {
  const b = await contractBoard(userId, now);
  const buf = await renderContracts({
    name: b.character.name,
    daily: b.daily,
    weekly: b.weekly,
    streak: b.streak,
    bestStreak: b.bestStreak,
    clearedToday: b.clearedToday,
    dailyResetIn: duration(b.dailyReset - now),
    weeklyResetIn: duration(b.weeklyReset - now),
    rerollCost: b.nextRerollCost,
  });
  const swappable = b.daily.filter((c) => !c.done && c.progress === 0);
  const components = [];
  if (swappable.length) {
    components.push(
      row(
        select(
          cid('dl', 'reroll', userId),
          b.nextRerollCost ? `بدّل عقداً (${b.nextRerollCost} NX)` : 'بدّل عقداً (مجاناً مرة كل يوم)',
          swappable.map((c) => ({ label: c.title, value: String(c.slot), description: `${c.tier} • +${c.xp} XP • +${c.nx} NX`, emoji: '🔄' })),
        ),
      ),
    );
  }
  components.push(
    row(
      button(cid('dl', 'board', userId), 'تحديث', ButtonStyle.Secondary, { emoji: '🔁' }),
      button(cid('dl', 'top', userId), 'أبطال العقود', ButtonStyle.Secondary, { emoji: '🏆' }),
    ),
  );
  return { files: [card(buf, 'contracts')], components };
}

export async function contractLeadersMessage() {
  const rows = await contractLeaders(10);
  const buf = await renderList({
    title: 'أبطال العقود',
    subtitle: 'أكثر من أنجز العقود اليومية والأسبوعية',
    iconName: 'trophy',
    color: theme.gold,
    rows: rows.map((r, n) => ({ title: r.name, subtitle: `أفضل سلسلة: ${r.best_streak ?? 0} يوم`, value: fmt(r.n), rank: n + 1 })),
    emptyText: 'لم ينجز أحد عقداً بعد',
  });
  return { files: [card(buf, 'contracts-top')] };
}

// Bosses ------------------------------------------------------------------------

const HALL_FILTERS = {
  all: { label: 'كل الزعماء', test: () => true },
  story: { label: 'زعماء القصة', test: (b) => b.kind === 'story' },
  world: { label: 'زعماء المناطق', test: (b) => b.kind === 'world' },
  beaten: { label: 'من هزمتهم', test: (b) => b.defeated },
  open: { label: 'المتاحون الآن', test: (b) => !b.sealed && !b.defeated },
};
const HALL_PER_PAGE = 10;

export async function hallMessage(userId, page = 1, filter = 'all') {
  const f = HALL_FILTERS[filter] ?? HALL_FILTERS.all;
  const hall = await bossHall(userId);
  const list = hall.bosses.filter(f.test);
  const pages = Math.max(1, Math.ceil(list.length / HALL_PER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const buf = await renderBossHall({
    bosses: list.slice((p - 1) * HALL_PER_PAGE, p * HALL_PER_PAGE),
    beaten: hall.bosses.filter((b) => b.defeated).length,
    total: hall.bosses.length,
    page: p,
    pages,
    filterLabel: f.label,
  });
  const visible = list.slice((p - 1) * HALL_PER_PAGE, p * HALL_PER_PAGE).filter((b) => !b.sealed || b.defeated);
  const components = [
    row(
      select(
        cid('bs', 'filter', userId),
        'اعرض...',
        Object.entries(HALL_FILTERS).map(([k, v]) => ({ label: v.label, value: k, default: k === filter })),
      ),
    ),
  ];
  if (visible.length)
    components.push(
      row(
        select(
          cid('bs', 'info', userId),
          'تفاصيل زعيم',
          visible.map((b) => ({ label: `#${b.number} ${b.name}`, value: b.key, description: `${b.kind === 'story' ? 'قصة' : 'منطقة'} • مستوى ${b.level}` })),
        ),
      ),
    );
  const nav = pager('bs', userId, p, pages, filter);
  if (nav) components.push(nav);
  return { files: [card(buf, 'boss-hall')], components };
}

async function itemRows(keys) {
  if (!keys.length) return {};
  const { rows } = await getPool().query('SELECT key, name_ar, rarity FROM items WHERE key = ANY($1::text[])', [keys]);
  return Object.fromEntries(rows.map((r) => [r.key, r]));
}

export async function bossInfoMessage(userId, key) {
  const v = await bossInfo(userId, key);
  const b = v.boss;
  const lootKeys = b.kind === 'world' ? [...b.loot.map(([k]) => k), b.trophy] : [];
  const names = await itemRows(lootKeys);
  const loc = await locationInfo(b.location).catch(() => ({ nameAr: b.location }));
  const buf = await renderBossCard({
    boss: b,
    number: b.number,
    total: ALL_BOSSES.length,
    kind: b.kind,
    locationName: loc.nameAr,
    sealed: v.sealed,
    blockers: b.kind === 'world' ? v.blockers : v.sealed ? [] : ['زعيم قصة: يُواجه عبر /story fight في فصله'],
    record: v.record,
    rewards: v.rewards,
    skills: (b.skills ?? []).map((s) => MONSTER_SKILLS[s]?.name ?? s),
    loot: lootKeys.filter((k) => names[k]).map((k) => ({ name: names[k].name_ar, rarity: names[k].rarity })),
  });
  const btns = [button(cid('bs', 'page', userId, 1, 'all'), 'قاعة الزعماء', ButtonStyle.Secondary, { emoji: '👑' })];
  if (b.kind === 'world' && !v.sealed)
    btns.unshift(button(cid('bs', 'fight', userId, b.key), 'واجهه', ButtonStyle.Danger, { emoji: '⚔️', disabled: v.blockers.length > 0 }));
  return { files: [card(buf, 'boss')], components: [row(...btns)] };
}

export async function bossesHereMessage(userId) {
  const v = await bossesAt(userId);
  if (!v.bosses.length) throw new UserError('لا يسكن هذا المكان أي زعيم. جرّب البراري أو العوالم العائدة. اعرض القائمة كاملة عبر /boss hall');
  const loc = await locationInfo(v.location).catch(() => ({ nameAr: v.location }));
  const buf = await renderList({
    title: `زعماء ${loc.nameAr}`,
    subtitle: 'كل زعيم يُهزم مرة كل بضع ساعات، والانتصار الأول يدفع الضعف',
    iconName: 'crown',
    color: '#fb7185',
    rowHeight: 86,
    rows: v.bosses.map((b) => ({
      title: b.sealed ? 'زعيم مختوم' : b.name,
      subtitle: b.sealed ? `يظهر بعد الفصل ${b.chapter}` : b.blockers.length ? b.blockers[0] : `${b.title} • جاهز للقتال`,
      value: `م${b.level}`,
      valueSub: `${b.record?.kills ?? 0} انتصار`,
      iconName: b.sealed ? 'lock' : 'skull',
      color: b.sealed ? theme.textMute : b.blockers.length ? theme.warn : '#fb7185',
      dim: b.sealed,
    })),
  });
  const open = v.bosses.filter((b) => !b.sealed);
  const components = open.length
    ? [
        row(
          ...open.map((b) =>
            button(cid('bs', 'info', userId, b.key), b.name.slice(0, 40), b.blockers.length ? ButtonStyle.Secondary : ButtonStyle.Danger, { emoji: '👑' }),
          ),
        ),
      ]
    : [];
  return { files: [card(buf, 'bosses-here')], components };
}

export async function bossLeadersMessage() {
  const rows = await bossLeaders(10);
  const buf = await renderList({
    title: 'صائدو الزعماء',
    subtitle: 'أكثر من هزم زعماء المناطق',
    iconName: 'crown',
    color: theme.gold,
    rows: rows.map((r, n) => ({ title: r.name, subtitle: `${r.kills} انتصار`, value: `${r.bosses}`, valueSub: 'زعيم', rank: n + 1 })),
    emptyText: 'لم يسقط أي زعيم بعد',
  });
  return { files: [card(buf, 'boss-top')] };
}

/** Follow-up after a region boss fight. */
export function bossResultText(boss) {
  if (!boss) return null;
  if (!boss.won) return `💀 صمد **${boss.boss.name}**. اشفِ جراحك وعد إليه حين تكون مستعداً.`;
  const lines = [`👑 سقط **${boss.boss.name}**!${boss.firstKill ? ' انتصارك الأول عليه: المكافأة مضاعفة!' : ''}`];
  if (boss.text) lines.push(boss.text);
  if (boss.secret) lines.push(`🌟 **عنصر سري!** حصلت على **${boss.secret.name}**. احذر: في التحديات قد يسقط منك بنسبة ضئيلة جداً.`);
  return lines.join('\n');
}

// Regions -----------------------------------------------------------------------

export async function regionMessage(userId, key = null) {
  const v = await regionOverview(userId, key);
  const buf = await renderRegion(v);
  const btns = [];
  if (v.here && !v.sealed) {
    btns.push(button(cid('rg', 'explore', userId), 'استكشف', ButtonStyle.Success, { emoji: '🔦' }));
    if (v.gather.some((g) => !g.locked)) btns.push(button(cid('rg', 'gather', userId), 'اجمع الموارد', ButtonStyle.Primary, { emoji: '⛏️' }));
    if (v.bosses.some((b) => !b.sealed)) btns.push(button(cid('bs', 'here', userId), 'زعماء المكان', ButtonStyle.Danger, { emoji: '👑' }));
  }
  btns.push(button(cid('rg', 'journal', userId), 'سجل المعالم', ButtonStyle.Secondary, { emoji: '📔' }));
  return { files: [card(buf, 'region')], components: [row(...btns)] };
}

function againRow(userId, gatherToo = true) {
  return row(
    button(cid('rg', 'explore', userId), 'استكشف مجدداً', ButtonStyle.Success, { emoji: '🔦' }),
    gatherToo && button(cid('rg', 'gather', userId), 'اجمع', ButtonStyle.Primary, { emoji: '⛏️' }),
    button(cid('rg', 'view', userId), 'المنطقة', ButtonStyle.Secondary, { emoji: '🗺️' }),
  );
}

export async function exploreMessage(userId, res) {
  const tiles = rewardTiles(res.rewards);
  if (res.hpChange)
    tiles.push({
      label: 'الصحة',
      value: `${res.hpChange > 0 ? '+' : ''}${res.hpChange}`,
      iconName: 'heart',
      color: res.hpChange > 0 ? theme.success : theme.danger,
    });
  if (res.nxLost) tiles.push({ label: 'خسرت', value: `-${res.nxLost} NX`, iconName: 'coin', color: theme.danger });
  const buf = await renderNotice({
    title: res.landmark ? `اكتشفت: ${res.landmark.name}` : 'استكشاف',
    subtitle: res.location?.nameAr ?? '',
    iconName: res.landmark ? 'flag' : 'map',
    color: res.landmark ? theme.gold : theme.cyan,
    tiles,
    body: res.landmark ? res.landmark.text : res.event?.text,
  });
  const lines = [];
  if (res.mastery) lines.push(`🏆 اكتشفت كل معالم هذه المنطقة! مكافأة الإتقان: ${res.mastery.xp} XP و${res.mastery.nx} NX وصندوقا مستكشف.`);
  return { content: withContracts(lines.join('\n'), res.contracts), files: [card(buf, 'explore')], components: [againRow(userId)] };
}

export async function gatherMessage(userId, res) {
  const buf = await renderNotice({
    title: 'جمعت موارد',
    subtitle: res.location?.nameAr ?? '',
    iconName: 'gem',
    color: '#34d399',
    tiles: rewardTiles(res.rewards),
    body: res.items.map((i) => `${i.name} (${RARITY_LABELS[i.rarity] ?? i.rarity}) x${i.quantity}`).join('، '),
  });
  return {
    content: withContracts('', res.contracts),
    files: [card(buf, 'gather')],
    components: [
      row(
        button(cid('rg', 'gather', userId), 'اجمع مجدداً', ButtonStyle.Primary, { emoji: '⛏️' }),
        button(cid('cf', 'page', userId, 1), 'الصناعة', ButtonStyle.Secondary, { emoji: '⚒️' }),
      ),
    ],
  };
}

export async function journalMessage(userId) {
  const j = await landmarkJournal(userId);
  const buf = await renderList({
    title: 'سجل المعالم',
    subtitle: `${j.character.name} • ${j.found.length} معلماً مكتشفاً`,
    iconName: 'flag',
    color: theme.gold,
    rows: j.found
      .slice(-10)
      .reverse()
      .map((l) => ({ title: l.name, subtitle: l.text.slice(0, 90), iconName: 'flag', color: theme.gold })),
    emptyText: 'لم تكتشف أي معلم بعد. استخدم /region explore',
    rowHeight: 84,
  });
  return { files: [card(buf, 'landmarks')] };
}

// Crafting ----------------------------------------------------------------------

const RECIPES_PER_PAGE = 7;

export async function recipesMessage(userId, page = 1) {
  const book = await recipeBook(userId);
  // Ready first, then craftable-but-missing, then sealed.
  const order = (r) => (r.ready ? 0 : r.locked ? 2 : 1);
  const list = [...book.recipes].sort((a, b) => order(a) - order(b) || a.level - b.level);
  const pages = Math.max(1, Math.ceil(list.length / RECIPES_PER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = list.slice((p - 1) * RECIPES_PER_PAGE, p * RECIPES_PER_PAGE);
  const buf = await renderList({
    title: 'ورشة الصناعة',
    subtitle: `${book.recipes.filter((r) => r.ready).length} وصفة جاهزة • المواد تُجمع من المناطق والزعماء`,
    iconName: 'gear',
    color: '#f59e0b',
    rowHeight: 84,
    page: p,
    pages,
    rows: slice.map((r) => ({
      title: r.locked ? `${r.name} (مختومة)` : r.name,
      subtitle: r.locked ? `تُفتح عند ${r.locked}` : r.materials.map((m) => `${m.name} ${m.have}/${m.need}`).join(' • '),
      value: r.nx ? `${fmt(r.nx)} NX` : 'مجاني',
      valueSub: r.qty > 1 ? `ينتج ${r.qty}` : RARITY_LABELS[r.rarity],
      iconName: r.ready ? 'check' : r.locked ? 'lock' : 'gear',
      color: r.locked ? theme.textMute : r.ready ? theme.success : (rarityColors[r.rarity] ?? theme.cyan),
      highlight: r.ready,
      dim: Boolean(r.locked),
    })),
  });
  const ready = list.filter((r) => r.ready);
  const components = [];
  if (ready.length)
    components.push(
      row(
        select(
          cid('cf', 'make', userId),
          'اصنع وصفة جاهزة',
          ready.map((r) => ({ label: r.name, value: r.key, description: `${RARITY_LABELS[r.rarity]} • ${r.nx} NX`, emoji: '⚒️' })),
        ),
      ),
    );
  const nav = pager('cf', userId, p, pages);
  if (nav) components.push(nav);
  return { files: [card(buf, 'crafting')], components };
}

export async function craftedMessage(res) {
  const buf = await renderNotice({
    title: `صنعت ${res.item.name}`,
    subtitle: `${RARITY_LABELS[res.item.rarity] ?? ''} • x${res.quantity}`,
    iconName: 'gear',
    color: rarityColors[res.item.rarity] ?? '#f59e0b',
    tiles: [
      { label: 'الناتج', value: `${res.item.name} x${res.quantity}`, iconName: 'gem', color: rarityColors[res.item.rarity] ?? theme.cyan },
      res.cost ? { label: 'التكلفة', value: `-${fmt(res.cost)} NX`, iconName: 'coin', color: theme.gold } : null,
    ].filter(Boolean),
  });
  return { content: withContracts('', res.contracts), files: [card(buf, 'crafted')] };
}
