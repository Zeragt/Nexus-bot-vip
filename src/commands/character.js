import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { cid } from '../core/customId.js';
import { send, ok, confirmRow, info } from '../core/ui.js';
import { UserError } from '../core/errors.js';
import { findByUser, requireByUser, allocateStat, setAvatar } from '../services/characters.js';
import { profileMessage, statsMessage, skillsMessage, statChoices } from '../views/character.js';
import { forgetImage } from '../views/avatars.js';
import { normalizeAvatar } from '../render/index.js';

const input = (id, label, { style = TextInputStyle.Short, required = false, max = 100, placeholder, value } = {}) => {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(style).setRequired(required).setMaxLength(max);
  if (placeholder) t.setPlaceholder(placeholder);
  if (value) t.setValue(String(value).slice(0, max));
  return new ActionRowBuilder().addComponents(t);
};

/** Modal sets: the creation form is split into three short, mobile-friendly modals. */
export function basicModal(id, ch = null) {
  const p = ch?.profile ?? {};
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle(ch ? 'تعديل المعلومات الأساسية' : 'إنشاء شخصية — الهوية')
    .addComponents(
      input('name', 'الاسم', { required: true, max: 32, placeholder: 'مثال: كايل الأزرق', value: ch?.name }),
      input('race', 'العرق', { max: 40, placeholder: 'إنسان، إلف، شيطان، وحش...', value: p.race }),
      input('age', 'العمر', { max: 20, placeholder: '27 أو «مجهول»', value: p.age }),
      input('gender', 'الجنس', { max: 30, value: p.gender }),
      input('origin', 'الأصل / من أين أتى', { max: 60, placeholder: 'مملكة الضباب، بُعد آخر...', value: p.origin }),
    );
}

export function bioModal(id, ch = null) {
  const p = ch?.profile ?? {};
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle('السيرة والشخصية')
    .addComponents(
      input('occupation', 'المهنة / الدور', { max: 60, placeholder: 'فارس، طالب، تاجر، عالم...', value: p.occupation }),
      input('alignment', 'التوجه', { max: 40, placeholder: 'محايد طيب، فوضوي شرير...', value: p.alignment }),
      input('personality', 'الشخصية', { style: TextInputStyle.Paragraph, max: 400, value: p.personality }),
      input('appearance', 'المظهر', { style: TextInputStyle.Paragraph, max: 600, value: p.appearance }),
      input('backstory', 'القصة الخلفية', { style: TextInputStyle.Paragraph, max: 1500, value: p.backstory }),
    );
}

export function traitsModal(id, ch = null) {
  const p = ch?.profile ?? {};
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle('القدرات ونقاط الضعف')
    .addComponents(
      input('abilities', 'القدرات', { style: TextInputStyle.Paragraph, max: 600, placeholder: 'ما الذي تجيده شخصيتك؟ (للـ RP فقط)', value: p.abilities }),
      input('weaknesses', 'نقاط الضعف', { style: TextInputStyle.Paragraph, max: 600, value: p.weaknesses }),
    );
}

export default {
  data: new SlashCommandBuilder()
    .setName('character')
    .setDescription('شخصيتك في نكسس')
    .addSubcommand((s) => s.setName('create').setDescription('أنشئ شخصيتك'))
    .addSubcommand((s) =>
      s
        .setName('profile')
        .setDescription('بطاقة الشخصية')
        .addUserOption((o) => o.setName('user').setDescription('اعرض شخصية لاعب آخر')),
    )
    .addSubcommand((s) =>
      s
        .setName('edit')
        .setDescription('عدّل معلومات شخصيتك')
        .addStringOption((o) =>
          o
            .setName('section')
            .setDescription('القسم')
            .setRequired(true)
            .addChoices({ name: 'الهوية', value: 'basic' }, { name: 'السيرة والشخصية', value: 'bio' }, { name: 'القدرات ونقاط الضعف', value: 'traits' }),
        ),
    )
    .addSubcommand((s) => s.setName('delete').setDescription('احذف شخصيتك نهائياً'))
    .addSubcommand((s) =>
      s
        .setName('stats')
        .setDescription('الإحصائيات بالتفصيل')
        .addUserOption((o) => o.setName('user').setDescription('لاعب آخر')),
    )
    .addSubcommand((s) => s.setName('skills').setDescription('مهارات الشخصية'))
    .addSubcommand((s) =>
      s
        .setName('allocate')
        .setDescription('وزّع نقاط الإحصائيات')
        .addStringOption((o) =>
          o
            .setName('stat')
            .setDescription('الإحصائية')
            .setRequired(true)
            .addChoices(...statChoices()),
        )
        .addIntegerOption((o) => o.setName('points').setDescription('عدد النقاط').setRequired(true).setMinValue(1).setMaxValue(100)),
    )
    .addSubcommand((s) =>
      s
        .setName('avatar')
        .setDescription('صورة الشخصية على البطاقات')
        .addAttachmentOption((o) => o.setName('image').setDescription('صورة PNG/JPG/WEBP (اتركها فارغة لاستخدام صورة حسابك)')),
    ),

  defer: (i, { sub }) => (['create', 'edit', 'delete'].includes(sub) ? false : sub === 'allocate' || sub === 'avatar' ? 'ephemeral' : 'public'),

  async execute(i, { sub }) {
    const uid = i.user.id;
    switch (sub) {
      case 'create': {
        if (await findByUser(uid)) throw new UserError('لديك شخصية بالفعل. استخدم /character profile أو /character edit');
        return i.showModal(basicModal(cid('chm', 'create')));
      }
      case 'profile': {
        const target = i.options.getUser('user') ?? i.user;
        const ch = target.id === uid ? await requireByUser(uid) : await findByUser(target.id);
        if (!ch) throw new UserError(`${target.username} لا يملك شخصية في نكسس`);
        return send(i, await profileMessage(ch, uid));
      }
      case 'stats': {
        const target = i.options.getUser('user') ?? i.user;
        const ch = await findByUser(target.id);
        if (!ch) throw new UserError(target.id === uid ? 'ليس لديك شخصية بعد. استخدم /character create' : 'هذا اللاعب لا يملك شخصية');
        return send(i, await statsMessage(ch, uid));
      }
      case 'skills':
        return send(i, await skillsMessage(await requireByUser(uid), uid));
      case 'edit': {
        const ch = await requireByUser(uid);
        const section = i.options.getString('section', true);
        const build = { basic: basicModal, bio: bioModal, traits: traitsModal }[section];
        return i.showModal(build(cid('chm', `edit_${section}`), ch));
      }
      case 'delete': {
        const ch = await requireByUser(uid);
        return i.reply({
          ...info(`⚠️ هل أنت متأكد من حذف **${ch.name}** (${ch.code})؟\nسيُحذف كل شيء: المستوى، الأغراض، NX، المهام والعلاقات. **لا يمكن التراجع.**`),
          components: [confirmRow('chm', 'delete', uid, ch.id)],
          flags: MessageFlags.Ephemeral,
        });
      }
      case 'allocate': {
        const stat = i.options.getString('stat', true);
        const pts = i.options.getInteger('points', true);
        const ch = await allocateStat(uid, stat, pts);
        return send(i, ok(`تمت إضافة ${pts} نقاط. النقاط المتبقية: ${ch.statPoints}`));
      }
      case 'avatar': {
        const ch = await requireByUser(uid);
        const att = i.options.getAttachment('image');
        if (!att) {
          await setAvatar(ch.id, null);
          forgetImage(ch.id);
          return send(i, ok('ستستخدم البطاقات صورة حسابك في ديسكورد.'));
        }
        if (!/^image\/(png|jpe?g|webp|gif)$/.test(att.contentType ?? '')) throw new UserError('الملف يجب أن يكون صورة PNG أو JPG أو WEBP');
        if (att.size > 8 * 1024 * 1024) throw new UserError('حجم الصورة يجب ألا يتجاوز 8MB');
        let png;
        try {
          png = await normalizeAvatar(att.url);
        } catch {
          throw new UserError('تعذّرت قراءة الصورة. جرّب صورة أخرى.');
        }
        await setAvatar(ch.id, png);
        forgetImage(ch.id);
        return send(i, ok('تم تحديث صورة شخصيتك! ستظهر في كل البطاقات.'));
      }
      default:
        throw new UserError('أمر غير معروف');
    }
  },
};
