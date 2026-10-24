import { SlashCommandBuilder, ButtonStyle } from 'discord.js';
import { send, card, ok, row, button, assertOwner } from '../core/ui.js';
import { cid } from '../core/customId.js';
import { UserError } from '../core/errors.js';
import { rolesOf } from '../core/interactions.js';
import { requireByUser } from '../services/characters.js';
import { travel, listLocations, getLocation, listLore, getLore } from '../services/world.js';
import { listNpcs, getNpc, talk, npcAutocomplete, openShop, buy, sell, shopAutocomplete } from '../services/npcs.js';
import { ownedForAutocomplete } from '../services/inventory.js';
import { mapMessage, locationMessage, locationCard, npcMessage, shopMessage } from '../views/game.js';
import { renderList, renderLore, renderNotice } from '../render/index.js';
import { theme } from '../render/theme.js';
import { fmt } from '../utils/format.js';

async function locationChoices(q) {
  const locs = await listLocations();
  const s = String(q ?? '').toLowerCase();
  return locs
    .filter((l) => !s || l.nameAr.includes(q) || l.name.toLowerCase().includes(s) || l.key.includes(s))
    .slice(0, 25)
    .map((l) => ({ name: `${l.nameAr} — ${l.name}${l.minLevel > 1 ? ` (مستوى ${l.minLevel}+)` : ''}`, value: l.key }));
}

/** Arrival card after travelling. */
export async function arrivalMessage(res, uid) {
  const buf = await locationCard(res.to, { here: true });
  const lines = [];
  if (res.cost) lines.push(`استهلكت الرحلة ${res.cost} طاقة.`);
  if (res.firstVisit) lines.push('زيارتك الأولى لهذا المكان!');
  if (res.unlocked.length) lines.push(`إنجاز جديد: ${res.unlocked.map((a) => a.name_ar).join('، ')}`);
  const btns = [button(cid('tv', 'look', uid, res.to.key), 'استكشف المكان', ButtonStyle.Primary, { emoji: '👁️' })];
  if (res.to.danger > 0) btns.push(button(cid('cb', 'hunt', uid), 'ابحث عن قتال', ButtonStyle.Danger, { emoji: '⚔️' }));
  return {
    content: `🧭 **${res.character.name}** وصل إلى **${res.to.nameAr}**${lines.length ? `\n-# ${lines.join(' • ')}` : ''}`,
    files: [card(buf, 'arrival')],
    components: [row(...btns)],
  };
}

export const travelCommand = {
  data: new SlashCommandBuilder()
    .setName('travel')
    .setDescription('سافر عبر عالم نكسس')
    .addStringOption((o) => o.setName('destination').setDescription('الوجهة (اتركها فارغة لعرض الخريطة)').setAutocomplete(true)),
  defer: 'public',
  autocomplete: (i) => locationChoices(i.options.getFocused()),
  async execute(i) {
    const dest = i.options.getString('destination');
    const ch = await requireByUser(i.user.id);
    if (!dest) return send(i, await mapMessage(ch, i.user.id));
    return send(i, await arrivalMessage(await travel(i.user.id, dest, rolesOf(i)), i.user.id));
  },
};

export const worldCommand = {
  data: new SlashCommandBuilder()
    .setName('world')
    .setDescription('عالم نكسس')
    .addSubcommand((s) => s.setName('map').setDescription('خريطة العالم'))
    .addSubcommand((s) =>
      s
        .setName('location')
        .setDescription('تفاصيل مكان')
        .addStringOption((o) => o.setName('place').setDescription('المكان (افتراضياً موقعك)').setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('lore')
        .setDescription('أرشيف القصص')
        .addStringOption((o) => o.setName('entry').setDescription('المدخل').setAutocomplete(true)),
    ),
  defer: 'public',
  async autocomplete(i) {
    const f = i.options.getFocused(true);
    if (f.name === 'entry') {
      const all = await listLore();
      return all
        .filter((e) => !f.value || e.title.includes(f.value) || e.slug.includes(f.value))
        .slice(0, 25)
        .map((e) => ({ name: e.title, value: e.slug }));
    }
    return locationChoices(f.value);
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'map') return send(i, await mapMessage(await requireByUser(uid), uid));
    if (sub === 'location') {
      const ch = await requireByUser(uid);
      const key = i.options.getString('place') ?? ch.location?.key;
      const loc = key && (await getLocation(key));
      if (!loc) throw new UserError('لم أجد هذا المكان');
      return send(i, await locationMessage(loc.key, ch, uid));
    }
    if (sub === 'lore') {
      const entry = i.options.getString('entry');
      if (!entry) {
        const all = await listLore();
        const buf = await renderList({
          title: 'أرشيف نكسس',
          subtitle: 'اختر مدخلاً عبر /world lore entry',
          iconName: 'book',
          color: '#a5b4fc',
          rows: all.slice(0, 12).map((e) => ({ title: e.title, subtitle: e.category, iconName: 'book', color: '#a5b4fc' })),
          rowHeight: 64,
          emptyText: 'الأرشيف فارغ',
        });
        return send(i, { files: [card(buf, 'lore')] });
      }
      const e = await getLore(entry);
      if (!e) throw new UserError('المدخل غير موجود');
      return send(i, { files: [card(await renderLore({ title: e.title, category: e.category, content: e.content }), 'lore')] });
    }
  },
};

export const npcCommand = {
  data: new SlashCommandBuilder()
    .setName('npc')
    .setDescription('شخصيات العالم')
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('الشخصيات في موقعك أو في كل العالم')
        .addBooleanOption((o) => o.setName('all').setDescription('كل العالم')),
    )
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('تعرّف على شخصية')
        .addStringOption((o) => o.setName('npc').setDescription('الشخصية').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('talk')
        .setDescription('تحدث مع شخصية')
        .addStringOption((o) => o.setName('npc').setDescription('الشخصية').setRequired(true).setAutocomplete(true)),
    ),
  defer: 'public',
  autocomplete: (i) => npcAutocomplete(i.options.getFocused()),
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'list') {
      const ch = await requireByUser(uid);
      const all = i.options.getBoolean('all') ?? false;
      const npcs = await listNpcs({ locationId: all ? null : ch.location?.id });
      const buf = await renderList({
        title: all ? 'شخصيات نكسس' : `الشخصيات في ${ch.location?.nameAr ?? 'موقعك'}`,
        subtitle: 'تحدث معهم عبر /npc talk',
        iconName: 'chat',
        rows: npcs.slice(0, 12).map((n) => ({
          title: n.name,
          subtitle: `${n.title}${n.location ? ` • ${n.location}` : ''}`,
          avatar: null,
          color: n.color,
          badge: n.hasShop ? 'متجر' : null,
        })),
        rowHeight: 70,
        emptyText: 'لا أحد هنا. جرّب /npc list all:True',
      });
      return send(i, { files: [card(buf, 'npcs')] });
    }
    if (sub === 'view') {
      const npc = await getNpc(i.options.getString('npc', true));
      if (!npc) throw new UserError('لم أجد هذه الشخصية');
      return send(i, await npcMessage({ npc, line: null }, uid));
    }
    if (sub === 'talk') return send(i, await npcMessage(await talk(uid, i.options.getString('npc', true)), uid));
  },
};

export const shopCommand = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('المتاجر في موقعك')
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('تصفح المتجر')
        .addStringOption((o) => o.setName('npc').setDescription('صاحب المتجر').setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('buy')
        .setDescription('اشترِ غرضاً')
        .addStringOption((o) => o.setName('item').setDescription('الغرض').setRequired(true).setAutocomplete(true))
        .addIntegerOption((o) => o.setName('quantity').setDescription('الكمية').setMinValue(1).setMaxValue(99)),
    )
    .addSubcommand((s) =>
      s
        .setName('sell')
        .setDescription('بع غرضاً لتاجر في موقعك')
        .addStringOption((o) => o.setName('item').setDescription('الغرض').setRequired(true).setAutocomplete(true))
        .addIntegerOption((o) => o.setName('quantity').setDescription('الكمية').setMinValue(1).setMaxValue(9999)),
    ),
  defer: 'public',
  async autocomplete(i) {
    const sub = i.options.getSubcommand();
    const q = i.options.getFocused();
    if (sub === 'view') return npcAutocomplete(q);
    if (sub === 'buy') return shopAutocomplete(i.user.id, q);
    return ownedForAutocomplete(i.user.id, q);
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'view') return send(i, await shopMessage(await openShop(uid, i.options.getString('npc')), uid));
    if (sub === 'buy') return send(i, await purchaseMessage(await buy(uid, i.options.getString('item', true), i.options.getInteger('quantity') ?? 1)));
    if (sub === 'sell') {
      const res = await sell(uid, i.options.getString('item', true), i.options.getInteger('quantity') ?? 1);
      return send(i, ok(`بعت ${res.qty} × **${res.item.name}** إلى ${res.npc} مقابل **${fmt(res.total)} NX**. رصيدك: ${fmt(res.balance)} NX`));
    }
  },
};

export async function purchaseMessage(res) {
  const buf = await renderNotice({
    title: `اشتريت ${res.item.name}`,
    subtitle: `من ${res.npc}${res.qty > 1 ? ` • الكمية ${res.qty}` : ''}`,
    iconName: 'bag',
    color: theme.gold,
    tiles: [
      { label: 'السعر', value: `${fmt(res.total)} NX`, iconName: 'coin', color: theme.gold },
      { label: 'رصيدك', value: `${fmt(res.balance)} NX`, iconName: 'coin' },
    ],
  });
  return { files: [card(buf, 'purchase')] };
}

/** tv:* travel select/buttons, npc:* talk, shop:* open/buy. */
export const worldComponents = [
  {
    prefix: 'tv',
    async handle(i, { action, args }) {
      const [owner, key] = args;
      assertOwner(i, owner);
      if (action === 'look') {
        await i.deferReply();
        return i.editReply(await locationMessage(key, await requireByUser(i.user.id), i.user.id));
      }
      const dest = action === 'go' ? i.values[0] : key;
      await i.deferUpdate();
      const res = await travel(i.user.id, dest, rolesOf(i));
      return i.editReply({ ...(await arrivalMessage(res, i.user.id)), attachments: [] });
    },
  },
  {
    prefix: 'npc',
    async handle(i, { action, args }) {
      const [owner, key] = args;
      assertOwner(i, owner, { ttlMs: 0 });
      const npcKey = action === 'talk' ? i.values[0] : key;
      await i.deferReply();
      return i.editReply(await npcMessage(await talk(i.user.id, npcKey), i.user.id));
    },
  },
  {
    prefix: 'shop',
    async handle(i, { action, args }) {
      const [owner, npcKey] = args;
      assertOwner(i, owner, { ttlMs: 0 });
      if (action === 'open') {
        await i.deferReply();
        return i.editReply(await shopMessage(await openShop(i.user.id, npcKey || null), i.user.id));
      }
      if (action === 'buy') {
        await i.deferReply();
        return i.editReply(await purchaseMessage(await buy(i.user.id, i.values[0], 1, npcKey)));
      }
    },
  },
];
