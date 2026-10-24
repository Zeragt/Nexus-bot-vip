import { ButtonStyle } from 'discord.js';
import {
  renderInventory,
  renderWallet,
  renderQuestBoard,
  renderQuest,
  renderList,
  renderMap,
  renderLocation,
  renderNpc,
  renderShop,
  renderAchievements,
  renderNotice,
} from '../render/index.js';
import { card, row, button, pager, select } from '../core/ui.js';
import { cid } from '../core/customId.js';
import { listInventory, carriedWeight, capacityOf } from '../services/inventory.js';
import { history, wealthRank } from '../services/economy.js';
import { questBoard, activeQuests } from '../services/quests.js';
import { listLocations, playersAt, getLocation, travelEnergyCost } from '../services/world.js';
import { listNpcs } from '../services/npcs.js';
import { visitedKeys } from '../services/characters.js';
import { listAchievements } from '../services/achievements.js';
import { getPool } from '../db/pool.js';
import { profileButtons } from './character.js';
import { theme, difficultyColors } from '../render/theme.js';
import { DIFFICULTY_LABELS, ITEM_TYPE_LABELS } from '../config/game.js';
import { describeRewards } from '../services/rewards.js';
import { fmt } from '../utils/format.js';

const when = (d) => {
  const mins = Math.round((Date.now() - new Date(d)) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} د`;
  if (mins < 1440) return `قبل ${Math.round(mins / 60)} س`;
  return `قبل ${Math.round(mins / 1440)} يوم`;
};

// Inventory -------------------------------------------------------------------
export async function inventoryMessage(ch, viewerId, { page = 1, type = null, withProfileNav = false } = {}) {
  const inv = await listInventory(ch.id, { page, type });
  const db = getPool();
  const buf = await renderInventory({
    owner: ch.name,
    code: ch.code,
    nx: ch.nx,
    weight: await carriedWeight(db, ch.id),
    capacity: capacityOf(ch),
    items: inv.items,
    page: inv.page,
    pages: inv.pages,
    filterLabel: type ? ITEM_TYPE_LABELS[type] : 'كل الأغراض',
  });
  const components = [];
  const pg = pager('inv', viewerId, inv.page, inv.pages, ch.id, type ?? 'all');
  if (pg) components.push(pg);
  components.push(
    row(
      select(cid('inv', 'filter', viewerId, ch.id), 'تصفية حسب النوع', [
        { label: 'كل الأغراض', value: 'all', emoji: '🎒' },
        ...Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => ({ label, value })),
      ]),
    ),
  );
  if (withProfileNav) components.push(...profileButtons(ch.id, viewerId, 'inventory'));
  return { files: [card(buf, 'inventory')], components: components.slice(0, 5) };
}

// Economy -------------------------------------------------------------------
export async function walletMessage(ch, viewerId, { withProfileNav = false } = {}) {
  const tx = await history(ch.id, 6);
  const streak = (await getPool().query('SELECT daily_streak FROM users WHERE discord_id = $1', [ch.userId])).rows[0]?.daily_streak ?? 0;
  const buf = await renderWallet({
    name: ch.name,
    code: ch.code,
    nx: ch.nx,
    rank: await wealthRank(ch.id),
    streak,
    transactions: tx.map((t) => ({ ...t, when: when(t.createdAt) })),
  });
  return { files: [card(buf, 'wallet')], components: withProfileNav ? profileButtons(ch.id, viewerId, 'economy') : [] };
}

// Quests ----------------------------------------------------------------------
export async function boardMessage(viewerId, { page = 1, level = null } = {}) {
  const b = await questBoard({ page });
  const buf = await renderQuestBoard({
    playerLevel: level,
    page: b.page,
    pages: b.pages,
    quests: b.quests.map((q) => ({
      code: q.code,
      title: q.title,
      difficulty: q.difficulty,
      location: q.location,
      giver: q.giver,
      minLevel: q.minLevel,
      xp: q.xpReward,
      nx: q.nxReward,
      reputation: q.reputationReward,
      items: q.items,
      repeatable: q.repeatable,
    })),
  });
  const components = [];
  if (b.quests.length) {
    components.push(
      row(
        select(
          cid('qb', 'pick', viewerId ?? '0'),
          'اختر مهمة لعرضها أو قبولها',
          b.quests.map((q) => ({
            label: `${q.code} — ${q.title}`,
            value: q.code,
            description: `${DIFFICULTY_LABELS[q.difficulty]} • مستوى ${q.minLevel}+ • ${q.xpReward} XP`,
            emoji: '📜',
          })),
        ),
      ),
    );
  }
  const pg = pager('qb', viewerId ?? '0', b.page, b.pages);
  if (pg) components.push(pg);
  return { files: [card(buf, 'quest-board')], components };
}

export function questButtons(code, status, viewerId) {
  const btns = [];
  if (status === 'available') btns.push(button(cid('qb', 'accept', viewerId ?? '0', code), 'قبول المهمة', ButtonStyle.Success, { emoji: '✅' }));
  if (status === 'active') {
    btns.push(button(cid('qb', 'complete', viewerId, code), 'تسليم المهمة', ButtonStyle.Success, { emoji: '🏁' }));
    btns.push(button(cid('qb', 'abandon', viewerId, code), 'التخلي', ButtonStyle.Danger, { emoji: '🗑️' }));
  }
  return btns.length ? [row(...btns)] : [];
}

export async function questMessage(view, viewerId) {
  const buf = await renderQuest({ quest: view.quest, objectives: view.objectives, status: view.status, expiresAt: view.expiresAt });
  return { files: [card(buf, 'quest')], components: questButtons(view.quest.code, view.status, viewerId) };
}

export async function activeQuestsCard(userId) {
  const { character, quests } = await activeQuests(userId);
  const rows = quests.map(({ quest, status, objectives }) => {
    const done = objectives.filter((o) => o.done).length;
    return {
      title: quest.title,
      subtitle: `${quest.code} • ${DIFFICULTY_LABELS[quest.difficulty]} • ${objectives.map((o) => `${o.description} ${o.current}/${o.requiredCount}`).join(' | ')}`,
      iconName: 'scroll',
      color: status === 'pending_review' ? theme.warn : difficultyColors[quest.difficulty],
      value: `${done}/${objectives.length}`,
      valueSub: status === 'pending_review' ? 'بانتظار المراجعة' : 'الأهداف',
      progress: objectives.length ? done / objectives.length : 0,
    };
  });
  const buf = await renderList({
    title: `مهام ${character.name}`,
    subtitle: `${quests.length} من 5 مهام نشطة`,
    iconName: 'scroll',
    color: theme.gold,
    rows,
    emptyText: 'لا توجد مهام نشطة. تفقد لوحة المهام عبر /quest board',
    footerText: 'سلّم المهمة عبر /quest complete',
  });
  return { character, buf, quests };
}

export async function questsMessageForProfile(ch, viewerId) {
  const { buf } = await activeQuestsCard(ch.userId);
  return { files: [card(buf, 'quests')], components: profileButtons(ch.id, viewerId, 'quests') };
}

export function questRewardCard(quest, rewards) {
  return renderNotice({
    title: 'أُنجزت المهمة!',
    subtitle: quest.title,
    iconName: 'scroll',
    color: theme.gold,
    tiles: [
      rewards.xp && { label: 'خبرة', value: `+${fmt(rewards.xp)} XP`, iconName: 'sparkle' },
      rewards.nx && { label: 'NX', value: `+${fmt(rewards.nx)}`, iconName: 'coin', color: theme.gold },
      rewards.reputation && { label: 'السمعة', value: `+${rewards.reputation}`, iconName: 'crown', color: theme.violet },
      ...rewards.items.map((it) => ({ label: 'غرض', value: `${it.name} x${it.quantity}`, iconName: 'gem', color: theme.cyan })),
    ].filter(Boolean),
    body: rewards.unlocked?.length ? `إنجاز جديد: ${rewards.unlocked.map((a) => a.name_ar).join('، ')}` : '',
  });
}

// World -------------------------------------------------------------------------
export async function mapMessage(ch, viewerId) {
  const locations = await listLocations();
  const buf = await renderMap({ locations, currentKey: ch.location?.key, visitedKeys: await visitedKeys(ch.id), playerLevel: ch.level });
  const from = ch.location ? locations.find((l) => l.key === ch.location.key) : null;
  const options = locations
    .filter((l) => l.key !== ch.location?.key)
    .map((l) => {
      const cost = travelEnergyCost(from, l);
      const lock = l.locked || l.minLevel > ch.level;
      return {
        label: l.nameAr,
        value: l.key,
        description: `${l.name}${lock ? ` • مقفل (مستوى ${l.minLevel})` : ''}${cost ? ` • ${cost} طاقة` : ' • مجاني'}`,
        emoji: lock ? '🔒' : l.region === 'city' ? '🏙️' : l.region === 'rift' ? '🌌' : '🌲',
      };
    });
  return { files: [card(buf, 'map')], components: [row(select(cid('tv', 'go', viewerId), 'إلى أين تريد السفر؟', options))] };
}

export async function locationCard(loc, { here = false } = {}) {
  const npcs = await listNpcs({ locationId: loc.id });
  return renderLocation({
    nameAr: loc.nameAr,
    name: loc.name,
    description: loc.description,
    region: loc.region,
    danger: loc.danger,
    minLevel: loc.minLevel,
    npcs: npcs.map((n) => ({ name: n.name, title: n.title, color: n.color, hasShop: n.hasShop })),
    players: await playersAt(loc.id),
    here,
    channelName: loc.channelName,
  });
}

export async function locationMessage(locKey, ch, viewerId) {
  const loc = await getLocation(locKey);
  const npcs = await listNpcs({ locationId: loc.id });
  const components = [];
  if (npcs.length) {
    components.push(
      row(
        select(
          cid('npc', 'talk', viewerId),
          'تحدث مع شخصية',
          npcs.map((n) => ({ label: n.name, value: n.key, description: n.title, emoji: n.hasShop ? '🛒' : '💬' })),
        ),
      ),
    );
  }
  const btns = [];
  if (ch?.location?.key !== loc.key) btns.push(button(cid('tv', 'goto', viewerId, loc.key), `سافر إلى ${loc.nameAr}`, ButtonStyle.Primary, { emoji: '🧭' }));
  if (npcs.some((n) => n.hasShop) && ch?.location?.key === loc.key)
    btns.push(button(cid('shop', 'open', viewerId), 'المتجر', ButtonStyle.Secondary, { emoji: '🛒' }));
  if (loc.danger > 0 && ch?.location?.key === loc.key) btns.push(button(cid('cb', 'hunt', viewerId), 'استكشف المنطقة', ButtonStyle.Danger, { emoji: '⚔️' }));
  if (btns.length) components.push(row(...btns));
  return { files: [card(await locationCard(loc, { here: ch?.location?.key === loc.key }), 'location')], components };
}

export async function npcMessage({ npc, line }, viewerId) {
  const buf = await renderNpc({
    name: npc.name,
    title: npc.title,
    description: npc.description,
    color: npc.color,
    location: npc.location,
    faction: npc.faction,
    line,
    hasShop: npc.hasShop,
  });
  const btns = [button(cid('npc', 'again', viewerId, npc.key), 'تحدث مجدداً', ButtonStyle.Secondary, { emoji: '💬' })];
  if (npc.hasShop) btns.push(button(cid('shop', 'open', viewerId, npc.key), 'تصفح البضاعة', ButtonStyle.Primary, { emoji: '🛒' }));
  return { files: [card(buf, 'npc')], components: [row(...btns)] };
}

export async function shopMessage({ npc, items, character }, viewerId) {
  const buf = await renderShop({ npcName: npc.name, npcTitle: npc.title, color: npc.color, nx: character.nx, items: items.slice(0, 12) });
  const buyable = items.filter((i) => i.stock !== 0);
  const components = buyable.length
    ? [
        row(
          select(
            cid('shop', 'buy', viewerId, npc.key),
            'اشترِ غرضاً (قطعة واحدة)',
            buyable.map((i) => ({ label: `${i.name} — ${i.price} NX`, value: i.key, description: i.nameEn })),
          ),
        ),
      ]
    : [];
  return { files: [card(buf, 'shop')], components };
}

export async function achievementsMessage(ch) {
  const list = await listAchievements(ch.id);
  return { files: [card(await renderAchievements({ name: ch.name, achievements: list }), 'achievements')] };
}

export function rewardLine(summary) {
  return describeRewards(summary);
}
