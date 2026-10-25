import { SlashCommandBuilder } from 'discord.js';
import { send, assertOwner, ok } from '../core/ui.js';
import { UserError } from '../core/errors.js';
import { rerollContract } from '../services/dailies.js';
import { startWorldBossFight } from '../services/bosses.js';
import { explore, gather } from '../services/exploration.js';
import { craft, recipeAutocomplete } from '../services/crafting.js';
import { listLocations } from '../services/world.js';
import { ALL_BOSSES } from '../content/bossRegistry.js';
import { postCombat } from './combat.js';
import {
  contractsMessage,
  contractLeadersMessage,
  hallMessage,
  bossInfoMessage,
  bossesHereMessage,
  bossLeadersMessage,
  regionMessage,
  exploreMessage,
  gatherMessage,
  journalMessage,
  recipesMessage,
  craftedMessage,
} from '../views/expansion.js';

/** Answers a button press with a fresh message (the source card stays as it was). */
async function reply(i, payload) {
  await i.deferReply();
  return i.editReply(payload);
}

function bossChoices(q, { worldOnly = false } = {}) {
  const s = String(q ?? '').toLowerCase();
  return ALL_BOSSES.filter((b) => (!worldOnly || b.kind === 'world') && (!s || b.name.includes(q) || b.key.includes(s) || String(b.number) === s))
    .slice(0, 25)
    .map((b) => ({ name: `#${b.number} ${b.name} (مستوى ${b.level})`.slice(0, 100), value: b.key }));
}

// /daily ------------------------------------------------------------------------

export const dailyCommand = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('العقود اليومية والأسبوعية: تتغير كل يوم، ومكافآت للمواظبة')
    .addSubcommand((s) => s.setName('board').setDescription('📜 عقود اليوم والأسبوع'))
    .addSubcommand((s) =>
      s
        .setName('reroll')
        .setDescription('بدّل عقداً يومياً لم تبدأ فيه')
        .addIntegerOption((o) => o.setName('slot').setDescription('رقم العقد (1-5)').setRequired(true).setMinValue(1).setMaxValue(5)),
    )
    .addSubcommand((s) => s.setName('top').setDescription('أبطال العقود')),
  defer: 'public',
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'board') return send(i, await contractsMessage(uid));
    if (sub === 'reroll') {
      const res = await rerollContract(uid, i.options.getInteger('slot', true) - 1);
      return send(i, { ...ok(`بدّلت «${res.old}» بـ «${res.fresh.title}»${res.cost ? ` مقابل ${res.cost} NX` : ''}.`), ...(await contractsMessage(uid)) });
    }
    if (sub === 'top') return send(i, await contractLeadersMessage());
    throw new UserError('أمر غير معروف');
  },
};

export const dailyComponent = {
  prefix: 'dl',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    assertOwner(i, args[0], { ttlMs: 0 });
    if (action === 'board') {
      await i.deferUpdate();
      return i.editReply({ content: null, embeds: [], ...(await contractsMessage(uid)), attachments: [] });
    }
    if (action === 'reroll') {
      await i.deferUpdate();
      const res = await rerollContract(uid, Number(i.values[0]));
      const payload = await contractsMessage(uid);
      return i.editReply({ content: `🔄 بدّلت «${res.old}» بـ «${res.fresh.title}»${res.cost ? ` مقابل ${res.cost} NX` : ''}.`, ...payload, attachments: [] });
    }
    if (action === 'top') return reply(i, await contractLeadersMessage());
  },
};

// /boss -------------------------------------------------------------------------

export const bossCommand = {
  data: new SlashCommandBuilder()
    .setName('boss')
    .setDescription('الزعماء المئة: زعماء القصة وزعماء المناطق')
    .addSubcommand((s) => s.setName('here').setDescription('👑 زعماء المكان الذي أنت فيه'))
    .addSubcommand((s) =>
      s
        .setName('hall')
        .setDescription('قاعة الزعماء المئة')
        .addStringOption((o) =>
          o
            .setName('filter')
            .setDescription('أي زعماء تعرض')
            .addChoices(
              { name: 'الكل', value: 'all' },
              { name: 'زعماء القصة', value: 'story' },
              { name: 'زعماء المناطق', value: 'world' },
              { name: 'من هزمتهم', value: 'beaten' },
              { name: 'المتاحون الآن', value: 'open' },
            ),
        )
        .addIntegerOption((o) => o.setName('page').setDescription('الصفحة').setMinValue(1).setMaxValue(10)),
    )
    .addSubcommand((s) =>
      s
        .setName('info')
        .setDescription('تفاصيل زعيم')
        .addStringOption((o) => o.setName('boss').setDescription('الزعيم').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('fight')
        .setDescription('واجه زعيم منطقة (20 طاقة)')
        .addStringOption((o) => o.setName('boss').setDescription('الزعيم').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName('top').setDescription('صائدو الزعماء')),
  defer: 'public',
  autocomplete(i) {
    return bossChoices(i.options.getFocused(), { worldOnly: i.options.getSubcommand() === 'fight' });
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    switch (sub) {
      case 'here':
        return send(i, await bossesHereMessage(uid));
      case 'hall':
        return send(i, await hallMessage(uid, i.options.getInteger('page') ?? 1, i.options.getString('filter') ?? 'all'));
      case 'info':
        return send(i, await bossInfoMessage(uid, i.options.getString('boss', true)));
      case 'fight':
        return postCombat(i, await startWorldBossFight(uid, i.options.getString('boss', true)));
      case 'top':
        return send(i, await bossLeadersMessage());
      default:
        throw new UserError('أمر غير معروف');
    }
  },
};

export const bossComponent = {
  prefix: 'bs',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    assertOwner(i, args[0], { ttlMs: 0 });
    switch (action) {
      case 'page':
        await i.deferUpdate();
        return i.editReply({ ...(await hallMessage(uid, Number(args[1]) || 1, args[2] || 'all')), attachments: [] });
      case 'filter':
        await i.deferUpdate();
        return i.editReply({ ...(await hallMessage(uid, 1, i.values[0])), attachments: [] });
      case 'info':
        return reply(i, await bossInfoMessage(uid, args[1] || i.values?.[0]));
      case 'here':
        return reply(i, await bossesHereMessage(uid));
      case 'fight':
        await i.deferReply();
        return postCombat(i, await startWorldBossFight(uid, args[1]));
      default:
        return null;
    }
  },
};

// /region -----------------------------------------------------------------------

export const regionCommand = {
  data: new SlashCommandBuilder()
    .setName('region')
    .setDescription('محتوى المناطق: استكشاف، معالم مخفية، موارد، وأحداث')
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('🗺️ كل ما في المنطقة وما زال مختوماً')
        .addStringOption((o) => o.setName('place').setDescription('المكان (افتراضياً موقعك)').setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName('explore').setDescription('🔦 استكشف موقعك: معالم، كنوز، فخاخ، ولقاءات'))
    .addSubcommand((s) => s.setName('gather').setDescription('⛏️ اجمع موارد موقعك للصناعة'))
    .addSubcommand((s) => s.setName('landmarks').setDescription('📔 سجل المعالم التي اكتشفتها')),
  defer: 'public',
  async autocomplete(i) {
    const q = String(i.options.getFocused() ?? '');
    return (await listLocations())
      .filter((l) => !q || l.nameAr.includes(q) || l.key.includes(q.toLowerCase()))
      .slice(0, 25)
      .map((l) => ({ name: `${l.nameAr}${l.requiredChapter ? ` • فصل ${l.requiredChapter}+` : ''}`, value: l.key }));
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'view') return send(i, await regionMessage(uid, i.options.getString('place')));
    if (sub === 'explore') return send(i, await exploreMessage(uid, await explore(uid)));
    if (sub === 'gather') return send(i, await gatherMessage(uid, await gather(uid)));
    if (sub === 'landmarks') return send(i, await journalMessage(uid));
    throw new UserError('أمر غير معروف');
  },
};

export const regionComponent = {
  prefix: 'rg',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    assertOwner(i, args[0], { ttlMs: 0 });
    if (action === 'view') return reply(i, await regionMessage(uid, args[1] || null));
    if (action === 'explore') return reply(i, await exploreMessage(uid, await explore(uid)));
    if (action === 'gather') return reply(i, await gatherMessage(uid, await gather(uid)));
    if (action === 'journal') return reply(i, await journalMessage(uid));
    return null;
  },
};

// /craft ------------------------------------------------------------------------

export const craftCommand = {
  data: new SlashCommandBuilder()
    .setName('craft')
    .setDescription('الصناعة: حوّل الموارد إلى معدات وجرعات')
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('⚒️ كل الوصفات وما ينقصك لكل واحدة')
        .addIntegerOption((o) => o.setName('page').setDescription('الصفحة').setMinValue(1).setMaxValue(10)),
    )
    .addSubcommand((s) =>
      s
        .setName('make')
        .setDescription('اصنع غرضاً')
        .addStringOption((o) => o.setName('recipe').setDescription('الوصفة').setRequired(true).setAutocomplete(true))
        .addIntegerOption((o) => o.setName('times').setDescription('كم مرة (1-10)').setMinValue(1).setMaxValue(10)),
    ),
  defer: 'public',
  async autocomplete(i) {
    return (await recipeAutocomplete(i.options.getFocused())).map((r) => ({ name: `${r.name} (مستوى ${r.level})`.slice(0, 100), value: r.key }));
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'list') return send(i, await recipesMessage(uid, i.options.getInteger('page') ?? 1));
    if (sub === 'make') return send(i, await craftedMessage(await craft(uid, i.options.getString('recipe', true), i.options.getInteger('times') ?? 1)));
    throw new UserError('أمر غير معروف');
  },
};

export const craftComponent = {
  prefix: 'cf',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    assertOwner(i, args[0], { ttlMs: 0 });
    if (action === 'page') {
      const own = /^crafting\./.test(i.message?.attachments?.first()?.name ?? '');
      if (!own) return reply(i, await recipesMessage(uid, Number(args[1]) || 1));
      await i.deferUpdate();
      return i.editReply({ ...(await recipesMessage(uid, Number(args[1]) || 1)), attachments: [] });
    }
    if (action === 'make') return reply(i, await craftedMessage(await craft(uid, i.values[0], 1)));
    return null;
  },
};
