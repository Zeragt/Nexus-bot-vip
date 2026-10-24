import { ButtonStyle } from 'discord.js';
import { renderProfile, renderStats, renderList, renderNotice } from '../render/index.js';
import { card, row, button } from '../core/ui.js';
import { cid } from '../core/customId.js';
import { critChance } from '../engine/combat.js';
import { SKILL_TYPE_LABELS, STAT_LABELS } from '../config/game.js';
import { capacityOf } from '../services/inventory.js';
import { skillCatalog } from '../services/social.js';
import { characterImage } from './avatars.js';
import { theme } from '../render/theme.js';
import { fmt } from '../utils/format.js';
import { CLASS_BY_KEY } from '../content/classes.js';
import { subclassByKey } from '../content/classGen.js';

/** Five navigation buttons under every profile view (owner-locked). */
export function profileButtons(characterId, viewerId, active = 'profile') {
  const b = (view, label, emoji) =>
    button(cid('pf', view, characterId, viewerId), label, view === active ? ButtonStyle.Primary : ButtonStyle.Secondary, { emoji });
  return [
    row(b('profile', 'الملف', '🪪'), b('stats', 'الإحصائيات', '📊'), b('skills', 'المهارات', '⚔️')),
    row(b('inventory', 'الحقيبة', '🎒'), b('quests', 'المهام', '📜'), b('economy', 'الاقتصاد', '💰')),
  ];
}

export async function profileCard(ch) {
  const avatar = await characterImage(ch.id, ch.userId);
  const equipment = {};
  for (const [slot, it] of Object.entries(ch.equipment)) equipment[slot] = { name: it.name, rarity: it.rarity };
  return renderProfile({
    name: ch.name,
    code: ch.code,
    avatar,
    title: ch.guild ? `${ch.guild.tag}` : null,
    occupation: ch.profile.occupation,
    race: ch.profile.race,
    className: ch.classKey ? [CLASS_BY_KEY[ch.classKey]?.nameAr, subclassByKey(ch.subclassKey)?.name].filter(Boolean).join(' • ') : null,
    classColor: ch.classKey ? CLASS_BY_KEY[ch.classKey]?.colors[1] : null,
    origin: ch.profile.origin,
    age: ch.profile.age,
    alignment: ch.profile.alignment,
    level: ch.level,
    xp: ch.xp,
    xpNeed: ch.xpNeed,
    hp: ch.hp,
    maxHp: ch.maxHp,
    energy: ch.energy,
    maxEnergy: ch.maxEnergy,
    nx: ch.nx,
    reputation: ch.reputation,
    location: ch.location?.nameAr,
    guild: ch.guild,
    job: ch.job?.nameAr,
    wins: ch.counters.combatWins,
    stats: ch.stats,
    statPoints: ch.statPoints,
    equipment,
    footer: ch.profile.personality ? `«${ch.profile.personality.slice(0, 70)}»` : '',
  });
}

export async function profileMessage(ch, viewerId) {
  return { files: [card(await profileCard(ch), 'profile')], components: profileButtons(ch.id, viewerId, 'profile') };
}

export async function statsMessage(ch, viewerId) {
  const buf = await renderStats({
    name: ch.name,
    code: ch.code,
    base: ch.base,
    effective: ch.stats,
    statPoints: ch.statPoints,
    skillPoints: ch.skillPoints,
    critChance: critChance({ stats: ch.stats, passives: { crit: 0 } }),
    dodgeChance: Math.min(0.25, 0.03 + ch.stats.agility * 0.003),
    attack: ch.stats.attack,
    armor: ch.stats.armor,
    carry: capacityOf(ch),
  });
  return { files: [card(buf, 'stats')], components: profileButtons(ch.id, viewerId, 'stats') };
}

const DISCIPLINE = {
  swordsmanship: 'فن السيف',
  martial: 'قتال',
  medicine: 'طب',
  assassination: 'اغتيال',
  magic: 'سحر',
  psychic: 'قوى ذهنية',
  alchemy: 'خيمياء',
  technology: 'تقنية',
  dimensional: 'أبعاد',
};

export async function skillsCard(ch) {
  const all = await skillCatalog(ch.id);
  const owned = all.filter((s) => s.rank);
  const next = all.filter((s) => !s.rank && s.required_level <= ch.level + 4).slice(0, Math.max(0, 8 - owned.length));
  const rows = [...owned, ...next].map((s) => ({
    title: s.name_ar,
    subtitle: `${SKILL_TYPE_LABELS[s.type]} • ${DISCIPLINE[s.discipline] ?? s.discipline}${s.energy_cost ? ` • ${s.energy_cost} طاقة` : ''}${s.cooldown_turns ? ` • انتظار ${s.cooldown_turns}` : ''}`,
    iconName: { attack: 'sword', defense: 'shield', healing: 'heart', utility: 'sparkle', passive: 'eye', special: 'gate' }[s.type],
    color: s.rank ? theme.cyan : theme.textMute,
    value: s.rank ? `R${s.rank}` : `LV${s.required_level}`,
    valueSub: s.rank ? 'الرتبة' : ch.level >= s.required_level ? 'متاحة للتعلم' : 'مقفلة',
    dim: !s.rank,
    badge: s.rank ? null : 'جديدة',
  }));
  return renderList({
    title: `مهارات ${ch.name}`,
    subtitle: `نقاط المهارة المتاحة: ${ch.skillPoints}`,
    iconName: 'swords',
    rows,
    footerText: ch.skillPoints > 0 ? 'تعلّم مهارة عبر /skill learn' : 'تحصل على نقطة مهارة كل مستويين',
    emptyText: 'لا مهارات بعد',
  });
}

export async function skillsMessage(ch, viewerId) {
  return { files: [card(await skillsCard(ch), 'skills')], components: profileButtons(ch.id, viewerId, 'skills') };
}

export async function levelUpCard(ch, res) {
  return renderNotice({
    title: 'ارتقاء في المستوى!',
    subtitle: `${ch.name} وصل إلى المستوى ${res.level}`,
    iconName: 'sparkle',
    highlight: `LV ${res.level}`,
    avatar: await characterImage(ch.id, ch.userId),
    avatarLabel: ch.name,
    tiles: [
      { label: 'نقاط إحصائيات', value: `+${res.statPoints}`, iconName: 'eye' },
      { label: 'نقاط مهارة', value: `+${res.skillPoints}`, iconName: 'zap' },
      { label: 'مكافأة', value: `${fmt(res.nxBonus)} NX`, iconName: 'coin', color: theme.gold },
    ],
    body: res.unlockedSkills?.length
      ? `مهارات جديدة: ${res.unlockedSkills
          .slice(0, 4)
          .map((s) => s.name_ar)
          .join('، ')}${res.unlockedSkills.length > 4 ? ` و${res.unlockedSkills.length - 4} أخرى` : ''}. جهّزها عبر /class loadout`
      : '',
  });
}

export function statChoices() {
  return Object.entries(STAT_LABELS).map(([value, name]) => ({ name: `${name} (${value})`, value }));
}
