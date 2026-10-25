import { SlashCommandBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { send, card, ok, assertOwner, button, row, select, pager } from '../core/ui.js';
import { cid } from '../core/customId.js';
import { UserError } from '../core/errors.js';
import { requireByUser } from '../services/characters.js';
import { getBoard, claim, reroll, worldGoal, claimWorldGoal } from '../services/dailies.js';
import { explore, gather, zoneOverview, moveZone, provinceOverview } from '../services/exploration.js';
import { recipeBook, recipeAutocomplete, craft, MAX_CRAFT_BATCH } from '../services/crafting.js';
import { STATIONS } from '../content/recipes.js';
import { PROVINCES, ZONE_BY_KEY } from '../content/regions.js';
import { renderNotice } from '../render/index.js';
import { renderDailyBoard, renderWorldGoal, renderZones, renderProvince, renderRecipes, questIcon } from '../render/cards/world3.js';
import { theme, rarityColors, difficultyColors } from '../render/theme.js';
import { levelUpCard } from '../views/character.js';
import { fmt } from '../utils/format.js';
import { postCombat } from './combat.js';

// --- shared helpers ------------------------------------------------------------------------

function rewardTiles(r, extra = []) {
  const tiles = [...extra];
  if (r?.xp) tiles.push({ label: 'الخبرة', value: `+${fmt(r.xp)} XP`, iconName: 'sparkle', color: theme.cyan });
  if (r?.nx) tiles.push({ label: 'NX', value: `${r.nx > 0 ? '+' : ''}${fmt(r.nx)}`, iconName: 'coin', color: theme.gold });
  for (const it of (r?.items ?? []).slice(0, 9 - tiles.length))
    tiles.push({ label: it.name, value: `x${it.quantity}`, iconName: 'gem', color: rarityColors[it.rarity] ?? theme.cyan });
  return tiles;
}

async function followLevelUp(i, userId, level) {
  if (!level) return;
  const ch = await requireByUser(userId);
  await i.followUp({ files: [card(await levelUpCard(ch, level), 'level-up')] }).catch(() => {});
}

// --- /daily ------------------------------------------------------------------------------

async function boardPayload(userId) {
  const b = await getBoard(userId);
  const buf = await renderDailyBoard(b);
  const rerollable = b.daily.filter((q) => q.status === 'active');
  const ready = [...b.daily, ...b.weekly].some((q) => q.status === 'done');
  const components = [
    row(
      button(cid('dq', 'claim', userId), 'استلم المكتمل', ready ? ButtonStyle.Success : ButtonStyle.Secondary, { emoji: '🎁', disabled: !ready }),
      button(cid('dq', 'world', userId), 'هدف السيرفر', ButtonStyle.Primary, { emoji: '🌍' }),
      button(cid('dq', 'refresh', userId), 'تحديث', ButtonStyle.Secondary, { emoji: '🔄' }),
    ),
  ];
  if (rerollable.length) {
    const costText = b.freeRerollsLeft ? 'مجاناً' : b.rerollTokens ? 'برمز تبديل' : `${fmt(b.nextRerollCost)} NX`;
    components.push(
      row(
        select(
          cid('dq', 'reroll', userId),
          `بدّل مهمة (${costText})`,
          rerollable.map((q) => ({ label: `${q.slot}. ${q.title}`, value: String(q.slot), description: q.description })),
        ),
      ),
    );
  }
  return { files: [card(buf, 'daily')], components };
}

async function claimPayload(userId, questId = null) {
  const res = await claim(userId, questId);
  const extra = [];
  if (res.chest) {
    extra.push({ label: 'لوحة اليوم كاملة', value: 'صندوق المهام', iconName: 'box', color: rarityColors.rare });
    extra.push({ label: 'السلسلة', value: `${res.chest.streak} يوم`, iconName: 'flame', color: theme.warn });
  }
  const buf = await renderNotice({
    title: res.claimed.length === 1 ? `أنجزت: ${res.claimed[0].title}` : `استلمت ${res.claimed.length} مهام`,
    subtitle: res.chest?.milestone ? `مكافأة سلسلة ${res.chest.streak} يوماً!` : res.chest ? 'افتح صندوق المهام عبر /inventory use' : '',
    iconName: res.chest ? 'box' : questIcon(res.claimed[0]?.kind),
    color: res.chest ? theme.gold : (difficultyColors[res.claimed[0]?.tier] ?? theme.success),
    tiles: rewardTiles(res.rewards, extra),
  });
  return { payload: { files: [card(buf, 'daily-claim')] }, level: res.rewards.level };
}

async function worldPayload(userId) {
  const view = await worldGoal(userId);
  const g = view.goal;
  const components = [];
  if (g?.done && g.mine > 0 && !g.claimed) components.push(row(button(cid('dq', 'wclaim', userId), 'استلم نصيبك', ButtonStyle.Success, { emoji: '🌍' })));
  return { files: [card(await renderWorldGoal(view), 'world-goal')], components };
}

export const dailyCommand = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('المهام اليومية والأسبوعية (تتغير كل يوم)')
    .addSubcommand((s) => s.setName('board').setDescription('لوحة مهام اليوم والأسبوع'))
    .addSubcommand((s) => s.setName('claim').setDescription('استلم مكافآت كل المهام المكتملة'))
    .addSubcommand((s) =>
      s
        .setName('reroll')
        .setDescription('بدّل مهمة يومية بأخرى')
        .addIntegerOption((o) => o.setName('slot').setDescription('رقم المهمة في اللوحة').setRequired(true).setMinValue(1).setMaxValue(6)),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('world')
        .setDescription('هدف السيرفر اليومي المشترك')
        .addSubcommand((s) => s.setName('view').setDescription('تقدم هدف السيرفر'))
        .addSubcommand((s) => s.setName('claim').setDescription('استلم نصيبك من هدف السيرفر')),
    ),
  defer: 'public',
  async execute(i, { sub }) {
    const uid = i.user.id;
    const group = i.options.getSubcommandGroup(false);
    if (group === 'world') {
      if (sub === 'claim') {
        const res = await claimWorldGoal(uid);
        const buf = await renderNotice({
          title: 'نصيبك من هدف السيرفر',
          subtitle: res.goal.title,
          iconName: 'globe',
          color: theme.success,
          tiles: rewardTiles(res.rewards),
        });
        await send(i, { files: [card(buf, 'world-claim')] });
        return followLevelUp(i, uid, res.rewards.level);
      }
      return send(i, await worldPayload(uid));
    }
    if (sub === 'board') return send(i, await boardPayload(uid));
    if (sub === 'claim') {
      const res = await claimPayload(uid);
      await send(i, res.payload);
      return followLevelUp(i, uid, res.level);
    }
    if (sub === 'reroll') {
      const res = await reroll(uid, i.options.getInteger('slot', true));
      const paid = res.paid.kind === 'free' ? 'مجاناً' : res.paid.kind === 'token' ? 'برمز تبديل' : `مقابل ${fmt(res.paid.cost)} NX`;
      await send(i, ok(`بدّلت «${res.old.title}» بـ **${res.quest.title}** (${paid}).`));
      return i.followUp(await boardPayload(uid));
    }
    throw new UserError('أمر غير معروف');
  },
};

/** dq:* — daily board buttons (claim, reroll select, world goal). */
export const dailyComponent = {
  prefix: 'dq',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    const owner = args[0];
    if (action === 'world') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      return i.editReply(await worldPayload(uid));
    }
    if (action === 'wclaim') {
      assertOwner(i, owner, { ttlMs: 0 });
      await i.deferReply();
      const res = await claimWorldGoal(uid);
      const buf = await renderNotice({
        title: 'نصيبك من هدف السيرفر',
        subtitle: res.goal.title,
        iconName: 'globe',
        color: theme.success,
        tiles: rewardTiles(res.rewards),
      });
      await i.editReply({ files: [card(buf, 'world-claim')] });
      return followLevelUp(i, uid, res.rewards.level);
    }
    assertOwner(i, owner);
    if (action === 'refresh') {
      await i.deferUpdate();
      return i.editReply({ ...(await boardPayload(uid)), attachments: [] });
    }
    if (action === 'claim') {
      await i.deferReply();
      const res = await claimPayload(uid);
      await i.editReply(res.payload);
      await followLevelUp(i, uid, res.level);
      return i.message.edit({ ...(await boardPayload(uid)), attachments: [] }).catch(() => {});
    }
    if (action === 'reroll') {
      await i.deferUpdate();
      const res = await reroll(uid, Number(i.values[0]));
      await i.editReply({ ...(await boardPayload(uid)), attachments: [] });
      const paid = res.paid.kind === 'free' ? 'مجاناً' : res.paid.kind === 'token' ? 'برمز تبديل' : `مقابل ${fmt(res.paid.cost)} NX`;
      return i.followUp({ ...ok(`بدّلت «${res.old.title}» بـ **${res.quest.title}** (${paid}).`), flags: MessageFlags.Ephemeral });
    }
  },
};

// --- /explore and /gather ------------------------------------------------------------------

const EXPLORE_TITLES = {
  resource: ['موارد!', 'leaf', theme.success],
  cache: ['مخبأ مستكشف', 'box', rarityColors.rare],
  lore: ['أثر من الماضي', 'book', theme.violet],
  traveler: ['مسافر عابر', 'users', theme.cyan],
  trap: ['فخ!', 'skull', theme.danger],
  shrine: ['مزار قديم', 'sparkle', theme.gold],
  nothing: ['هدوء', 'compass', theme.textDim],
  encounter: ['كمين!', 'swords', theme.danger],
  elite: ['نخبة!', 'crown', rarityColors.mythic],
  pickpocket: ['نشّال!', 'coin', theme.warn],
  festival: ['احتفال في الشارع', 'star', theme.gold],
};

function exploreButtons(userId, { fight = false } = {}) {
  return row(
    button(cid('xp', 'go', userId), 'استكشف مجدداً', ButtonStyle.Primary, { emoji: '🧭', disabled: fight }),
    button(cid('xp', 'gather', userId), 'اجمع', ButtonStyle.Secondary, { emoji: '⛏️', disabled: fight }),
    button(cid('xp', 'zones', userId), 'المناطق', ButtonStyle.Secondary, { emoji: '🗺️' }),
  );
}

async function explorePayload(userId) {
  const out = await explore(userId);
  const [title, iconName, color] = EXPLORE_TITLES[out.kind] ?? ['استكشاف', 'compass', theme.cyan];
  const tiles = rewardTiles({ xp: out.xp, nx: out.nx, items: out.items });
  if (out.hpLost) tiles.push({ label: 'الصحة', value: `-${out.hpLost}`, iconName: 'heart', color: theme.danger });
  if (out.buff) tiles.push({ label: 'بركة', value: '20 دقيقة', iconName: 'sparkle', color: theme.violet });
  tiles.push({ label: 'نقاط الاستكشاف', value: `${fmt(out.points)} (+${out.pointsGained})`, iconName: 'compass', color: theme.violet });
  for (const z of out.unlocked.slice(0, 2))
    tiles.push({ label: 'منطقة جديدة!', value: z.depth === 4 ? '؟؟؟ (مخفية)' : z.name, iconName: 'map', color: theme.success });
  const buf = await renderNotice({
    title,
    subtitle: `${out.zone.name}  •  ${out.weather?.name ?? ''}`,
    iconName,
    color,
    tiles: tiles.slice(0, 9),
    body: out.text,
  });
  return { out, payload: { files: [card(buf, 'explore')], components: [exploreButtons(userId, { fight: Boolean(out.fight) })] } };
}

async function runExplore(i, userId, { reply = 'send' } = {}) {
  const { out, payload } = await explorePayload(userId);
  if (reply === 'edit') await i.editReply(payload);
  else await send(i, payload);
  if (out.fight) await postCombat(i, out.fight);
  await followLevelUp(i, userId, out.level);
}

async function gatherPayload(userId) {
  const res = await gather(userId);
  const buf = await renderNotice({
    title: res.items.length ? `جمعت ${res.total} من الموارد` : 'لم تجد شيئاً يستحق',
    subtitle: `${res.zone.name}  •  ${res.weather?.name ?? ''}`,
    iconName: 'pickaxe',
    color: theme.success,
    tiles: rewardTiles({ items: res.items }),
    body: res.weather?.gather > 1 ? `الطقس (${res.weather.name}) يزيد الجمع.` : '',
  });
  return { files: [card(buf, 'gather')], components: [exploreButtons(userId)] };
}

export const exploreCommand = {
  data: new SlashCommandBuilder().setName('explore').setDescription('استكشف منطقتك الحالية: موارد، أسرار، صناديق، ووحوش'),
  defer: 'public',
  async execute(i) {
    return runExplore(i, i.user.id);
  },
};

export const gatherCommand = {
  data: new SlashCommandBuilder().setName('gather').setDescription('اجمع موارد منطقتك الحالية (للصناعة والمهام)'),
  defer: 'public',
  async execute(i) {
    return send(i, await gatherPayload(i.user.id));
  },
};

/** xp:* — explore/gather/zone buttons. */
export const exploreComponent = {
  prefix: 'xp',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    assertOwner(i, args[0], { ttlMs: 0 });
    if (action === 'go') {
      await i.deferReply();
      return runExplore(i, uid, { reply: 'edit' });
    }
    if (action === 'gather') {
      await i.deferReply();
      return i.editReply(await gatherPayload(uid));
    }
    if (action === 'zones') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      return i.editReply(await zonesPayload(uid));
    }
    if (action === 'move') {
      await i.deferReply();
      return i.editReply(await movePayload(uid, i.values[0]));
    }
  },
};

// --- /zone and /region ----------------------------------------------------------------------

async function zonesPayload(userId) {
  const z = await zoneOverview(userId);
  const buf = await renderZones(z);
  const options = z.zones
    .filter((x) => !x.current && x.access.ok)
    .map((x) => ({ label: x.depth === 4 && !x.known ? '؟؟؟ منطقة مخفية' : x.name, value: x.key, description: x.depthLabel }));
  const components = options.length ? [row(select(cid('xp', 'move', userId), 'انتقل إلى منطقة', options))] : [];
  return { files: [card(buf, 'zones')], components };
}

async function movePayload(userId, zoneKey) {
  const res = await moveZone(userId, zoneKey);
  const buf = await renderNotice({
    title: res.secret ? `اكتشفت: ${res.zone.name}` : `دخلت ${res.zone.name}`,
    subtitle: res.secret ? 'منطقة مخفية! كوفئت على اكتشافها' : res.zone.description,
    iconName: res.secret ? 'eye' : 'map',
    color: res.secret ? rarityColors.secret : theme.cyan,
    body: res.secret ?? '',
  });
  return { files: [card(buf, 'zone-move')], components: [exploreButtons(userId)] };
}

export const zoneCommand = {
  data: new SlashCommandBuilder()
    .setName('zone')
    .setDescription('مناطق مكانك الحالي (الأطراف، العمق، القلب، والمخفية)')
    .addSubcommand((s) => s.setName('view').setDescription('اعرض مناطق مكانك'))
    .addSubcommand((s) =>
      s
        .setName('move')
        .setDescription('انتقل إلى منطقة أخرى في نفس المكان')
        .addStringOption((o) => o.setName('zone').setDescription('المنطقة').setRequired(true).setAutocomplete(true)),
    ),
  defer: 'public',
  async autocomplete(i) {
    const z = await zoneOverview(i.user.id).catch(() => null);
    if (!z) return [];
    const q = i.options.getFocused();
    return z.zones
      .filter((x) => x.known || x.depth < 4)
      .filter((x) => !q || x.name.includes(q) || x.key.includes(q))
      .map((x) => ({ name: `${x.name} (${x.depthLabel})${x.access.ok ? '' : ' 🔒'}`.slice(0, 100), value: x.key }));
  },
  async execute(i, { sub }) {
    if (sub === 'move') {
      const key = i.options.getString('zone', true);
      if (!ZONE_BY_KEY[key]) throw new UserError('اختر منطقة من القائمة');
      return send(i, await movePayload(i.user.id, key));
    }
    return send(i, await zonesPayload(i.user.id));
  },
};

export const regionCommand = {
  data: new SlashCommandBuilder()
    .setName('region')
    .setDescription('المقاطعات: الإتقان والطقس والاستكشاف')
    .addStringOption((o) =>
      o
        .setName('province')
        .setDescription('المقاطعة (الافتراضي: حيث تقف)')
        .addChoices(...PROVINCES.map((p) => ({ name: p.name, value: p.key }))),
    ),
  defer: 'public',
  async execute(i) {
    const p = await provinceOverview(i.user.id, i.options.getString('province'));
    return send(i, { files: [card(await renderProvince(p), 'region')] });
  },
};

// --- /craft --------------------------------------------------------------------------------

const RECIPES_PER_PAGE = 6;

async function recipesPayload(userId, { page = 1, station = null } = {}) {
  const { recipes, character } = await recipeBook(userId, { station: station || null });
  const pages = Math.max(1, Math.ceil(recipes.length / RECIPES_PER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = recipes.slice((p - 1) * RECIPES_PER_PAGE, p * RECIPES_PER_PAGE);
  const ready = recipes.filter((r) => r.ready).length;
  const buf = await renderRecipes({
    recipes: slice,
    page: p,
    pages,
    title: station ? STATIONS[station].name : 'كتاب الوصفات',
    subtitle: `${ready} جاهزة للصنع  •  أنت في ${character.location?.nameAr ?? '؟'}`,
  });
  const components = [];
  const nav = pager('cf', userId, p, pages, station ?? '');
  if (nav) components.push(nav);
  const makeable = slice.filter((r) => r.ready);
  if (makeable.length)
    components.push(
      row(
        select(
          cid('cf', 'make', userId),
          'اصنع وصفة جاهزة',
          makeable.map((r) => ({ label: r.name, value: r.key, description: `${r.stationName} • حتى ${r.batches} مرات` })),
        ),
      ),
    );
  return { files: [card(buf, 'recipes')], components };
}

async function craftPayload(userId, key, times) {
  const res = await craft(userId, key, times);
  const tiles = [
    { label: 'الناتج', value: `${res.item.name} x${res.quantity}`, iconName: 'hammer', color: rarityColors[res.item.rarity] ?? theme.cyan },
    ...res.used.slice(0, 6).map((u) => ({ label: 'استُهلك', value: `${u.name} x${u.quantity}`, iconName: 'gem', color: theme.textDim })),
  ];
  if (res.cost) tiles.push({ label: 'التكلفة', value: `${fmt(res.cost)} NX`, iconName: 'coin', color: theme.gold });
  const buf = await renderNotice({
    title: `صنعت ${res.item.name}`,
    subtitle: STATIONS[res.recipe.station].name,
    iconName: 'hammer',
    color: rarityColors[res.item.rarity] ?? theme.warn,
    tiles,
  });
  return { files: [card(buf, 'craft')] };
}

export const craftCommand = {
  data: new SlashCommandBuilder()
    .setName('craft')
    .setDescription('الصناعة: حوّل الموارد إلى عتاد وجرعات')
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('كتاب الوصفات')
        .addStringOption((o) =>
          o
            .setName('station')
            .setDescription('المحطة')
            .addChoices(...Object.entries(STATIONS).map(([value, st]) => ({ name: st.name, value }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('make')
        .setDescription('اصنع غرضاً')
        .addStringOption((o) => o.setName('recipe').setDescription('الوصفة').setRequired(true).setAutocomplete(true))
        .addIntegerOption((o) => o.setName('times').setDescription('عدد المرات').setMinValue(1).setMaxValue(MAX_CRAFT_BATCH)),
    ),
  defer: 'public',
  autocomplete(i) {
    return recipeAutocomplete(i.user.id, i.options.getFocused());
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'make') return send(i, await craftPayload(uid, i.options.getString('recipe', true), i.options.getInteger('times') ?? 1));
    return send(i, await recipesPayload(uid, { station: i.options.getString('station') }));
  },
};

/** cf:* — recipe book pages and the "make" select. */
export const craftComponent = {
  prefix: 'cf',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    assertOwner(i, args[0]);
    if (action === 'page') {
      await i.deferUpdate();
      return i.editReply({ ...(await recipesPayload(uid, { page: Number(args[1]), station: args[2] || null })), attachments: [] });
    }
    if (action === 'make') {
      await i.deferReply();
      return i.editReply(await craftPayload(uid, i.values[0], 1));
    }
  },
};
