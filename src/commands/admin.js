import { resetClass } from '../services/classes.js';
import { setStoryProgress } from '../services/story.js';
import { CHAPTERS } from '../content/story/index.js';

const STORY_CHAPTERS = CHAPTERS.length;
import { resetBoard } from '../services/dailies.js';
import { forgetImage } from '../views/avatars.js';
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { cid } from '../core/customId.js';
import { send, ok, info, card, confirmRow, assertOwner, assertNotExpired } from '../core/ui.js';
import { UserError } from '../core/errors.js';
import { requireCap } from '../core/interactions.js';
import { getPool, tx } from '../db/pool.js';
import { theme } from '../render/theme.js';
import { renderList } from '../render/index.js';
import { STATS, STAT_LABELS, RARITIES, RARITY_LABELS, ITEM_TYPES, ITEM_TYPE_LABELS, DIFFICULTY_LABELS } from '../config/game.js';
import { fmt, truncate } from '../utils/format.js';
import { cleanText, slugify } from '../utils/validation.js';
import { findByUser, findByCode, deleteCharacter, setStats, grantXp, loadCharacter } from '../services/characters.js';
import { adminAdjust } from '../services/economy.js';
import { adminGive, createItem, searchItems } from '../services/inventory.js';
import { disband, guildAutocomplete, getGuild } from '../services/guilds.js';
import { createFaction, adminSetRep, getFaction, listFactions } from '../services/factions.js';
import { setSetting, allSettings, invalidateSettings } from '../services/settings.js';
import { ACTION_LABELS, audit } from '../services/audit.js';
import { createQuest, setQuestActive, pendingReviews, review, parseObjectives, questAutocomplete } from '../services/quests.js';
import { createNpc, addDialogue, setShopItem, npcAutocomplete } from '../services/npcs.js';
import {
  createEvent,
  addPhase,
  advance,
  endEvent,
  addContribution,
  eventAutocomplete,
  setEventMessage,
  getEvent,
  listRandomEventDefs,
  setRandomEventEnabled,
  spawnRandomEvent,
  setRandomEventMessage,
} from '../services/events.js';
import { createLocation, setLocationFlags, upsertLore, deleteLore, getLocation, listLocations } from '../services/world.js';
import { profileMessage } from '../views/character.js';
import { eventMessage } from '../views/social.js';
import { randomEventMessage, refreshEventMessage } from './event.js';

// Helpers -----------------------------------------------------------------------

/** Whole-number settings with their allowed range. */
const NUMERIC_LIMITS = {
  pvp_xp_loss_pct: [0, 90, 'نسبة الخسارة'],
  pve_xp_loss_pct: [0, 90, 'نسبة الخسارة'],
  daily_reset_offset_hours: [-12, 14, 'فرق التوقيت'],
  daily_free_rerolls: [0, 6, 'عدد التبديلات'],
};
const reasonOpt = (s) => s.addStringOption((o) => o.setName('reason').setDescription('السبب (يُسجَّل)').setMaxLength(200));
const userOpt = (s, req = true) => s.addUserOption((o) => o.setName('user').setDescription('اللاعب').setRequired(req));
const choices = (labels) => Object.entries(labels).map(([value, name]) => ({ name, value }));

async function targetCharacter(i) {
  const user = i.options.getUser('user');
  const code = i.options.getString('code');
  const ch = user ? await findByUser(user.id) : code ? await findByCode(code) : null;
  if (!ch) throw new UserError('لم أجد الشخصية. حدّد لاعباً أو رقم الهوية NX-000000');
  return ch;
}

/** Parses "a=1, b=text" into an object, converting numbers. */
export function parseKv(text) {
  const out = {};
  for (const part of String(text ?? '').split(/[,\n،]/)) {
    const [k, ...rest] = part.split('=');
    const key = k?.trim();
    if (!key) continue;
    const raw = rest.join('=').trim();
    out[key] = raw === '' || raw === 'true' ? true : raw === 'false' ? false : Number.isFinite(Number(raw)) ? Number(raw) : raw;
  }
  return out;
}

const textInput = (id, label, { style = TextInputStyle.Short, required = false, max = 200, placeholder, value } = {}) => {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(style).setRequired(required).setMaxLength(max);
  if (placeholder) t.setPlaceholder(placeholder.slice(0, 100));
  if (value) t.setValue(value);
  return new ActionRowBuilder().addComponents(t);
};

// /admin ------------------------------------------------------------------------
export const adminCommand = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('أدوات الإدارة')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommandGroup((g) =>
      g
        .setName('character')
        .setDescription('الشخصيات')
        .addSubcommand((s) =>
          userOpt(s.setName('view').setDescription('اعرض شخصية'), false).addStringOption((o) => o.setName('code').setDescription('رقم الهوية NX-')),
        )
        .addSubcommand((s) =>
          reasonOpt(
            userOpt(s.setName('setstat').setDescription('عيّن إحصائية'))
              .addStringOption((o) =>
                o
                  .setName('stat')
                  .setDescription('الإحصائية')
                  .setRequired(true)
                  .addChoices(...choices(STAT_LABELS)),
              )
              .addIntegerOption((o) => o.setName('value').setDescription('القيمة').setRequired(true).setMinValue(0).setMaxValue(999)),
          ),
        )
        .addSubcommand((s) =>
          reasonOpt(
            userOpt(s.setName('xp').setDescription('امنح خبرة')).addIntegerOption((o) =>
              o.setName('amount').setDescription('XP').setRequired(true).setMinValue(1).setMaxValue(1_000_000),
            ),
          ),
        )
        .addSubcommand((s) => reasonOpt(userOpt(s.setName('heal').setDescription('شفاء كامل وطاقة كاملة'))))
        .addSubcommand((s) => reasonOpt(userOpt(s.setName('unlock').setDescription('حرّر لاعباً عالقاً في قتال'))))
        .addSubcommand((s) => reasonOpt(userOpt(s.setName('classreset').setDescription('أزل كلاس اللاعب ومساره (تُسترد نقاط المهارة)'))))
        .addSubcommand((s) =>
          reasonOpt(
            userOpt(s.setName('story').setDescription('اضبط تقدم اللاعب في القصة')).addIntegerOption((o) =>
              o
                .setName('chapters')
                .setDescription('عدد الفصول المكتملة (0 يعيد القصة من البداية)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(STORY_CHAPTERS),
            ),
          ),
        )
        .addSubcommand((s) => reasonOpt(userOpt(s.setName('dailyreset').setDescription('أعد توليد مهام اللاعب اليومية'))))
        .addSubcommand((s) => reasonOpt(userOpt(s.setName('delete').setDescription('احذف شخصية (مع تأكيد)')))),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('economy')
        .setDescription('الاقتصاد')
        .addSubcommand((s) =>
          reasonOpt(
            userOpt(s.setName('add').setDescription('أضف NX')).addIntegerOption((o) =>
              o.setName('amount').setDescription('المبلغ').setRequired(true).setMinValue(1),
            ),
          ),
        )
        .addSubcommand((s) =>
          reasonOpt(
            userOpt(s.setName('remove').setDescription('اخصم NX')).addIntegerOption((o) =>
              o.setName('amount').setDescription('المبلغ').setRequired(true).setMinValue(1),
            ),
          ),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('item')
        .setDescription('الأغراض')
        .addSubcommand((s) =>
          reasonOpt(
            userOpt(s.setName('give').setDescription('أعطِ غرضاً'))
              .addStringOption((o) => o.setName('item').setDescription('الغرض').setRequired(true).setAutocomplete(true))
              .addIntegerOption((o) => o.setName('qty').setDescription('الكمية').setMinValue(1).setMaxValue(999)),
          ),
        )
        .addSubcommand((s) =>
          reasonOpt(
            userOpt(s.setName('take').setDescription('اسحب غرضاً'))
              .addStringOption((o) => o.setName('item').setDescription('الغرض').setRequired(true).setAutocomplete(true))
              .addIntegerOption((o) => o.setName('qty').setDescription('الكمية').setMinValue(1).setMaxValue(999)),
          ),
        )
        .addSubcommand((s) =>
          s
            .setName('create')
            .setDescription('أنشئ غرضاً جديداً')
            .addStringOption((o) =>
              o
                .setName('type')
                .setDescription('النوع')
                .setRequired(true)
                .addChoices(...choices(ITEM_TYPE_LABELS)),
            )
            .addStringOption((o) =>
              o
                .setName('rarity')
                .setDescription('الندرة')
                .setRequired(true)
                .addChoices(...choices(RARITY_LABELS)),
            )
            .addIntegerOption((o) => o.setName('value').setDescription('السعر الأساسي').setMinValue(0))
            .addNumberOption((o) => o.setName('weight').setDescription('الوزن').setMinValue(0)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('guild')
        .setDescription('النقابات')
        .addSubcommand((s) =>
          reasonOpt(
            s
              .setName('disband')
              .setDescription('حلّ نقابة')
              .addStringOption((o) => o.setName('guild').setDescription('النقابة').setRequired(true).setAutocomplete(true)),
          ),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('faction')
        .setDescription('الفصائل')
        .addSubcommand((s) =>
          s
            .setName('create')
            .setDescription('أنشئ فصيلاً')
            .addStringOption((o) => o.setName('key').setDescription('مفتاح إنجليزي').setRequired(true))
            .addStringOption((o) => o.setName('name').setDescription('الاسم بالإنجليزية').setRequired(true))
            .addStringOption((o) => o.setName('name_ar').setDescription('الاسم بالعربية').setRequired(true))
            .addStringOption((o) => o.setName('color').setDescription('لون HEX'))
            .addStringOption((o) => o.setName('description').setDescription('الوصف').setMaxLength(300)),
        )
        .addSubcommand((s) =>
          reasonOpt(
            userOpt(s.setName('rep').setDescription('عدّل سمعة لاعب'))
              .addStringOption((o) => o.setName('faction').setDescription('الفصيل').setRequired(true).setAutocomplete(true))
              .addIntegerOption((o) => o.setName('delta').setDescription('التغيير (+/-)').setRequired(true)),
          ),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('settings')
        .setDescription('الإعدادات')
        .addSubcommand((s) => s.setName('view').setDescription('كل الإعدادات'))
        .addSubcommand((s) =>
          s
            .setName('set')
            .setDescription('غيّر إعداداً')
            .addStringOption((o) =>
              o
                .setName('key')
                .setDescription('المفتاح')
                .setRequired(true)
                .addChoices(
                  { name: 'مضاعف XP', value: 'xp_multiplier' },
                  { name: 'مضاعف NX', value: 'nx_multiplier' },
                  { name: 'XP الرول بلاي', value: 'rp_xp_enabled' },
                  { name: 'الأحداث العشوائية', value: 'random_events_enabled' },
                  { name: 'قنوات الرول بلاي', value: 'rp_channel_ids' },
                  { name: 'قنوات الأحداث العشوائية', value: 'random_event_channel_ids' },
                  { name: 'قناة لوحة المهام', value: 'quest_board_channel_id' },
                  { name: 'قناة الإعلانات', value: 'announce_channel_id' },
                  { name: 'خسارة XP في المبارزة %', value: 'pvp_xp_loss_pct' },
                  { name: 'خسارة XP أمام الوحوش %', value: 'pve_xp_loss_pct' },
                  { name: 'سقوط العناصر في المبارزة', value: 'pvp_item_drop_enabled' },
                  { name: 'ساعة تجدد المهام (فرق التوقيت)', value: 'daily_reset_offset_hours' },
                  { name: 'التبديلات المجانية يومياً', value: 'daily_free_rerolls' },
                  { name: 'هدف السيرفر اليومي', value: 'world_goal_enabled' },
                  { name: 'الاستكشاف', value: 'explore_enabled' },
                ),
            )
            .addStringOption((o) => o.setName('value').setDescription('القيمة (رقم، true/false، أو معرفات مفصولة بفواصل)').setRequired(true)),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('logs')
        .setDescription('سجل الإدارة')
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription('نوع الإجراء')
            .addChoices(...choices(ACTION_LABELS).slice(0, 25)),
        )
        .addUserOption((o) => o.setName('actor').setDescription('المنفّذ')),
    ),

  defer: (i, { group, sub }) => (group === 'item' && sub === 'create' ? false : 'ephemeral'),

  async autocomplete(i) {
    const f = i.options.getFocused(true);
    if (f.name === 'item') return (await searchItems(f.value)).map((it) => ({ name: `${it.nameAr} (${it.key})`.slice(0, 100), value: it.key }));
    if (f.name === 'guild') return guildAutocomplete(f.value);
    if (f.name === 'faction') return (await listFactions()).map((x) => ({ name: x.name_ar, value: x.key }));
    return [];
  },

  async execute(i, { group, sub }) {
    const actorId = i.user.id;
    const reason = i.options.getString('reason') ?? null;
    const key = `${group ?? ''}.${sub}`;

    switch (key) {
      case 'character.view': {
        requireCap(i, 'manageCharacters');
        const ch = await targetCharacter(i);
        return send(i, {
          ...(await profileMessage(ch, actorId)),
          ...info(`**${ch.name}** • ${ch.code} • <@${ch.userId}> • NX ${fmt(ch.nx)} • نقاط ${ch.statPoints}/${ch.skillPoints}`),
        });
      }
      case 'character.setstat': {
        requireCap(i, 'manageCharacters');
        const ch = await targetCharacter(i);
        const stat = i.options.getString('stat', true);
        await setStats(ch.id, { [stat]: i.options.getInteger('value', true) }, { actorId, reason });
        return send(i, ok(`${STAT_LABELS[stat]} لـ **${ch.name}** أصبحت ${i.options.getInteger('value', true)}.`));
      }
      case 'character.xp': {
        requireCap(i, 'manageCharacters');
        const ch = await targetCharacter(i);
        const amount = i.options.getInteger('amount', true);
        const res = await tx(async (db) => {
          const r = await grantXp(db, ch.id, amount, { ignoreMultiplier: true });
          await audit({ actorId, action: 'admin_action', targetType: 'character', targetId: ch.code, after: { xp: amount }, reason: reason ?? 'grant xp' }, db);
          return r;
        });
        return send(i, ok(`منحت **${ch.name}** ${fmt(amount)} XP. المستوى الآن ${res.level}.`));
      }
      case 'character.heal': {
        requireCap(i, 'manageCharacters');
        const ch = await targetCharacter(i);
        await getPool().query('UPDATE characters SET hp = $2, energy = $3, vitals_at = now() WHERE id = $1', [ch.id, ch.maxHp, ch.maxEnergy]);
        await audit({ actorId, action: 'admin_action', targetType: 'character', targetId: ch.code, reason: reason ?? 'heal' });
        return send(i, ok(`استعاد **${ch.name}** صحته وطاقته بالكامل.`));
      }
      case 'character.unlock': {
        requireCap(i, 'manageCharacters');
        const ch = await targetCharacter(i);
        await tx(async (db) => {
          await db.query(
            `UPDATE combat_sessions SET status = 'cancelled', finished_at = now()
             WHERE status IN ('pending','active') AND id IN (SELECT session_id FROM combat_locks WHERE character_id = $1)`,
            [ch.id],
          );
          await db.query('DELETE FROM combat_locks WHERE session_id IN (SELECT session_id FROM combat_locks WHERE character_id = $1)', [ch.id]);
          await audit({ actorId, action: 'admin_action', targetType: 'character', targetId: ch.code, reason: reason ?? 'combat unlock' }, db);
        });
        return send(i, ok(`حُرّر **${ch.name}** من أي قتال عالق.`));
      }
      case 'character.classreset': {
        requireCap(i, 'manageCharacters');
        const ch = await targetCharacter(i);
        const res = await resetClass(ch.id, { actorId, reason });
        forgetImage(ch.id);
        return send(i, ok(`أُزيل كلاس **${ch.name}**، واستُرد ${res.refund} من نقاط المهارة. يمكنه الاختيار من جديد مجاناً عبر /class browse.`));
      }
      case 'character.story': {
        requireCap(i, 'manageCharacters');
        const ch = await targetCharacter(i);
        const n = i.options.getInteger('chapters', true);
        await setStoryProgress(ch.id, n, { actorId, reason });
        return send(i, ok(`تقدم **${ch.name}** في القصة أصبح ${n} فصلاً مكتملاً.`));
      }
      case 'character.dailyreset': {
        requireCap(i, 'manageCharacters');
        const ch = await targetCharacter(i);
        await resetBoard(ch.id, { actorId });
        return send(i, ok(`أُعيد توليد مهام **${ch.name}** اليومية. ستظهر لوحة جديدة في /daily.`));
      }
      case 'character.delete': {
        requireCap(i, 'deleteCharacters');
        const ch = await targetCharacter(i);
        return send(i, {
          ...info(`⚠️ حذف **${ch.name}** (${ch.code}) نهائياً؟ سيُفقد كل تقدمه. **لا يمكن التراجع.**`),
          components: [confirmRow('adm', 'chardel', actorId, ch.id)],
        });
      }
      case 'economy.add':
      case 'economy.remove': {
        requireCap(i, 'manageEconomy');
        const ch = await targetCharacter(i);
        const amount = i.options.getInteger('amount', true);
        const nx = await adminAdjust(ch.id, sub === 'add' ? amount : -amount, { actorId, reason });
        return send(i, ok(`${sub === 'add' ? 'أُضيف' : 'خُصم'} ${fmt(amount)} NX ${sub === 'add' ? 'إلى' : 'من'} **${ch.name}**. الرصيد: ${fmt(nx)} NX`));
      }
      case 'item.give':
      case 'item.take': {
        requireCap(i, 'manageItems');
        const ch = await targetCharacter(i);
        const qty = i.options.getInteger('qty') ?? 1;
        const item = await adminGive(ch.id, i.options.getString('item', true), sub === 'give' ? qty : -qty, { actorId, reason });
        return send(i, ok(`${sub === 'give' ? 'أُعطي' : 'سُحب'} ${qty}× **${item.nameAr}** ${sub === 'give' ? 'لـ' : 'من'} **${ch.name}**.`));
      }
      case 'item.create': {
        requireCap(i, 'manageItems');
        const type = i.options.getString('type', true);
        const params = [type, i.options.getString('rarity', true), i.options.getInteger('value') ?? 0, i.options.getNumber('weight') ?? 1];
        return i.showModal(
          new ModalBuilder()
            .setCustomId(cid('adm', 'item', ...params))
            .setTitle('غرض جديد')
            .addComponents(
              textInput('key', 'المفتاح (إنجليزي صغير)', { required: true, max: 40, placeholder: 'moon_blade' }),
              textInput('names', 'الاسم: English | عربي', { required: true, max: 100, placeholder: 'Moon Blade | نصل القمر' }),
              textInput('description', 'الوصف', { style: TextInputStyle.Paragraph, max: 300 }),
              textInput('stats', 'الإحصائيات (للمعدات)', { max: 200, placeholder: 'attack=12, agility=2' }),
              textInput('effect', 'تأثير الاستخدام (للمستهلكات)', { max: 200, placeholder: 'heal=60 أو buff=attack_up, minutes=20' }),
            ),
        );
      }
      case 'guild.disband': {
        requireCap(i, 'manageGuilds');
        const g = await getGuild(i.options.getString('guild', true));
        if (!g) throw new UserError('النقابة غير موجودة');
        return send(i, { ...info(`⚠️ حلّ نقابة **${g.name}** [${g.tag}] نهائياً؟`), components: [confirmRow('adm', 'guilddel', actorId, g.id)] });
      }
      case 'faction.create': {
        requireCap(i, 'manageFactions');
        const f = await createFaction(
          {
            key: i.options.getString('key', true),
            name: i.options.getString('name', true),
            nameAr: i.options.getString('name_ar', true),
            color: i.options.getString('color'),
            description: i.options.getString('description'),
          },
          { actorId },
        );
        return send(i, ok(`أُنشئ فصيل **${f.name_ar}**.`));
      }
      case 'faction.rep': {
        requireCap(i, 'manageFactions');
        const ch = await targetCharacter(i);
        const f = await getFaction(i.options.getString('faction', true));
        if (!f) throw new UserError('الفصيل غير موجود');
        const delta = i.options.getInteger('delta', true);
        await adminSetRep(ch.id, f.id, delta, { actorId, reason });
        return send(i, ok(`سمعة **${ch.name}** لدى ${f.name_ar}: ${delta > 0 ? '+' : ''}${delta}`));
      }
      case 'settings.view': {
        requireCap(i, 'manageSettings');
        const all = await allSettings();
        return send(
          i,
          info(
            Object.entries(all)
              .map(([k, v]) => `\`${k}\` = \`${truncate(JSON.stringify(v), 80)}\``)
              .join('\n') || 'لا إعدادات',
          ),
        );
      }
      case 'settings.set': {
        requireCap(i, 'manageSettings');
        const k = i.options.getString('key', true);
        const raw = i.options.getString('value', true).trim();
        let value;
        if (k.endsWith('_ids')) value = raw.split(/[\s,]+/).filter((x) => /^\d{15,22}$/.test(x));
        else if (k.endsWith('_id'))
          value = /^\d{15,22}$/.test(raw)
            ? raw
            : raw === 'none'
              ? null
              : (() => {
                  throw new UserError('معرف قناة غير صالح');
                })();
        else if (k.endsWith('_enabled')) value = ['true', 'on', '1', 'نعم'].includes(raw.toLowerCase());
        else if (NUMERIC_LIMITS[k]) {
          const [min, max, label] = NUMERIC_LIMITS[k];
          value = Number(raw);
          if (!Number.isInteger(value) || value < min || value > max) throw new UserError(`${label} يجب أن يكون رقماً صحيحاً بين ${min} و ${max}`);
        } else {
          value = Number(raw);
          if (!Number.isFinite(value) || value < 0 || value > 10) throw new UserError('المضاعف يجب أن يكون رقماً بين 0 و 10');
        }
        await setSetting(k, value);
        invalidateSettings();
        await audit({ actorId, action: 'admin_action', targetType: 'setting', targetId: k, after: { value } });
        return send(i, ok(`\`${k}\` = \`${JSON.stringify(value)}\``));
      }
      case '.logs': {
        requireCap(i, 'viewLogs');
        const action = i.options.getString('action');
        const actor = i.options.getUser('actor');
        const { rows } = await getPool().query(
          `SELECT * FROM admin_logs WHERE ($1::text IS NULL OR action = $1) AND ($2::text IS NULL OR actor_id = $2) ORDER BY created_at DESC LIMIT 12`,
          [action, actor?.id ?? null],
        );
        const names = new Map();
        for (const r of rows)
          if (r.actor_id && /^\d+$/.test(r.actor_id) && !names.has(r.actor_id))
            names.set(r.actor_id, (await i.client.users.fetch(r.actor_id).catch(() => null))?.username ?? r.actor_id);
        const buf = await renderList({
          title: 'سجل الإدارة',
          subtitle: action ? ACTION_LABELS[action] : 'آخر الإجراءات',
          iconName: 'book',
          color: theme.violet,
          rows: rows.map((r) => ({
            title: `${ACTION_LABELS[r.action] ?? r.action}${r.target_id ? ` • ${r.target_type ?? ''} ${r.target_id}` : ''}`,
            subtitle: [names.get(r.actor_id) ?? r.actor_id ?? 'system', r.reason].filter(Boolean).join(' • '),
            iconName: r.action.includes('deleted') || r.action.includes('removed') ? 'skull' : 'check',
            value: new Date(r.created_at).toISOString().slice(5, 16).replace('T', ' '),
          })),
          rowHeight: 62,
          emptyText: 'لا توجد سجلات',
        });
        return send(i, { files: [card(buf, 'logs')] });
      }
      default:
        throw new UserError('أمر غير معروف');
    }
  },
};

// /gm — world building: quests, NPCs, events, locations, lore ----------------------
export const gmCommand = {
  data: new SlashCommandBuilder()
    .setName('gm')
    .setDescription('أدوات صانع العالم')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommandGroup((g) =>
      g
        .setName('quest')
        .setDescription('المهام')
        .addSubcommand((s) =>
          s
            .setName('create')
            .setDescription('أنشئ مهمة')
            .addStringOption((o) =>
              o
                .setName('difficulty')
                .setDescription('الصعوبة')
                .setRequired(true)
                .addChoices(...choices(DIFFICULTY_LABELS)),
            )
            .addIntegerOption((o) => o.setName('xp').setDescription('XP').setMinValue(0).setMaxValue(100000))
            .addIntegerOption((o) => o.setName('nx').setDescription('NX').setMinValue(0).setMaxValue(1000000))
            .addIntegerOption((o) => o.setName('min_level').setDescription('أقل مستوى').setMinValue(1).setMaxValue(100))
            .addBooleanOption((o) => o.setName('review').setDescription('تحتاج مراجعة إدارية'))
            .addBooleanOption((o) => o.setName('repeatable').setDescription('قابلة للتكرار'))
            .addStringOption((o) => o.setName('location').setDescription('المكان').setAutocomplete(true))
            .addStringOption((o) => o.setName('reward_item').setDescription('غرض مكافأة').setAutocomplete(true))
            .addIntegerOption((o) => o.setName('time_limit').setDescription('مهلة بالدقائق').setMinValue(5)),
        )
        .addSubcommand((s) =>
          s
            .setName('toggle')
            .setDescription('فعّل/عطّل مهمة')
            .addStringOption((o) => o.setName('quest').setDescription('المهمة').setRequired(true).setAutocomplete(true))
            .addBooleanOption((o) => o.setName('active').setDescription('مفعّلة؟').setRequired(true)),
        )
        .addSubcommand((s) => s.setName('reviews').setDescription('المهام بانتظار المراجعة'))
        .addSubcommand((s) =>
          reasonOpt(
            s
              .setName('review')
              .setDescription('راجع مهمة')
              .addIntegerOption((o) => o.setName('id').setDescription('رقم المراجعة').setRequired(true))
              .addBooleanOption((o) => o.setName('approve').setDescription('قبول؟').setRequired(true)),
          ),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('npc')
        .setDescription('الشخصيات غير القابلة للعب')
        .addSubcommand((s) =>
          s
            .setName('create')
            .setDescription('أنشئ شخصية')
            .addStringOption((o) => o.setName('key').setDescription('مفتاح إنجليزي').setRequired(true))
            .addStringOption((o) => o.setName('name').setDescription('الاسم').setRequired(true))
            .addStringOption((o) => o.setName('title').setDescription('اللقب'))
            .addStringOption((o) => o.setName('location').setDescription('المكان').setAutocomplete(true))
            .addStringOption((o) => o.setName('greeting').setDescription('جملة الترحيب').setMaxLength(300))
            .addStringOption((o) => o.setName('color').setDescription('لون HEX')),
        )
        .addSubcommand((s) =>
          s
            .setName('dialogue')
            .setDescription('أضف حواراً')
            .addStringOption((o) => o.setName('npc').setDescription('الشخصية').setRequired(true).setAutocomplete(true))
            .addStringOption((o) => o.setName('text').setDescription('النص').setRequired(true).setMaxLength(400))
            .addIntegerOption((o) => o.setName('min_rep').setDescription('أقل سمعة مطلوبة')),
        )
        .addSubcommand((s) =>
          s
            .setName('shop')
            .setDescription('أضف/حدّث/أزل غرضاً في المتجر (سعر 0 = إزالة)')
            .addStringOption((o) => o.setName('npc').setDescription('التاجر').setRequired(true).setAutocomplete(true))
            .addStringOption((o) => o.setName('item').setDescription('الغرض').setRequired(true).setAutocomplete(true))
            .addIntegerOption((o) => o.setName('price').setDescription('السعر').setRequired(true).setMinValue(0))
            .addIntegerOption((o) => o.setName('stock').setDescription('المخزون (فارغ = غير محدود)').setMinValue(0)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('event')
        .setDescription('الأحداث')
        .addSubcommand((s) =>
          s
            .setName('create')
            .setDescription('أنشئ حدثاً')
            .addIntegerOption((o) => o.setName('starts_in').setDescription('يبدأ بعد (دقائق)').setMinValue(0).setMaxValue(43200))
            .addIntegerOption((o) => o.setName('duration').setDescription('المدة (دقائق)').setMinValue(5).setMaxValue(43200))
            .addIntegerOption((o) => o.setName('xp').setDescription('XP لكل مشارك').setMinValue(0))
            .addIntegerOption((o) => o.setName('nx').setDescription('NX لكل مشارك').setMinValue(0))
            .addIntegerOption((o) => o.setName('max').setDescription('أقصى عدد مشاركين').setMinValue(1))
            .addStringOption((o) => o.setName('location').setDescription('المكان').setAutocomplete(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('post')
            .setDescription('انشر بطاقة الحدث')
            .addStringOption((o) => o.setName('event').setDescription('الحدث').setRequired(true).setAutocomplete(true))
            .addChannelOption((o) => o.setName('channel').setDescription('القناة').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
        )
        .addSubcommand((s) =>
          s
            .setName('phase')
            .setDescription('أضف مرحلة')
            .addStringOption((o) => o.setName('event').setDescription('الحدث').setRequired(true).setAutocomplete(true))
            .addStringOption((o) => o.setName('title').setDescription('العنوان').setRequired(true).setMaxLength(80))
            .addStringOption((o) => o.setName('choices').setDescription('خيارات التصويت مفصولة بفواصل').setMaxLength(300))
            .addStringOption((o) => o.setName('description').setDescription('الوصف').setMaxLength(300)),
        )
        .addSubcommand((s) =>
          s
            .setName('advance')
            .setDescription('أنهِ المرحلة الحالية وانتقل للتالية')
            .addStringOption((o) => o.setName('event').setDescription('الحدث').setRequired(true).setAutocomplete(true))
            .addStringOption((o) => o.setName('note').setDescription('ملاحظة القصة').setMaxLength(200)),
        )
        .addSubcommand((s) =>
          s
            .setName('contribute')
            .setDescription('سجّل مساهمة مشارك')
            .addStringOption((o) => o.setName('event').setDescription('الحدث').setRequired(true).setAutocomplete(true))
            .addUserOption((o) => o.setName('user').setDescription('اللاعب').setRequired(true))
            .addIntegerOption((o) => o.setName('points').setDescription('النقاط').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('end')
            .setDescription('أنهِ الحدث ووزّع المكافآت')
            .addStringOption((o) => o.setName('event').setDescription('الحدث').setRequired(true).setAutocomplete(true))
            .addBooleanOption((o) => o.setName('cancel').setDescription('إلغاء بدون مكافآت')),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('world')
        .setDescription('العالم')
        .addSubcommand((s) =>
          s
            .setName('location')
            .setDescription('أنشئ مكاناً')
            .addStringOption((o) => o.setName('key').setDescription('مفتاح إنجليزي').setRequired(true))
            .addStringOption((o) => o.setName('name').setDescription('الاسم بالإنجليزية').setRequired(true))
            .addStringOption((o) => o.setName('name_ar').setDescription('الاسم بالعربية').setRequired(true))
            .addStringOption((o) => o.setName('description').setDescription('الوصف').setMaxLength(400))
            .addStringOption((o) =>
              o
                .setName('region')
                .setDescription('المنطقة')
                .addChoices(
                  { name: 'مدينة', value: 'city' },
                  { name: 'برية', value: 'wild' },
                  { name: 'زنزانة', value: 'dungeon' },
                  { name: 'بُعد', value: 'realm' },
                ),
            )
            .addStringOption((o) => o.setName('channel').setDescription('اسم قناة الرول بلاي المرتبطة'))
            .addNumberOption((o) => o.setName('x').setDescription('موقع الخريطة X (0-1)').setMinValue(0).setMaxValue(1))
            .addNumberOption((o) => o.setName('y').setDescription('موقع الخريطة Y (0-1)').setMinValue(0).setMaxValue(1))
            .addIntegerOption((o) => o.setName('danger').setDescription('الخطورة 0-5').setMinValue(0).setMaxValue(5))
            .addIntegerOption((o) => o.setName('min_level').setDescription('أقل مستوى').setMinValue(1)),
        )
        .addSubcommand((s) =>
          s
            .setName('flags')
            .setDescription('أقفل/افتح مكاناً أو غيّر شروطه')
            .addStringOption((o) => o.setName('location').setDescription('المكان').setRequired(true).setAutocomplete(true))
            .addBooleanOption((o) => o.setName('locked').setDescription('مقفل'))
            .addBooleanOption((o) => o.setName('staff_only').setDescription('للطاقم فقط'))
            .addIntegerOption((o) => o.setName('min_level').setDescription('أقل مستوى').setMinValue(1))
            .addIntegerOption((o) => o.setName('danger').setDescription('الخطورة').setMinValue(0).setMaxValue(5)),
        )
        .addSubcommand((s) =>
          s
            .setName('lore')
            .setDescription('أضف/عدّل مدخل أرشيف')
            .addStringOption((o) => o.setName('category').setDescription('التصنيف').setMaxLength(40)),
        )
        .addSubcommand((s) =>
          s
            .setName('lore_delete')
            .setDescription('احذف مدخل أرشيف')
            .addStringOption((o) => o.setName('slug').setDescription('المعرف').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('random')
            .setDescription('فعّل/عطّل حدثاً عشوائياً')
            .addStringOption((o) => o.setName('key').setDescription('الحدث').setRequired(true).setAutocomplete(true))
            .addBooleanOption((o) => o.setName('enabled').setDescription('مفعّل؟').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('spawn')
            .setDescription('أطلق حدثاً عشوائياً الآن')
            .addStringOption((o) => o.setName('key').setDescription('الحدث').setRequired(true).setAutocomplete(true))
            .addChannelOption((o) => o.setName('channel').setDescription('القناة').addChannelTypes(ChannelType.GuildText)),
        ),
    ),

  defer: (i, { group, sub }) =>
    (group === 'quest' && sub === 'create') || (group === 'event' && sub === 'create') || (group === 'world' && sub === 'lore') ? false : 'ephemeral',

  async autocomplete(i) {
    const f = i.options.getFocused(true);
    const q = f.value;
    if (f.name === 'item' || f.name === 'reward_item')
      return (await searchItems(q)).map((it) => ({ name: `${it.nameAr} (${it.key})`.slice(0, 100), value: it.key }));
    if (f.name === 'location')
      return (await listLocations()).filter((l) => !q || l.nameAr.includes(q) || l.key.includes(q)).map((l) => ({ name: l.nameAr, value: l.key }));
    if (f.name === 'npc') return npcAutocomplete(q);
    if (f.name === 'quest') return questAutocomplete(q, { scope: 'all' });
    if (f.name === 'event') return eventAutocomplete(q);
    if (f.name === 'key')
      return (await listRandomEventDefs())
        .filter((d) => !q || d.name_ar.includes(q) || d.key.includes(q))
        .map((d) => ({ name: `${d.name_ar} ${d.enabled ? '' : '(معطّل)'}`.trim(), value: d.key }));
    return [];
  },

  async execute(i, { group, sub }) {
    const actorId = i.user.id;
    const key = `${group}.${sub}`;
    const eventId = () => Number(i.options.getString('event', true)) || 0;

    switch (key) {
      case 'quest.create': {
        requireCap(i, 'manageQuests');
        const p = [
          i.options.getString('difficulty', true),
          i.options.getInteger('xp') ?? 100,
          i.options.getInteger('nx') ?? 100,
          i.options.getInteger('min_level') ?? 1,
          i.options.getBoolean('review') ? 1 : 0,
          i.options.getBoolean('repeatable') ? 1 : 0,
          i.options.getString('location') ?? '-',
          i.options.getString('reward_item') ?? '-',
          i.options.getInteger('time_limit') ?? 0,
        ];
        return i.showModal(
          new ModalBuilder()
            .setCustomId(cid('adm', 'quest', ...p))
            .setTitle('مهمة جديدة')
            .addComponents(
              textInput('title', 'العنوان', { required: true, max: 80 }),
              textInput('description', 'الوصف والقصة', { style: TextInputStyle.Paragraph, required: true, max: 1000 }),
              textInput('objectives', 'الأهداف (سطر لكل هدف)', {
                style: TextInputStyle.Paragraph,
                max: 1000,
                placeholder: 'collect glow_herb 3 | اجمع الأعشاب\nvisit ruins 1 | زر الأطلال\nmanual - 1 | اكتب مشهداً',
              }),
            ),
        );
      }
      case 'quest.toggle': {
        requireCap(i, 'manageQuests');
        await setQuestActive(i.options.getString('quest', true), i.options.getBoolean('active', true), { actorId });
        return send(i, ok('تم تحديث حالة المهمة.'));
      }
      case 'quest.reviews': {
        requireCap(i, 'reviewQuests');
        const rows = await pendingReviews();
        const buf = await renderList({
          title: 'بانتظار المراجعة',
          subtitle: `${rows.length} مهمة`,
          iconName: 'scroll',
          color: theme.gold,
          rows: rows.map((r) => ({
            title: `${r.code} • ${r.title}`,
            subtitle: `${r.name} (${r.char_code})`,
            iconName: 'scroll',
            value: `#${r.id}`,
            valueSub: 'رقم المراجعة',
          })),
          emptyText: 'لا توجد مهام بانتظار المراجعة',
          footerText: 'راجع عبر /gm quest review',
          rowHeight: 66,
        });
        return send(i, { files: [card(buf, 'reviews')] });
      }
      case 'quest.review': {
        requireCap(i, 'reviewQuests');
        const res = await review(i.options.getInteger('id', true), i.options.getBoolean('approve', true), { actorId, reason: i.options.getString('reason') });
        const user = await i.client.users.fetch(res.userId).catch(() => null);
        await user
          ?.send(
            res.approved
              ? `✅ تمت الموافقة على مهمتك **${res.quest.title}** واستلمت مكافآتك!`
              : `↩️ أُعيدت مهمتك **${res.quest.title}** للمتابعة.${i.options.getString('reason') ? ` السبب: ${i.options.getString('reason')}` : ''}`,
          )
          .catch(() => {});
        return send(i, ok(res.approved ? `تمت الموافقة على ${res.quest.code} وصُرفت المكافآت.` : `رُفضت ${res.quest.code} وأُعيدت للاعب.`));
      }
      case 'npc.create': {
        requireCap(i, 'manageNpcs');
        const locKey = i.options.getString('location');
        const loc = locKey ? await getLocation(locKey) : null;
        const npc = await createNpc(
          {
            key: i.options.getString('key', true),
            name: i.options.getString('name', true),
            title: i.options.getString('title') ?? '',
            locationId: loc?.id ?? null,
            color: i.options.getString('color') ?? undefined,
            greeting: i.options.getString('greeting'),
          },
          { actorId },
        );
        return send(i, ok(`أُنشئت الشخصية **${npc.name}**${loc ? ` في ${loc.nameAr}` : ''}.`));
      }
      case 'npc.dialogue': {
        requireCap(i, 'manageNpcs');
        const npc = await addDialogue(i.options.getString('npc', true), cleanText(i.options.getString('text', true)), {
          minReputation: i.options.getInteger('min_rep') ?? -100000,
          actorId,
        });
        return send(i, ok(`أُضيف حوار لـ **${npc.name}**.`));
      }
      case 'npc.shop': {
        requireCap(i, 'manageNpcs');
        await setShopItem(
          i.options.getString('npc', true),
          i.options.getString('item', true),
          i.options.getInteger('price', true),
          i.options.getInteger('stock'),
          { actorId },
        );
        return send(i, ok('تم تحديث المتجر.'));
      }
      case 'event.create': {
        requireCap(i, 'manageEvents');
        const p = [
          i.options.getInteger('starts_in') ?? 0,
          i.options.getInteger('duration') ?? 120,
          i.options.getInteger('xp') ?? 150,
          i.options.getInteger('nx') ?? 150,
          i.options.getInteger('max') ?? 0,
          i.options.getString('location') ?? '-',
        ];
        return i.showModal(
          new ModalBuilder()
            .setCustomId(cid('adm', 'event', ...p))
            .setTitle('حدث جديد')
            .addComponents(
              textInput('title', 'العنوان', { required: true, max: 80 }),
              textInput('description', 'القصة', { style: TextInputStyle.Paragraph, required: true, max: 1200 }),
              textInput('phases', 'المراحل (سطر لكل مرحلة)', {
                style: TextInputStyle.Paragraph,
                max: 1000,
                placeholder: 'الاستطلاع\nالمواجهة | الهجوم، التفاوض\nالحصاد',
              }),
              textInput('items', 'أغراض المكافأة (اختياري)', { max: 200, placeholder: 'health_potion=2, nexus_shard=1' }),
            ),
        );
      }
      case 'event.post': {
        requireCap(i, 'manageEvents');
        const ev = await getEvent(eventId());
        if (!ev) throw new UserError('الحدث غير موجود');
        const channel = i.options.getChannel('channel') ?? i.channel;
        const msg = await channel.send(await eventMessage(ev));
        await setEventMessage(ev.id, channel.id, msg.id);
        return send(i, ok(`نُشر الحدث في <#${channel.id}>.`));
      }
      case 'event.phase': {
        requireCap(i, 'manageEvents');
        const list = (i.options.getString('choices') ?? '')
          .split(/[,،]/)
          .map((c) => cleanText(c))
          .filter(Boolean)
          .slice(0, 10);
        await addPhase(
          eventId(),
          { title: i.options.getString('title', true), description: i.options.getString('description') ?? '', choices: list },
          { actorId },
        );
        await refreshEventMessage(eventId());
        return send(i, ok('أُضيفت المرحلة.'));
      }
      case 'event.advance': {
        requireCap(i, 'manageEvents');
        const res = await advance(eventId(), { actorId, note: i.options.getString('note') });
        await refreshEventMessage(eventId());
        const tally = res.outcome?.winner ? ` القرار: «${res.outcome.winner}».` : '';
        return send(i, ok(`انتهت مرحلة «${res.resolved?.title ?? '-'}».${tally} ${res.next ? `بدأت «${res.next.title}».` : 'لا توجد مراحل أخرى.'}`));
      }
      case 'event.contribute': {
        requireCap(i, 'manageEvents');
        const ch = await findByUser(i.options.getUser('user', true).id);
        if (!ch) throw new UserError('هذا اللاعب لا يملك شخصية');
        await addContribution(eventId(), ch.id, i.options.getInteger('points', true), { actorId });
        return send(i, ok(`سُجّلت مساهمة **${ch.name}**.`));
      }
      case 'event.end': {
        requireCap(i, 'manageEvents');
        const res = await endEvent(eventId(), { actorId, cancel: Boolean(i.options.getBoolean('cancel')) });
        await refreshEventMessage(eventId());
        return send(i, ok(i.options.getBoolean('cancel') ? 'أُلغي الحدث.' : `انتهى الحدث ووُزعت المكافآت على ${res.paid} مشارك.`));
      }
      case 'world.location': {
        requireCap(i, 'manageWorld');
        const loc = await createLocation(
          {
            key: i.options.getString('key', true),
            name: i.options.getString('name', true),
            nameAr: i.options.getString('name_ar', true),
            description: i.options.getString('description') ?? '',
            region: i.options.getString('region') ?? 'wild',
            channelName: i.options.getString('channel') ? slugify(i.options.getString('channel')) : null,
            mapX: i.options.getNumber('x') ?? 0.5,
            mapY: i.options.getNumber('y') ?? 0.5,
            danger: i.options.getInteger('danger') ?? 0,
            minLevel: i.options.getInteger('min_level') ?? 1,
          },
          { actorId },
        );
        return send(i, ok(`أُضيف **${loc.nameAr}** إلى الخريطة.`));
      }
      case 'world.flags': {
        requireCap(i, 'manageWorld');
        const loc = await setLocationFlags(
          i.options.getString('location', true),
          {
            locked: i.options.getBoolean('locked'),
            requiresPermission: i.options.getBoolean('staff_only'),
            minLevel: i.options.getInteger('min_level'),
            danger: i.options.getInteger('danger'),
          },
          { actorId },
        );
        return send(i, ok(`حُدّث **${loc.nameAr}**${loc.locked ? ' (مقفل)' : ''}.`));
      }
      case 'world.lore': {
        requireCap(i, 'manageLore');
        return i.showModal(
          new ModalBuilder()
            .setCustomId(cid('adm', 'lore', slugify(i.options.getString('category') ?? 'general') || 'general'))
            .setTitle('مدخل أرشيف')
            .addComponents(
              textInput('slug', 'المعرف (إنجليزي، يُستبدل إن وُجد)', { required: true, max: 60, placeholder: 'origin-of-nexus' }),
              textInput('title', 'العنوان', { required: true, max: 80 }),
              textInput('content', 'النص', { style: TextInputStyle.Paragraph, required: true, max: 3000 }),
            ),
        );
      }
      case 'world.lore_delete': {
        requireCap(i, 'manageLore');
        await deleteLore(i.options.getString('slug', true), { actorId });
        return send(i, ok('حُذف المدخل.'));
      }
      case 'world.random': {
        requireCap(i, 'manageEvents');
        await setRandomEventEnabled(i.options.getString('key', true), i.options.getBoolean('enabled', true), { actorId });
        return send(i, ok('تم التحديث.'));
      }
      case 'world.spawn': {
        requireCap(i, 'manageEvents');
        const def = (await listRandomEventDefs()).find((d) => d.key === i.options.getString('key', true));
        if (!def) throw new UserError('الحدث غير موجود');
        const channel = i.options.getChannel('channel') ?? i.channel;
        const inst = await spawnRandomEvent(def, { channelId: channel.id });
        const msg = await channel.send(await randomEventMessage(inst));
        await setRandomEventMessage(inst.id, msg.id);
        await audit({ actorId, action: 'admin_action', targetType: 'random_event', targetId: def.key, reason: 'manual spawn' });
        return send(i, ok(`أُطلق «${def.name_ar}» في <#${channel.id}>.`));
      }
      default:
        throw new UserError('أمر غير معروف');
    }
  },
};

// adm:* — admin modals and confirmations ---------------------------------------
const dash = (v) => (v === '-' || v === '' ? null : v);

export const adminComponent = {
  prefix: 'adm',
  async handle(i, { action, args }) {
    const actorId = i.user.id;
    const field = (n) => cleanText(i.fields.getTextInputValue(n) ?? '');

    if (action === 'chardel' || action === 'guilddel') {
      const [owner, exp, id] = args;
      assertOwner(i, owner, { ttlMs: 0 });
      assertNotExpired(exp);
      if (action === 'chardel') {
        requireCap(i, 'deleteCharacters');
        const ch = await loadCharacter(getPool(), Number(id));
        if (!ch) throw new UserError('الشخصية لم تعد موجودة');
        await deleteCharacter(ch.id, { actorId, reason: 'admin delete' });
        return i.update({ ...ok(`حُذفت **${ch.name}** (${ch.code}).`), components: [] });
      }
      requireCap(i, 'manageGuilds');
      const g = await disband(null, { actorId, guildId: Number(id), reason: 'admin disband' });
      return i.update({ ...ok(`حُلّت نقابة **${g.name}**.`), components: [] });
    }

    if (!i.isModalSubmit()) throw new UserError('إجراء غير معروف');
    await i.deferReply({ flags: MessageFlags.Ephemeral });

    if (action === 'item') {
      requireCap(i, 'manageItems');
      const [type, rarity, value, weight] = args;
      if (!ITEM_TYPES.includes(type) || !RARITIES.includes(rarity)) throw new UserError('نوع أو ندرة غير صالحة');
      const [en, ar] = field('names')
        .split('|')
        .map((x) => x.trim());
      const stats = parseKv(field('stats'));
      for (const k of Object.keys(stats)) if (![...STATS, 'attack', 'armor'].includes(k) || typeof stats[k] !== 'number') delete stats[k];
      const effect = parseKv(field('effect'));
      const item = await createItem(
        {
          key: field('key').toLowerCase(),
          name: en,
          nameAr: ar || en,
          description: field('description'),
          type,
          rarity,
          value: Number(value) || 0,
          weight: Number(weight) || 0,
          stats,
          useEffect: Object.keys(effect).length ? effect : null,
          slot: ['weapon', 'armor', 'accessory'].includes(type) ? type : null,
        },
        { actorId },
      );
      return i.editReply(ok(`أُنشئ الغرض **${item.nameAr}** (\`${item.key}\`).`));
    }

    if (action === 'quest') {
      requireCap(i, 'manageQuests');
      const [difficulty, xp, nx, minLevel, rev, rep, locKey, rewardKey, limit] = args;
      const loc = dash(locKey) ? await getLocation(locKey) : null;
      const quest = await createQuest(
        {
          title: field('title'),
          description: field('description'),
          difficulty,
          xp: Number(xp),
          nx: Number(nx),
          minLevel: Number(minLevel),
          requiresReview: rev === '1',
          repeatable: rep === '1',
          locationId: loc?.id ?? null,
          rewardItem: dash(rewardKey) ? { key: rewardKey, quantity: 1 } : null,
          timeLimitMinutes: Number(limit) || null,
          objectives: parseObjectives(i.fields.getTextInputValue('objectives')),
        },
        { actorId },
      );
      return i.editReply(ok(`أُضيفت المهمة **${quest.code} • ${quest.title}** إلى لوحة المهام.`));
    }

    if (action === 'event') {
      requireCap(i, 'manageEvents');
      const [startsIn, duration, xp, nx, max, locKey] = args;
      const loc = dash(locKey) ? await getLocation(locKey) : null;
      const startsAt = new Date(Date.now() + Number(startsIn) * 60_000);
      const phases = i.fields
        .getTextInputValue('phases')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 10)
        .map((l) => {
          const [title, opts = ''] = l.split('|');
          return {
            title: cleanText(title).slice(0, 80),
            choices: opts
              .split(/[,،]/)
              .map((c) => cleanText(c))
              .filter(Boolean)
              .slice(0, 10),
          };
        });
      const rewardItems = Object.entries(parseKv(field('items'))).map(([key, q]) => ({ key, quantity: Number(q) || 1 }));
      const ev = await createEvent(
        {
          title: field('title'),
          description: field('description'),
          startsAt,
          endsAt: new Date(startsAt.getTime() + Number(duration) * 60_000),
          xp: Number(xp),
          nx: Number(nx),
          maxParticipants: Number(max) || null,
          locationId: loc?.id ?? null,
          phases,
          rewardItems,
        },
        { actorId },
      );
      return i.editReply(ok(`أُنشئ الحدث **#${ev.id} ${ev.title}**. انشره عبر /gm event post`));
    }

    if (action === 'lore') {
      requireCap(i, 'manageLore');
      const slug = slugify(field('slug'));
      if (!slug) throw new UserError('معرف غير صالح');
      const entry = await upsertLore(
        { slug, title: field('title'), category: args[0] ?? 'general', content: i.fields.getTextInputValue('content').trim() },
        { actorId },
      );
      return i.editReply(ok(`حُفظ المدخل **${entry.title}** (\`${entry.slug}\`). اعرضه عبر /world lore`));
    }
    throw new UserError('إجراء غير معروف');
  },
};
