import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, StringSelectMenuBuilder } from 'discord.js';
import { IMAGE_EXT } from '../render/index.js';
import { cid } from './customId.js';
import { ui as UI } from '../config/game.js';
import { UserError } from './errors.js';

export const COLORS = { primary: 0x22d3ee, royal: 0x2f4fd8, gold: 0xf5c451, success: 0x34d399, danger: 0xf43f5e, violet: 0x7c6cff };

/** Wraps a rendered card into a Discord attachment. */
export function card(buffer, name = 'nexus') {
  return new AttachmentBuilder(buffer, { name: `${name}.${IMAGE_EXT}` });
}

/** Sends or edits the interaction response, whatever state it is in. */
export async function send(i, payload) {
  const body = typeof payload === 'string' ? { content: payload } : payload;
  const { ephemeral, ...rest } = body;
  const flags = ephemeral ? MessageFlags.Ephemeral : undefined;
  if (i.deferred || i.replied) {
    if (i.deferred && !i.replied) return i.editReply({ components: [], embeds: [], attachments: [], ...rest });
    return i.followUp({ ...rest, flags });
  }
  return i.reply({ ...rest, flags, withResponse: true }).then((r) => r?.resource?.message ?? r);
}

/** Short text answer styled as a slim embed (for confirmations and errors). */
export function notice(text, color = COLORS.primary) {
  return new EmbedBuilder().setColor(color).setDescription(text);
}

export const ok = (text) => ({ embeds: [notice(`✅ ${text}`, COLORS.success)] });
export const warn = (text) => ({ embeds: [notice(`⚠️ ${text}`, COLORS.danger)] });
export const info = (text) => ({ embeds: [notice(text, COLORS.primary)] });

export function button(id, label, style = ButtonStyle.Secondary, { emoji, disabled = false } = {}) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) b.setEmoji(emoji);
  return b;
}

export function linkButton(url, label) {
  return new ButtonBuilder().setURL(url).setLabel(label).setStyle(ButtonStyle.Link);
}

export const row = (...components) => new ActionRowBuilder().addComponents(...components.flat().filter(Boolean));

export function select(id, placeholder, options, { min = 1, max = 1 } = {}) {
  return new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(placeholder)
    .setMinValues(min)
    .setMaxValues(Math.min(max, options.length || 1))
    .addOptions(
      options
        .slice(0, 25)
        .map((o) => ({ ...o, label: String(o.label).slice(0, 100), description: o.description ? String(o.description).slice(0, 100) : undefined })),
    );
}

/** Previous / page / next / close buttons. Handler receives action "page" with args [owner, page, ...extra]. */
export function pager(handler, owner, page, pages, ...extra) {
  if (pages <= 1) return null;
  return row(
    button(cid(handler, 'page', owner, Math.max(1, page - 1), ...extra), 'السابق', ButtonStyle.Secondary, { emoji: '◀️', disabled: page <= 1 }),
    button(cid(handler, 'noop', owner, page), `${page} / ${pages}`, ButtonStyle.Secondary, { disabled: true }),
    button(cid(handler, 'page', owner, Math.min(pages, page + 1), ...extra), 'التالي', ButtonStyle.Secondary, { emoji: '▶️', disabled: page >= pages }),
    button(cid('ui', 'close', owner), 'إغلاق', ButtonStyle.Danger, { emoji: '✖️' }),
  );
}

/** Confirm / cancel pair for dangerous actions; both buttons carry the owner and an expiry. */
export function confirmRow(handler, action, owner, ...args) {
  const exp = Math.floor((Date.now() + 2 * 60_000) / 1000);
  return row(
    button(cid(handler, action, owner, exp, ...args), 'تأكيد', ButtonStyle.Danger, { emoji: '✔️' }),
    button(cid('ui', 'cancel', owner), 'إلغاء', ButtonStyle.Secondary, { emoji: '✖️' }),
  );
}

/** Rejects presses from anyone but the UI's owner, and presses on stale messages. */
export function assertOwner(i, ownerId, { ttlMs = UI.componentTtlMs } = {}) {
  if (ownerId && i.user.id !== ownerId) throw new UserError('هذه الواجهة ليست لك. استخدم الأمر بنفسك لتحصل على واجهتك الخاصة.');
  const ts = i.message?.editedTimestamp ?? i.message?.createdTimestamp;
  if (ttlMs && ts && Date.now() - ts > ttlMs) throw new UserError('انتهت صلاحية هذه الواجهة. استخدم الأمر من جديد.');
}

export function assertNotExpired(expSeconds) {
  if (Number(expSeconds) * 1000 < Date.now()) throw new UserError('انتهت مهلة التأكيد. أعد المحاولة.');
}

/** Avatar URL for a Discord user id via the cache (falls back to null). */
export async function avatarUrlFor(client, userId) {
  try {
    const u = client.users.cache.get(userId) ?? (await client.users.fetch(userId));
    return u.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
  } catch {
    return null;
  }
}
