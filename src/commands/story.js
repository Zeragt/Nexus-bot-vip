import { SlashCommandBuilder } from 'discord.js';
import { send, assertOwner } from '../core/ui.js';
import { UserError } from '../core/errors.js';
import { CHAPTERS, CHAPTER_BY_KEY } from '../content/story/index.js';
import { CODEX_CATEGORIES } from '../content/lore.js';
import { ENEMIES } from '../engine/enemies.js';
import { startBossFight, makeChoice, progressOf } from '../services/story.js';
import { requireByUser, findByUser } from '../services/characters.js';
import { listLocations } from '../services/world.js';
import { currentMessage, pageMessage, choiceMessage, listMessage, bossesMessage } from '../views/story.js';
import { codexIndexMessage, codexEntryMessage, codexAutocomplete, bestiaryMessage } from '../views/codex.js';
import { postCombat } from './combat.js';
import { artMessage } from '../views/art.js';

async function chapterChoices(userId, q) {
  const ch = await findByUser(userId);
  const reached = ch ? (await progressOf(ch.id)).chapter : 0;
  const query = String(q ?? '');
  return CHAPTERS.filter((c) => c.index <= reached && (!query || c.title.includes(query)))
    .slice(0, 25)
    .map((c) => ({ name: `${c.index + 1}. ${c.title}`, value: c.key }));
}

export const storyCommand = {
  data: new SlashCommandBuilder()
    .setName('story')
    .setDescription('القصة الكبرى: 25 فصلاً، زعماء، وقرارات مصيرية')
    .addSubcommand((s) => s.setName('current').setDescription('فصلك الحالي وزعيمه'))
    .addSubcommand((s) =>
      s
        .setName('read')
        .setDescription('اقرأ صفحات فصل')
        .addStringOption((o) => o.setName('chapter').setDescription('الفصل (افتراضياً الحالي)').setAutocomplete(true))
        .addIntegerOption((o) => o.setName('page').setDescription('الصفحة').setMinValue(1).setMaxValue(12)),
    )
    .addSubcommand((s) =>
      s
        .setName('chapters')
        .setDescription('كل الفصول وتقدمك فيها')
        .addIntegerOption((o) => o.setName('act').setDescription('الجزء').setMinValue(1).setMaxValue(4)),
    )
    .addSubcommand((s) => s.setName('fight').setDescription('واجه زعيم فصلك الحالي'))
    .addSubcommand((s) => s.setName('bosses').setDescription('قاعة الزعماء الذين هزمتهم')),
  defer: 'public',
  async autocomplete(i) {
    return chapterChoices(i.user.id, i.options.getFocused());
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    switch (sub) {
      case 'current':
        return send(i, await currentMessage(uid));
      case 'read': {
        const key = i.options.getString('chapter');
        if (key && !CHAPTER_BY_KEY[key]) throw new UserError('اختر فصلاً من القائمة');
        let chapterKey = key;
        if (!chapterKey) {
          const ch = await requireByUser(uid);
          const p = await progressOf(ch.id);
          chapterKey = (CHAPTERS[p.chapter] ?? CHAPTERS.at(-1)).key;
        }
        return send(i, await pageMessage(uid, chapterKey, i.options.getInteger('page') ?? 1));
      }
      case 'chapters':
        return send(i, await listMessage(uid, i.options.getInteger('act')));
      case 'fight':
        return postCombat(i, await startBossFight(uid));
      case 'bosses':
        return send(i, await bossesMessage(uid, 1));
      default:
        throw new UserError('أمر غير معروف');
    }
  },
};

export const codexCommand = {
  data: new SlashCommandBuilder()
    .setName('codex')
    .setDescription('أرشيف نكسس: التاريخ، الأماكن، الشخصيات، وكتاب الوحوش')
    .addSubcommand((s) =>
      s
        .setName('browse')
        .setDescription('تصفح أبواب الأرشيف')
        .addStringOption((o) =>
          o
            .setName('category')
            .setDescription('الباب')
            .addChoices(...CODEX_CATEGORIES.map((c) => ({ name: c.label, value: c.key })), { name: 'مدونات الإدارة', value: 'custom' }),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('entry')
        .setDescription('اقرأ مدخلاً')
        .addStringOption((o) => o.setName('entry').setDescription('المدخل').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('bestiary')
        .setDescription('كتاب الوحوش لكل منطقة')
        .addStringOption((o) => o.setName('region').setDescription('المنطقة').setAutocomplete(true)),
    ),
  defer: 'public',
  async autocomplete(i) {
    const f = i.options.getFocused(true);
    if (f.name === 'region') {
      const q = String(f.value ?? '');
      return (await listLocations())
        .filter((l) => ENEMIES[l.key] && (!q || l.name_ar.includes(q) || l.key.includes(q)))
        .slice(0, 25)
        .map((l) => ({ name: l.name_ar, value: l.key }));
    }
    return codexAutocomplete(i.user.id, f.value);
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'browse') return send(i, await codexIndexMessage(uid, i.options.getString('category') ?? 'world', 1));
    if (sub === 'entry') return send(i, await codexEntryMessage(uid, i.options.getString('entry', true)));
    if (sub === 'bestiary') {
      const ch = await findByUser(uid);
      const here = ch?.location?.key && ENEMIES[ch.location.key] ? ch.location.key : 'forest';
      const region = i.options.getString('region') ?? here;
      if (!ENEMIES[region]) throw new UserError('اختر منطقة من القائمة');
      return send(i, await bestiaryMessage(uid, region));
    }
    throw new UserError('أمر غير معروف');
  },
};

/** Replaces the card in place when the press came from a story or codex card; otherwise answers with a new message. */
function updater(i, pattern) {
  const own = pattern.test(i.message?.attachments?.first()?.name ?? '');
  return async (payload) => {
    if (!own) {
      await i.deferReply();
      return i.editReply(payload);
    }
    await i.deferUpdate();
    return i.editReply({ content: null, embeds: [], ...payload, attachments: [] });
  };
}

/** st:* — story navigation, choices, and starting boss fights. */
export const storyComponent = {
  prefix: 'st',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    assertOwner(i, args[0]);
    const update = updater(i, /^story\./);
    switch (action) {
      case 'cur':
        return update(await currentMessage(uid));
      case 'read':
        return update(await pageMessage(uid, args[1], Number(args[2]) || 1));
      case 'open':
        return update(await pageMessage(uid, i.values[0], 1));
      case 'win':
        return update(await pageMessage(uid, args[1], 0, { victory: true }));
      case 'list':
        return update(await listMessage(uid, Number(args[1]) || null));
      case 'bosses':
        return update(await bossesMessage(uid, Number(args[1]) || 1));
      case 'choose': {
        const res = await makeChoice(uid, args[1], Number(args[2]));
        const ch = await requireByUser(uid);
        return update(await choiceMessage(ch, await progressOf(ch.id), res.chapter));
      }
      case 'fight': {
        await i.deferReply();
        return postCombat(i, await startBossFight(uid));
      }
      case 'poster': {
        const chapter = CHAPTER_BY_KEY[args[1]];
        if (!chapter) throw new UserError('هذا الفصل غير موجود');
        const ch = await requireByUser(uid);
        if (chapter.index > (await progressOf(ch.id)).chapter) throw new UserError('لم تصل إلى هذا الفصل بعد');
        await i.deferReply();
        return i.editReply(await artMessage(`story/${chapter.key}.webp`, `chapter-${chapter.key}`, `**الفصل ${chapter.index + 1}: ${chapter.title}**`));
      }
      default:
        throw new UserError('إجراء غير معروف');
    }
  },
};

/** cx:* — codex categories, entries and the bestiary. */
export const codexComponent = {
  prefix: 'cx',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    assertOwner(i, args[0]);
    const update = updater(i, /^codex\./);
    switch (action) {
      case 'cat':
        return update(await codexIndexMessage(uid, i.values?.[0] ?? args[1] ?? 'world', 1));
      case 'page':
        return update(await codexIndexMessage(uid, args[1], Number(args[2]) || 1));
      case 'open':
        return update(await codexEntryMessage(uid, i.values?.[0] ?? args[1]));
      case 'beasts':
        return update(await bestiaryMessage(uid, i.values?.[0] ?? args[1] ?? 'forest'));
      default:
        throw new UserError('إجراء غير معروف');
    }
  },
};
