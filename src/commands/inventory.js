import { SlashCommandBuilder } from 'discord.js';
import { send, card, ok, assertOwner } from '../core/ui.js';
import { UserError } from '../core/errors.js';
import { requireByUser, findByUser, loadCharacter } from '../services/characters.js';
import { useItem, equipItem, unequipSlot, dropItem, ownedForAutocomplete, resolveItem, ownedQuantity, searchItems } from '../services/inventory.js';
import { inventoryMessage } from '../views/game.js';
import { renderItem, renderNotice } from '../render/index.js';
import { theme, rarityColors } from '../render/theme.js';
import { ITEM_TYPE_LABELS, SLOT_LABELS } from '../config/game.js';
import { getPool } from '../db/pool.js';

const itemOpt = (o, desc = 'الغرض') => o.setName('item').setDescription(desc).setRequired(true).setAutocomplete(true);

export default {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('حقيبتك وعتادك')
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('اعرض حقيبتك')
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('نوع الأغراض')
            .addChoices(...Object.entries(ITEM_TYPE_LABELS).map(([value, name]) => ({ name, value }))),
        )
        .addUserOption((o) => o.setName('user').setDescription('حقيبة لاعب آخر')),
    )
    .addSubcommand((s) =>
      s
        .setName('use')
        .setDescription('استخدم غرضاً مستهلكاً')
        .addStringOption((o) => itemOpt(o)),
    )
    .addSubcommand((s) =>
      s
        .setName('equip')
        .setDescription('جهّز سلاحاً أو درعاً أو إكسسواراً')
        .addStringOption((o) => itemOpt(o)),
    )
    .addSubcommand((s) =>
      s
        .setName('unequip')
        .setDescription('انزع قطعة من العتاد')
        .addStringOption((o) =>
          o
            .setName('slot')
            .setDescription('الخانة')
            .setRequired(true)
            .addChoices(...Object.entries(SLOT_LABELS).map(([value, name]) => ({ name, value }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('drop')
        .setDescription('ارمِ غرضاً')
        .addStringOption((o) => itemOpt(o))
        .addIntegerOption((o) => o.setName('quantity').setDescription('الكمية').setMinValue(1).setMaxValue(9999)),
    )
    .addSubcommand((s) =>
      s
        .setName('info')
        .setDescription('تفاصيل غرض')
        .addStringOption((o) => itemOpt(o, 'اسم الغرض')),
    ),
  defer: (i, { sub }) => (sub === 'drop' ? 'ephemeral' : 'public'),

  async autocomplete(i) {
    const sub = i.options.getSubcommand();
    const q = i.options.getFocused();
    if (sub === 'info') return (await searchItems(q)).map((r) => ({ name: `${r.name_ar} (${r.name})`.slice(0, 100), value: r.key }));
    return ownedForAutocomplete(i.user.id, q, { only: sub === 'use' ? 'usable' : sub === 'equip' ? 'equippable' : null });
  },

  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'view') {
      const target = i.options.getUser('user') ?? i.user;
      const ch = target.id === uid ? await requireByUser(uid) : await findByUser(target.id);
      if (!ch) throw new UserError('هذا اللاعب لا يملك شخصية');
      return send(i, await inventoryMessage(ch, uid, { type: i.options.getString('type') }));
    }
    if (sub === 'use') {
      const res = await useItem(uid, i.options.getString('item', true));
      const tiles = [];
      if (res.healed)
        tiles.push({ label: 'الصحة', value: `+${res.healed}  (${res.character.hp}/${res.character.maxHp})`, iconName: 'heart', color: theme.hp[1] });
      if (res.energy) tiles.push({ label: 'الطاقة', value: `+${res.energy}  (${res.character.energy}/${res.character.maxEnergy})`, iconName: 'zap' });
      if (res.cleansed) tiles.push({ label: 'التطهير', value: 'زالت التأثيرات السلبية', iconName: 'sparkle', color: theme.success });
      if (res.buff) tiles.push({ label: res.buff.name, value: `${res.buff.minutes} دقيقة`, iconName: 'flame', color: theme.violet });
      const buf = await renderNotice({
        title: `استخدمت ${res.item.name}`,
        subtitle: res.item.description,
        iconName: 'flask',
        color: rarityColors[res.item.rarity],
        tiles,
      });
      return send(i, { files: [card(buf, 'use')] });
    }
    if (sub === 'equip') {
      const res = await equipItem(uid, i.options.getString('item', true));
      const st = Object.entries(res.item.stats).filter(([, v]) => v);
      const buf = await renderNotice({
        title: `جهّزت ${res.item.name}`,
        subtitle: `${SLOT_LABELS[res.item.slot]}${res.replaced ? ` • أُعيد ${res.replaced} إلى الحقيبة` : ''}`,
        iconName: { weapon: 'sword', armor: 'armor', accessory: 'ring' }[res.item.slot],
        color: rarityColors[res.item.rarity],
        tiles: st.slice(0, 6).map(([k, v]) => ({
          label:
            {
              attack: 'الهجوم',
              armor: 'الحماية',
              strength: 'القوة',
              defense: 'الدفاع',
              agility: 'الرشاقة',
              intelligence: 'الذكاء',
              endurance: 'التحمل',
              luck: 'الحظ',
            }[k] ?? k,
          value: `+${v}`,
          iconName: 'sparkle',
        })),
      });
      return send(i, { files: [card(buf, 'equip')] });
    }
    if (sub === 'unequip') {
      const res = await unequipSlot(uid, i.options.getString('slot', true));
      return send(i, ok(`نزعت **${res.item.name}** وأعدته إلى الحقيبة.`));
    }
    if (sub === 'drop') {
      const res = await dropItem(uid, i.options.getString('item', true), i.options.getInteger('quantity') ?? 1);
      return send(i, ok(`رميت ${res.quantity} × **${res.item.name}**.`));
    }
    if (sub === 'info') {
      const item = await resolveItem(i.options.getString('item', true));
      if (!item) throw new UserError('لم أجد هذا الغرض');
      const ch = await findByUser(uid);
      const quantity = ch ? await ownedQuantity(getPool(), ch.id, item.id) : 0;
      return send(i, { files: [card(await renderItem({ ...item, quantity }), 'item')] });
    }
    throw new UserError('أمر غير معروف');
  },
};

export const inventoryPager = {
  prefix: 'inv',
  async handle(i, { action, args }) {
    const [owner, ...rest] = args;
    assertOwner(i, owner);
    await i.deferUpdate();
    if (action === 'page') {
      const [page, characterId, type] = rest;
      const ch = await loadCharacter(getPool(), Number(characterId));
      return i.editReply({ ...(await inventoryMessage(ch, owner, { page: Number(page), type: type === 'all' ? null : type })), attachments: [] });
    }
    if (action === 'filter') {
      const ch = await loadCharacter(getPool(), Number(rest[0]));
      const type = i.values[0] === 'all' ? null : i.values[0];
      return i.editReply({ ...(await inventoryMessage(ch, owner, { type })), attachments: [] });
    }
  },
};
