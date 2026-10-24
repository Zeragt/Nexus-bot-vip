import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { send, card, ok, assertOwner, info } from '../core/ui.js';
import { UserError } from '../core/errors.js';
import { requireByUser, findByUser } from '../services/characters.js';
import { accept, abandon, complete, viewQuest, questAutocomplete } from '../services/quests.js';
import { boardMessage, questMessage, activeQuestsCard, questRewardCard } from '../views/game.js';
import { levelUpCard } from '../views/character.js';

const questOpt = (o) => o.setName('quest').setDescription('رمز المهمة أو اسمها').setRequired(true).setAutocomplete(true);

/** Turning in a quest: reward card (+ level-up card when it happens). */
export async function completionPayload(userId, code) {
  const res = await complete(userId, code);
  if (res.review) return info(`📨 تم إرسال مهمة **${res.quest.title}** إلى الإدارة للمراجعة. ستحصل على المكافأة بعد الموافقة.`);
  const files = [card(await questRewardCard(res.quest, res.rewards), 'quest-complete')];
  if (res.rewards.level) {
    const ch = await requireByUser(userId);
    files.push(card(await levelUpCard(ch, res.rewards.level), 'level-up'));
  }
  return { files };
}

export default {
  data: new SlashCommandBuilder()
    .setName('quest')
    .setDescription('المهام')
    .addSubcommand((s) => s.setName('board').setDescription('📜 لوحة المهام'))
    .addSubcommand((s) => s.setName('list').setDescription('كل المهام المتاحة'))
    .addSubcommand((s) => s.setName('view').setDescription('تفاصيل مهمة').addStringOption(questOpt))
    .addSubcommand((s) => s.setName('accept').setDescription('اقبل مهمة').addStringOption(questOpt))
    .addSubcommand((s) => s.setName('active').setDescription('مهامك النشطة'))
    .addSubcommand((s) => s.setName('abandon').setDescription('تخلَّ عن مهمة').addStringOption(questOpt))
    .addSubcommand((s) => s.setName('complete').setDescription('سلّم مهمة مكتملة').addStringOption(questOpt)),
  defer: (i, { sub }) => (sub === 'abandon' ? 'ephemeral' : 'public'),
  autocomplete(i) {
    const sub = i.options.getSubcommand();
    return questAutocomplete(i.options.getFocused(), { userId: i.user.id, scope: ['abandon', 'complete'].includes(sub) ? 'mine' : 'board' });
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'board' || sub === 'list') {
      const ch = await findByUser(uid);
      return send(i, await boardMessage(uid, { level: ch?.level ?? null }));
    }
    if (sub === 'view') return send(i, await questMessage(await viewQuest(uid, i.options.getString('quest', true)), uid));
    if (sub === 'accept') {
      const { quest } = await accept(uid, i.options.getString('quest', true));
      return send(i, { ...ok(`قبلت مهمة **${quest.title}**!`), ...(await questMessage(await viewQuest(uid, quest.code), uid)) });
    }
    if (sub === 'active') {
      const { buf } = await activeQuestsCard(uid);
      return send(i, { files: [card(buf, 'active-quests')] });
    }
    if (sub === 'abandon') {
      const q = await abandon(uid, i.options.getString('quest', true));
      return send(i, ok(`تخليت عن مهمة **${q.title}**.`));
    }
    if (sub === 'complete') return send(i, await completionPayload(uid, i.options.getString('quest', true)));
    throw new UserError('أمر غير معروف');
  },
};

/** qb:* — quest board select, pagination, accept/complete/abandon buttons. */
export const questBoardComponent = {
  prefix: 'qb',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    if (action === 'page') {
      const [owner, page] = args;
      assertOwner(i, owner === '0' ? null : owner);
      await i.deferUpdate();
      const ch = await findByUser(uid);
      return i.editReply({ ...(await boardMessage(owner, { page: Number(page), level: ch?.level })), attachments: [] });
    }
    if (action === 'pick') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      return i.editReply(await questMessage(await viewQuest(uid, i.values[0]), uid));
    }
    const code = args[1];
    if (action === 'accept') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const { quest } = await accept(uid, code);
      return i.editReply({ ...ok(`قبلت مهمة **${quest.title}**! تابعها عبر /quest active`), ...(await questMessage(await viewQuest(uid, quest.code), uid)) });
    }
    assertOwner(i, args[0], { ttlMs: 0 });
    if (action === 'complete') {
      await i.deferReply();
      return i.editReply(await completionPayload(uid, code));
    }
    if (action === 'abandon') {
      const q = await abandon(uid, code);
      return i.update({ ...ok(`تخليت عن مهمة **${q.title}**.`), files: [], attachments: [], components: [] });
    }
  },
};
