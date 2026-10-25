import { createFighter } from './combat.js';

/**
 * Monster skills are plain objects (no database rows): the engine only needs these fields.
 * `M(...)` keeps the table below readable.
 */
const M = (key, name, type, power, energyCost, cooldownTurns, scalingStat, effectKey = null, effectChance = 0, effectTurns = 0, extra = {}) => ({
  key: `m_${key}`,
  name,
  type,
  power,
  energyCost,
  cooldownTurns,
  scalingStat,
  effectKey,
  effectChance,
  effectTurns,
  target: ['healing', 'defense'].includes(type) || (type === 'utility' && power === 0) ? 'self' : 'enemy',
  rank: 1,
  extra,
});

export const MONSTER_SKILLS = {
  bite: M('bite', 'عضة ممزقة', 'attack', 120, 12, 2, 'strength', 'bleeding', 0.5, 2),
  howl: M('howl', 'عواء القطيع', 'utility', 0, 10, 4, 'strength', 'attack_up', 1, 3),
  thorns: M('thorns', 'وابل الأشواك', 'attack', 110, 14, 3, 'intelligence', 'poison', 0.7, 3),
  rockslam: M('rockslam', 'سحق صخري', 'attack', 140, 18, 3, 'strength', 'stun', 0.25, 1),
  harden: M('harden', 'تصلّب', 'defense', 0, 10, 4, 'defense', 'barrier', 1, 3),
  gust: M('gust', 'هبة إعصار', 'attack', 115, 14, 2, 'agility', 'slow', 0.6, 2, { hits: 2 }),
  coil: M('coil', 'التفاف خانق', 'attack', 120, 15, 3, 'strength', 'weaken', 0.6, 2),
  venom: M('venom', 'ناب السم', 'attack', 105, 14, 3, 'agility', 'poison', 0.8, 3),
  ambush: M('ambush', 'كمين', 'attack', 150, 18, 3, 'agility', null, 0, 0, { pierce: 0.3 }),
  sting: M('sting', 'لسعة قاتلة', 'attack', 130, 16, 3, 'strength', 'poison', 0.7, 3),
  frostbeam: M('frostbeam', 'شعاع الصقيع', 'attack', 125, 18, 3, 'intelligence', 'freeze', 0.25, 1),
  wail: M('wail', 'نواح الأرواح', 'utility', 60, 14, 4, 'intelligence', 'silence', 0.7, 2),
  drain: M('drain', 'امتصاص الجوهر', 'attack', 115, 16, 3, 'intelligence', null, 0, 0, { lifesteal: 0.4 }),
  riftfire: M('riftfire', 'نار الشق', 'attack', 150, 22, 3, 'intelligence', 'burn', 0.6, 2),
  crystalspike: M('crystalspike', 'نتوء البلور', 'attack', 130, 16, 2, 'intelligence', 'vulnerable', 0.5, 2),
  echo: M('echo', 'صدى مرآوي', 'utility', 0, 12, 4, 'intelligence', 'haste', 1, 3),
  ashstorm: M('ashstorm', 'عاصفة الرماد', 'attack', 125, 18, 3, 'intelligence', 'blind', 0.5, 2, { hits: 3 }),
  ember: M('ember', 'جمرة متقدة', 'attack', 120, 14, 2, 'strength', 'burn', 0.6, 2),
  lightning: M('lightning', 'صاعقة السماء', 'attack', 140, 20, 3, 'agility', 'stun', 0.25, 1),
  talon: M('talon', 'مخالب الريح', 'attack', 115, 14, 2, 'agility', 'bleeding', 0.5, 2, { hits: 2 }),
  tide: M('tide', 'مدّ ساحق', 'attack', 135, 18, 3, 'strength', 'slow', 0.6, 2),
  siren: M('siren', 'غناء الحورية', 'utility', 70, 16, 4, 'intelligence', 'weaken', 0.7, 2),
  regen: M('regen', 'تجدد الأعماق', 'healing', 60, 18, 4, 'endurance', 'regeneration', 1, 3),
  shadowbolt: M('shadowbolt', 'سهم الظل', 'attack', 140, 18, 2, 'intelligence', 'blind', 0.4, 2),
  curse: M('curse', 'لعنة الطائفة', 'utility', 80, 18, 4, 'intelligence', 'vulnerable', 0.75, 3),
  voidrend: M('voidrend', 'تمزيق الفراغ', 'special', 220, 30, 5, 'strength', 'weaken', 0.6, 2, { pierce: 0.4 }),
  abyssgaze: M('abyssgaze', 'نظرة الهاوية', 'special', 240, 34, 5, 'intelligence', 'silence', 0.6, 2),
  mend: M('mend', 'ترميم ذاتي', 'healing', 80, 20, 5, 'endurance'),
  frostnova: M('frostnova', 'انفجار الصقيع', 'attack', 150, 24, 4, 'intelligence', 'freeze', 0.3, 1, { hits: 2 }),
  magmaburst: M('magmaburst', 'انفجار الصهارة', 'attack', 170, 26, 3, 'strength', 'burn', 0.7, 3),
  gearstorm: M('gearstorm', 'عاصفة التروس', 'attack', 90, 22, 3, 'strength', 'bleeding', 0.5, 2, { hits: 3 }),
  swamprot: M('swamprot', 'عفن المستنقع', 'attack', 120, 20, 3, 'intelligence', 'poison', 0.9, 4),
  meteor: M('meteor', 'سقوط النيزك', 'special', 230, 32, 5, 'strength', 'stun', 0.35, 1),
  mirrorstrike: M('mirrorstrike', 'ضربة المرآة', 'attack', 150, 22, 3, 'agility', 'vulnerable', 0.6, 2, { pierce: 0.35 }),
  bonequake: M('bonequake', 'زلزال العظام', 'attack', 160, 24, 4, 'strength', 'stun', 0.3, 1),
  holybeam: M('holybeam', 'شعاع الهالة', 'attack', 165, 24, 3, 'intelligence', 'blind', 0.5, 2),
  weave: M('weave', 'نسج الواقع', 'special', 250, 34, 5, 'intelligence', 'silence', 0.6, 2, { pierce: 0.4 }),
  frostbite: M('frostbite', 'عضة الصقيع', 'attack', 125, 15, 2, 'strength', 'slow', 0.6, 2),
  lavaspit: M('lavaspit', 'بصقة الحمم', 'attack', 130, 16, 2, 'intelligence', 'burn', 0.6, 2),
  vinelash: M('vinelash', 'جلدة الكرمة', 'attack', 120, 14, 2, 'agility', 'weaken', 0.5, 2, { hits: 2 }),
  rivet: M('rivet', 'مسمار نحاسي', 'attack', 135, 16, 2, 'agility', null, 0, 0, { pierce: 0.25 }),
  shatter: M('shatter', 'تحطّم', 'attack', 140, 18, 3, 'strength', 'vulnerable', 0.5, 2),
  bonerattle: M('bonerattle', 'قعقعة العظام', 'utility', 60, 14, 4, 'intelligence', 'weaken', 0.7, 2),
  radiance: M('radiance', 'إشراق', 'healing', 90, 20, 4, 'intelligence', 'regeneration', 1, 3),
};

/**
 * Bestiary by location. `archetype` and `palette` drive the 2D monster sprite;
 * `weights` shape the stat spread; `skills` are keys of MONSTER_SKILLS.
 */
export const ENEMIES = {
  forest: [
    {
      key: 'shade_wolf',
      name: 'ذئب الظل',
      archetype: 'beast',
      palette: ['#1e293b', '#a78bfa'],
      weights: { strength: 1.1, agility: 1.2 },
      skills: ['bite', 'howl'],
      loot: [
        ['wolf_pelt', 0.7],
        ['glow_herb', 0.5],
      ],
    },
    {
      key: 'thorn_sprite',
      name: 'جنية الأشواك',
      archetype: 'sprite',
      palette: ['#14532d', '#4ade80'],
      weights: { intelligence: 1.3, agility: 1.1 },
      skills: ['thorns'],
      loot: [['glow_herb', 0.8]],
    },
    {
      key: 'moss_treant',
      name: 'شجرة الطحلب الحية',
      archetype: 'golem',
      palette: ['#3f2d1d', '#65a30d'],
      weights: { defense: 1.4, endurance: 1.3, agility: 0.6 },
      skills: ['harden', 'thorns'],
      loot: [['glow_herb', 0.6]],
    },
    {
      key: 'glow_moth',
      name: 'عثة الضياء',
      archetype: 'bird',
      palette: ['#422006', '#fde047'],
      weights: { agility: 1.4, luck: 1.2 },
      skills: ['gust'],
      loot: [['glow_herb', 0.5]],
    },
  ],
  mountains: [
    {
      key: 'stone_golem',
      name: 'غولم الصخر',
      archetype: 'golem',
      palette: ['#44403c', '#a8a29e'],
      weights: { defense: 1.5, strength: 1.2, agility: 0.6 },
      skills: ['rockslam', 'harden'],
      loot: [['iron_ore', 0.9]],
    },
    {
      key: 'storm_harpy',
      name: 'هاربي العاصفة',
      archetype: 'bird',
      palette: ['#1e3a8a', '#facc15'],
      weights: { agility: 1.4 },
      skills: ['talon', 'lightning'],
      loot: [
        ['iron_ore', 0.4],
        ['star_shard', 0.03],
      ],
    },
    {
      key: 'frost_yeti',
      name: 'يتي الصقيع',
      archetype: 'beast',
      palette: ['#e0f2fe', '#38bdf8'],
      weights: { strength: 1.3, endurance: 1.3 },
      skills: ['frostbeam', 'bite'],
      loot: [['wolf_pelt', 0.5]],
    },
  ],
  lake: [
    {
      key: 'mire_serpent',
      name: 'أفعى المستنقع',
      archetype: 'serpent',
      palette: ['#064e3b', '#34d399'],
      weights: { endurance: 1.3 },
      skills: ['venom', 'coil'],
      loot: [['glow_herb', 0.5]],
    },
    {
      key: 'drowned_knight',
      name: 'الفارس الغريق',
      archetype: 'humanoid',
      palette: ['#0c4a6e', '#7dd3fc'],
      weights: { defense: 1.3, strength: 1.1 },
      skills: ['tide'],
      loot: [['iron_ore', 0.5]],
    },
    {
      key: 'lake_wisp',
      name: 'شعلة البحيرة',
      archetype: 'ghost',
      palette: ['#0e7490', '#a5f3fc'],
      weights: { intelligence: 1.4, agility: 1.2 },
      skills: ['wail', 'drain'],
      loot: [['star_shard', 0.03]],
    },
  ],
  desert: [
    {
      key: 'sand_bandit',
      name: 'قاطع طريق',
      archetype: 'humanoid',
      palette: ['#78350f', '#f59e0b'],
      weights: { agility: 1.2, luck: 1.2 },
      skills: ['ambush'],
      loot: [
        ['old_map', 0.15],
        ['health_potion', 0.3],
      ],
    },
    {
      key: 'dune_scorpion',
      name: 'عقرب الكثبان',
      archetype: 'insect',
      palette: ['#92400e', '#fbbf24'],
      weights: { defense: 1.3 },
      skills: ['sting'],
      loot: [['iron_ore', 0.4]],
    },
    {
      key: 'sand_wurm',
      name: 'دودة الرمال',
      archetype: 'serpent',
      palette: ['#a16207', '#fde68a'],
      weights: { endurance: 1.5, strength: 1.2, agility: 0.7 },
      skills: ['coil', 'rockslam'],
      loot: [['ancient_relic', 0.03]],
    },
  ],
  ruins: [
    {
      key: 'ruin_sentinel',
      name: 'حارس الأطلال',
      archetype: 'golem',
      palette: ['#1e1b4b', '#818cf8'],
      weights: { defense: 1.4, intelligence: 1.2 },
      skills: ['frostbeam', 'harden'],
      loot: [
        ['ancient_relic', 0.08],
        ['iron_ore', 0.5],
      ],
    },
    {
      key: 'restless_spirit',
      name: 'روح هائمة',
      archetype: 'ghost',
      palette: ['#312e81', '#c4b5fd'],
      weights: { intelligence: 1.5 },
      skills: ['wail', 'drain'],
      loot: [
        ['glow_herb', 0.4],
        ['star_shard', 0.04],
      ],
    },
    {
      key: 'bone_hound',
      name: 'كلب العظام',
      archetype: 'beast',
      palette: ['#57534e', '#e7e5e4'],
      weights: { strength: 1.2, agility: 1.2 },
      skills: ['bite'],
      loot: [['wolf_pelt', 0.3]],
    },
  ],
  crystal_caverns: [
    {
      key: 'crystal_crawler',
      name: 'زاحف البلور',
      archetype: 'insect',
      palette: ['#4c1d95', '#e879f9'],
      weights: { defense: 1.4, agility: 1.1 },
      skills: ['crystalspike'],
      loot: [['star_shard', 0.1]],
    },
    {
      key: 'echo_wraith',
      name: 'شبح الصدى',
      archetype: 'ghost',
      palette: ['#1e1b4b', '#67e8f9'],
      weights: { intelligence: 1.5, agility: 1.1 },
      skills: ['echo', 'wail', 'drain'],
      loot: [['star_shard', 0.08]],
    },
    {
      key: 'geode_golem',
      name: 'غولم الجيود',
      archetype: 'golem',
      palette: ['#581c87', '#f0abfc'],
      weights: { defense: 1.6, strength: 1.2, agility: 0.5 },
      skills: ['crystalspike', 'harden'],
      loot: [['iron_ore', 0.8]],
    },
  ],
  ashen_wastes: [
    {
      key: 'cinder_hound',
      name: 'كلب الجمر',
      archetype: 'beast',
      palette: ['#450a0a', '#fb923c'],
      weights: { strength: 1.3, agility: 1.2 },
      skills: ['ember', 'bite'],
      loot: [['wolf_pelt', 0.5]],
    },
    {
      key: 'ash_revenant',
      name: 'منتقم الرماد',
      archetype: 'humanoid',
      palette: ['#292524', '#f97316'],
      weights: { strength: 1.3, defense: 1.2 },
      skills: ['ashstorm', 'ember'],
      loot: [['ancient_relic', 0.06]],
    },
    {
      key: 'slag_elemental',
      name: 'روح الخَبَث',
      archetype: 'slime',
      palette: ['#7c2d12', '#fdba74'],
      weights: { endurance: 1.6, intelligence: 1.1 },
      skills: ['ember', 'mend'],
      loot: [['iron_ore', 0.9]],
    },
  ],
  sky_archipelago: [
    {
      key: 'cloud_roc',
      name: 'الرُّخ السحابي',
      archetype: 'bird',
      palette: ['#e2e8f0', '#38bdf8'],
      weights: { agility: 1.5, strength: 1.1 },
      skills: ['talon', 'gust'],
      loot: [['star_shard', 0.1]],
    },
    {
      key: 'sky_pirate',
      name: 'قرصان السماء',
      archetype: 'humanoid',
      palette: ['#1e3a8a', '#fcd34d'],
      weights: { agility: 1.3, luck: 1.3 },
      skills: ['ambush', 'lightning'],
      loot: [
        ['old_map', 0.2],
        ['health_potion', 0.4],
      ],
    },
    {
      key: 'storm_spirit',
      name: 'روح العاصفة',
      archetype: 'sprite',
      palette: ['#312e81', '#facc15'],
      weights: { intelligence: 1.5, agility: 1.2 },
      skills: ['lightning', 'echo'],
      loot: [['star_shard', 0.12]],
    },
  ],
  sunken_kingdom: [
    {
      key: 'abyssal_eel',
      name: 'ثعبان الأعماق',
      archetype: 'serpent',
      palette: ['#082f49', '#22d3ee'],
      weights: { agility: 1.3, strength: 1.2 },
      skills: ['lightning', 'coil'],
      loot: [['star_shard', 0.08]],
    },
    {
      key: 'siren',
      name: 'حورية الأجراس',
      archetype: 'sprite',
      palette: ['#0f766e', '#99f6e4'],
      weights: { intelligence: 1.5, luck: 1.2 },
      skills: ['siren', 'tide'],
      loot: [['ancient_relic', 0.08]],
    },
    {
      key: 'coral_colossus',
      name: 'عملاق المرجان',
      archetype: 'golem',
      palette: ['#9f1239', '#fda4af'],
      weights: { defense: 1.6, endurance: 1.4, agility: 0.5 },
      skills: ['tide', 'regen'],
      loot: [['iron_ore', 0.7]],
    },
  ],
  shadow_citadel: [
    {
      key: 'order_zealot',
      name: 'متعصب الطائفة',
      archetype: 'humanoid',
      palette: ['#1e1b4b', '#a78bfa'],
      weights: { intelligence: 1.4, strength: 1.2 },
      skills: ['shadowbolt', 'curse'],
      loot: [['ancient_relic', 0.1]],
    },
    {
      key: 'shadow_stalker',
      name: 'متربص العتمة',
      archetype: 'beast',
      palette: ['#0f0a1e', '#7c3aed'],
      weights: { agility: 1.5, strength: 1.2 },
      skills: ['ambush', 'shadowbolt'],
      loot: [['star_shard', 0.1]],
    },
    {
      key: 'faceless_one',
      name: 'بلا وجه',
      archetype: 'ghost',
      palette: ['#18181b', '#f43f5e'],
      weights: { intelligence: 1.6 },
      skills: ['curse', 'drain', 'wail'],
      loot: [['star_shard', 0.15]],
    },
  ],
  the_abyss: [
    {
      key: 'void_spawn',
      name: 'نسل الفراغ',
      archetype: 'eldritch',
      palette: ['#1e0b3a', '#c026d3'],
      weights: { strength: 1.4, intelligence: 1.4 },
      skills: ['voidrend', 'drain'],
      loot: [['star_shard', 0.25]],
    },
    {
      key: 'abyss_watcher',
      name: 'مراقب الهاوية',
      archetype: 'eldritch',
      palette: ['#020617', '#22d3ee'],
      weights: { intelligence: 1.6, defense: 1.2 },
      skills: ['abyssgaze', 'curse'],
      loot: [['star_shard', 0.3]],
    },
    {
      key: 'hollow_dragon',
      name: 'تنين أجوف',
      archetype: 'dragon',
      palette: ['#111827', '#a855f7'],
      weights: { strength: 1.5, endurance: 1.4 },
      skills: ['riftfire', 'voidrend'],
      loot: [['ancient_relic', 0.2]],
    },
  ],
  dimensional_gate: [
    {
      key: 'rift_horror',
      name: 'رعب الشق',
      archetype: 'eldritch',
      palette: ['#2e1065', '#e879f9'],
      weights: { strength: 1.4, intelligence: 1.4 },
      skills: ['riftfire', 'drain'],
      loot: [['star_shard', 0.2]],
    },
    {
      key: 'gate_hound',
      name: 'كلب البوابة',
      archetype: 'beast',
      palette: ['#1e1b4b', '#22d3ee'],
      weights: { agility: 1.4, strength: 1.3 },
      skills: ['bite', 'riftfire'],
      loot: [['star_shard', 0.12]],
    },
  ],
};

// Saga II regions (unlocked by the story after chapter 25).
const SAGA2_ENEMIES = {
  frost_reach: [
    {
      key: 'rime_wolf',
      name: 'ذئب الصقيع الأبدي',
      archetype: 'beast',
      palette: ['#e2e8f0', '#38bdf8'],
      weights: { agility: 1.3, strength: 1.2 },
      skills: ['frostbite', 'howl'],
      loot: [
        ['rime_crystal', 0.35],
        ['yeti_fur', 0.6],
      ],
    },
    {
      key: 'frozen_citizen',
      name: 'مواطن متجمد',
      archetype: 'humanoid',
      palette: ['#cbd5e1', '#7dd3fc'],
      weights: { defense: 1.4, endurance: 1.3 },
      skills: ['frostbeam', 'harden'],
      loot: [['rime_crystal', 0.4]],
    },
    {
      key: 'ice_wraith',
      name: 'شبح الجليد',
      archetype: 'ghost',
      palette: ['#0c4a6e', '#e0f2fe'],
      weights: { intelligence: 1.4, agility: 1.2 },
      skills: ['frostnova', 'wail'],
      loot: [
        ['frozen_ember', 0.05],
        ['rime_crystal', 0.3],
      ],
    },
  ],
  ember_isles: [
    {
      key: 'lava_salamander',
      name: 'سمندل الحمم',
      archetype: 'serpent',
      palette: ['#450a0a', '#f97316'],
      weights: { strength: 1.3, endurance: 1.2 },
      skills: ['lavaspit', 'bite'],
      loot: [['magma_core', 0.35]],
    },
    {
      key: 'ember_imp',
      name: 'عفريت الجمر',
      archetype: 'sprite',
      palette: ['#7c2d12', '#fdba74'],
      weights: { agility: 1.4, intelligence: 1.2 },
      skills: ['ember', 'gust'],
      loot: [
        ['cinder_ash', 0.7],
        ['phoenix_ash', 0.04],
      ],
    },
    {
      key: 'obsidian_golem',
      name: 'غولم الزجاج البركاني',
      archetype: 'golem',
      palette: ['#0c0a09', '#ef4444'],
      weights: { defense: 1.6, strength: 1.2, agility: 0.5 },
      skills: ['magmaburst', 'harden'],
      loot: [['magma_core', 0.45]],
    },
  ],
  emerald_wilds: [
    {
      key: 'jade_drake',
      name: 'تنين اليشم الصغير',
      archetype: 'dragon',
      palette: ['#052e16', '#4ade80'],
      weights: { strength: 1.3, agility: 1.2 },
      skills: ['ember', 'talon'],
      loot: [['emerald_scale', 0.35]],
    },
    {
      key: 'vine_stalker',
      name: 'متربص الكروم',
      archetype: 'insect',
      palette: ['#14532d', '#a3e635'],
      weights: { agility: 1.4 },
      skills: ['vinelash', 'venom'],
      loot: [
        ['moonbark', 0.6],
        ['worldtree_sap', 0.04],
      ],
    },
    {
      key: 'bloom_nymph',
      name: 'حورية الأزهار',
      archetype: 'sprite',
      palette: ['#831843', '#f9a8d4'],
      weights: { intelligence: 1.4, luck: 1.2 },
      skills: ['thorns', 'radiance'],
      loot: [['faerie_dust', 0.7]],
    },
  ],
  clockwork_bastion: [
    {
      key: 'brass_sentry',
      name: 'حارس نحاسي',
      archetype: 'golem',
      palette: ['#292524', '#f59e0b'],
      weights: { defense: 1.6, strength: 1.2, agility: 0.5 },
      skills: ['rivet', 'harden'],
      loot: [['brass_gear', 0.45]],
    },
    {
      key: 'order_engineer',
      name: 'مهندس الطائفة',
      archetype: 'humanoid',
      palette: ['#1c1917', '#38bdf8'],
      weights: { intelligence: 1.4, agility: 1.1 },
      skills: ['gearstorm', 'curse'],
      loot: [
        ['brass_gear', 0.35],
        ['aether_coil', 0.04],
      ],
    },
    {
      key: 'clock_spider',
      name: 'عنكبوت الساعة',
      archetype: 'insect',
      palette: ['#44403c', '#fbbf24'],
      weights: { agility: 1.5 },
      skills: ['rivet', 'venom'],
      loot: [['brass_gear', 0.4]],
    },
  ],
  whispering_marsh: [
    {
      key: 'bog_toad',
      name: 'ضفدع المستنقع العجوز',
      archetype: 'slime',
      palette: ['#1a2e05', '#84cc16'],
      weights: { endurance: 1.5, strength: 1.1 },
      skills: ['swamprot', 'regen'],
      loot: [
        ['whisper_moss', 0.4],
        ['bog_pearl', 0.04],
      ],
    },
    {
      key: 'will_wisp',
      name: 'ضوء الضلال',
      archetype: 'sprite',
      palette: ['#0f1a05', '#d9f99d'],
      weights: { intelligence: 1.4, agility: 1.3 },
      skills: ['wail', 'drain'],
      loot: [['whisper_moss', 0.5]],
    },
    {
      key: 'mud_serpent',
      name: 'أفعى الطين الهامسة',
      archetype: 'serpent',
      palette: ['#292524', '#a3e635'],
      weights: { strength: 1.3, endurance: 1.3 },
      skills: ['coil', 'swamprot'],
      loot: [['whisper_moss', 0.4]],
    },
  ],
  starfall_crater: [
    {
      key: 'meteor_hound',
      name: 'كلب النيزك',
      archetype: 'beast',
      palette: ['#1e1b4b', '#fbbf24'],
      weights: { strength: 1.4, agility: 1.2 },
      skills: ['bite', 'ember'],
      loot: [['meteor_iron', 0.2]],
    },
    {
      key: 'star_moth',
      name: 'عثة النجوم',
      archetype: 'bird',
      palette: ['#0c0a2a', '#fef08a'],
      weights: { agility: 1.5, luck: 1.2 },
      skills: ['gust', 'holybeam'],
      loot: [['starlight_dust', 0.25]],
    },
    {
      key: 'starless_knight',
      name: 'فارس بلا نجوم',
      archetype: 'knight',
      palette: ['#020617', '#94a3b8'],
      weights: { strength: 1.4, defense: 1.4 },
      skills: ['shatter', 'harden'],
      loot: [['meteor_iron', 0.25]],
    },
  ],
  mirror_realm: [
    {
      key: 'mirror_shade',
      name: 'ظل المرآة',
      archetype: 'ghost',
      palette: ['#334155', '#e2e8f0'],
      weights: { agility: 1.4, intelligence: 1.3 },
      skills: ['mirrorstrike', 'echo'],
      loot: [['mirror_shard', 0.25]],
    },
    {
      key: 'glass_mimic',
      name: 'المقلد الزجاجي',
      archetype: 'humanoid',
      palette: ['#e2e8f0', '#a5b4fc'],
      weights: { strength: 1.3, agility: 1.3 },
      skills: ['shatter', 'ambush'],
      loot: [['mirror_shard', 0.3]],
    },
    {
      key: 'prism_wyrmling',
      name: 'تنين الموشور الصغير',
      archetype: 'dragon',
      palette: ['#4c1d95', '#f0abfc'],
      weights: { intelligence: 1.4 },
      skills: ['crystalspike', 'riftfire'],
      loot: [
        ['mirror_shard', 0.2],
        ['reflection_essence', 0.02],
      ],
    },
  ],
  bone_sea: [
    {
      key: 'bone_shark',
      name: 'قرش العظام',
      archetype: 'serpent',
      palette: ['#e7e5e4', '#a8a29e'],
      weights: { strength: 1.4, agility: 1.3 },
      skills: ['bite', 'bonequake'],
      loot: [['leviathan_bone', 0.3]],
    },
    {
      key: 'pale_sailor',
      name: 'بحار شاحب',
      archetype: 'humanoid',
      palette: ['#27272a', '#e4e4e7'],
      weights: { agility: 1.3, strength: 1.2 },
      skills: ['ambush', 'bonerattle'],
      loot: [
        ['leviathan_bone', 0.25],
        ['pale_pearl', 0.02],
      ],
    },
    {
      key: 'ossuary_crab',
      name: 'سرطان المدفن',
      archetype: 'insect',
      palette: ['#44403c', '#fafaf9'],
      weights: { defense: 1.6, endurance: 1.2 },
      skills: ['shatter', 'harden'],
      loot: [['leviathan_bone', 0.3]],
    },
  ],
  celestial_spire: [
    {
      key: 'lesser_seraph',
      name: 'سيرافي صغير',
      archetype: 'sprite',
      palette: ['#fefce8', '#facc15'],
      weights: { intelligence: 1.5, defense: 1.2 },
      skills: ['holybeam', 'radiance'],
      loot: [['celestial_feather', 0.12]],
    },
    {
      key: 'halo_knight',
      name: 'فارس الهالة',
      archetype: 'knight',
      palette: ['#1e3a8a', '#fde68a'],
      weights: { strength: 1.4, defense: 1.4 },
      skills: ['holybeam', 'shatter'],
      loot: [['halo_fragment', 0.08]],
    },
    {
      key: 'sky_griffin',
      name: 'غريفين البرج',
      archetype: 'bird',
      palette: ['#78350f', '#fef3c7'],
      weights: { agility: 1.5, strength: 1.2 },
      skills: ['talon', 'gust'],
      loot: [['celestial_feather', 0.15]],
    },
  ],
  the_origin: [
    {
      key: 'thread_spinner',
      name: 'غازل الخيوط',
      archetype: 'insect',
      palette: ['#0c0a09', '#f5f5f4'],
      weights: { agility: 1.5, intelligence: 1.3 },
      skills: ['weave', 'venom'],
      loot: [
        ['origin_ember', 0.1],
        ['weaver_thread', 0.01],
      ],
    },
    {
      key: 'unmade_beast',
      name: 'الوحش غير المكتمل',
      archetype: 'beast',
      palette: ['#18181b', '#f43f5e'],
      weights: { strength: 1.5, endurance: 1.4 },
      skills: ['voidrend', 'bite'],
      loot: [['origin_ember', 0.12]],
    },
    {
      key: 'first_light',
      name: 'الضوء الأول',
      archetype: 'ghost',
      palette: ['#fafafa', '#fde047'],
      weights: { intelligence: 1.6 },
      skills: ['holybeam', 'radiance'],
      loot: [['origin_ember', 0.1]],
    },
  ],
};
Object.assign(ENEMIES, SAGA2_ENEMIES);

export function enemiesFor(locationKey) {
  return ENEMIES[locationKey] ?? [];
}

export function findEnemy(key) {
  for (const list of Object.values(ENEMIES)) {
    const e = list.find((x) => x.key === key);
    if (e) return e;
  }
  return null;
}

/**
 * Builds a monster fighter scaled to the area and the player. Enemies sit slightly
 * below the player's power at danger 0-2 and above it in dangerous places.
 * `boss` templates (from the story) pass `levelOffset`, `hpMult` and `statMult`.
 */
export function spawnEnemy(template, { playerLevel, danger = 0, skillsByKey = {}, boss = false, statLevel = null }, rng) {
  const level = boss ? Math.max(1, playerLevel + (template.levelOffset ?? 1)) : Math.max(1, Math.round(playerLevel * 0.85 + danger * 0.4 - 1 + rng.int(-1, 1)));
  // `statLevel` lets story bosses show their lore level while their numbers stay fair.
  const power = statLevel ?? level;
  // Roughly a well-built hero's spread at the same level, but in every stat at once.
  const base = (5 + power * 0.95 + power * power * 0.005) * (template.statMult ?? 1);
  const stats = {};
  for (const s of ['strength', 'defense', 'agility', 'intelligence', 'endurance', 'luck']) {
    stats[s] = Math.max(1, Math.round(base * (template.weights[s] ?? 1)));
  }
  stats.attack = Math.round(4 + power * 0.9);
  stats.armor = Math.round(4 + power * 0.5);
  const maxHp = Math.round((70 + stats.endurance * 8 + power * 10) * (template.hpMult ?? 1));
  const maxEnergy = 60 + power * 3;
  const skills = [];
  for (const k of template.skills ?? (template.skill ? [template.skill] : [])) {
    const s = MONSTER_SKILLS[k] ?? skillsByKey[k];
    if (s) skills.push(s);
  }
  return createFighter({
    id: `enemy:${template.key}`,
    name: template.name,
    level,
    hp: maxHp,
    maxHp,
    energy: maxEnergy,
    maxEnergy,
    stats,
    skills,
    ai: true,
    avatarKey: template.key,
    look: {
      monster: template.archetype ?? 'beast',
      palette: template.palette ?? ['#1e293b', '#22d3ee'],
      boss: boss || undefined,
      crown: template.crown,
      traits: template.look ?? undefined,
      seedKey: template.key,
    },
    boss,
  });
}

export function rollLoot(template, rng) {
  return (template.loot ?? []).filter(([, chance]) => rng.chance(chance)).map(([key]) => key);
}
