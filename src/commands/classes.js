import { SlashCommandBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { send, ok, assertOwner, assertNotExpired, info, row, button } from '../core/ui.js';
import { cid } from '../core/customId.js';
import { UserError } from '../core/errors.js';
import { CATEGORIES, CLASS_BY_KEY } from '../content/classes.js';
import { PATHS, subclassByKey } from '../content/classGen.js';
import { requireByUser, findByUser } from '../services/characters.js';
import { chooseClass, chooseSubclass, equipSkill, unequipSkill, ownedSkillAutocomplete, classChangeCost, pathsFor } from '../services/classes.js';
import { galleryMessage, classCardMessage, pathsMessage, treeMessage, loadoutMessage, chosenMessage, classAutocomplete } from '../views/classes.js';
import { forgetImage } from '../views/avatars.js';
import { artMessage } from '../views/art.js';

async function pickFlow(i, userId, classKey) {
  const cls = CLASS_BY_KEY[classKey];
  if (!cls) throw new UserError('كلاس غير معروف');
  const ch = await requireByUser(userId);
  const cost = await classChangeCost(ch);
  if (ch.classKey && cost > 0) {
    const exp = Math.floor((Date.now() + 2 * 60_000) / 1000);
    return {
      ...info(
        `⚠️ تغيير كلاسك من **${CLASS_BY_KEY[ch.classKey].nameAr}** إلى **${cls.nameAr}** يكلف **${cost} NX**.\n` +
          'ستفقد مهارات الكلاس الحالي ومساره، وتُسترد نقاط المهارة التي صرفتها على رتبها.',
      ),
      components: [
        row(
          button(cid('cl', 'pickc', userId, exp, classKey), 'تأكيد التغيير', ButtonStyle.Danger, { emoji: '✔️' }),
          button(cid('ui', 'cancel', userId), 'إلغاء', ButtonStyle.Secondary, { emoji: '✖️' }),
        ),
      ],
    };
  }
  const res = await chooseClass(userId, classKey);
  forgetImage(res.character.id);
  return chosenMessage(res, userId);
}

export const classCommand = {
  data: new SlashCommandBuilder()
    .setName('class')
    .setDescription('الكلاسات: 55 كلاساً، 30 مساراً لكل كلاس، 100 مهارة')
    .addSubcommand((s) =>
      s
        .setName('browse')
        .setDescription('معرض الكلاسات بشخصيتك')
        .addStringOption((o) =>
          o
            .setName('category')
            .setDescription('الفئة')
            .addChoices(...Object.entries(CATEGORIES).map(([value, c]) => ({ name: c.name, value }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('تفاصيل كلاس')
        .addStringOption((o) => o.setName('class').setDescription('الكلاس').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('choose')
        .setDescription('اختر كلاسك أو غيّره')
        .addStringOption((o) => o.setName('class').setDescription('الكلاس').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('path')
        .setDescription('المسارات الفرعية لكلاسك (من المستوى 15)')
        .addStringOption((o) => o.setName('path').setDescription('اختر مساراً مباشرة').setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('skills')
        .setDescription('شجرة مهارات كلاس')
        .addStringOption((o) => o.setName('class').setDescription('كلاس آخر (افتراضياً كلاسك)').setAutocomplete(true))
        .addIntegerOption((o) => o.setName('page').setDescription('الصفحة (1-10)').setMinValue(1).setMaxValue(13)),
    )
    .addSubcommand((s) => s.setName('loadout').setDescription('تجهيزك القتالي ومكاسبك الدائمة'))
    .addSubcommand((s) =>
      s
        .setName('equip')
        .setDescription('جهّز مهارة للقتال (حتى 6)')
        .addStringOption((o) => o.setName('skill').setDescription('المهارة').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('unequip')
        .setDescription('أزل مهارة من التجهيز')
        .addStringOption((o) => o.setName('skill').setDescription('المهارة').setRequired(true).setAutocomplete(true)),
    ),
  defer: (i, { sub }) => (['equip', 'unequip'].includes(sub) ? 'ephemeral' : 'public'),
  async autocomplete(i) {
    const focused = i.options.getFocused(true);
    if (focused.name === 'class') return classAutocomplete(focused.value);
    if (focused.name === 'skill') return ownedSkillAutocomplete(i.user.id, focused.value, { equipped: i.options.getSubcommand() === 'unequip' });
    if (focused.name === 'path') {
      const ch = await findByUser(i.user.id);
      if (!ch?.classKey) return [];
      const q = String(focused.value ?? '');
      return pathsFor(ch.classKey, ch.level)
        .filter((p) => !q || p.name.includes(q) || p.path.includes(q.toLowerCase()))
        .slice(0, 25)
        .map((p) => ({ name: `${p.name}${p.locked ? ` (مستوى ${p.minLevel})` : ''}`, value: p.path }));
    }
    return [];
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    switch (sub) {
      case 'browse':
        return send(i, await galleryMessage(uid, i.options.getString('category') ?? 'warrior'));
      case 'view': {
        const key = i.options.getString('class', true);
        if (!CLASS_BY_KEY[key]) throw new UserError('كلاس غير معروف. اختر من القائمة.');
        return send(i, await classCardMessage(uid, key));
      }
      case 'choose':
        return send(i, await pickFlow(i, uid, i.options.getString('class', true)));
      case 'path': {
        const ch = await requireByUser(uid);
        if (!ch.classKey) throw new UserError('اختر كلاسك أولاً عبر /class browse');
        const key = i.options.getString('path');
        if (!key) return send(i, await pathsMessage(uid, ch.classKey, 1));
        if (!PATHS.some((p) => p.key === key)) throw new UserError('مسار غير معروف');
        const res = await chooseSubclass(uid, key);
        return send(i, await chosenMessage(res, uid, { path: true }));
      }
      case 'skills': {
        const ch = await findByUser(uid);
        const key = i.options.getString('class') ?? ch?.classKey;
        if (!key || !CLASS_BY_KEY[key]) throw new UserError('حدد كلاساً، أو اختر كلاسك أولاً عبر /class browse');
        return send(i, await treeMessage(uid, key, i.options.getInteger('page') ?? 1));
      }
      case 'loadout': {
        const ch = await requireByUser(uid);
        if (!ch.classKey) throw new UserError('ليس لديك كلاس بعد. افتح المعرض عبر /class browse واختر طريقك.');
        return send(i, await loadoutMessage(ch, uid));
      }
      case 'equip': {
        const res = await equipSkill(uid, i.options.getString('skill', true));
        return send(i, ok(`جُهّزت **${res.skill.name_ar}** (${res.equipped}/6).`));
      }
      case 'unequip': {
        const res = await unequipSkill(uid, i.options.getString('skill', true));
        return send(i, ok(`أُزيلت **${res.skill.name_ar}** من التجهيز.`));
      }
      default:
        throw new UserError('أمر غير معروف');
    }
  },
};

/** cl:* — class gallery, class pages, path and skill tree paging, loadout editing. */
export const classComponent = {
  prefix: 'cl',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    const [owner] = args;
    assertOwner(i, owner);
    // Class screens replace each other; pressing a class button on any other card opens a new message.
    const own = /^(classes|class|paths|skills|loadout)\./.test(i.message?.attachments?.first()?.name ?? '');
    const update = async (payload) => {
      if (!own) {
        await i.deferReply();
        return i.editReply(payload);
      }
      await i.deferUpdate();
      return i.editReply({ ...payload, embeds: payload.embeds ?? [], attachments: [] });
    };
    switch (action) {
      case 'cat':
        return update(await galleryMessage(uid, i.values?.[0] ?? args[1] ?? 'warrior'));
      case 'view':
      case 'show':
        return update(await classCardMessage(uid, i.values?.[0] ?? args[1]));
      case 'paths':
        return update(await pathsMessage(uid, args[1], Number(args[2]) || 1));
      case 'tree':
        return update(await treeMessage(uid, args[1], Number(args[2]) || 1));
      case 'pick': {
        await i.deferReply({ flags: (await findByUser(uid)) ? undefined : MessageFlags.Ephemeral });
        return i.editReply(await pickFlow(i, uid, args[1]));
      }
      case 'pickc': {
        assertNotExpired(args[1]);
        await i.deferUpdate();
        const res = await chooseClass(uid, args[2]);
        forgetImage(res.character.id);
        return i.editReply({ embeds: [], ...(await chosenMessage(res, uid)) });
      }
      case 'path': {
        await i.deferReply();
        const res = await chooseSubclass(uid, i.values[0]);
        return i.editReply(await chosenMessage(res, uid, { path: true }));
      }
      case 'hd': {
        const cls = CLASS_BY_KEY[args[1]];
        if (!cls) throw new UserError('كلاس غير معروف');
        await i.deferReply();
        return i.editReply(await artMessage(`classes/${cls.key}.webp`, `class-${cls.key}`, `**${cls.nameAr}** • ملصق بدقة 2560×1440`));
      }
      case 'loadout': {
        const ch = await requireByUser(uid);
        await i.deferReply();
        return i.editReply(await loadoutMessage(ch, uid));
      }
      case 'equip':
      case 'unequip': {
        if (action === 'equip') await equipSkill(uid, i.values[0]);
        else await unequipSkill(uid, i.values[0]);
        return update(await loadoutMessage(await requireByUser(uid), uid));
      }
      default:
        throw new UserError('إجراء غير معروف');
    }
  },
};

export const subclassName = (key) => subclassByKey(key)?.name ?? null;
