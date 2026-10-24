import { SlashCommandBuilder } from 'discord.js';
import { send, card } from '../core/ui.js';
import { UserError } from '../core/errors.js';
import { requireByUser, findByUser, loadCharacter } from '../services/characters.js';
import { pay, daily } from '../services/economy.js';
import { parseAmount } from '../utils/validation.js';
import { walletMessage } from '../views/game.js';
import { leaderboardMessage } from './leaderboard.js';
import { renderNotice } from '../render/index.js';
import { theme } from '../render/theme.js';
import { fmt, ts } from '../utils/format.js';
import { getPool } from '../db/pool.js';
import { characterImage } from '../views/avatars.js';

export default {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('اقتصاد نكسس وعملة NX')
    .addSubcommand((s) =>
      s
        .setName('balance')
        .setDescription('محفظتك')
        .addUserOption((o) => o.setName('user').setDescription('لاعب آخر')),
    )
    .addSubcommand((s) =>
      s
        .setName('pay')
        .setDescription('حوّل NX إلى لاعب آخر')
        .addUserOption((o) => o.setName('user').setDescription('المستلم').setRequired(true))
        .addStringOption((o) => o.setName('amount').setDescription('المبلغ (مثل 500 أو 1.5k)').setRequired(true))
        .addStringOption((o) => o.setName('note').setDescription('ملاحظة').setMaxLength(80)),
    )
    .addSubcommand((s) => s.setName('daily').setDescription('استلم مكافأتك اليومية'))
    .addSubcommand((s) => s.setName('leaderboard').setDescription('أغنى شخصيات نكسس')),
  defer: 'public',
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'balance') {
      const target = i.options.getUser('user') ?? i.user;
      const ch = target.id === uid ? await requireByUser(uid) : await findByUser(target.id);
      if (!ch) throw new UserError('هذا اللاعب لا يملك شخصية');
      return send(i, await walletMessage(ch, uid));
    }
    if (sub === 'pay') {
      const target = i.options.getUser('user', true);
      if (target.bot) throw new UserError('لا يمكنك التحويل إلى بوت');
      const amount = parseAmount(i.options.getString('amount', true));
      const note = i.options.getString('note') ?? null;
      const res = await pay(uid, target.id, amount, { note, idempotencyKey: `pay:${i.id}` });
      const from = await loadCharacter(getPool(), res.fromCharacterId);
      const to = await loadCharacter(getPool(), res.toCharacterId);
      const buf = await renderNotice({
        title: 'تم التحويل',
        subtitle: `من ${from.name} إلى ${to.name}`,
        iconName: 'swap',
        color: theme.gold,
        highlight: `${fmt(amount)} NX`,
        avatar: await characterImage(to.id, to.userId),
        avatarLabel: to.name,
        body: note ? `«${note}»` : `رصيدك الآن ${fmt(res.balance)} NX`,
      });
      return send(i, { content: `<@${target.id}>`, allowedMentions: { users: [target.id] }, files: [card(buf, 'transfer')] });
    }
    if (sub === 'daily') {
      let res;
      try {
        res = await daily(uid);
      } catch (err) {
        if (err.retryAt) throw new UserError(`استلمت مكافأتك اليوم. عُد ${ts(err.retryAt)}`);
        throw err;
      }
      const buf = await renderNotice({
        title: 'المكافأة اليومية',
        subtitle: `سلسلة ${res.streak} ${res.streak > 1 ? 'أيام متتالية' : 'يوم'} — عُد غداً لتزيد المكافأة`,
        iconName: 'flame',
        color: theme.gold,
        highlight: `+${fmt(res.amount)} NX`,
        tiles: [
          { label: 'الرصيد', value: `${fmt(res.character.nx)} NX`, iconName: 'coin', color: theme.gold },
          { label: 'السلسلة', value: `${res.streak} / 7`, iconName: 'flame' },
        ],
        body: res.unlocked.length ? `إنجاز جديد: ${res.unlocked.map((a) => a.name_ar).join('، ')}` : '',
      });
      return send(i, { files: [card(buf, 'daily')] });
    }
    if (sub === 'leaderboard') return send(i, await leaderboardMessage('wealth', 1, uid));
    throw new UserError('أمر غير معروف');
  },
};
