import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { send, row, select, ok } from '../core/ui.js';
import { cid } from '../core/customId.js';
import { UserError } from '../core/errors.js';
import { app } from '../core/context.js';
import { logger } from '../core/logger.js';
import { openTrade, getTrade, setItem, setNx, confirm, cancel, setTradeMessage } from '../services/trades.js';
import { ownedForAutocomplete } from '../services/inventory.js';
import { tradeMessage } from '../views/social.js';
import { parseAmount } from '../utils/validation.js';

export const tradeCommand = {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('افتح نافذة تداول آمنة مع لاعب')
    .addUserOption((o) => o.setName('user').setDescription('الطرف الآخر').setRequired(true)),
  defer: 'public',
  async execute(i) {
    const target = i.options.getUser('user', true);
    if (target.bot) throw new UserError('لا يمكنك التداول مع بوت');
    const { trade } = await openTrade(i.user.id, target.id);
    const msg = await send(i, await tradeMessage(trade));
    if (msg?.id) await setTradeMessage(trade.id, msg.channelId, msg.id);
  },
};

async function refreshTradeMessage(trade) {
  if (!trade.channelId || !trade.messageId) return;
  const channel = await app.client?.channels.fetch(trade.channelId).catch(() => null);
  const msg = channel?.isTextBased() ? await channel.messages.fetch(trade.messageId).catch(() => null) : null;
  if (msg) await msg.edit({ ...(await tradeMessage(trade)), attachments: [] }).catch((err) => logger.debug({ err: err.message }, 'trade refresh failed'));
}

function qtyModal(tradeId, itemKey) {
  return new ModalBuilder()
    .setCustomId(cid('tr', 'qty', tradeId, itemKey))
    .setTitle('الكمية')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('qty')
          .setLabel('كم قطعة تريد عرضها؟ (0 للإزالة)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(6)
          .setValue('1'),
      ),
    );
}

function nxModal(tradeId) {
  return new ModalBuilder()
    .setCustomId(cid('tr', 'nx', tradeId))
    .setTitle('إضافة NX')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('المبلغ (0 للإزالة)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(12)
          .setPlaceholder('مثال: 500 أو 1.5k'),
      ),
    );
}

/** tr:* — trade window buttons, item picker and quantity modals. */
export const tradeComponent = {
  prefix: 'tr',
  async handle(i, { action, args }) {
    const [tradeId, itemKey] = args;
    const uid = i.user.id;
    const trade = await getTrade(tradeId);
    if (!trade) throw new UserError('الصفقة غير موجودة');
    switch (action) {
      case 'additem': {
        const options = await ownedForAutocomplete(uid, '', { only: 'tradeable' });
        if (!options.length) throw new UserError('لا تملك أغراضاً قابلة للتداول');
        return i.reply({
          content: 'اختر الغرض الذي تريد عرضه:',
          components: [
            row(
              select(
                cid('tr', 'pick', tradeId),
                'أغراضك',
                options.map((o) => ({ label: o.name, value: o.value })),
              ),
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
      case 'pick':
        return i.showModal(qtyModal(tradeId, i.values[0]));
      case 'qty': {
        const qty = parseInt(i.fields.getTextInputValue('qty'), 10);
        if (!Number.isInteger(qty) || qty < 0 || qty > 99999) throw new UserError('كمية غير صالحة');
        await i.deferUpdate();
        const t = await setItem(tradeId, uid, itemKey, qty);
        await refreshTradeMessage(t);
        return i.editReply({ ...ok('تم تحديث عرضك.'), content: null, components: [] });
      }
      case 'addnx':
        return i.showModal(nxModal(tradeId));
      case 'nx': {
        const raw = i.fields.getTextInputValue('amount').trim();
        const amount = raw === '0' ? 0 : parseAmount(raw);
        await i.deferUpdate();
        const t = await setNx(tradeId, uid, amount);
        return i.editReply({ ...(await tradeMessage(t)), attachments: [] });
      }
      case 'confirm': {
        await i.deferUpdate();
        const res = await confirm(tradeId, uid);
        await i.editReply({ ...(await tradeMessage(res.trade)), attachments: [] });
        if (res.executed) await i.followUp(ok('🤝 تمت الصفقة بنجاح! تحقق من حقيبتك.'));
        return;
      }
      case 'cancel': {
        await i.deferUpdate();
        const t = await cancel(tradeId, uid);
        return i.editReply({ ...(await tradeMessage(t)), attachments: [] });
      }
      default:
        throw new UserError('إجراء غير معروف');
    }
  },
};
