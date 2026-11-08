/**
 * كل محتوى لعبة Nexus في مكان واحد: الفئات، المهارات، المناطق، الوحوش، الزعماء،
 * القصة، الأدوات، المتجر والمهام اليومية. الخادم يعتمد على هذا الملف وحده،
 * والواجهة تستلم نسخة منه عبر /api/content.
 *
 * كل حقل icon هو اسم أيقونة من مجموعة game-icons.net (رخصة CC BY 3.0).
 * سكربت scripts/extract-art.js ينسخ الأيقونات المستخدمة فقط إلى client/public/art.
 */

export const MAX_LEVEL = 40;
export const BAG_LIMIT = 40;
export const POTIONS_PER_BATTLE = 3;

// ───────────────────────── الحالات (Status effects) ─────────────────────────
export const STATUSES = {
  burn: { name: 'حرق', icon: 'flame', color: '#fb923c', kind: 'dot' },
  poison: { name: 'سم', icon: 'poison-bottle', color: '#84cc16', kind: 'dot' },
  bleed: { name: 'نزيف', icon: 'bleeding-wound', color: '#ef4444', kind: 'dot' },
  stun: { name: 'صعق', icon: 'stun-grenade', color: '#facc15', kind: 'control' },
  freeze: { name: 'تجمّد', icon: 'frozen-orb', color: '#7dd3fc', kind: 'control' },
  silence: { name: 'إسكات', icon: 'silenced', color: '#c084fc', kind: 'control' },
  shield: { name: 'درع', icon: 'bolt-shield', color: '#38bdf8', kind: 'buff' },
  regen: { name: 'تجدد', icon: 'heart-drop', color: '#4ade80', kind: 'buff' },
  atk_up: { name: 'قوة', icon: 'muscle-up', color: '#f59e0b', kind: 'buff' },
  def_up: { name: 'صلابة', icon: 'armor-upgrade', color: '#60a5fa', kind: 'buff' },
  spd_up: { name: 'سرعة', icon: 'sprint', color: '#a7f3d0', kind: 'buff' },
  crit_up: { name: 'تركيز', icon: 'target-arrows', color: '#fde047', kind: 'buff' },
  evade: { name: 'مراوغة', icon: 'invisible', color: '#a78bfa', kind: 'buff' },
  summon: { name: 'تابع', icon: 'raise-skeleton', color: '#94a3b8', kind: 'buff' },
  weaken: { name: 'وهن', icon: 'broken-shield', color: '#f43f5e', kind: 'debuff' },
  armor_break: { name: 'كسر الدرع', icon: 'spiky-explosion', color: '#fb7185', kind: 'debuff' },
  mark: { name: 'علامة', icon: 'dead-eye', color: '#e879f9', kind: 'debuff' },
};

// ───────────────────────── الندرة ─────────────────────────
export const RARITIES = {
  common: { name: 'شائع', color: '#94a3b8', mult: 1, order: 0, pvpDrop: 0.25, sell: 8 },
  rare: { name: 'نادر', color: '#38bdf8', mult: 1.25, order: 1, pvpDrop: 0.15, sell: 20 },
  epic: { name: 'ملحمي', color: '#a78bfa', mult: 1.55, order: 2, pvpDrop: 0.08, sell: 55 },
  legendary: { name: 'أسطوري', color: '#f59e0b', mult: 1.9, order: 3, pvpDrop: 0.03, sell: 140 },
  mythic: { name: 'خرافي', color: '#f43f5e', mult: 2.4, order: 4, pvpDrop: 0.01, sell: 350 },
  secret: { name: 'سرّي', color: '#22d3ee', mult: 3.2, order: 5, pvpDrop: 0.0001, sell: 1200 },
};

// ───────────────────────── المهارات ─────────────────────────
// kind: attack | heal | shield | buff | debuff
// power: مضاعف الهجوم للضرر، أو نسبة من أقصى صحة للشفاء/الدرع
// effects: [{ status, chance, turns, value, self? }]
const S = (id, name, icon, o) => ({ id, name, icon, cost: 0, cd: 0, unlock: 1, hits: 1, effects: [], ...o });

export const BASIC_ATTACK = S('strike', 'ضربة', 'sword-brandish', { kind: 'attack', power: 1, desc: 'هجوم عادي يعيد بعض الطاقة.' });

export const CLASSES = [
  {
    key: 'knight',
    name: 'فارس الحصن',
    icon: 'visored-helm',
    color: '#60a5fa',
    role: 'مدافع',
    blurb: 'حامل القسم القديم. يقف بين الضعفاء والخطر، ودرعه حدٌّ لا يُعبر.',
    base: { hp: 150, atk: 12, def: 14, spd: 8, crit: 5, mp: 60 },
    growth: { hp: 20, atk: 2.8, def: 2.2, spd: 0.3, crit: 0.1, mp: 1.5 },
    passive: { name: 'جدار الحديد', desc: 'يتلقى ضرراً أقل بنسبة 12%.', dmgTaken: 0.88 },
    skills: [
      S('shield_bash', 'ضربة الدرع', 'shield-bash', { kind: 'attack', power: 1.2, cost: 14, cd: 2, effects: [{ status: 'stun', chance: 0.3, turns: 1 }], desc: 'تصدم العدو وقد تصعقه.' }),
      S('bulwark', 'حصن الإيمان', 'checked-shield', { kind: 'shield', power: 0.25, cost: 20, cd: 4, desc: 'درع يمتص 25% من صحتك.' }),
      S('war_cry', 'صرخة الحرب', 'shouting', { kind: 'buff', cost: 15, cd: 4, unlock: 4, effects: [{ status: 'atk_up', chance: 1, turns: 3, value: 0.3, self: true }], desc: 'يرفع هجومك 30% لثلاث جولات.' }),
      S('sky_split', 'شق السماء', 'sword-wound', { kind: 'attack', power: 2.2, cost: 30, cd: 3, unlock: 8, effects: [{ status: 'armor_break', chance: 1, turns: 2, value: 0.25 }], desc: 'ضربة هائلة تكسر دفاع العدو.' }),
      S('last_oath', 'قسم الحارس الأخير', 'knight-banner', { kind: 'heal', power: 0.3, cost: 40, cd: 6, unlock: 14, effects: [{ status: 'def_up', chance: 1, turns: 3, value: 0.4, self: true }], desc: 'يشفيك 30% ويرفع دفاعك.' }),
    ],
  },
  {
    key: 'assassin',
    name: 'قاتل الظل',
    icon: 'hooded-assassin',
    color: '#a78bfa',
    role: 'قاتل',
    blurb: 'لا يُرى إلا حين يسقط خصمه. سرعة، خداع، وضربات حرجة قاتلة.',
    base: { hp: 115, atk: 16, def: 8, spd: 14, crit: 20, mp: 60 },
    growth: { hp: 17, atk: 3.3, def: 1.9, spd: 0.6, crit: 0.25, mp: 1.5 },
    passive: { name: 'نصل الغدر', desc: 'الضربات الحرجة تسبب ضعف الضرر.', critMul: 2 },
    skills: [
      S('venom_stab', 'طعنة سامة', 'stiletto', { kind: 'attack', power: 1.1, cost: 12, cd: 2, effects: [{ status: 'poison', chance: 0.8, turns: 3, value: 0.35 }], desc: 'تسمم العدو لثلاث جولات.' }),
      S('shadow_step', 'خطوة الظل', 'cloak-dagger', { kind: 'buff', cost: 18, cd: 4, effects: [{ status: 'evade', chance: 1, turns: 2, value: 0.5, self: true }], desc: 'فرصة 50% لتفادي الهجمات.' }),
      S('rend', 'تمزيق', 'triple-scratches', { kind: 'attack', power: 0.55, hits: 3, cost: 22, cd: 3, unlock: 4, effects: [{ status: 'bleed', chance: 0.5, turns: 3, value: 0.3 }], desc: 'ثلاث ضربات سريعة تسبب النزيف.' }),
      S('death_mark', 'علامة الموت', 'dead-eye', { kind: 'debuff', cost: 15, cd: 4, unlock: 8, effects: [{ status: 'mark', chance: 1, turns: 3, value: 0.3 }], desc: 'العدو يتلقى ضرراً أكثر بـ 30%.' }),
      S('silent_end', 'الإعدام الصامت', 'decapitation', { kind: 'attack', power: 3, cost: 40, cd: 5, unlock: 14, execute: 0.3, desc: 'ضرر مضاعف إن كانت صحة العدو أقل من 30%.' }),
    ],
  },
  {
    key: 'ranger',
    name: 'رامي البراري',
    icon: 'high-shot',
    color: '#34d399',
    role: 'رامٍ',
    blurb: 'يصيب الهدف من حيث لا يتوقع. للريح صوت، وسهامه أسرع منه.',
    base: { hp: 120, atk: 15, def: 9, spd: 12, crit: 15, mp: 60 },
    growth: { hp: 17.5, atk: 3.2, def: 1.9, spd: 0.5, crit: 0.2, mp: 1.5 },
    passive: { name: 'عين القنّاص', desc: 'ضرر أعلى بنسبة 15%.', dmgMul: 1.15 },
    skills: [
      S('double_shot', 'رمية مزدوجة', 'double-shot', { kind: 'attack', power: 0.75, hits: 2, cost: 12, cd: 1, desc: 'سهمان متتاليان.' }),
      S('fire_arrow', 'سهم مشتعل', 'flaming-arrow', { kind: 'attack', power: 1.3, cost: 16, cd: 2, effects: [{ status: 'burn', chance: 0.7, turns: 3, value: 0.35 }], desc: 'يحرق العدو.' }),
      S('vine_trap', 'فخ الكروم', 'wolf-trap', { kind: 'attack', power: 0.6, cost: 18, cd: 4, unlock: 4, effects: [{ status: 'stun', chance: 0.6, turns: 1 }], desc: 'فخ يشل حركة العدو.' }),
      S('hawk_eye', 'عين الصقر', 'hawk-emblem', { kind: 'buff', cost: 15, cd: 4, unlock: 8, effects: [{ status: 'crit_up', chance: 1, turns: 3, value: 40, self: true }], desc: '+40% فرصة ضربة حرجة.' }),
      S('arrow_rain', 'مطر السهام', 'arrow-cluster', { kind: 'attack', power: 0.6, hits: 5, cost: 42, cd: 5, unlock: 14, desc: 'خمسة سهام تمطر على العدو.' }),
    ],
  },
  {
    key: 'mage',
    name: 'الساحر الأزلي',
    icon: 'pointy-hat',
    color: '#38bdf8',
    role: 'ساحر',
    blurb: 'يطوّع قوانين العالم بالكلمات. النار والجليد والبرق طوع يديه.',
    base: { hp: 95, atk: 18, def: 6, spd: 10, crit: 10, mp: 90 },
    growth: { hp: 12.5, atk: 3.6, def: 1.2, spd: 0.4, crit: 0.15, mp: 2.5 },
    passive: { name: 'فيض الأثير', desc: 'يستعيد طاقة أكثر بنسبة 50% كل جولة.', mpRegen: 1.5 },
    skills: [
      S('fireball', 'كرة نار', 'fireball', { kind: 'attack', power: 1.5, cost: 18, cd: 1, effects: [{ status: 'burn', chance: 0.5, turns: 2, value: 0.4 }], desc: 'كرة لهب قد تحرق العدو.' }),
      S('ice_spear', 'رمح الجليد', 'ice-spear', { kind: 'attack', power: 1.3, cost: 18, cd: 2, effects: [{ status: 'freeze', chance: 0.35, turns: 1 }], desc: 'قد يجمّد العدو جولة.' }),
      S('arcane_ward', 'درع أزلي', 'magic-shield', { kind: 'shield', power: 0.3, cost: 25, cd: 4, unlock: 4, desc: 'درع يمتص 30% من صحتك.' }),
      S('chain_lightning', 'سلسلة البرق', 'lightning-arc', { kind: 'attack', power: 0.75, hits: 3, cost: 32, cd: 3, unlock: 8, effects: [{ status: 'stun', chance: 0.15, turns: 1 }], desc: 'ثلاث صواعق متتالية.' }),
      S('nexus_meteor', 'نيزك النيكسس', 'meteor-impact', { kind: 'attack', power: 3.4, cost: 55, cd: 5, unlock: 14, effects: [{ status: 'burn', chance: 1, turns: 3, value: 0.5 }], desc: 'نيزك من قلب النيكسس.' }),
    ],
  },
  {
    key: 'cleric',
    name: 'كاهن النور',
    icon: 'holy-symbol',
    color: '#fde68a',
    role: 'شافٍ',
    blurb: 'نورٌ يشفي وإيمانٌ يحمي. لا يسقط ما دام في قلبه دعاء.',
    base: { hp: 125, atk: 13, def: 10, spd: 9, crit: 8, mp: 80 },
    growth: { hp: 16, atk: 2.7, def: 1.7, spd: 0.3, crit: 0.1, mp: 2 },
    passive: { name: 'بركة', desc: 'الشفاء أقوى بنسبة 25%.', healMul: 1.25 },
    skills: [
      S('smite', 'ضوء عقابي', 'sun-radiations', { kind: 'attack', power: 1.3, cost: 12, cd: 1, effects: [{ status: 'weaken', chance: 0.4, turns: 2, value: 0.25 }], desc: 'يضعف هجوم العدو.' }),
      S('mend', 'لمسة الشفاء', 'healing', { kind: 'heal', power: 0.3, cost: 22, cd: 3, desc: 'يشفيك 30%.' }),
      S('blessing', 'نعمة', 'heart-plus', { kind: 'buff', cost: 18, cd: 5, unlock: 4, effects: [{ status: 'regen', chance: 1, turns: 4, value: 0.08, self: true }], desc: 'تجدد 8% من الصحة كل جولة.' }),
      S('judgement', 'حكم سماوي', 'angel-wings', { kind: 'attack', power: 2.4, cost: 30, cd: 3, unlock: 8, desc: 'عمود نور يسقط من السماء.' }),
      S('dawn_rebirth', 'قيامة الفجر', 'angel-outfit', { kind: 'heal', power: 0.5, cost: 45, cd: 6, unlock: 14, cleanse: true, effects: [{ status: 'def_up', chance: 1, turns: 3, value: 0.3, self: true }], desc: 'شفاء 50% وإزالة اللعنات.' }),
    ],
  },
  {
    key: 'necromancer',
    name: 'مستحضر العتمة',
    icon: 'death-skull',
    color: '#f43f5e',
    role: 'مستنزف',
    blurb: 'قوة محرّمة ثمنها دائماً باهظ. يتغذى على حياة أعدائه.',
    base: { hp: 110, atk: 17, def: 8, spd: 9, crit: 10, mp: 80 },
    growth: { hp: 13, atk: 3.4, def: 1.2, spd: 0.35, crit: 0.15, mp: 2 },
    passive: { name: 'عطش الأرواح', desc: 'يستعيد 10% من كل ضرر يسببه.', lifesteal: 0.1 },
    skills: [
      S('wither', 'لمسة الذبول', 'claw-slashes', { kind: 'attack', power: 1.2, cost: 12, cd: 1, lifesteal: 0.4, desc: 'يسرق 40% من الضرر كصحة.' }),
      S('curse', 'لعنة الوهن', 'cursed-star', { kind: 'debuff', cost: 16, cd: 3, effects: [{ status: 'weaken', chance: 1, turns: 3, value: 0.3 }, { status: 'poison', chance: 1, turns: 3, value: 0.3 }], desc: 'يضعف العدو ويسممه.' }),
      S('raise_dead', 'استدعاء هيكل', 'raise-skeleton', { kind: 'buff', cost: 25, cd: 5, unlock: 4, effects: [{ status: 'summon', chance: 1, turns: 4, value: 0.6, self: true }], desc: 'هيكل عظمي يهاجم كل جولة.' }),
      S('soul_reap', 'حصاد الأرواح', 'reaper-scythe', { kind: 'attack', power: 2.5, cost: 32, cd: 3, unlock: 8, lifesteal: 0.3, desc: 'منجل يحصد الصحة.' }),
      S('death_tide', 'طوفان الموت', 'vampire-dracula', { kind: 'attack', power: 3, cost: 50, cd: 5, unlock: 14, effects: [{ status: 'poison', chance: 1, turns: 3, value: 0.5 }], desc: 'موجة عتمة سامة.' }),
    ],
  },
  {
    key: 'engineer',
    name: 'المهندس التقني',
    icon: 'robot-golem',
    color: '#22d3ee',
    role: 'مُصنّع',
    blurb: 'عقلٌ صنع من الحديد معجزات. أبراجه وآلاته تقاتل عنه.',
    base: { hp: 120, atk: 15, def: 11, spd: 9, crit: 8, mp: 70 },
    growth: { hp: 16, atk: 3.2, def: 1.8, spd: 0.3, crit: 0.1, mp: 1.8 },
    passive: { name: 'سبائك معززة', desc: 'الدروع أقوى بنسبة 25%.', shieldMul: 1.25 },
    skills: [
      S('rivet_shot', 'طلقة مسمارية', 'cog', { kind: 'attack', power: 0.65, hits: 2, cost: 10, cd: 1, desc: 'طلقتان من مسدس المسامير.' }),
      S('turret', 'برج حراسة', 'sentry-gun', { kind: 'buff', cost: 24, cd: 5, effects: [{ status: 'summon', chance: 1, turns: 4, value: 0.55, self: true }], desc: 'برج يطلق النار كل جولة.' }),
      S('shock', 'صدمة كهربائية', 'electric', { kind: 'attack', power: 1.2, cost: 18, cd: 3, unlock: 4, effects: [{ status: 'stun', chance: 0.4, turns: 1 }], desc: 'قد تصعق العدو.' }),
      S('nano_shield', 'درع نانوي', 'energy-shield', { kind: 'shield', power: 0.3, cost: 22, cd: 4, unlock: 8, desc: 'درع يمتص 30% من صحتك.' }),
      S('iron_titan', 'العملاق الحديدي', 'battle-mech', { kind: 'attack', power: 3.2, cost: 50, cd: 5, unlock: 14, effects: [{ status: 'armor_break', chance: 1, turns: 2, value: 0.3 }], desc: 'آلة قتال عملاقة تسحق العدو.' }),
    ],
  },
  {
    key: 'riftwalker',
    name: 'سائر الأبعاد',
    icon: 'portal',
    color: '#e879f9',
    role: 'متحكم',
    blurb: 'جاء من خلف البوابة، ولا يشبه أحداً. يثني الزمان والمكان.',
    base: { hp: 110, atk: 16, def: 8, spd: 12, crit: 12, mp: 75 },
    growth: { hp: 14.5, atk: 3.3, def: 1.4, spd: 0.5, crit: 0.15, mp: 2 },
    passive: { name: 'جسد متذبذب', desc: 'فرصة 10% لتفادي أي هجوم.', evade: 0.1 },
    skills: [
      S('rift_tear', 'شق البعد', 'magic-swirl', { kind: 'attack', power: 1.4, cost: 14, cd: 2, effects: [{ status: 'silence', chance: 0.3, turns: 2 }], desc: 'قد يُسكت العدو.' }),
      S('time_swap', 'تبادل زمني', 'sands-of-time', { kind: 'heal', power: 0.2, cost: 20, cd: 4, effects: [{ status: 'spd_up', chance: 1, turns: 3, value: 0.3, self: true }], desc: 'يشفيك ويسرّعك.' }),
      S('void_echo', 'صدى الفراغ', 'black-hole-bolas', { kind: 'attack', power: 1, cost: 16, cd: 3, unlock: 4, effects: [{ status: 'mark', chance: 1, turns: 3, value: 0.2 }], desc: 'يضع علامة الفراغ على العدو.' }),
      S('reality_break', 'انهيار الواقع', 'vortex', { kind: 'attack', power: 2.6, cost: 32, cd: 3, unlock: 8, pierce: true, desc: 'يتجاهل دفاع العدو بالكامل.' }),
      S('nexus_gate', 'بوابة النيكسس', 'magic-portal', { kind: 'attack', power: 3.6, cost: 55, cd: 5, unlock: 14, desc: 'يفتح بوابة تبتلع العدو.' }),
    ],
  },
];

// ───────────────────────── مهارات الوحوش ─────────────────────────
export const MONSTER_SKILLS = {
  claw: S('m_claw', 'مخالب', 'claw-slashes', { kind: 'attack', power: 1.15, cd: 2, effects: [{ status: 'bleed', chance: 0.4, turns: 2, value: 0.3 }] }),
  bite: S('m_bite', 'عضة', 'fangs', { kind: 'attack', power: 1.3, cd: 2 }),
  venom: S('m_venom', 'نفث السم', 'poison-bottle', { kind: 'attack', power: 0.9, cd: 3, effects: [{ status: 'poison', chance: 0.8, turns: 3, value: 0.3 }] }),
  fire: S('m_fire', 'لهيب', 'dragon-breath', { kind: 'attack', power: 1.4, cd: 3, effects: [{ status: 'burn', chance: 0.6, turns: 2, value: 0.35 }] }),
  frost: S('m_frost', 'نفس الصقيع', 'ice-bolt', { kind: 'attack', power: 1.2, cd: 3, effects: [{ status: 'freeze', chance: 0.25, turns: 1 }] }),
  slam: S('m_slam', 'سحق', 'fist', { kind: 'attack', power: 1.6, cd: 3, effects: [{ status: 'stun', chance: 0.2, turns: 1 }] }),
  roar: S('m_roar', 'زئير', 'shouting', { kind: 'buff', cd: 4, effects: [{ status: 'atk_up', chance: 1, turns: 3, value: 0.25, self: true }] }),
  harden: S('m_harden', 'تصلّب', 'bolt-shield', { kind: 'shield', power: 0.18, cd: 4 }),
  drain: S('m_drain', 'امتصاص', 'heart-drop', { kind: 'attack', power: 1.1, cd: 3, lifesteal: 0.5 }),
  hex: S('m_hex', 'لعنة', 'cursed-star', { kind: 'debuff', cd: 4, effects: [{ status: 'weaken', chance: 1, turns: 2, value: 0.25 }] }),
  mend: S('m_mend', 'ترميم', 'healing', { kind: 'heal', power: 0.18, cd: 4 }),
  shock: S('m_shock', 'صاعقة', 'electric', { kind: 'attack', power: 1.25, cd: 3, effects: [{ status: 'stun', chance: 0.25, turns: 1 }] }),
  void: S('m_void', 'لمسة الفراغ', 'black-hole-bolas', { kind: 'attack', power: 1.5, cd: 3, effects: [{ status: 'silence', chance: 0.3, turns: 1 }] }),
  quake: S('m_quake', 'زلزال', 'dust-cloud', { kind: 'attack', power: 2, cd: 4, effects: [{ status: 'armor_break', chance: 1, turns: 2, value: 0.2 }] }),
};

// archetype multipliers for monsters
export const ARCHETYPES = {
  brute: { hp: 1.15, atk: 1.05, def: 1, spd: 0.9 },
  swift: { hp: 0.85, atk: 1.05, def: 0.8, spd: 1.3 },
  caster: { hp: 0.9, atk: 1.15, def: 0.85, spd: 1 },
  tank: { hp: 1.35, atk: 0.85, def: 1.35, spd: 0.8 },
};

const M = (id, name, icon, color, type, skills) => ({ id, name, icon, color, type, skills });

// ───────────────────────── المناطق ─────────────────────────
export const REGIONS = [
  {
    id: 'dawn',
    name: 'سهول الفجر',
    icon: 'sun',
    levels: [1, 6],
    colors: ['#0f2a4a', '#f59e0b'],
    desc: 'سهول ذهبية عند بوابة النيكسس، حيث تبدأ كل حكاية.',
    monsters: [
      M('plains_wolf', 'ذئب البراري', 'wolf-head', '#cbd5e1', 'swift', ['bite', 'claw']),
      M('dew_slime', 'هلام الندى', 'transparent-slime', '#7dd3fc', 'tank', ['harden', 'slam']),
      M('plains_goblin', 'عفريت السهول', 'goblin-head', '#86efac', 'swift', ['claw', 'venom']),
      M('wild_boar', 'خنزير هائج', 'boar', '#fdba74', 'brute', ['slam', 'roar']),
    ],
    boss: M('gorg', 'قرقور ملك العفاريت', 'ogre', '#4ade80', 'brute', ['slam', 'roar', 'quake']),
    shard: 'شظية الفجر',
  },
  {
    id: 'forest',
    name: 'غابة الهمس',
    icon: 'pine-tree',
    levels: [6, 12],
    colors: ['#052e1a', '#22c55e'],
    desc: 'أشجار تتكلم ليلاً، وظلال تتحرك حين لا تنظر.',
    monsters: [
      M('shade_spider', 'عنكبوت الظلال', 'spider-alt', '#a78bfa', 'swift', ['venom', 'bite']),
      M('cursed_tree', 'شجرة ملعونة', 'evil-tree', '#65a30d', 'tank', ['harden', 'drain']),
      M('branch_witch', 'ساحرة الأغصان', 'witch-face', '#a3e635', 'caster', ['hex', 'venom', 'mend']),
      M('moss_bear', 'دب الطحالب', 'bear-head', '#a16207', 'brute', ['claw', 'roar']),
    ],
    boss: M('nagra', 'ناغرا الأفعى العتيقة', 'hydra', '#16a34a', 'caster', ['venom', 'bite', 'mend', 'hex']),
    shard: 'شظية الهمس',
  },
  {
    id: 'desert',
    name: 'صحراء الرماد',
    icon: 'cactus',
    levels: [12, 18],
    colors: ['#3b1d0a', '#f97316'],
    desc: 'رمال حارقة دفنت مملكة كاملة، ولا تزال ملوكها تحرس كنوزها.',
    monsters: [
      M('sand_scorpion', 'عقرب الرمال', 'scorpion', '#f59e0b', 'swift', ['venom', 'claw']),
      M('ash_mummy', 'مومياء الرماد', 'mummy-head', '#d6d3d1', 'tank', ['drain', 'hex']),
      M('dune_serpent', 'أفعى الكثبان', 'sand-snake', '#facc15', 'swift', ['bite', 'venom']),
      M('ash_djinn', 'جنّي الرماد', 'imp', '#fb923c', 'caster', ['fire', 'hex']),
    ],
    boss: M('sethar', 'سِثار فرعون الرماد', 'anubis', '#fbbf24', 'caster', ['fire', 'drain', 'hex', 'mend']),
    shard: 'شظية الرماد',
  },
  {
    id: 'frost',
    name: 'قمم الصقيع',
    icon: 'mountains',
    levels: [18, 25],
    colors: ['#0b2440', '#7dd3fc'],
    desc: 'جبال لا تذوب ثلوجها، يحكمها تنين نام ألف عام.',
    monsters: [
      M('frost_wolf', 'ذئب الصقيع', 'direwolf', '#bae6fd', 'swift', ['bite', 'frost']),
      M('ice_golem', 'عملاق الجليد', 'ice-golem', '#7dd3fc', 'tank', ['slam', 'harden', 'frost']),
      M('cave_bat', 'خفاش الكهوف', 'evil-bat', '#94a3b8', 'swift', ['drain', 'bite']),
      M('snow_bear', 'الدب الأبيض', 'polar-bear', '#f1f5f9', 'brute', ['claw', 'roar', 'slam']),
    ],
    boss: M('kryos', 'كرايوس تنين الصقيع', 'spiked-dragon-head', '#38bdf8', 'brute', ['frost', 'bite', 'roar', 'quake']),
    shard: 'شظية الصقيع',
  },
  {
    id: 'gears',
    name: 'مدينة التروس الغارقة',
    icon: 'factory',
    levels: [25, 32],
    colors: ['#0b1f2a', '#22d3ee'],
    desc: 'مدينة آلات غرقت في البحر، ولا تزال مصانعها تعمل في الظلام.',
    monsters: [
      M('spider_bot', 'عنكبوت آلي', 'spider-bot', '#67e8f9', 'swift', ['shock', 'venom']),
      M('mech_guard', 'حارس ميكانيكي', 'robot-golem', '#94a3b8', 'tank', ['slam', 'harden']),
      M('wheel_drone', 'جوّال الدولاب', 'mono-wheel-robot', '#fde047', 'swift', ['shock', 'bite']),
      M('iron_ghoul', 'غول الحديد', 'metal-golem-head', '#cbd5e1', 'brute', ['quake', 'roar']),
    ],
    boss: M('omnicore', 'أومنيكور العقل المدبّر', 'mecha-head', '#22d3ee', 'caster', ['shock', 'harden', 'quake']),
    shard: 'شظية التروس',
  },
  {
    id: 'rift',
    name: 'صدع النيكسس',
    icon: 'portal',
    levels: [32, 40],
    colors: ['#1a0b2e', '#c026d3'],
    desc: 'الجرح المفتوح في قلب العوالم. هنا ينتظر سيد الفراغ.',
    monsters: [
      M('void_eye', 'عين الفراغ', 'eyestalk', '#e879f9', 'caster', ['void', 'hex']),
      M('abyss_tentacle', 'مجسّات الهاوية', 'kraken-tentacle', '#a855f7', 'brute', ['slam', 'drain']),
      M('rift_ghost', 'شبح الأبعاد', 'ghost', '#c4b5fd', 'swift', ['void', 'drain']),
      M('void_knight', 'فارس الفراغ', 'black-knight-helm', '#7c3aed', 'tank', ['quake', 'harden', 'void']),
    ],
    boss: M('malvar', 'مالفار سيد الفراغ', 'tentacles-skull', '#d946ef', 'caster', ['void', 'quake', 'drain', 'hex', 'mend']),
    shard: 'قلب النيكسس',
  },
];

// ───────────────────────── القصة ─────────────────────────
// كل منطقة فيها 3 فصول: الأولان ضد نخبة من وحوش المنطقة، والثالث ضد زعيمها.
const L = (speaker, text) => ({ speaker, text });
const LYRA = 'ليرا حارسة البوابة';

export const STORY = [
  {
    id: 'c1', region: 'dawn', title: 'الشرارة الأولى', enemy: { monster: 'plains_wolf', elite: true, name: 'ذئب العاصفة' },
    lines: [
      L('الراوي', 'قبل ألف عام، كانت العوالم متصلة بقلب بلوري واحد يُدعى النيكسس.'),
      L('الراوي', 'ثم جاء مالفار سيد الفراغ، فحطّم القلب إلى ست شظايا تناثرت في الأرض.'),
      L(LYRA, 'استيقظت أخيراً يا حامل الشرارة. البوابة اختارتك، وأنا ليرا، حارستها.'),
      L(LYRA, 'لا وقت للأسئلة! ذئب العاصفة يهاجم القافلة، أرني ما تستطيع!'),
    ],
  },
  {
    id: 'c2', region: 'dawn', title: 'دخان في السهول', enemy: { monster: 'plains_goblin', elite: true, name: 'زعيم الكشافة العفاريت' },
    lines: [
      L(LYRA, 'العفاريت لا تجرؤ على مهاجمة القرى إلا إذا وجدت من يقودها.'),
      L('فلاح خائف', 'لقد أحرقوا الحقول وقالوا إن ملكهم قرقور يحمل حجراً متوهجاً!'),
      L(LYRA, 'حجر متوهج... إنها شظية الفجر. اتبع الكشافة إلى معسكرهم.'),
    ],
  },
  {
    id: 'c3', region: 'dawn', title: 'عرش قرقور', boss: true,
    lines: [
      L('قرقور', 'هاها! إنسان صغير جاء يطلب حجري اللامع؟ هذا الحجر جعلني ملكاً!'),
      L(LYRA, 'الشظية تفسد من يحملها. حرره منها، أو اسقطه معها.'),
      L('قرقور', 'تعال إذن، وسأجعل عظامك عرشاً جديداً!'),
    ],
  },
  {
    id: 'c4', region: 'forest', title: 'همسات بين الأشجار', enemy: { monster: 'shade_spider', elite: true, name: 'أم العناكب' },
    lines: [
      L(LYRA, 'شظية واحدة من ست. الثانية في غابة الهمس، حيث لا يدخل أحد ويخرج كما كان.'),
      L('صوت بين الأغصان', 'ارجع... ارجع يا حامل الشرارة... الغابة جائعة...'),
      L(LYRA, 'لا تستمع للأصوات. انظر إلى الأعلى! الشباك!'),
    ],
  },
  {
    id: 'c5', region: 'forest', title: 'ساحرة الجذور', enemy: { monster: 'branch_witch', elite: true, name: 'ميرا ساحرة الجذور' },
    lines: [
      L('ميرا', 'كنت أحرس هذه الغابة قبل أن تصيبها لعنة الأفعى. والآن أخدمها.'),
      L('ميرا', 'إن هزمتني، سينكسر قيدي... وستعرف طريق عرين ناغرا.'),
    ],
  },
  {
    id: 'c6', region: 'forest', title: 'عرين ناغرا', boss: true,
    lines: [
      L('ناغرا', 'سسسس... طعم الشرارة فيك يا صغير. ستكون أشهى من الشظية نفسها.'),
      L(LYRA, 'لها رؤوس كثيرة، لكن قلباً واحداً. لا تتوقف عن الهجوم!'),
    ],
  },
  {
    id: 'c7', region: 'desert', title: 'رمال تتذكر', enemy: { monster: 'dune_serpent', elite: true, name: 'حارسة الكثبان' },
    lines: [
      L(LYRA, 'تحت هذه الرمال مملكة كاملة. ملكها سِثار باع روحه للفراغ مقابل الخلود.'),
      L('تاجر القافلة', 'لا أحد يعبر الكثبان في النهار! الأفاعي تخرج مع الحرّ!'),
    ],
  },
  {
    id: 'c8', region: 'desert', title: 'لهيب الجنّ', enemy: { monster: 'ash_djinn', elite: true, name: 'إفريت المصباح المكسور' },
    lines: [
      L('الإفريت', 'ثلاث أمنيات؟ لا، لا أمنيات اليوم. اليوم أحرقك وأعود إلى نومي.'),
      L(LYRA, 'هذا الجني حارس بوابة الهرم. أطفئ ناره!'),
    ],
  },
  {
    id: 'c9', region: 'desert', title: 'هرم الخلود', boss: true,
    lines: [
      L('سِثار', 'ألف عام انتظرت فيها من يستحق أن يقف أمامي. أنت لا تستحق.'),
      L('سِثار', 'الفراغ وعدني بالخلود، وسأدفع له بروحك ثمناً.'),
    ],
  },
  {
    id: 'c10', region: 'frost', title: 'الطريق الأبيض', enemy: { monster: 'frost_wolf', elite: true, name: 'قائد القطيع الثلجي' },
    lines: [
      L(LYRA, 'نصف الشظايا معك. أشعر أن مالفار بدأ ينتبه لوجودك.'),
      L(LYRA, 'قمم الصقيع تخفي تنيناً نائماً، والشظية في قلبه. احذر البرد، فهو يقتل أسرع من المخالب.'),
    ],
  },
  {
    id: 'c11', region: 'frost', title: 'العملاق النائم', enemy: { monster: 'ice_golem', elite: true, name: 'حارس الكهف الأزلي' },
    lines: [
      L('حارس الكهف', 'لا... أحد... يوقظ... السيد.'),
      L(LYRA, 'إنه مصنوع من جليد لا يذوب. اضرب الشقوق!'),
    ],
  },
  {
    id: 'c12', region: 'frost', title: 'استيقاظ كرايوس', boss: true,
    lines: [
      L('كرايوس', 'من يجرؤ على إيقاظي؟ آه... حامل شرارة آخر. آخر من جاء صار تمثالاً عند الباب.'),
      L(LYRA, 'نَفَسه يجمّد كل شيء. كن أسرع منه!'),
    ],
  },
  {
    id: 'c13', region: 'gears', title: 'المدينة تحت الموج', enemy: { monster: 'spider_bot', elite: true, name: 'المستطلع X-9' },
    lines: [
      L(LYRA, 'هذه المدينة بناها شعب عبقري حاول إصلاح النيكسس بالآلات. فشلوا... وغرقوا.'),
      L('صوت آلي', 'دخيل. دخيل. بدء بروتوكول الإزالة.'),
    ],
  },
  {
    id: 'c14', region: 'gears', title: 'غرفة المحركات', enemy: { monster: 'iron_ghoul', elite: true, name: 'المطرقة الحديدية' },
    lines: [
      L('مهندس عجوز', 'أنا آخر من بقي حياً هنا. أومنيكور كان مساعدنا... حتى لمسته الشظية.'),
      L('مهندس عجوز', 'المطرقة الحديدية تحرس الطريق إلى قلبه. أرجوك، أوقفه.'),
    ],
  },
  {
    id: 'c15', region: 'gears', title: 'العقل المدبّر', boss: true,
    lines: [
      L('أومنيكور', 'حسبت احتمالات فوزك: 0.003%. استسلامك هو القرار المنطقي.'),
      L(LYRA, 'الآلات لا تفهم الإرادة. أثبت له أن حساباته خاطئة!'),
    ],
  },
  {
    id: 'c16', region: 'rift', title: 'حافة الصدع', enemy: { monster: 'void_eye', elite: true, name: 'العين التي لا تنام' },
    lines: [
      L(LYRA, 'خمس شظايا. القلب الأخير عند مالفار نفسه، في صدع النيكسس.'),
      L(LYRA, 'يجب أن أخبرك بشيء... أنا من فتحت البوابة لمالفار قبل ألف عام. كنت أظنه سينقذنا.'),
      L(LYRA, 'سامحني، وانهِ ما بدأته.'),
    ],
  },
  {
    id: 'c17', region: 'rift', title: 'فارس بلا اسم', enemy: { monster: 'void_knight', elite: true, name: 'فارس الفراغ الأول' },
    lines: [
      L('فارس الفراغ', 'كنت حامل شرارة مثلك. وصلت إلى هنا ورأيت ما رأى مالفار... فانضممت إليه.'),
      L('فارس الفراغ', 'سأريك الحقيقة يا صغير، بنصل سيفي.'),
    ],
  },
  {
    id: 'c18', region: 'rift', title: 'سيد الفراغ', boss: true,
    lines: [
      L('مالفار', 'حامل الشرارة... جمعت كل شظاياي من أجلي. شكراً لك.'),
      L('مالفار', 'العوالم كانت سجناً، وأنا حررتها من بعضها. والآن سأحررها من الوجود.'),
      L(LYRA, 'الشظايا معك، والنيكسس يناديك. هذه معركتنا الأخيرة!'),
    ],
    outro: [
      L('الراوي', 'سقط مالفار، والتأم قلب النيكسس من جديد. عادت العوالم تتنفس.'),
      L(LYRA, 'لقد فعلتها. ستروي العوالم حكايتك ألف عام... حتى يأتي حامل الشرارة التالي.'),
    ],
  },
];

// أيقونات المتحدثين في الحوارات
export const SPEAKERS = {
  'الراوي': 'scroll-unfurled',
  [LYRA]: 'moebius-star',
  'فلاح خائف': 'pitchfork',
  'صوت بين الأغصان': 'tree-face',
  'ميرا': 'witch-face',
  'تاجر القافلة': 'camel-head',
  'الإفريت': 'imp-laugh',
  'حارس الكهف': 'ice-golem',
  'صوت آلي': 'robot-antennas',
  'مهندس عجوز': 'mad-scientist',
  'فارس الفراغ': 'black-knight-helm',
  'قرقور': 'ogre',
  'ناغرا': 'hydra',
  'سِثار': 'anubis',
  'كرايوس': 'spiked-dragon-head',
  'أومنيكور': 'mecha-head',
  'مالفار': 'tentacles-skull',
};

// ───────────────────────── الأدوات ─────────────────────────
export const ITEM_BASES = {
  weapon: [
    { id: 'sword', name: 'سيف', icon: 'broadsword' },
    { id: 'axe', name: 'فأس', icon: 'battle-axe' },
    { id: 'staff', name: 'عصا', icon: 'wizard-staff' },
    { id: 'bow', name: 'قوس', icon: 'pocket-bow' },
    { id: 'dagger', name: 'خنجر', icon: 'plain-dagger' },
    { id: 'wand', name: 'صولجان', icon: 'crystal-wand' },
    { id: 'trident', name: 'رمح ثلاثي', icon: 'magic-trident' },
  ],
  armor: [
    { id: 'plate', name: 'درع صدري', icon: 'chest-armor' },
    { id: 'robe', name: 'رداء', icon: 'robe' },
    { id: 'leather', name: 'سترة جلدية', icon: 'leather-armor' },
    { id: 'cloak', name: 'عباءة', icon: 'wing-cloak' },
  ],
  charm: [
    { id: 'ring', name: 'خاتم', icon: 'ring' },
    { id: 'pendant', name: 'قلادة', icon: 'gem-pendant' },
    { id: 'rune', name: 'حجر رونيّ', icon: 'rune-stone' },
    { id: 'orb', name: 'كرة بلورية', icon: 'crystal-ball' },
  ],
};
export const SLOT_NAMES = { weapon: 'سلاح', armor: 'درع', charm: 'تميمة' };
export const TIER_SUFFIX = ['', 'الفجر', 'الهمس', 'الرماد', 'الصقيع', 'التروس', 'الفراغ'];

export const SHOP = [
  { id: 'potion_small', name: 'جرعة شفاء صغرى', icon: 'round-potion', price: 25, desc: 'تشفي 35% من الصحة في المعركة.', heal: 0.35 },
  { id: 'potion_big', name: 'جرعة شفاء كبرى', icon: 'health-potion', price: 80, desc: 'تشفي 70% من الصحة في المعركة.', heal: 0.7 },
  { id: 'ether', name: 'إكسير الأثير', icon: 'potion-ball', price: 40, desc: 'تعيد 50 طاقة في المعركة.', mp: 50 },
  { id: 'chest', name: 'صندوق المغامر', icon: 'locked-chest', price: 180, desc: 'أداة عشوائية من أعلى منطقة فتحتها.', chest: true },
];

// ───────────────────────── المهام اليومية ─────────────────────────
export const DAILY_TEMPLATES = [
  { id: 'kill', text: 'اهزم {n} من الوحوش', event: 'kill', range: [5, 10] },
  { id: 'boss', text: 'اهزم زعيماً', event: 'boss', range: [1, 1] },
  { id: 'duel', text: 'انتصر في مبارزة ضد لاعب', event: 'duel_win', range: [1, 1] },
  { id: 'skills', text: 'استخدم {n} مهارات في القتال', event: 'skill', range: [10, 20] },
  { id: 'gold', text: 'اجمع {n} ذهبة', event: 'gold', range: [150, 400] },
  { id: 'story', text: 'العب فصلاً من القصة', event: 'story', range: [1, 1] },
  { id: 'crit', text: 'وجّه {n} ضربات حرجة', event: 'crit', range: [5, 12] },
  { id: 'loot', text: 'احصل على {n} أدوات من المعارك', event: 'loot', range: [2, 4] },
];
export const DAILY_COUNT = 3;
