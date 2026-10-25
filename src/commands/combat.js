import { SlashCommandBuilder } from 'discord.js';
import { send, ok, assertOwner, info } from '../core/ui.js';
import { UserError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { app } from '../core/context.js';
import { challenge, respond, act, hunt, forfeit, currentSessionFor, getSession, setMessage } from '../services/combat.js';
import { challengeMessage, combatMessage } from '../views/social.js';
import { requireByUser } from '../services/characters.js';
import { levelUpCard } from '../views/character.js';
import { card } from '../core/ui.js';
import { storyResultMessage } from '../views/story.js';

/** Sends a fight update and remembers where the live message is (for turn timeouts). */
export async function postCombat(i, result, { update = false } = {}) {
  const payload = await combatMessage(result.session);
  const msg = update ? await i.editReply({ ...payload, attachments: [] }) : await send(i, payload);
  if (msg?.id && msg.channelId) await setMessage(result.session.id, msg.channelId, msg.id);
  if (result.finished) {
    await announceLevelUps(i, result);
    await announceStory(i, result);
  }
  return msg;
}

/** After a story boss falls (or wins), follow up with the chapter's ending or a retry prompt. */
async function announceStory(i, result) {
  const story = result.summary?.story;
  if (!story) return;
  const player = result.session.state.fighters.find((f) => f.userId);
  if (!player) return;
  const payload = await storyResultMessage(player.userId, story).catch((err) => {
    logger.warn({ err: err.message }, 'story follow-up failed');
    return null;
  });
  if (payload) await i.followUp(payload).catch(() => {});
}

async function announceLevelUps(i, result) {
  const lvl = result.summary?.rewards?.level;
  if (!lvl) return;
  const winner = result.session.state.fighters[result.session.state.winner];
  if (!winner?.userId) return;
  const ch = await requireByUser(winner.userId);
  await i.followUp({ files: [card(await levelUpCard(ch, lvl), 'level-up')] }).catch(() => {});
}

export const combatCommand = {
  data: new SlashCommandBuilder()
    .setName('combat')
    .setDescription('القتال بالأدوار')
    .addSubcommand((s) =>
      s
        .setName('challenge')
        .setDescription('تحدَّ لاعباً في نفس موقعك')
        .addUserOption((o) => o.setName('user').setDescription('الخصم').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('status').setDescription('قتالك الحالي'))
    .addSubcommand((s) => s.setName('forfeit').setDescription('استسلم من القتال الحالي')),
  defer: 'public',
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'challenge') {
      const target = i.options.getUser('user', true);
      if (target.bot) throw new UserError('لا يمكنك تحدي بوت. جرّب /hunt لقتال الوحوش');
      const res = await challenge(uid, target.id, i.channelId);
      return send(i, await challengeMessage(res));
    }
    if (sub === 'status') {
      const s = await currentSessionFor(uid);
      if (!s) return send(i, info('لست في قتال حالياً. تحدَّ أحداً عبر /combat challenge أو اصطد عبر /hunt'));
      return postCombat(i, { session: s, finished: false });
    }
    if (sub === 'forfeit') return postCombat(i, await forfeit(uid));
  },
};

export const huntCommand = {
  data: new SlashCommandBuilder().setName('hunt').setDescription('ابحث عن وحش في موقعك الحالي وقاتله'),
  defer: 'public',
  async execute(i) {
    return postCombat(i, await hunt(i.user.id));
  },
};

const ACTIONS = { atk: 'attack', def: 'defend', flee: 'flee' };

/** cb:* — challenge accept/decline, combat actions, and the "hunt" shortcut button. */
export const combatComponent = {
  prefix: 'cb',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    if (action === 'hunt') {
      assertOwner(i, args[0], { ttlMs: 0 });
      await i.deferReply();
      return postCombat(i, await hunt(uid));
    }
    const sessionId = args[0];
    if (action === 'acc' || action === 'dec') {
      const s = await getSession(sessionId);
      if (!s) throw new UserError('هذا التحدي لم يعد صالحاً');
      await i.deferUpdate();
      const res = await respond(sessionId, uid, action === 'acc');
      if (res.declined) return i.editReply({ ...ok('رُفض التحدي.'), content: null, files: [], attachments: [], components: [] });
      return postCombat(i, { session: res.session, finished: false }, { update: true });
    }
    if (action === 'ff') {
      const s = await getSession(sessionId);
      if (!s?.state?.fighters?.some((f) => f.userId === uid)) throw new UserError('أنت لست طرفاً في هذا القتال');
      await i.deferUpdate();
      return postCombat(i, await forfeit(uid), { update: true });
    }
    let move;
    if (ACTIONS[action]) move = { type: ACTIONS[action] };
    else if (action === 'skill') move = { type: 'skill', key: i.values[0] };
    else if (action === 'item') move = { type: 'item', key: i.values[0] };
    else throw new UserError('إجراء غير معروف');
    await i.deferUpdate();
    const res = await act(sessionId, uid, move);
    try {
      return await postCombat(i, res, { update: true });
    } catch (err) {
      logger.warn({ err: err.message }, 'Combat message update failed');
      throw err;
    }
  },
};

/** Scheduler hook: re-render fights that advanced because of a turn timeout. */
export async function refreshCombatMessage(result) {
  const s = result.session;
  if (!s.channelId || !s.messageId || !app.client) return;
  const channel = await app.client.channels.fetch(s.channelId).catch(() => null);
  const msg = channel?.isTextBased() ? await channel.messages.fetch(s.messageId).catch(() => null) : null;
  if (!msg) return;
  await msg.edit({ ...(await combatMessage(s)), attachments: [] }).catch((err) => logger.debug({ err: err.message }, 'combat refresh failed'));
}
