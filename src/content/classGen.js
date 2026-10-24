import { CLASSES, CLASS_BY_KEY, ELEMENTS } from './classes.js';
import { STAT_LABELS } from '../config/game.js';

/**
 * Turns the 53 hand-written classes into the full skill tree:
 *  - 100 class skills per class, one unlocked at every level from 1 to 100
 *  - 30 paths (subclasses) per class, each with stat growth, passive bonuses and 3 signature skills
 *
 * Everything is deterministic: the same input always yields the same keys, names and numbers,
 * so the database sync can upsert by key and the content hash only changes when this file does.
 */

const STAT_KEYS = ['strength', 'defense', 'agility', 'intelligence', 'endurance', 'luck'];

// ── Naming ──────────────────────────────────────────────────────────────
// Each list has at least 10 entries so the decade of a skill always picks a different word.
const FORMS = {
  melee: ['ضربة', 'نصل', 'شقّ', 'صدمة', 'قبضة', 'اندفاعة', 'حدّ', 'طعنة', 'دوامة', 'زئير', 'كسر', 'هجمة'],
  ranged: ['سهم', 'رمية', 'وابل', 'قنص', 'طلقة', 'شظية', 'مطر', 'رمح', 'عين', 'صاعقة', 'إصابة', 'زخة'],
  magic: ['كرة', 'شعاع', 'لعنة', 'موجة', 'نجمة', 'انفجار', 'تعويذة', 'طوفان', 'نبض', 'همسة', 'لهيب', 'دائرة'],
  defense: ['درع', 'حصن', 'جدار', 'ستار', 'وقفة', 'هالة', 'حماية', 'صمود', 'ملاذ', 'قلعة', 'سدّ', 'ترس'],
  healing: ['نفحة', 'بلسم', 'ترنيمة', 'لمسة', 'ينبوع', 'دعاء', 'عطية', 'رحمة', 'إحياء', 'ندى', 'سكينة', 'شفاء'],
  buff: ['صيحة', 'بركة', 'إيقاع', 'نداء', 'عهد', 'إشراقة', 'نشوة', 'تركيز', 'وعد', 'إرادة', 'يقظة', 'ثورة'],
  control: ['قيد', 'فخ', 'سجن', 'ختم', 'شبكة', 'ضباب', 'أغلال', 'نظرة', 'متاهة', 'طلسم', 'صمت', 'مصيدة'],
  passive: ['روح', 'قلب', 'إرث', 'جوهر', 'سرّ', 'عزم', 'بصيرة', 'غريزة', 'نبض', 'ذاكرة', 'وشم', 'أثر'],
  ultimate: ['غضب', 'نهاية', 'ملحمة', 'سقوط', 'قيامة', 'فجر', 'أسطورة', 'عرش', 'صحوة', 'يوم', 'لحن', 'قدر'],
};

const RANGED_WEAPONS = new Set(['bow', 'gun', 'crossbow', 'rifle', 'cards', 'bombs']);
const MAGIC_WEAPONS = new Set(['staff', 'orb', 'wand', 'tome', 'lute', 'flask', 'injector']);

export function attackStyle(cls) {
  if (RANGED_WEAPONS.has(cls.weapon)) return 'ranged';
  if (MAGIC_WEAPONS.has(cls.weapon) || ['mage', 'healer', 'summoner', 'controller'].includes(cls.role)) return 'magic';
  return 'melee';
}

// ── The ten slots of every decade ────────────────────────────────────────
// Position 9 of each decade (levels 10, 20 ... 100) is the class's ultimate of that tier.
const SLOT_BY_ROLE = {
  tank: ['strike', 'debuff', 'guard', 'combo', 'barrier', 'passive', 'drain', 'control', 'buff', 'ultimate'],
  bruiser: ['strike', 'debuff', 'guard', 'combo', 'pierce', 'passive', 'drain', 'control', 'buff', 'ultimate'],
  assassin: ['strike', 'debuff', 'evade', 'combo', 'pierce', 'passive', 'drain', 'control', 'buff', 'ultimate'],
  marksman: ['strike', 'debuff', 'evade', 'combo', 'pierce', 'passive', 'strike2', 'control', 'buff', 'ultimate'],
  mage: ['strike', 'debuff', 'guard', 'combo', 'pierce', 'passive', 'drain', 'control', 'buff', 'ultimate'],
  healer: ['strike', 'heal', 'guard', 'debuff', 'heal2', 'passive', 'drain', 'control', 'buff', 'ultimate'],
  support: ['strike', 'debuff', 'guard', 'combo', 'heal', 'passive', 'drain', 'control', 'buff', 'ultimate'],
  controller: ['strike', 'debuff', 'guard', 'control2', 'pierce', 'passive', 'drain', 'control', 'buff', 'ultimate'],
  summoner: ['strike', 'debuff', 'guard', 'combo', 'heal', 'passive', 'strike2', 'control', 'buff', 'ultimate'],
};

const SLOT_FORM = {
  strike: null, // attack style of the class
  strike2: null,
  debuff: null,
  combo: null,
  pierce: null,
  drain: null,
  guard: 'defense',
  barrier: 'defense',
  evade: 'buff',
  heal: 'healing',
  heal2: 'healing',
  buff: 'buff',
  control: 'control',
  control2: 'control',
  passive: 'passive',
  ultimate: 'ultimate',
};

const PASSIVE_KINDS = {
  tank: ['defense', 'hp', 'defense', 'hp', 'attack', 'defense', 'hp', 'lifesteal', 'defense', 'hp'],
  bruiser: ['attack', 'hp', 'lifesteal', 'crit', 'defense', 'attack', 'hp', 'lifesteal', 'crit', 'attack'],
  assassin: ['crit', 'dodge', 'attack', 'crit', 'lifesteal', 'dodge', 'crit', 'attack', 'dodge', 'crit'],
  marksman: ['crit', 'attack', 'dodge', 'crit', 'attack', 'crit', 'dodge', 'attack', 'crit', 'attack'],
  mage: ['attack', 'crit', 'hp', 'attack', 'defense', 'attack', 'crit', 'hp', 'attack', 'crit'],
  healer: ['hp', 'defense', 'attack', 'hp', 'lifesteal', 'defense', 'hp', 'attack', 'defense', 'hp'],
  support: ['hp', 'attack', 'defense', 'crit', 'hp', 'dodge', 'attack', 'defense', 'hp', 'crit'],
  controller: ['attack', 'dodge', 'crit', 'hp', 'attack', 'defense', 'dodge', 'crit', 'attack', 'hp'],
  summoner: ['attack', 'hp', 'defense', 'attack', 'crit', 'hp', 'lifesteal', 'attack', 'defense', 'hp'],
};

export const PASSIVE_LABELS = {
  attack: 'ضرر إضافي',
  defense: 'دفاع إضافي',
  crit: 'فرصة ضربة حرجة',
  hp: 'صحة قصوى',
  lifesteal: 'امتصاص حياة',
  dodge: 'مراوغة',
};

/** Size of a passive at a given level (before rank). Small on purpose: passives stack. */
export const passiveValue = (level) => 2 + Math.floor(level / 20);

const round = Math.round;
const tierOf = (level) => Math.min(5, Math.ceil(level / 20));
export const TIER_LABELS = ['', 'مبتدئ', 'متمرس', 'خبير', 'أستاذ', 'أسطوري'];

/** Status effects that skip a turn are capped hard, so no build can lock an opponent. */
function effectChance(effectKey, base) {
  if (effectKey === 'stun' || effectKey === 'freeze') return Math.min(0.3, base * 0.5);
  return Math.min(0.85, base);
}
const effectTurns = (effectKey, turns) => (effectKey === 'stun' || effectKey === 'freeze' ? 1 : turns);

const OFFENSIVE = new Set(['strength', 'agility', 'intelligence', 'luck']);

/** The stat a class hits with: its primary, or for tanks its secondary when that is offensive. */
export function offenseStat(cls) {
  if (OFFENSIVE.has(cls.primary)) return cls.primary;
  return OFFENSIVE.has(cls.secondary) ? cls.secondary : 'strength';
}

function scaleStat(cls, slot) {
  if (slot === 'guard' || slot === 'barrier') return cls.primary === 'intelligence' ? 'intelligence' : 'defense';
  if (slot === 'heal' || slot === 'heal2') return cls.primary === 'strength' ? 'endurance' : 'intelligence';
  if (slot === 'evade') return 'agility';
  return offenseStat(cls);
}

/** Numbers for one class skill. Everything grows with the unlock level. */
function buildNumbers(cls, slot, level) {
  const el = ELEMENTS[cls.element];
  const L = level;
  const base = {
    type: 'attack',
    target: 'enemy',
    power: 0,
    energyCost: 0,
    cooldownTurns: 0,
    scalingStat: scaleStat(cls, slot),
    effectKey: null,
    effectChance: 0,
    effectTurns: 0,
    extra: {},
  };
  switch (slot) {
    case 'strike':
    case 'strike2':
      return { ...base, power: round(105 + L * 1.7), energyCost: round(10 + L * 0.25), cooldownTurns: slot === 'strike' ? 1 : 2 };
    case 'debuff': {
      const k = el.debuff;
      return {
        ...base,
        power: round(90 + L * 1.4),
        energyCost: round(13 + L * 0.27),
        cooldownTurns: 3,
        effectKey: k,
        effectChance: effectChance(k, 0.55 + L * 0.002),
        effectTurns: effectTurns(k, 2 + Math.floor(L / 40)),
      };
    }
    case 'combo': {
      const hits = L >= 60 ? 4 : L >= 25 ? 3 : 2;
      return { ...base, power: round(115 + L * 1.9), energyCost: round(15 + L * 0.3), cooldownTurns: 3, extra: { hits } };
    }
    case 'pierce':
      return { ...base, power: round(110 + L * 1.7), energyCost: round(14 + L * 0.28), cooldownTurns: 3, extra: { pierce: Math.min(0.6, 0.25 + L * 0.003) } };
    case 'drain':
      return {
        ...base,
        power: round(100 + L * 1.5),
        energyCost: round(14 + L * 0.28),
        cooldownTurns: 3,
        extra: { lifesteal: Math.min(0.6, 0.25 + L * 0.0025) },
      };
    case 'guard':
      return {
        ...base,
        type: 'defense',
        target: 'self',
        energyCost: round(10 + L * 0.2),
        cooldownTurns: 4,
        effectKey: L >= 30 ? 'barrier' : 'defense_up',
        effectChance: 1,
        effectTurns: 3,
      };
    case 'barrier':
      return {
        ...base,
        type: 'defense',
        target: 'self',
        energyCost: round(12 + L * 0.22),
        cooldownTurns: 4,
        effectKey: 'barrier',
        effectChance: 1,
        effectTurns: 3,
      };
    case 'evade':
      return {
        ...base,
        type: 'utility',
        target: 'self',
        energyCost: round(10 + L * 0.2),
        cooldownTurns: 4,
        effectKey: 'haste',
        effectChance: 1,
        effectTurns: 3,
      };
    case 'heal':
    case 'heal2':
      return {
        ...base,
        type: 'healing',
        target: 'self',
        power: round(18 + L * 1.9),
        energyCost: round(14 + L * 0.3),
        cooldownTurns: slot === 'heal' ? 3 : 4,
        effectKey: slot === 'heal2' ? 'regeneration' : null,
        effectChance: slot === 'heal2' ? 1 : 0,
        effectTurns: slot === 'heal2' ? 3 : 0,
        extra: L >= 40 ? { cleanse: true } : {},
      };
    case 'buff':
      return {
        ...base,
        type: 'utility',
        target: 'self',
        energyCost: round(10 + L * 0.2),
        cooldownTurns: 4,
        effectKey: el.buff,
        effectChance: 1,
        effectTurns: 3,
      };
    case 'control':
    case 'control2': {
      const pool = ['weaken', 'vulnerable', el.debuff, 'blind', 'slow', 'silence'];
      const k = pool[Math.floor(L / 10) % pool.length];
      return {
        ...base,
        type: 'utility',
        power: round(70 + L * 1.1),
        energyCost: round(12 + L * 0.22),
        cooldownTurns: 4,
        effectKey: k,
        effectChance: effectChance(k, 0.75),
        effectTurns: effectTurns(k, 2 + Math.floor(L / 50)),
      };
    }
    case 'passive':
      return { ...base, type: 'passive', target: 'self', power: passiveValue(L), extra: { passive: PASSIVE_KINDS[cls.role][Math.floor(L / 10)] } };
    case 'ultimate': {
      const k = el.debuff;
      return {
        ...base,
        type: 'special',
        power: round(170 + L * 2.6),
        energyCost: round(28 + L * 0.34),
        cooldownTurns: 5,
        effectKey: k,
        effectChance: effectChance(k, 0.6),
        effectTurns: effectTurns(k, 2),
        extra: L >= 50 ? { pierce: 0.3 } : {},
      };
    }
    default:
      throw new Error(`unknown slot ${slot}`);
  }
}

// ── Descriptions ────────────────────────────────────────────────────────
const EFFECT_AR = {
  poison: 'السم',
  bleeding: 'النزيف',
  burn: 'الحرق',
  stun: 'الصعق',
  freeze: 'التجمد',
  silence: 'الإسكات',
  slow: 'الإبطاء',
  regeneration: 'التجدد',
  attack_up: 'تعزيز الهجوم',
  defense_up: 'تعزيز الدفاع',
  haste: 'التسارع',
  barrier: 'الحاجز',
  weaken: 'الإضعاف',
  vulnerable: 'الانكشاف',
  blind: 'العمى',
};

const FLAVOR = {
  strike: ['ضربة أساسية صقلها التدريب حتى صارت غريزة.', 'أول ما يتعلمه كل {class}، وآخر ما ينساه.', 'بسيطة في ظاهرها، قاتلة في توقيتها.'],
  strike2: ['هجوم ثانٍ يأتي من زاوية لا يتوقعها الخصم.', 'تقنية تُدرّس سراً في مدارس {class}.'],
  debuff: ['تترك أثراً يبقى بعد أن ينتهي الألم.', 'ضربة لا تكتفي بالجرح، بل تلعنه.', 'سلاح {element} في يد من يعرف أسراره.'],
  combo: ['سلسلة ضربات متلاحقة لا تترك مجالاً للتنفس.', 'إيقاع سريع تتعلمه اليد قبل العقل.'],
  pierce: ['تخترق الدروع كأنها ورق.', 'تبحث عن الثغرة في كل دفاع، وتجدها.'],
  drain: ['تسرق من الخصم حياته لتضيفها إلى حياتك.', 'كل جرح تصنعه يرمم جرحاً فيك.'],
  guard: ['يتخذ {class} وقفته الشهيرة ويصبح جداراً.', 'لحظة ثبات تكسر اندفاع العدو.'],
  barrier: ['حاجز من {element} يمتص الضربات قبل أن تصل.', 'درع لا يُرى، لكنه يُشعر به.'],
  evade: ['خفة تجعل الضربات تمر في الهواء.', 'جسدك يتحرك أسرع من أفكار خصمك.'],
  heal: ['تستدعي قوة {element} لترميم الجسد.', 'دفء يسري في العروق فيُطفئ الألم.'],
  heal2: ['شفاء عميق يستمر أثره لعدة أدوار.', 'ينبوع حياة لا ينضب سريعاً.'],
  buff: ['تشعل الطاقة الكامنة في داخلك.', 'نداء يوقظ القوة النائمة في روح {class}.'],
  control: ['تكبّل الخصم وتسلبه أفضل ما لديه.', 'خدعة تُفقد العدو توازنه.'],
  control2: ['سيطرة كاملة على ساحة المعركة.', 'من يملك الإيقاع يملك القتال.'],
  passive: ['قوة صامتة تعمل دائماً دون أن تطلبها.', 'خبرة السنين تتحول إلى طبيعة ثانية.'],
  ultimate: ['ذروة فن {class}. لا يستخدمها إلا من أتقن كل ما قبلها.', 'حين تُطلق، يتوقف الزمن للحظة.', 'قوة {element} في أنقى صورها وأكثرها رعباً.'],
};

function pick(list, seed) {
  return list[Math.abs(seed) % list.length];
}

export function describeSkill(s, { cls = null, flavorSeed = 0, slot = null } = {}) {
  const parts = [];
  if (slot && cls) {
    const el = ELEMENTS[cls.element];
    parts.push(
      pick(FLAVOR[slot] ?? FLAVOR.strike, flavorSeed)
        .replace('{class}', cls.nameAr)
        .replace('{element}', el?.name ?? ''),
    );
  }
  const stat = STAT_LABELS[s.scalingStat] ?? s.scalingStat;
  if (s.type === 'passive') {
    const kind = s.extra?.passive;
    const v = s.power;
    const amount = kind === 'defense' ? `+${v * 2}` : kind === 'dodge' ? `+${(v / 2).toFixed(1)}%` : kind === 'hp' ? `+${v * 2}%` : `+${v}%`;
    parts.push(`دائمة: ${PASSIVE_LABELS[kind] ?? kind} ${amount} لكل رتبة.`);
    return parts.join(' ');
  }
  if (s.type === 'healing') parts.push(`يستعيد ${s.power} صحة + (${stat} × 2.5).`);
  else if (s.power > 0 && s.target === 'enemy') {
    const hits = s.extra?.hits;
    parts.push(hits ? `${hits} ضربات بقوة إجمالية ${s.power}% تعتمد على ${stat}.` : `ضرر بقوة ${s.power}% يعتمد على ${stat}.`);
  }
  if (s.extra?.pierce) parts.push(`يتجاهل ${round(s.extra.pierce * 100)}% من دفاع الهدف.`);
  if (s.extra?.lifesteal) parts.push(`يمتص ${round(s.extra.lifesteal * 100)}% من الضرر كصحة.`);
  if (s.extra?.cleanse) parts.push('يزيل التأثيرات السلبية.');
  if (s.effectKey) {
    const name = EFFECT_AR[s.effectKey] ?? s.effectKey;
    parts.push(
      s.target === 'self'
        ? `يمنحك ${name} لمدة ${s.effectTurns} أدوار.`
        : `فرصة ${round(s.effectChance * 100)}% لإصابة الهدف بـ${name} (${s.effectTurns} أدوار).`,
    );
  }
  if (s.type === 'special') parts.push('لا يمكن مراوغتها.');
  return parts.join(' ');
}

// ── Paths (subclasses) ──────────────────────────────────────────────────
/**
 * 30 archetypes; each class combines them with its own vocabulary, so a Knight's
 * "طليعة الحصن" and a Pyromancer's "طليعة اللهب" share mechanics but not identity.
 * growth: extra stat points per level for the two listed stats.
 * bonus: permanent passive bonuses (same units as passive skills).
 */
export const PATHS = [
  {
    key: 'vanguard',
    title: 'طليعة',
    minLevel: 15,
    growth: ['defense', 'endurance'],
    bonus: { defense: 8, hp: 4 },
    sig: ['guard', 'strike', 'ultimate'],
    blurb: 'أول من يتقدم وآخر من يتراجع، يحمل {noun} في وجه العاصفة.',
  },
  {
    key: 'executioner',
    title: 'جلّاد',
    minLevel: 15,
    growth: ['strength', 'luck'],
    bonus: { crit: 5, attack: 3 },
    sig: ['pierce', 'debuff', 'ultimate'],
    blurb: 'لا يضرب مرتين. {noun} في يده حكمٌ لا استئناف له.',
  },
  {
    key: 'warden',
    title: 'حارس',
    minLevel: 15,
    growth: ['defense', 'intelligence'],
    bonus: { defense: 10, hp: 2 },
    sig: ['barrier', 'control', 'ultimate'],
    blurb: 'أقسم أن يحمي {noun} مهما كلّف الأمر.',
  },
  {
    key: 'tempest',
    title: 'عاصفة',
    minLevel: 15,
    growth: ['agility', 'strength'],
    bonus: { dodge: 4, attack: 2 },
    sig: ['combo', 'evade', 'ultimate'],
    blurb: 'سرعة لا تُلحق. يمر كالريح ويترك {noun} خلفه حطاماً.',
  },
  {
    key: 'sage',
    title: 'حكيم',
    minLevel: 15,
    growth: ['intelligence', 'luck'],
    bonus: { attack: 4, crit: 2 },
    sig: ['debuff', 'buff', 'ultimate'],
    blurb: 'قرأ كل ما كُتب عن {noun}، ثم كتب ما لم يُكتب.',
  },
  {
    key: 'zealot',
    title: 'متعصّب',
    minLevel: 15,
    growth: ['strength', 'endurance'],
    bonus: { attack: 5, lifesteal: 2 },
    sig: ['strike', 'drain', 'ultimate'],
    blurb: 'إيمانه بـ{noun} يحرق كل شك، وكل عدو.',
  },
  {
    key: 'phantom',
    title: 'شبح',
    minLevel: 15,
    growth: ['agility', 'luck'],
    bonus: { dodge: 6, crit: 2 },
    sig: ['evade', 'pierce', 'ultimate'],
    blurb: 'لا أحد يراه يأتي. {noun} آخر ما يراه الضحايا.',
  },
  {
    key: 'bulwark',
    title: 'سور',
    minLevel: 15,
    growth: ['endurance', 'defense'],
    bonus: { hp: 8, defense: 4 },
    sig: ['barrier', 'guard', 'ultimate'],
    blurb: 'جسد كالجبل، وصبر يفوق صبر {noun}.',
  },
  {
    key: 'duelist',
    title: 'مبارز',
    minLevel: 15,
    growth: ['agility', 'strength'],
    bonus: { crit: 4, dodge: 3 },
    sig: ['combo', 'strike', 'ultimate'],
    blurb: 'يعيش للمبارزة الفردية، ويرى في {noun} شريك رقص.',
  },
  {
    key: 'seer',
    title: 'عرّاف',
    minLevel: 15,
    growth: ['intelligence', 'luck'],
    bonus: { crit: 3, dodge: 3 },
    sig: ['control', 'heal', 'ultimate'],
    blurb: 'يرى ضربة خصمه قبل أن تولد، ويقرأ {noun} في النجوم.',
  },
  {
    key: 'reaver',
    title: 'ناهب',
    minLevel: 15,
    growth: ['strength', 'endurance'],
    bonus: { lifesteal: 5, attack: 2 },
    sig: ['drain', 'debuff', 'ultimate'],
    blurb: 'يأخذ ولا يعطي. حتى {noun} يخشى جوعه.',
  },
  {
    key: 'cyclone',
    title: 'إعصار',
    minLevel: 15,
    growth: ['agility', 'intelligence'],
    bonus: { attack: 3, dodge: 3 },
    sig: ['combo', 'combo', 'ultimate'],
    blurb: 'دوامة من الضربات لا تهدأ، يدور حول {noun} كإعصار.',
  },
  {
    key: 'sentinel',
    title: 'رقيب',
    minLevel: 15,
    growth: ['defense', 'agility'],
    bonus: { defense: 6, dodge: 3 },
    sig: ['guard', 'control', 'ultimate'],
    blurb: 'لا ينام. يراقب {noun} من أعلى برج في نكسس.',
  },
  {
    key: 'weaver',
    title: 'نسّاج',
    minLevel: 15,
    growth: ['intelligence', 'agility'],
    bonus: { attack: 2, dodge: 4 },
    sig: ['control', 'control', 'ultimate'],
    blurb: 'ينسج خيوط المعركة كما يشاء، ويحيك من {noun} شبكة.',
  },
  {
    key: 'stalker',
    title: 'مطارِد',
    minLevel: 15,
    growth: ['agility', 'luck'],
    bonus: { crit: 4, attack: 2 },
    sig: ['pierce', 'strike', 'ultimate'],
    blurb: 'يتبع أثر فريسته أياماً، و{noun} دليله.',
  },
  {
    key: 'martyr',
    title: 'شهيد',
    minLevel: 15,
    growth: ['endurance', 'intelligence'],
    bonus: { hp: 6, lifesteal: 2 },
    sig: ['heal', 'barrier', 'ultimate'],
    blurb: 'يتلقى الجراح عن رفاقه، ويقوم من كل سقوط باسم {noun}.',
  },
  {
    key: 'gambler',
    title: 'مقامر',
    minLevel: 15,
    growth: ['luck', 'agility'],
    bonus: { crit: 7 },
    sig: ['strike', 'buff', 'ultimate'],
    blurb: 'يراهن بكل شيء على رمية واحدة، و{noun} حظه الأخير.',
  },
  {
    key: 'tactician',
    title: 'مخطّط',
    minLevel: 15,
    growth: ['intelligence', 'defense'],
    bonus: { defense: 4, attack: 3 },
    sig: ['buff', 'control', 'ultimate'],
    blurb: 'المعركة عنده رقعة شطرنج، و{noun} أقوى قطعه.',
  },
  {
    key: 'rampager',
    title: 'مسعور',
    minLevel: 15,
    growth: ['strength', 'agility'],
    bonus: { attack: 6 },
    sig: ['combo', 'drain', 'ultimate'],
    blurb: 'حين يفقد السيطرة يصبح {noun} نفسه.',
  },
  {
    key: 'mystic',
    title: 'متصوّف',
    minLevel: 15,
    growth: ['intelligence', 'endurance'],
    bonus: { hp: 4, defense: 4 },
    sig: ['heal', 'buff', 'ultimate'],
    blurb: 'وجد في {noun} سلاماً داخلياً لا تهزه الحروب.',
  },
  {
    key: 'conqueror',
    title: 'فاتح',
    minLevel: 20,
    growth: ['strength', 'defense'],
    bonus: { attack: 4, defense: 4 },
    sig: ['strike', 'guard', 'ultimate'],
    blurb: 'يرفع {noun} فوق كل أرض يطؤها.',
  },
  {
    key: 'umbra',
    title: 'ظِلّ',
    minLevel: 20,
    growth: ['agility', 'intelligence'],
    bonus: { crit: 5, dodge: 3 },
    sig: ['pierce', 'evade', 'ultimate'],
    blurb: 'يعيش في العتمة التي يلقيها {noun}.',
  },
  {
    key: 'eclipse',
    title: 'كسوف',
    minLevel: 25,
    growth: ['intelligence', 'strength'],
    bonus: { attack: 4, lifesteal: 2 },
    sig: ['debuff', 'debuff', 'ultimate'],
    blurb: 'حين يحجب {noun} الشمس، تبدأ قوته الحقيقية.',
  },
  {
    key: 'dawn',
    title: 'فجر',
    minLevel: 25,
    growth: ['intelligence', 'endurance'],
    bonus: { hp: 5, defense: 3 },
    sig: ['heal', 'strike', 'ultimate'],
    blurb: 'يأتي بعد أحلك الليالي، حاملاً {noun} كأول خيط نور.',
  },
  {
    key: 'titan',
    title: 'عملاق',
    minLevel: 30,
    growth: ['endurance', 'strength'],
    bonus: { hp: 10, attack: 2 },
    sig: ['guard', 'combo', 'ultimate'],
    blurb: 'كبر حتى صار {noun} في يده كلعبة طفل.',
  },
  {
    key: 'comet',
    title: 'مذنّب',
    minLevel: 30,
    growth: ['strength', 'intelligence'],
    bonus: { attack: 5, crit: 3 },
    sig: ['pierce', 'strike', 'ultimate'],
    blurb: 'يمر مرة كل ألف عام، و{noun} ذيله المشتعل.',
  },
  {
    key: 'serpent',
    title: 'أفعى',
    minLevel: 35,
    growth: ['agility', 'intelligence'],
    bonus: { attack: 3, dodge: 4 },
    sig: ['debuff', 'control', 'ultimate'],
    blurb: 'صبور كالأفعى، ولدغته تحمل سمّ {noun}.',
  },
  {
    key: 'eternal',
    title: 'أبديّ',
    minLevel: 40,
    growth: ['endurance', 'defense'],
    bonus: { hp: 6, defense: 6 },
    sig: ['heal', 'barrier', 'ultimate'],
    blurb: 'لم يعد يشيخ. ربط روحه بـ{noun} إلى الأبد.',
  },
  {
    key: 'sovereign',
    title: 'سيّد',
    minLevel: 50,
    growth: ['strength', 'intelligence'],
    bonus: { attack: 4, defense: 4, crit: 3 },
    sig: ['buff', 'pierce', 'ultimate'],
    blurb: 'لا ينحني لأحد. {noun} تاجه وعرشه.',
  },
  {
    key: 'mythic',
    title: 'أسطورة',
    minLevel: 60,
    growth: ['luck', 'endurance'],
    bonus: { attack: 3, hp: 4, crit: 3, dodge: 2 },
    sig: ['combo', 'drain', 'ultimate'],
    blurb: 'لم يعد بشراً بل حكاية تُروى. {noun} جزء من اسمه.',
  },
];
export const PATH_BY_KEY = Object.fromEntries(PATHS.map((p) => [p.key, p]));
export const SIGNATURE_LEVELS = [15, 45, 80];

/** The 30 subclasses of a class. */
export function subclassesOf(cls) {
  return PATHS.map((p, i) => {
    const noun = cls.nouns[i % cls.nouns.length];
    return {
      key: `${cls.key}.${p.key}`,
      path: p.key,
      classKey: cls.key,
      name: `${p.title} ${noun}`,
      minLevel: p.minLevel,
      growth: p.growth,
      bonus: p.bonus,
      blurb: p.blurb.replace('{noun}', noun),
      noun,
      index: i,
    };
  });
}

export function subclassByKey(key) {
  const [ck, pk] = String(key ?? '').split('.');
  const cls = CLASS_BY_KEY[ck];
  if (!cls || !PATH_BY_KEY[pk]) return null;
  return subclassesOf(cls).find((s) => s.path === pk) ?? null;
}

const SIG_WORDS = ['فن', 'ذروة', 'سرّ'];

function slotForm(cls, slot) {
  return SLOT_FORM[slot] ?? attackStyle(cls);
}

// ── Generation ──────────────────────────────────────────────────────────
function classSkills(cls) {
  const slots = SLOT_BY_ROLE[cls.role];
  const out = [];
  const used = new Set();
  for (let L = 1; L <= 100; L++) {
    const i = L - 1;
    const pos = i % 10;
    const decade = Math.floor(i / 10);
    const slot = slots[pos];
    const forms = FORMS[slotForm(cls, slot)];
    const noun = cls.nouns[pos];
    let form = forms[(decade + pos * 3) % forms.length];
    if (noun.includes(form)) form = forms[(decade + pos * 3 + 11) % forms.length];
    let name = `${form} ${noun}`;
    if (used.has(name)) name = `${name} ${TIER_LABELS[tierOf(L)]}`;
    used.add(name);
    const n = buildNumbers(cls, slot, L);
    const key = `c_${cls.key}_${String(L).padStart(3, '0')}`;
    const skill = {
      key,
      name: `${cls.name} ${L}`,
      nameAr: name,
      classKey: cls.key,
      subclassKey: null,
      tier: tierOf(L),
      element: cls.element,
      requiredLevel: L,
      slot,
      discipline: `class:${cls.key}`,
      ...n,
    };
    skill.description = describeSkill(skill, { cls, slot, flavorSeed: L * 7 + cls.key.length });
    out.push(skill);
  }
  return out;
}

function signatureSkills(cls) {
  const out = [];
  for (const sub of subclassesOf(cls)) {
    const path = PATH_BY_KEY[sub.path];
    path.sig.forEach((slot, k) => {
      const L = Math.max(SIGNATURE_LEVELS[k], sub.minLevel);
      const n = buildNumbers(cls, slot, L);
      // Signature skills are a notch stronger than class skills of the same level.
      if (n.power && n.type !== 'passive') n.power = round(n.power * 1.12);
      const skill = {
        key: `p_${cls.key}_${path.key}_${k + 1}`,
        name: `${cls.name} ${path.key} ${k + 1}`,
        nameAr: `${SIG_WORDS[k]} ${sub.name}`,
        classKey: cls.key,
        subclassKey: sub.key,
        tier: tierOf(L),
        element: cls.element,
        requiredLevel: L,
        slot,
        discipline: `path:${path.key}`,
        ...n,
      };
      skill.description = `${k === 2 ? 'المهارة المطلقة' : 'مهارة توقيع'} لمسار ${sub.name}. ${describeSkill(skill)}`;
      out.push(skill);
    });
  }
  return out;
}

let cache = null;

/** Every generated skill (class + signature). Built once and memoised. */
export function allGeneratedSkills() {
  if (cache) return cache;
  cache = [];
  for (const cls of CLASSES) cache.push(...classSkills(cls), ...signatureSkills(cls));
  return cache;
}

export function skillsOfClass(classKey) {
  return allGeneratedSkills().filter((s) => s.classKey === classKey && !s.subclassKey);
}

export function signatureOf(subclassKey) {
  return allGeneratedSkills().filter((s) => s.subclassKey === subclassKey);
}

// ── Stats ───────────────────────────────────────────────────────────────
/**
 * Automatic stat growth from class and path, on top of points the player allocates.
 * Primary +0.5/level, secondary +0.3/level, path growth +0.2/level each.
 */
export function classStatBonus(classKey, subclassKey, level) {
  const out = Object.fromEntries(STAT_KEYS.map((s) => [s, 0]));
  const cls = CLASS_BY_KEY[classKey];
  if (!cls) return out;
  out[cls.primary] += 3 + Math.floor(level * 0.5);
  out[cls.secondary] += 2 + Math.floor(level * 0.3);
  // Every class hardens with experience; without this, classes whose secondary is luck or a
  // second offensive stat fell far behind tanks and healers in simulated fights.
  const sturdy = cls.secondary === 'endurance' || cls.secondary === 'defense' || cls.primary === 'defense' || cls.primary === 'endurance';
  out.endurance += sturdy ? Math.floor(level * 0.1) : 2 + Math.floor(level * 0.3);
  out.defense += sturdy ? 0 : Math.floor(level * 0.15);
  const sub = subclassByKey(subclassKey);
  if (sub) {
    const span = Math.max(0, level - sub.minLevel + 1);
    for (const s of sub.growth) out[s] += Math.floor(span * 0.2);
  }
  return out;
}

/** Passive bonuses granted by the chosen path (same units as passive skills). */
export function pathBonus(subclassKey) {
  return subclassByKey(subclassKey)?.bonus ?? {};
}

/** Stable fingerprint of the generated content; the DB sync is skipped when it hasn't changed. */
export function contentFingerprint() {
  let h = 2166136261;
  const str = JSON.stringify(allGeneratedSkills());
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return `v1-${allGeneratedSkills().length}-${(h >>> 0).toString(16)}`;
}
