import { SlashCommandBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { cid } from '../core/customId.js';
import { send, ok, card, row, button } from '../core/ui.js';
import { UserError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { app } from '../core/context.js';
import { theme } from '../render/theme.js';
import { renderList, renderNotice } from '../render/index.js';
import { getEvent, listEvents, eventAutocomplete, join, leave, vote, claimRandomEvent } from '../services/events.js';
import { eventMessage } from '../views/social.js';

const STATUS = { scheduled: 'قادم', active: 'جارٍ الآن', ended: 'انتهى', cancelled: 'أُلغي' };

async function requireEvent(id) {
  const ev = await getEvent(id);
  if (!ev) throw new UserError('الحدث غير موجود');
  return ev;
}

/** Re-renders the public event message (stored on the event) after a change. */
export async function refreshEventMessage(eventId) {
  const ev = await getEvent(eventId);
  if (!ev?.channelId || !ev.messageId || !app.client) return;
  const channel = await app.client.channels.fetch(ev.channelId).catch(() => null);
  const msg = channel?.isTextBased() ? await channel.messages.fetch(ev.messageId).catch(() => null) : null;
  if (msg) await msg.edit({ ...(await eventMessage(ev)), attachments: [] }).catch((err) => logger.debug({ err: err.message }, 'event refresh failed'));
}

export const eventCommand = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('أحداث نكسس')
    .addSubcommand((s) => s.setName('list').setDescription('الأحداث الجارية والقادمة'))
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('تفاصيل حدث')
        .addStringOption((o) => o.setName('event').setDescription('الحدث').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('join')
        .setDescription('انضم إلى حدث')
        .addStringOption((o) => o.setName('event').setDescription('الحدث').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('leave')
        .setDescription('انسحب من حدث')
        .addStringOption((o) => o.setName('event').setDescription('الحدث').setRequired(true).setAutocomplete(true)),
    ),
  defer: (i, { sub }) => (sub === 'list' || sub === 'view' ? 'public' : 'ephemeral'),
  autocomplete: (i) => eventAutocomplete(i.options.getFocused()),
  async execute(i, { sub }) {
    if (sub === 'list') {
      const events = await listEvents();
      const buf = await renderList({
        title: 'الأحداث',
        subtitle: 'ما يجري في نكسس الآن',
        iconName: 'flame',
        color: theme.violet,
        rows: events.map((e) => ({
          title: e.title,
          subtitle: `#${e.id} • ${STATUS[e.status]}${e.location ? ` • ${e.location}` : ''}`,
          iconName: e.status === 'active' ? 'flame' : 'calendar',
          color: e.status === 'active' ? theme.danger : theme.violet,
          value: e.maxParticipants ? `${e.participants}/${e.maxParticipants}` : String(e.participants),
          valueSub: 'مشارك',
          highlight: e.status === 'active',
        })),
        emptyText: 'لا توجد أحداث حالياً. ترقّب الإعلانات!',
        footerText: 'اعرض حدثاً عبر /event view',
      });
      return send(i, { files: [card(buf, 'events')] });
    }
    const id = Number(i.options.getString('event', true)) || 0;
    if (sub === 'view') return send(i, await eventMessage(await requireEvent(id)));
    if (sub === 'join') {
      const res = await join(i.user.id, id);
      await refreshEventMessage(id);
      return send(i, ok(`انضممت إلى **${res.event.title}**. عدد المشاركين: ${res.count}`));
    }
    await leave(i.user.id, id);
    await refreshEventMessage(id);
    return send(i, ok('انسحبت من الحدث.'));
  },
};

/** ev:* — buttons and vote menu under event cards. */
export const eventComponent = {
  prefix: 'ev',
  async handle(i, { action, args }) {
    const id = Number(args[0]);
    if (action === 'refresh') {
      await i.deferUpdate();
      return i.editReply({ ...(await eventMessage(await requireEvent(id))), attachments: [] });
    }
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    let message;
    if (action === 'join') message = `انضممت إلى **${(await join(i.user.id, id)).event.title}**!`;
    else if (action === 'leave') {
      await leave(i.user.id, id);
      message = 'انسحبت من الحدث.';
    } else if (action === 'vote') message = `صوّتت لـ «${(await vote(i.user.id, id, Number(i.values[0]))).choice}».`;
    else throw new UserError('إجراء غير معروف');
    await i.editReply(ok(message));
    if (action !== 'vote') await i.message.edit({ ...(await eventMessage(await requireEvent(id))), attachments: [] }).catch(() => {});
  },
};

/** Builds the public card for a freshly spawned random event. */
export async function randomEventMessage({ id, def, location }) {
  const buf = await renderNotice({
    title: def.name_ar,
    subtitle: location ? `في ${location.name_ar}` : 'في أرجاء نكسس',
    iconName: 'sparkle',
    color: theme.gold,
    body: def.description,
    footerText: `أول ${def.max_claims} يربحون • ينتهي خلال ${def.duration_minutes} دقيقة`,
  });
  return {
    files: [card(buf, 'random-event')],
    components: [row(button(cid('rev', 'claim', id), 'شارك الآن!', ButtonStyle.Success, { emoji: '✨' }))],
  };
}

/** rev:claim:<instanceId> */
export const randomEventComponent = {
  prefix: 'rev',
  async handle(i, { action, args }) {
    if (action !== 'claim') throw new UserError('إجراء غير معروف');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await claimRandomEvent(args[0], i.user.id);
    await i.editReply(ok(`**${res.name}**: ${res.text || 'شاركت!'}`));
    if (res.remaining <= 0)
      await i.message.edit({ components: [row(button(cid('ui', 'noop', ''), 'انتهت المكافآت', ButtonStyle.Secondary, { disabled: true }))] }).catch(() => {});
  },
};
