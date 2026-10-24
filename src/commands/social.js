import { SlashCommandBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { cid } from '../core/customId.js';
import { send, ok, info, card, row, button, confirmRow, assertOwner, assertNotExpired } from '../core/ui.js';
import { UserError } from '../core/errors.js';
import { parseAmount } from '../utils/validation.js';
import { fmt, compact } from '../utils/format.js';
import { theme } from '../render/theme.js';
import { renderWelcome, renderList, renderNotice } from '../render/index.js';
import { findByUser, requireByUser } from '../services/characters.js';
import { learnSkill, skillAutocomplete, relationshipTypes, setRelationship, removeRelationship, listRelationships } from '../services/social.js';
import { listFactions, getFaction, standings, rankFor, nextRank } from '../services/factions.js';
import { listJobs, selectJob, work, jobHistory } from '../services/jobs.js';
import * as guilds from '../services/guilds.js';
import { STAT_LABELS, economy } from '../config/game.js';
import { userImage, characterImage } from '../views/avatars.js';
import { skillsMessage, levelUpCard } from '../views/character.js';
import { achievementsMessage } from '../views/game.js';
import { guildCard, guildMembersCard } from '../views/social.js';
import { basicModal } from './character.js';

// /start & /help ---------------------------------------------------------------
export const startCommand = {
  data: new SlashCommandBuilder().setName('start').setDescription('ابدأ رحلتك في نكسس'),
  defer: 'public',
  async execute(i) {
    const ch = await findByUser(i.user.id);
    const buf = await renderWelcome({
      userName: ch?.name ?? i.member?.displayName ?? i.user.globalName ?? i.user.username,
      avatar: ch ? await characterImage(ch.id, ch.userId) : await userImage(i.user.id),
      hasCharacter: Boolean(ch),
    });
    const buttons = ch
      ? [button(cid('pf', 'profile', ch.id, i.user.id), 'بطاقتي', ButtonStyle.Primary, { emoji: '🪪' })]
      : [button(cid('hp', 'create', i.user.id), 'أنشئ شخصيتي', ButtonStyle.Success, { emoji: '✨' })];
    buttons.push(button(cid('hp', 'guide', i.user.id), 'دليل الأوامر', ButtonStyle.Secondary, { emoji: '📖' }));
    return send(i, { files: [card(buf, 'welcome')], components: [row(buttons)] });
  },
};

const HELP_SECTIONS = [
  { title: 'الشخصية', sub: '/character create • profile • edit • stats • allocate • avatar', icon: 'star' },
  { title: 'الكلاسات', sub: '/class browse • choose • path • skills • loadout • equip', icon: 'swords' },
  { title: 'القصة والأرشيف', sub: '/story current • read • fight • chapters • bosses • /codex', icon: 'book' },
  { title: 'العالم', sub: '/travel • /world map • /world location • /world lore', icon: 'map' },
  { title: 'الشخصيات والمتاجر', sub: '/npc talk • /shop view • /shop buy • /shop sell', icon: 'gem' },
  { title: 'المهام', sub: '/quest board • accept • active • complete', icon: 'scroll' },
  { title: 'القتال', sub: '/hunt • /combat challenge • /combat status • /combat forfeit', icon: 'swords' },
  { title: 'الحقيبة', sub: '/inventory view • use • equip • unequip • info', icon: 'bag' },
  { title: 'الاقتصاد والعمل', sub: '/economy balance • pay • daily • /job select • /job work', icon: 'coin' },
  { title: 'المجتمع', sub: '/guild • /trade • /relation • /faction • /event', icon: 'users' },
  { title: 'التقدم', sub: '/skill learn • /achievements • /leaderboard', icon: 'trophy' },
];

async function guideCard() {
  return renderList({
    title: 'دليل نكسس',
    subtitle: 'كل ما تحتاجه لتبدأ مغامرتك',
    iconName: 'book',
    rows: HELP_SECTIONS.map((s) => ({ title: s.title, subtitle: s.sub, iconName: s.icon })),
    rowHeight: 56,
    footerText: 'اكسب XP من الكتابة في قنوات الرول بلاي أيضاً',
  });
}

export const helpCommand = {
  data: new SlashCommandBuilder().setName('help').setDescription('دليل أوامر نكسس'),
  defer: 'ephemeral',
  async execute(i) {
    return send(i, { files: [card(await guideCard(), 'guide')] });
  },
};

/** hp:* — buttons on the welcome card. */
export const helpComponent = {
  prefix: 'hp',
  async handle(i, { action, args }) {
    assertOwner(i, args[0], { ttlMs: 0 });
    if (action === 'guide') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      return i.editReply({ files: [card(await guideCard(), 'guide')] });
    }
    if (action === 'create') {
      if (await findByUser(i.user.id)) throw new UserError('لديك شخصية بالفعل. استخدم /character profile');
      return i.showModal(basicModal(cid('chm', 'create')));
    }
    throw new UserError('إجراء غير معروف');
  },
};

// /skill -------------------------------------------------------------------------
export const skillCommand = {
  data: new SlashCommandBuilder()
    .setName('skill')
    .setDescription('المهارات')
    .addSubcommand((s) => s.setName('list').setDescription('مهاراتك والمهارات المتاحة'))
    .addSubcommand((s) =>
      s
        .setName('learn')
        .setDescription('تعلّم مهارة أو ارفع رتبتها (نقطة مهارة واحدة)')
        .addStringOption((o) => o.setName('skill').setDescription('المهارة').setRequired(true).setAutocomplete(true)),
    ),
  defer: 'public',
  autocomplete: (i) => skillAutocomplete(i.options.getFocused(), i.user.id),
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'list') return send(i, await skillsMessage(await requireByUser(uid), uid));
    const { skill, rank } = await learnSkill(uid, i.options.getString('skill', true));
    const ch = await requireByUser(uid);
    const buf = await renderNotice({
      title: rank === 1 ? 'مهارة جديدة!' : 'ارتقاء المهارة',
      subtitle: `${ch.name} ${rank === 1 ? 'تعلّم' : 'طوّر'} ${skill.name_ar}`,
      iconName: 'zap',
      color: theme.violet,
      highlight: `RANK ${rank}`,
      body: skill.description ?? '',
      footerText: `نقاط المهارة المتبقية: ${ch.skillPoints}`,
    });
    return send(i, { files: [card(buf, 'skill')] });
  },
};

// /faction -----------------------------------------------------------------------
export const factionCommand = {
  data: new SlashCommandBuilder()
    .setName('faction')
    .setDescription('فصائل نكسس وسمعتك لديها')
    .addSubcommand((s) => s.setName('list').setDescription('مكانتك لدى كل الفصائل'))
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('تفاصيل فصيل')
        .addStringOption((o) => o.setName('faction').setDescription('الفصيل').setRequired(true).setAutocomplete(true)),
    ),
  defer: 'public',
  async autocomplete(i) {
    const q = i.options.getFocused().toLowerCase();
    return (await listFactions())
      .filter((f) => !q || f.name_ar.includes(q) || f.name.toLowerCase().includes(q))
      .map((f) => ({ name: `${f.name_ar} (${f.name})`, value: f.key }));
  },
  async execute(i, { sub }) {
    const ch = await requireByUser(i.user.id);
    const list = await standings(ch.id);
    if (sub === 'list') {
      const buf = await renderList({
        title: 'الفصائل',
        subtitle: `مكانة ${ch.name} في عالم نكسس`,
        iconName: 'flag',
        rows: list.map((f) => ({
          title: f.name_ar,
          subtitle: `${f.rank.label}${f.next ? ` • ${fmt(f.next.min - f.rep)} حتى «${f.next.label}»` : ' • أعلى رتبة'}`,
          iconName: 'flag',
          color: f.color,
          value: fmt(f.rep),
          valueSub: 'السمعة',
          progress: f.next ? progressBetween(f.rep, f.rank.min, f.next.min) : 1,
          progressColors: [f.color, f.rank.color],
        })),
        footerText: 'ترتفع السمعة من المهام والوظائف والأحداث',
      });
      return send(i, { files: [card(buf, 'factions')] });
    }
    const f = await getFaction(i.options.getString('faction', true));
    if (!f) throw new UserError('لم أجد هذا الفصيل');
    const mine = list.find((x) => x.id === f.id);
    const rank = rankFor(mine?.rep ?? 0);
    const next = nextRank(mine?.rep ?? 0);
    const buf = await renderNotice({
      title: f.name_ar,
      subtitle: f.name,
      iconName: 'flag',
      color: f.color,
      highlight: rank.label,
      tiles: [
        { label: 'سمعتك', value: fmt(mine?.rep ?? 0), iconName: 'crown', color: rank.color },
        { label: 'الرتبة التالية', value: next ? next.label : '—', iconName: 'sparkle' },
        { label: 'الحلفاء', value: String(mine?.allies ?? 0), iconName: 'users' },
      ],
      body: f.description ?? '',
    });
    return send(i, { files: [card(buf, 'faction')] });
  },
};

const progressBetween = (v, a, b) => (Number.isFinite(a) ? Math.max(0, Math.min(1, (v - a) / (b - a))) : Math.max(0, Math.min(1, (v + 100) / (b + 100))));

// /job ---------------------------------------------------------------------------
export const jobCommand = {
  data: new SlashCommandBuilder()
    .setName('job')
    .setDescription('الوظائف والعمل')
    .addSubcommand((s) => s.setName('list').setDescription('الوظائف المتاحة'))
    .addSubcommand((s) =>
      s
        .setName('select')
        .setDescription('اختر وظيفتك')
        .addStringOption((o) => o.setName('job').setDescription('الوظيفة').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName('work').setDescription('اعمل وردية واكسب NX')),
  defer: 'public',
  async autocomplete(i) {
    const q = i.options.getFocused();
    return (await listJobs())
      .filter((j) => !q || j.name_ar.includes(q) || j.name.toLowerCase().includes(q.toLowerCase()))
      .map((j) => ({ name: `${j.name_ar} — مستوى ${j.min_level} • ${j.base_pay} NX`.slice(0, 100), value: j.key }));
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'list') {
      const ch = await findByUser(uid);
      const history = ch ? await jobHistory(ch.id) : [];
      const buf = await renderList({
        title: 'لوحة الوظائف',
        subtitle: ch?.job ? `وظيفتك الحالية: ${ch.job.nameAr}` : 'اختر وظيفة عبر /job select',
        iconName: 'briefcase',
        rows: (await listJobs()).map((j) => {
          const h = history.find((x) => x.job_id === j.id);
          return {
            title: j.name_ar,
            subtitle: `${STAT_LABELS[j.main_stat] ?? j.main_stat} • ${j.energy_cost} طاقة • كل ${Math.round(j.cooldown_seconds / 60)} دقيقة${j.faction_name ? ` • ${j.faction_name}` : ''}`,
            iconName: 'briefcase',
            color: ch?.job?.id === j.id ? theme.gold : ch && ch.level < j.min_level ? theme.textMute : theme.cyan,
            value: `${j.base_pay} NX`,
            valueSub: h ? `مستوى الوظيفة ${h.job_level}` : `يتطلب LV ${j.min_level}`,
            highlight: ch?.job?.id === j.id,
            dim: ch ? ch.level < j.min_level : false,
          };
        }),
        rowHeight: 66,
      });
      return send(i, { files: [card(buf, 'jobs')] });
    }
    if (sub === 'select') {
      const job = await selectJob(uid, i.options.getString('job', true));
      return send(i, ok(`أصبحت تعمل **${job.name_ar}**. ابدأ ورديتك الأولى عبر /job work`));
    }
    const res = await work(uid);
    const ch = await requireByUser(uid);
    const buf = await renderNotice({
      title: `وردية ${res.job.name_ar}`,
      subtitle: res.tip ? 'يوم موفق! حصلت على إكرامية' : 'انتهت الوردية بنجاح',
      iconName: 'briefcase',
      color: theme.gold,
      highlight: `+${fmt(res.pay)} NX`,
      avatar: await characterImage(ch.id, ch.userId),
      avatarLabel: ch.name,
      tiles: [
        { label: 'خبرة', value: `+${res.xp?.gained ?? res.job.xp_reward} XP`, iconName: 'sparkle' },
        { label: 'مستوى الوظيفة', value: `${res.jobLevel}${res.jobLevelUp ? ' ↑' : ''}`, iconName: 'briefcase' },
        { label: 'الطاقة', value: `${ch.energy} / ${ch.maxEnergy}`, iconName: 'zap', color: theme.energy?.[0] ?? theme.cyan },
      ],
      footerText: `رصيدك الآن ${compact(ch.nx)} NX`,
    });
    await send(i, { files: [card(buf, 'work')] });
    if (res.xp?.levelsGained > 0) await i.followUp({ files: [card(await levelUpCard(ch, res.xp), 'level-up')] });
    if (res.unlocked?.length) await i.followUp(ok(`🏆 إنجاز جديد: ${res.unlocked.map((a) => a.name_ar).join('، ')}`));
  },
};

// /achievements ------------------------------------------------------------------
export const achievementsCommand = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('إنجازاتك')
    .addUserOption((o) => o.setName('user').setDescription('لاعب آخر')),
  defer: 'public',
  async execute(i) {
    const target = i.options.getUser('user') ?? i.user;
    const ch = await findByUser(target.id);
    if (!ch) throw new UserError(target.id === i.user.id ? 'ليس لديك شخصية بعد. استخدم /character create' : 'هذا اللاعب لا يملك شخصية');
    return send(i, await achievementsMessage(ch));
  },
};

// /relation ----------------------------------------------------------------------
let typeChoices = null;
export const relationCommand = {
  data: new SlashCommandBuilder()
    .setName('relation')
    .setDescription('علاقات شخصيتك')
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('حدّد علاقتك بشخصية أخرى')
        .addUserOption((o) => o.setName('user').setDescription('اللاعب').setRequired(true))
        .addStringOption((o) => o.setName('type').setDescription('نوع العلاقة').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('note').setDescription('ملاحظة قصيرة').setMaxLength(120)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('أزل علاقة')
        .addUserOption((o) => o.setName('user').setDescription('اللاعب').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('شبكة العلاقات')
        .addUserOption((o) => o.setName('user').setDescription('لاعب آخر')),
    ),
  defer: 'public',
  async autocomplete(i) {
    typeChoices ??= (await relationshipTypes()).map((t) => ({ name: t.name_ar, value: t.key }));
    const q = i.options.getFocused();
    return typeChoices.filter((t) => !q || t.name.includes(q) || t.value.includes(q));
  },
  async execute(i, { sub }) {
    const uid = i.user.id;
    if (sub === 'set') {
      const target = i.options.getUser('user', true);
      const { b, type } = await setRelationship(uid, target.id, i.options.getString('type', true), i.options.getString('note'));
      return send(i, ok(`تم تسجيل **${b.name}** كـ «${type.name_ar}».`));
    }
    if (sub === 'remove') {
      const b = await removeRelationship(uid, i.options.getUser('user', true).id);
      return send(i, ok(`أُزيلت العلاقة مع **${b.name}**.`));
    }
    const target = i.options.getUser('user') ?? i.user;
    const ch = await findByUser(target.id);
    if (!ch) throw new UserError('هذا اللاعب لا يملك شخصية');
    const rels = await listRelationships(ch.id);
    const buf = await renderList({
      title: `علاقات ${ch.name}`,
      subtitle: `${rels.length} علاقة`,
      iconName: 'heart',
      color: theme.violet,
      rows: rels.slice(0, 12).map((r) => ({
        title: r.name,
        subtitle: [r.code, r.note].filter(Boolean).join(' • '),
        iconName: 'heart',
        color: r.color ?? theme.violet,
        value: r.type_name,
        valueSub: r.mutual ? 'علاقة متبادلة' : '',
      })),
      valueFamily: 'ar',
      emptyText: 'لا توجد علاقات مسجلة بعد. استخدم /relation set',
      rowHeight: 68,
    });
    return send(i, { files: [card(buf, 'relations')] });
  },
};

// /guild -------------------------------------------------------------------------
const userOpt = (s) => s.addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true));
const amountOpt = (s) => s.addStringOption((o) => o.setName('amount').setDescription('المبلغ (مثال 500 أو 2k)').setRequired(true));

export const guildCommand = {
  data: new SlashCommandBuilder()
    .setName('guild')
    .setDescription('النقابات')
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription(`أسّس نقابة (${economy.guildCreateCost} NX، مستوى ${economy.guildCreateMinLevel})`)
        .addStringOption((o) => o.setName('name').setDescription('اسم النقابة').setRequired(true).setMinLength(3).setMaxLength(32))
        .addStringOption((o) => o.setName('tag').setDescription('رمز من 2-5 أحرف إنجليزية').setRequired(true).setMinLength(2).setMaxLength(5))
        .addStringOption((o) => o.setName('description').setDescription('وصف النقابة').setMaxLength(300)),
    )
    .addSubcommand((s) =>
      s
        .setName('profile')
        .setDescription('بطاقة النقابة')
        .addStringOption((o) => o.setName('guild').setDescription('نقابة أخرى').setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('members')
        .setDescription('أعضاء النقابة')
        .addStringOption((o) => o.setName('guild').setDescription('نقابة أخرى').setAutocomplete(true)),
    )
    .addSubcommand((s) => userOpt(s.setName('invite').setDescription('ادعُ لاعباً')))
    .addSubcommand((s) =>
      s
        .setName('accept')
        .setDescription('اقبل دعوة نقابة')
        .addStringOption((o) => o.setName('guild').setDescription('النقابة').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName('leave').setDescription('غادر نقابتك'))
    .addSubcommand((s) => userOpt(s.setName('promote').setDescription('رقِّ عضواً (عضو ← ضابط ← قائد)')))
    .addSubcommand((s) => userOpt(s.setName('demote').setDescription('خفّض ضابطاً إلى عضو')))
    .addSubcommand((s) => userOpt(s.setName('kick').setDescription('اطرد عضواً')))
    .addSubcommand((s) => amountOpt(s.setName('deposit').setDescription('أودع NX في الخزينة')))
    .addSubcommand((s) => amountOpt(s.setName('withdraw').setDescription('اسحب من الخزينة (القائد)')))
    .addSubcommand((s) => s.setName('disband').setDescription('حلّ النقابة نهائياً')),
  defer: (i, { sub }) => (sub === 'disband' ? 'ephemeral' : 'public'),
  autocomplete: (i) => guilds.guildAutocomplete(i.options.getFocused()),
  async execute(i, { sub }) {
    const uid = i.user.id;
    const resolveGuild = async () => {
      const input = i.options.getString('guild');
      const id = input ?? (await guilds.myGuildId(uid));
      if (!id) throw new UserError('لست عضواً في نقابة. حدّد نقابة أو أسّس واحدة عبر /guild create');
      const g = await guilds.getGuild(id);
      if (!g) throw new UserError('لم أجد هذه النقابة');
      return g;
    };
    switch (sub) {
      case 'create': {
        const g = await guilds.createGuild(uid, {
          name: i.options.getString('name', true),
          tag: i.options.getString('tag', true),
          description: i.options.getString('description') ?? '',
        });
        return send(i, { ...ok(`تأسست نقابة **${g.name}** [${g.tag}]!`), files: [card(await guildCard(await guilds.getGuild(g.id)), 'guild')] });
      }
      case 'profile':
        return send(i, { files: [card(await guildCard(await resolveGuild()), 'guild')] });
      case 'members':
        return send(i, { files: [card(await guildMembersCard(await resolveGuild()), 'guild-members')] });
      case 'invite': {
        const target = i.options.getUser('user', true);
        if (target.bot) throw new UserError('لا يمكن دعوة بوت');
        const res = await guilds.invite(uid, target.id);
        return send(i, {
          content: `<@${target.id}>`,
          allowedMentions: { users: [target.id] },
          ...info(`🛡️ **${res.inviter.name}** يدعو **${res.target.name}** للانضمام إلى نقابة **${res.guild.name}** [${res.guild.tag}]. الدعوة صالحة 24 ساعة.`),
          components: [
            row(
              button(cid('gi', 'accept', res.guild.id, target.id), 'قبول الدعوة', ButtonStyle.Success, { emoji: '🛡️' }),
              button(cid('gi', 'decline', res.guild.id, target.id), 'رفض', ButtonStyle.Secondary),
            ),
          ],
        });
      }
      case 'accept': {
        const g = await guilds.acceptInvite(uid, Number(i.options.getString('guild', true)) || 0);
        return send(i, ok(`انضممت إلى **${g.name}** [${g.tag}]! مرحباً بك.`));
      }
      case 'leave': {
        const res = await guilds.leave(uid);
        return send(i, ok(res.disbanded ? `غادرت **${res.name}** وأُغلقت النقابة لأنك كنت آخر عضو.` : `غادرت **${res.name}**.`));
      }
      case 'promote': {
        const res = await guilds.promote(uid, i.options.getUser('user', true).id);
        return send(i, ok(res.role === 'leader' ? `سُلّمت القيادة إلى **${res.target.name}**. أصبحت ضابطاً.` : `أصبح **${res.target.name}** ضابطاً.`));
      }
      case 'demote': {
        const res = await guilds.demote(uid, i.options.getUser('user', true).id);
        return send(i, ok(`أصبح **${res.target.name}** عضواً عادياً.`));
      }
      case 'kick': {
        const res = await guilds.kick(uid, i.options.getUser('user', true).id);
        return send(i, ok(`طُرد **${res.target.name}** من ${res.guild}.`));
      }
      case 'deposit': {
        const res = await guilds.deposit(uid, parseAmount(i.options.getString('amount', true)));
        return send(i, ok(`تم الإيداع. خزينة **${res.guild}**: ${fmt(res.treasury)} NX`));
      }
      case 'withdraw': {
        const res = await guilds.withdraw(uid, parseAmount(i.options.getString('amount', true)));
        return send(i, ok(`تم السحب. خزينة **${res.guild}**: ${fmt(res.treasury)} NX`));
      }
      case 'disband': {
        const g = await resolveGuild();
        return send(i, {
          ...info(`⚠️ هل تريد حلّ **${g.name}** نهائياً؟ سيُحذف الأعضاء والخزينة (${fmt(Number(g.treasury))} NX). **لا يمكن التراجع.**`),
          components: [confirmRow('gi', 'disband', uid, g.id)],
        });
      }
      default:
        throw new UserError('أمر غير معروف');
    }
  },
};

/** gi:* — invite accept/decline buttons and the disband confirmation. */
export const guildComponent = {
  prefix: 'gi',
  async handle(i, { action, args }) {
    if (action === 'disband') {
      const [owner, exp] = args;
      assertOwner(i, owner, { ttlMs: 0 });
      assertNotExpired(exp);
      const g = await guilds.disband(i.user.id);
      return i.update({ ...ok(`حُلّت نقابة **${g.name}**.`), components: [] });
    }
    const [guildId, target] = args;
    assertOwner(i, target, { ttlMs: 0 });
    if (action === 'decline') return i.update({ ...info('رُفضت الدعوة.'), components: [] });
    if (action === 'accept') {
      const g = await guilds.acceptInvite(i.user.id, Number(guildId));
      return i.update({ ...ok(`انضم <@${i.user.id}> إلى **${g.name}** [${g.tag}]!`), content: null, components: [] });
    }
    throw new UserError('إجراء غير معروف');
  },
};
