import { ButtonStyle, MessageFlags } from 'discord.js';
import { cid } from '../core/customId.js';
import { card, row, button, ok, assertOwner, assertNotExpired } from '../core/ui.js';
import { UserError } from '../core/errors.js';
import { createCharacter, updateCharacter, deleteCharacter, requireByUser, loadCharacter } from '../services/characters.js';
import { checkAchievements } from '../services/achievements.js';
import { tx, getPool } from '../db/pool.js';
import { renderNotice } from '../render/index.js';
import { theme } from '../render/theme.js';
import { profileMessage, statsMessage, skillsMessage } from '../views/character.js';
import { inventoryMessage, walletMessage, questsMessageForProfile } from '../views/game.js';
import { characterImage, forgetImage } from '../views/avatars.js';
import { bioModal, traitsModal } from '../commands/character.js';

const fields = (i, names) => Object.fromEntries(names.map((n) => [n, i.fields.getTextInputValue(n) ?? '']));

/** chm:* — character modals and their follow-up buttons. */
export const characterModals = {
  prefix: 'chm',
  async handle(i, { action, args }) {
    const uid = i.user.id;
    if (action === 'create' && i.isModalSubmit()) {
      await i.deferReply();
      const ch = await createCharacter(uid, fields(i, ['name', 'race', 'age', 'gender', 'origin']));
      const unlocked = await tx((db) => checkAchievements(db, ch.id));
      const buf = await renderNotice({
        title: `مرحباً بك في نكسس، ${ch.name}`,
        subtitle: `رقم هويتك ${ch.code} • تبدأ رحلتك في ${ch.location?.nameAr ?? 'المدينة'}`,
        avatar: await characterImage(ch.id, uid),
        avatarLabel: ch.name,
        tiles: [
          { label: 'رصيد البداية', value: `${ch.nx} NX`, iconName: 'coin', color: theme.gold },
          { label: 'العتاد', value: 'سيف ودرع', iconName: 'sword' },
          { label: 'المؤن', value: '3 جرعات شفاء', iconName: 'flask', color: theme.success },
        ],
        body: `تم إنشاء شخصيتك بنجاح.${unlocked.length ? ` إنجاز جديد: ${unlocked.map((a) => a.name_ar).join('، ')}!` : ''} الخطوة التالية: اختر كلاسك من بين 55 كلاساً، وسترى شخصيتك ترتديه.`,
      });
      return i.editReply({
        files: [card(buf, 'welcome')],
        components: [
          row(button(cid('cl', 'cat', uid, 'warrior'), 'اختر كلاسك الآن', ButtonStyle.Success, { emoji: '⚔️' })),
          row(
            button(cid('chm', 'bio_btn', uid), 'أكمل السيرة', ButtonStyle.Primary, { emoji: '📝' }),
            button(cid('chm', 'traits_btn', uid), 'القدرات ونقاط الضعف', ButtonStyle.Secondary, { emoji: '✨' }),
            button(cid('pf', 'profile', ch.id, uid), 'بطاقتي', ButtonStyle.Success, { emoji: '🪪' }),
          ),
        ],
      });
    }

    if (action === 'bio_btn' || action === 'traits_btn') {
      assertOwner(i, args[0], { ttlMs: 0 });
      const ch = await requireByUser(uid);
      return i.showModal(action === 'bio_btn' ? bioModal(cid('chm', 'edit_bio'), ch) : traitsModal(cid('chm', 'edit_traits'), ch));
    }

    if (action.startsWith('edit_') && i.isModalSubmit()) {
      const section = action.slice(5);
      const names = {
        basic: ['name', 'race', 'age', 'gender', 'origin'],
        bio: ['occupation', 'alignment', 'personality', 'appearance', 'backstory'],
        traits: ['abilities', 'weaknesses'],
      }[section];
      if (!names) throw new UserError('قسم غير معروف');
      const ch = await requireByUser(uid);
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const data = fields(i, names);
      // Empty optional fields clear the value; name stays required.
      const updated = await updateCharacter(ch.id, data, { actorId: uid });
      forgetImage(updated.id);
      return i.editReply({ ...ok('تم حفظ التعديلات.'), ...(await profileMessage(updated, uid)) });
    }

    if (action === 'delete') {
      const [owner, exp, characterId] = args;
      assertOwner(i, owner, { ttlMs: 0 });
      assertNotExpired(exp);
      const ch = await requireByUser(uid);
      if (String(ch.id) !== characterId) throw new UserError('هذه الشخصية لم تعد موجودة');
      await deleteCharacter(ch.id, { actorId: uid, reason: 'self delete' });
      return i.update({ ...ok(`تم حذف **${ch.name}**. يمكنك بدء قصة جديدة عبر /character create متى شئت.`), components: [] });
    }
    throw new UserError('إجراء غير معروف');
  },
};

/** pf:<view>:<characterId>:<viewerId> — profile navigation buttons. */
export const profileNav = {
  prefix: 'pf',
  async handle(i, { action, args }) {
    const [characterId, viewer] = args;
    assertOwner(i, viewer);
    await i.deferUpdate();
    const ch = await loadCharacter(getPool(), Number(characterId));
    if (!ch) throw new UserError('هذه الشخصية لم تعد موجودة');
    const views = {
      profile: () => profileMessage(ch, viewer),
      stats: () => statsMessage(ch, viewer),
      skills: () => skillsMessage(ch, viewer),
      inventory: () => inventoryMessage(ch, viewer, { withProfileNav: true }),
      economy: () => walletMessage(ch, viewer, { withProfileNav: true }),
      quests: () => questsMessageForProfile(ch, viewer),
    };
    const build = views[action];
    if (!build) throw new UserError('عرض غير معروف');
    const payload = await build();
    // From the creation card the first press should post the profile rather than replace the welcome.
    if (i.message?.attachments?.first()?.name?.startsWith('welcome')) return i.followUp(payload);
    return i.editReply({ ...payload, attachments: [], embeds: [] });
  },
};

/** ui:* — generic close / cancel buttons. */
export const genericUi = {
  prefix: 'ui',
  async handle(i, { action, args }) {
    assertOwner(i, args[0], { ttlMs: 0 });
    if (action === 'close') {
      await i.deferUpdate();
      return i.deleteReply().catch(() => i.editReply({ components: [] }));
    }
    if (action === 'cancel') return i.update({ ...ok('تم الإلغاء.'), components: [] });
    if (action === 'noop') return i.deferUpdate();
    throw new UserError('إجراء غير معروف');
  },
};
