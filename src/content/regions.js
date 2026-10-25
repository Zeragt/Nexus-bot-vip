/**
 * The world, v3: provinces (أقاليم) group locations; every wild location is split into zones
 * (مناطق فرعية) of growing depth, plus one hidden zone found only by exploring.
 *
 * Zones decide what /explore finds, what /gather yields, how strong /hunt monsters are,
 * and which elite or warden may appear. Provinces carry weather and mastery ranks.
 */

/** Weather rotates every 3 hours per province (deterministic, see weatherFor). */
export const WEATHER = {
  clear: { name: 'صحو', icon: 'sun', loot: 1, danger: 0, gather: 1, xp: 1, text: 'سماء صافية. يوم جيد للمشي.' },
  rain: { name: 'مطر', icon: 'drop', loot: 1, danger: 0, gather: 1.25, xp: 1, text: 'المطر يوقظ الأعشاب والجذور. الجمع أوفر.' },
  storm: { name: 'عاصفة', icon: 'bolt', loot: 1.25, danger: 1, gather: 0.9, xp: 1.15, text: 'البرق يجذب المخلوقات الغاضبة. خطر أكبر، وغنائم أكبر.' },
  fog: { name: 'ضباب', icon: 'eye', loot: 1.1, danger: 0, gather: 1, xp: 1, text: 'الضباب يخفي الطرق... ويخفي الأسرار أيضاً. فرصة أعلى لاكتشاف المخفي.' },
  heat: { name: 'قيظ', icon: 'sun', loot: 1, danger: 1, gather: 0.8, xp: 1.1, text: 'حر لا يطاق. الطاقة تنفد أسرع، والوحوش أشرس.' },
  sandstorm: { name: 'عاصفة رملية', icon: 'wind', loot: 1.3, danger: 2, gather: 0.7, xp: 1.2, text: 'الرمال تكشف ما دفنته منذ قرون. وتدفن من لا ينتبه.' },
  snow: { name: 'ثلج', icon: 'snow', loot: 1, danger: 0, gather: 1.1, xp: 1.05, text: 'الثلج يمحو الآثار. الصيادون يحبون هذا الطقس.' },
  aurora: { name: 'شفق', icon: 'sparkle', loot: 1.4, danger: 0, gather: 1.2, xp: 1.1, text: 'شفق سماوي نادر. يقال إن الحظ يضحك تحته.' },
  ashfall: { name: 'تساقط الرماد', icon: 'flame', loot: 1.2, danger: 1, gather: 1, xp: 1.15, text: 'رماد دافئ يتساقط كالثلج. الأموات لا يرتاحون.' },
  tide: { name: 'مد عالٍ', icon: 'drop', loot: 1.15, danger: 1, gather: 1.3, xp: 1, text: 'المد يكشف كنوز القاع ثم يستردها.' },
  voidwind: { name: 'ريح الفراغ', icon: 'gate', loot: 1.35, danger: 2, gather: 1, xp: 1.25, text: 'ريح بلا صوت تهب من الشق. كل شيء أخطر وأثمن.' },
  eclipse: { name: 'كسوف', icon: 'moon', loot: 1.5, danger: 2, gather: 1.2, xp: 1.3, text: 'القمران يغطيان الشمس. ما ينام عادة... يستيقظ.' },
  festival: { name: 'احتفال', icon: 'star', loot: 1.1, danger: 0, gather: 1, xp: 1.2, text: 'المدينة تحتفل. الناس كرماء، والمكافآت أكبر.' },
};

/** Ranks earned by exploring a province (points summed over its locations). */
export const MASTERY_RANKS = [
  { min: 0, name: 'غريب', color: '#94a3b8' },
  { min: 25, name: 'مستكشف', color: '#34d399' },
  { min: 80, name: 'دليل', color: '#22d3ee' },
  { min: 180, name: 'رحّال', color: '#60a5fa' },
  { min: 360, name: 'حامي الإقليم', color: '#a78bfa' },
  { min: 700, name: 'سيد الإقليم', color: '#f5c451' },
];
/** Each mastery rank adds this much loot chance and gather yield inside its province. */
export const MASTERY_BONUS = { loot: 0.04, gather: 0.12, travelDiscount: 0.1 };

export function masteryRank(points) {
  let rank = 0;
  MASTERY_RANKS.forEach((r, i) => {
    if (points >= r.min) rank = i;
  });
  const next = MASTERY_RANKS[rank + 1] ?? null;
  return { rank, ...MASTERY_RANKS[rank], next, ratio: next ? (points - MASTERY_RANKS[rank].min) / (next.min - MASTERY_RANKS[rank].min) : 1 };
}

export const PROVINCES = [
  {
    key: 'nexus',
    name: 'مدينة نكسس',
    color: '#22d3ee',
    icon: 'city',
    levels: [1, 100],
    blurb: 'قلب العالم، حيث تلتقي الأبعاد. أزقتها تخفي قصصاً أكثر مما تخفي البراري وحوشاً.',
    weather: ['clear', 'rain', 'fog', 'festival', 'clear'],
    locations: ['nexus_city', 'central_plaza', 'cafe', 'tavern', 'market', 'library', 'blacksmith', 'residential'],
  },
  {
    key: 'verdant',
    name: 'البراري الخضراء',
    color: '#34d399',
    icon: 'leaf',
    levels: [1, 15],
    blurb: 'غابة تتوهج، وجبال تبتلع البرق، وبحيرة بسماءين. أول ما يواجهه كل مغامر خارج الأسوار.',
    weather: ['clear', 'rain', 'storm', 'fog', 'snow', 'aurora'],
    locations: ['forest', 'mountains', 'lake'],
  },
  {
    key: 'sands',
    name: 'بحر الرمال',
    color: '#f59e0b',
    icon: 'sun',
    levels: [4, 30],
    blurb: 'صحراء تبتلع القوافل، وأطلال مملكة أورين، وقفار احترقت في حرب لا يذكرها أحد.',
    weather: ['clear', 'heat', 'sandstorm', 'ashfall', 'clear'],
    locations: ['desert', 'ruins', 'ashen_wastes'],
  },
  {
    key: 'deep',
    name: 'الأعماق البلورية',
    color: '#c084fc',
    icon: 'gem',
    levels: [12, 50],
    blurb: 'تحت الأرض بلورات تغني، وتحت البحر مملكة غرقت في ليلة واحدة.',
    weather: ['fog', 'tide', 'clear', 'aurora', 'tide'],
    locations: ['crystal_caverns', 'sunken_kingdom'],
  },
  {
    key: 'heights',
    name: 'الأعالي',
    color: '#93c5fd',
    icon: 'wind',
    levels: [30, 45],
    blurb: 'جزر معلقة بين الغيوم، يحكمها قراصنة وطيور بحجم السفن.',
    weather: ['clear', 'storm', 'aurora', 'fog', 'storm'],
    locations: ['sky_archipelago'],
  },
  {
    key: 'rift',
    name: 'الشق',
    color: '#e879f9',
    icon: 'gate',
    levels: [10, 92],
    blurb: 'البوابة البعدية، وقلعة الظلال، والهاوية. كل ما هو أبعد من الواقع يبدأ هنا.',
    weather: ['voidwind', 'fog', 'eclipse', 'voidwind', 'clear'],
    locations: ['dimensional_gate', 'shadow_citadel', 'the_abyss'],
  },
  {
    key: 'returned',
    name: 'العوالم العائدة',
    color: '#fde68a',
    icon: 'star',
    levels: [85, 100],
    blurb: 'عوالم ابتلعتها الهاوية وعادت بعد سقوط الجائع. لا أحد يعرف قوانينها بعد.',
    weather: ['eclipse', 'aurora', 'voidwind', 'clear', 'storm'],
    locations: ['mirror_steppe', 'clockwork_isles', 'eclipse_sanctum', 'nexus_heart'],
  },
];
export const PROVINCE_BY_KEY = Object.fromEntries(PROVINCES.map((p) => [p.key, p]));
export const PROVINCE_OF_LOCATION = Object.fromEntries(PROVINCES.flatMap((p) => p.locations.map((l) => [l, p.key])));

export function provinceOf(locationKey) {
  return PROVINCE_BY_KEY[PROVINCE_OF_LOCATION[locationKey]] ?? null;
}

/** Deterministic weather for a province at a moment (changes every 3 hours). */
export function weatherFor(provinceKey, now = new Date()) {
  const p = PROVINCE_BY_KEY[provinceKey];
  if (!p) return { key: 'clear', ...WEATHER.clear };
  const block = Math.floor(now.getTime() / (3 * 3600_000));
  let h = 2166136261;
  for (const c of `${provinceKey}:${block}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const key = p.weather[(h >>> 0) % p.weather.length];
  const endsAt = new Date((block + 1) * 3 * 3600_000);
  return { key, ...WEATHER[key], endsAt };
}

// --- Zones -------------------------------------------------------------------------------
// Z(key, name, depth, minLevel, description, resources, extra)
// resources: [itemKey, weight]. depth 4 = hidden (needs exploration points to find).
const Z = (key, name, depth, minLevel, description, resources = [], extra = {}) => ({ key, name, depth, minLevel, description, resources, ...extra });

/** Points of exploration needed in a location before each depth opens. */
export const DEPTH_UNLOCK = { 1: 0, 2: 8, 3: 22, 4: 45 };
export const DEPTH_LABELS = { 1: 'الأطراف', 2: 'العمق', 3: 'القلب', 4: 'مخفية' };
/** Hunt level / loot boost per depth (a depth-3 monster is clearly stronger than a depth-1 one). */
export const DEPTH_BOOST = { 1: { level: 0, loot: 1 }, 2: { level: 2, loot: 1.2 }, 3: { level: 4, loot: 1.45 }, 4: { level: 6, loot: 1.8 } };

const CITY_ZONE = (loc, name, description, resources = []) => ({
  [loc]: [Z(`${loc}_streets`, name, 1, 1, description, resources, { city: true })],
});

export const ZONES = {
  ...CITY_ZONE('nexus_city', 'شوارع المدينة', 'زحام من كل الأبعاد. جيوب مثقوبة وأسرار مسموعة.', [['orin_coin', 2]]),
  ...CITY_ZONE('central_plaza', 'حول النافورة', 'نافورة البلور. العملات في قاعها من كل عالم.', [['orin_coin', 3]]),
  ...CITY_ZONE('cafe', 'زوايا المقهى', 'أحاديث هامسة ورائحة قهوة سحرية.', []),
  ...CITY_ZONE('tavern', 'أقبية الحانة', 'براميل قديمة، ونرد مغشوش، وخرائط تُباع بثمن كأس.', [['banner_scrap', 2]]),
  ...CITY_ZONE('market', 'أكشاك السوق', 'تجار يبيعون كل شيء، وأشياء تسقط من عرباتهم.', [
    ['river_reed', 2],
    ['sand_glass', 2],
  ]),
  ...CITY_ZONE('library', 'رفوف المكتبة', 'كتب تهمس، وأوراق تسقط من مخطوطات لا يقرؤها أحد.', [['rune_fragment', 1]]),
  ...CITY_ZONE('blacksmith', 'ساحة السندان', 'شظايا معدن وخام متروك قرب الأفران.', [
    ['iron_ore', 4],
    ['ash_iron', 1],
  ]),
  ...CITY_ZONE('residential', 'الأزقة الخلفية', 'حدائق صغيرة على الأسطح وأشياء نسيها الجيران.', [['glow_herb', 2]]),

  forest: [
    Z('forest_edge', 'حافة الغابة', 1, 1, 'أشجار متوهجة وطرق يسلكها الحطابون. الخطر هنا يعضّ لكنه لا يقتل.', [
      ['glow_herb', 6],
      ['ancient_bark', 5],
      ['wolf_pelt', 2],
    ]),
    Z('forest_deepwood', 'الغابة العميقة', 2, 4, 'الضوء يخفت والجذوع تلتف كالأفاعي. هنا تعيش الذئاب الكبيرة.', [
      ['ancient_bark', 5],
      ['glow_herb', 4],
      ['firefly_jar', 3],
      ['wolf_pelt', 3],
    ]),
    Z('forest_mother_tree', 'ظل الشجرة الأم', 3, 8, 'شجرة بحجم برج، جذورها تشرب من نهر تحت الأرض. ليرا لا تأتي إلى هنا وحدها.', [
      ['firefly_jar', 4],
      ['ancient_bark', 4],
      ['heartwood_seed', 0.35],
    ]),
    Z(
      'forest_firefly_hollow',
      'تجويف اليراعات',
      4,
      10,
      'وادٍ مخفي يضيئه مليون يراعة. في وسطه حجر عليه اسم لا يقرؤه إلا الأطفال.',
      [
        ['firefly_jar', 6],
        ['heartwood_seed', 1],
        ['moon_pearl', 0.6],
      ],
      {
        secret: 'على الحجر في قلب التجويف كُتب: «هنا نامت أول شجرة، وحلمت بالمدينة». تقول ليرا إن الغابة أقدم من نكسس، وإن نكسس ربما كانت حلماً لشجرة.',
      },
    ),
  ],
  mountains: [
    Z('mountains_foothills', 'السفوح', 1, 3, 'ممرات صخرية وأكواخ رعاة مهجورة. الصدى هنا يجيب أحياناً.', [
      ['iron_ore', 6],
      ['frost_lichen', 4],
    ]),
    Z('mountains_stormpass', 'ممر العواصف', 2, 6, 'برق يضرب القمم كل دقيقة. الحجارة مشحونة وتطقطق تحت قدميك.', [
      ['iron_ore', 4],
      ['storm_quartz', 4],
      ['frost_lichen', 2],
    ]),
    Z('mountains_summit', 'القمة المكسورة', 3, 9, 'قمة شقها البرق نصفين. الهواء رقيق، والطيور هنا أكبر من البشر.', [
      ['storm_quartz', 5],
      ['thunder_feather', 1.2],
    ]),
    Z(
      'mountains_thunder_nest',
      'عش الرعد',
      4,
      12,
      'عش من أغصان محترقة على حافة لا يصلها إلا من يتسلق الصواعق.',
      [
        ['thunder_feather', 3],
        ['storm_quartz', 4],
        ['star_shard', 0.4],
      ],
      {
        secret: 'في العش بيضة من نحاس، باردة، فارغة. شيء خرج منها منذ زمن طويل، وترك أثر مخالب على الصخر يتجه نحو البوابة البعدية.',
      },
    ),
  ],
  lake: [
    Z('lake_shore', 'الشاطئ الفضي', 1, 1, 'رمل أبيض ومراكب صيادين. البحيرة تعكس سماءً ليست هذه.', [
      ['river_reed', 6],
      ['mirror_scale', 2],
    ]),
    Z('lake_reedmaze', 'متاهة القصب', 2, 4, 'قصب أطول من الرجال، يغني حين تهب الريح. سهل أن تضيع.', [
      ['river_reed', 5],
      ['mirror_scale', 4],
      ['glow_herb', 2],
    ]),
    Z('lake_drowned_pier', 'الرصيف الغارق', 3, 7, 'رصيف حجري يمتد إلى وسط البحيرة ثم يختفي تحت الماء. أحدهم يمشي عليه ليلاً.', [
      ['mirror_scale', 4],
      ['moon_pearl', 1],
    ]),
    Z(
      'lake_second_sky',
      'السماء الثانية',
      4,
      10,
      'تحت سطح البحيرة، سماء كاملة بنجوم مختلفة. تتنفس فيها كأنك على الأرض.',
      [
        ['moon_pearl', 3],
        ['star_shard', 0.6],
      ],
      {
        secret: 'في السماء الثانية نجمة واحدة تتحرك. تبعتها حتى وجدت نفسك أمام نسخة من نكسس، مقلوبة، صامتة، وفي ساحتها نافورة جافة.',
      },
    ),
  ],
  desert: [
    Z('desert_dunes', 'بحر الكثبان', 1, 4, 'كثبان تتحرك كأمواج بطيئة. القوافل تمر هنا بسرعة.', [
      ['sand_glass', 6],
      ['sun_salt', 3],
    ]),
    Z('desert_caravan_graves', 'مقابر القوافل', 2, 8, 'هياكل جمال وعربات نصف مدفونة. قطاع الطرق يعرفون هذا المكان جيداً.', [
      ['sand_glass', 4],
      ['scarab_shell', 3],
      ['orin_coin', 3],
    ]),
    Z('desert_glass_sea', 'بحر الزجاج', 3, 12, 'سهل من الزجاج صهرته صاعقة عظيمة. يعكس الشمس كمرآة قاتلة.', [
      ['sand_glass', 4],
      ['sun_salt', 4],
      ['scarab_shell', 2],
    ]),
    Z(
      'desert_buried_oasis',
      'الواحة المدفونة',
      4,
      16,
      'واحة كاملة تحت الرمل، بنخيل حجري وبركة ماء ما زالت عذبة.',
      [
        ['sun_salt', 5],
        ['scarab_shell', 4],
        ['orin_coin', 4],
      ],
      {
        secret: 'على جدار الواحة رسم لملك يعطي ظله لشخص بلا وجه، مقابل نهر لا يجف. تحته كلمة واحدة بلغة أورين: «ندمت».',
      },
    ),
  ],
  ruins: [
    Z('ruins_outer_gate', 'البوابة الخارجية', 1, 5, 'أعمدة مكسورة وتماثيل بلا رؤوس. المدخل إلى مملكة أورين.', [
      ['ancient_relic', 1],
      ['orin_coin', 4],
      ['rune_fragment', 1],
    ]),
    Z('ruins_hall_of_kings', 'قاعة الملوك', 2, 9, 'عروش حجرية لملوك محيت وجوههم. الحراس الحجريون ما زالوا يحرسون.', [
      ['rune_fragment', 3],
      ['orin_coin', 3],
      ['ancient_relic', 1.5],
    ]),
    Z('ruins_sunken_archive', 'الأرشيف الغائر', 3, 14, 'مكتبة سقطت تحت الأرض. الكتب صارت حجراً، لكن الحروف ما زالت تتوهج.', [
      ['rune_fragment', 5],
      ['ancient_relic', 2],
      ['echo_dust', 0.5],
    ]),
    Z(
      'ruins_throne_vault',
      'خزانة العرش',
      4,
      18,
      'قبو خلف العرش الأكبر، مختوم بختم الملك الذي باع ظله.',
      [
        ['ancient_relic', 4],
        ['orin_coin', 6],
        ['rune_fragment', 3],
      ],
      {
        secret: 'في الخزانة صندوق فارغ، وعلى غطائه من الداخل كُتب بخط مرتجف: «أخذوا ظلي، ثم أخذوا ابني. الجائع لا يشبع». هذا خط الملك نفسه.',
      },
    ),
  ],
  ashen_wastes: [
    Z('ash_cinder_fields', 'حقول الجمر', 1, 22, 'أرض رمادية تحتها جمر حي. الأحذية تذوب إن وقفت طويلاً.', [
      ['ember_core', 1],
      ['ash_iron', 4],
      ['banner_scrap', 4],
    ]),
    Z('ash_war_trench', 'خنادق الحرب', 2, 25, 'خنادق محفورة لجيوش من رماد. الأسلحة ما زالت في أيدي أصحابها.', [
      ['ash_iron', 5],
      ['banner_scrap', 4],
      ['ember_core', 2],
    ]),
    Z('ash_furnace_heart', 'قلب الفرن', 3, 28, 'فوهة بركان صغير حيث صُهرت الجيوش. الحرارة تشوه الهواء.', [
      ['ember_core', 4],
      ['ash_iron', 3],
    ]),
    Z(
      'ash_general_tomb',
      'ضريح القائد',
      4,
      31,
      'ضريح من حديد الرماد لقائد قاتل في حرب نسيها الجميع إلا هو.',
      [
        ['ember_core', 5],
        ['ash_iron', 4],
        ['star_shard', 0.5],
      ],
      {
        secret: 'على تابوت القائد درع مكتوب عليه أسماء كل جنوده، ألف اسم. الاسم الأخير محفور حديثاً، والحروف ما زالت ساخنة: اسمك.',
      },
    ),
  ],
  crystal_caverns: [
    Z('crystal_mouth', 'فم الكهف', 1, 12, 'مدخل تغطيه بلورات صغيرة تطن حين تقترب.', [
      ['geode', 5],
      ['song_crystal', 2],
    ]),
    Z('crystal_choir', 'قاعة الجوقة', 2, 15, 'آلاف البلورات تغني معاً نغمة واحدة. إن سكتت، اهرب.', [
      ['song_crystal', 5],
      ['geode', 3],
      ['echo_dust', 0.8],
    ]),
    Z('crystal_heartvein', 'العرق القلبي', 3, 18, 'عرق بلوري ينبض كالقلب في عمق الجبل.', [
      ['song_crystal', 4],
      ['echo_dust', 2],
    ]),
    Z(
      'crystal_silent_chamber',
      'الحجرة الصامتة',
      4,
      22,
      'الحجرة الوحيدة في الكهوف التي لا صوت فيها. حتى قلبك يسكت.',
      [
        ['echo_dust', 4],
        ['song_crystal', 3],
        ['star_shard', 0.5],
      ],
      {
        secret:
          'في الحجرة الصامتة بلورة واحدة بحجم إنسان، وداخلها صورة امرأة تغني. الشيخ كا يقول إنها أول من علّم البلورات الغناء، وإنها لم تمت بل صارت أغنية.',
      },
    ),
  ],
  sunken_kingdom: [
    Z('sunken_bell_square', 'ساحة الأجراس', 1, 42, 'ساحة مدينة تحت الماء، أجراسها تدق مع كل موجة.', [
      ['coral_branch', 5],
      ['drowned_bell', 1],
    ]),
    Z('sunken_coral_gardens', 'حدائق المرجان', 2, 44, 'حدائق القصر صارت مرجاناً أحمر. الحوريات يغنين فيها.', [
      ['coral_branch', 5],
      ['moon_pearl', 1],
      ['drowned_bell', 1.5],
    ]),
    Z('sunken_palace', 'القصر الغارق', 3, 47, 'قصر الملكة الغريقة. التاج ذهب، لكن العرش ما زال ينتظر.', [
      ['drowned_bell', 3],
      ['abyssal_ink', 0.8],
      ['coral_branch', 3],
    ]),
    Z(
      'sunken_trench',
      'الخندق المظلم',
      4,
      50,
      'شق في قاع البحر يقود إلى ما تحت المملكة. الضوء لا يصل.',
      [
        ['abyssal_ink', 2],
        ['drowned_bell', 2],
        ['void_crystal', 0.3],
      ],
      {
        secret: 'في الخندق، سلسلة حديدية ضخمة تنزل إلى الظلام. أحدهم ربط المملكة بشيء تحتها كي لا تطفو... أو كي لا يصعد ما تحتها.',
      },
    ),
  ],
  sky_archipelago: [
    Z('sky_lower_isles', 'الجزر الدنيا', 1, 30, 'جزر صغيرة متصلة بجسور ضوء. الريح تحاول دفعك دائماً.', [
      ['wind_seed', 6],
      ['cloud_silk', 2],
    ]),
    Z('sky_pirate_docks', 'مرافئ القراصنة', 2, 33, 'مرافئ خشبية معلقة حيث ترسو سفن القراصنة الطائرة.', [
      ['cloud_silk', 4],
      ['skyfall_ore', 1],
      ['orin_coin', 2],
    ]),
    Z('sky_roc_peaks', 'قمم الرخ', 3, 37, 'أعشاش طيور الرخ على أعلى الجزر. الريش هنا بحجم الأشرعة.', [
      ['skyfall_ore', 3],
      ['thunder_feather', 1.5],
      ['cloud_silk', 3],
    ]),
    Z(
      'sky_first_observatory',
      'المرصد الأول',
      4,
      41,
      'مرصد مهجور فوق الغيوم، تلسكوبه موجه نحو نجمة لم تعد موجودة.',
      [
        ['skyfall_ore', 4],
        ['star_shard', 1],
      ],
      {
        secret: 'في سجل المرصد آخر ملاحظة كتبها الفلكي: «النجمة التي نراقبها ليست نجمة. إنها عين. وقد رأتنا». التاريخ قبل سقوط أورين بيوم.',
      },
    ),
  ],
  dimensional_gate: [
    Z('gate_threshold', 'العتبة', 1, 10, 'حافة البوابة حيث يقف الحرس. الهواء يرتجف كسطح ماء.', [
      ['star_shard', 0.5],
      ['rift_ember', 1],
    ]),
    Z('gate_fracture', 'خط الكسر', 2, 14, 'الشق نفسه، حيث يتسرب الواقع الآخر قطرة قطرة.', [
      ['rift_ember', 3],
      ['star_shard', 0.8],
    ]),
    Z('gate_between', 'ما بين', 3, 20, 'لست هنا ولا هناك. الأصوات تصل قبل أصحابها.', [
      ['rift_ember', 4],
      ['echo_dust', 1],
      ['star_shard', 1],
    ]),
    Z(
      'gate_veils_room',
      'غرفة فيل',
      4,
      26,
      'غرفة صغيرة داخل الشق، فيها كرسي واحد وقناع أبيض معلق.',
      [
        ['rift_ember', 4],
        ['shadow_thread', 1],
        ['star_shard', 1.2],
      ],
      {
        secret: 'على الطاولة دفتر فيه رسائل لم تُرسل، كلها لأوريل. آخرها: «أخي، إن قرأت هذا فقد نسيت اسمي. لا تبحث عني في الوجوه. ابحث في الظلال».',
      },
    ),
  ],
  shadow_citadel: [
    Z('citadel_walls', 'أسوار الظلال', 1, 60, 'أسوار من ظلال متراصة. بعضها ما زال يتحرك.', [
      ['shadow_thread', 4],
      ['void_crystal', 0.3],
    ]),
    Z('citadel_mask_gallery', 'رواق الأقنعة', 2, 63, 'ممرات طويلة مغطاة بأقنعة لها أعين تتبعك.', [
      ['stolen_mask', 1.5],
      ['shadow_thread', 3],
    ]),
    Z('citadel_court', 'المحكمة', 3, 68, 'قاعة الطائفة حيث يُحاكم من يرفض النسيان.', [
      ['stolen_mask', 2],
      ['void_crystal', 1],
      ['shadow_thread', 3],
    ]),
    Z(
      'citadel_name_well',
      'بئر الأسماء',
      4,
      72,
      'بئر تُرمى فيه الأسماء المسروقة. إن أنصتّ، تسمعها تنادي.',
      [
        ['void_crystal', 2],
        ['stolen_mask', 2],
        ['hunger_ash', 0.2],
      ],
      {
        secret: 'ناديت في البئر اسماً عشوائياً، فجاءك الرد بصوتك: «لست أول من يحمل هذا الاسم». تحت حافة البئر نُقشت تسعة أسماء، ثمانية منها مشطوبة.',
      },
    ),
  ],
  the_abyss: [
    Z('abyss_descent', 'المنحدر', 1, 75, 'درجات من عظم تنزل في الظلام. كل خطوة أثقل من التي قبلها.', [
      ['void_crystal', 1.5],
      ['star_shard', 1],
    ]),
    Z('abyss_hollow_plains', 'السهول الجوفاء', 2, 79, 'سهول بلا لون، فيها عوالم ميتة معلقة كالفوانيس.', [
      ['void_crystal', 3],
      ['hunger_ash', 0.4],
    ]),
    Z('abyss_kings_road', 'طريق الملك', 3, 84, 'الطريق الذي مشى عليه الملك الأجوف نحو عرشه.', [
      ['void_crystal', 3],
      ['hunger_ash', 0.8],
      ['star_shard', 2],
    ]),
    Z(
      'abyss_empty_throne',
      'العرش الفارغ',
      4,
      90,
      'العرش الذي جلس عليه الجائع. فارغ الآن... أو هكذا يبدو.',
      [
        ['hunger_ash', 2],
        ['void_crystal', 3],
        ['nexus_essence', 0.15],
      ],
      {
        secret: 'جلست على العرش للحظة، فرأيت كل العوالم التي ابتلعها الجائع تعود واحداً واحداً، كأنها تتنفس. ورأيت أن بعضها لم يعد وحده: شيء ما عاد معه.',
      },
    ),
  ],

  // The Returned Worlds -------------------------------------------------------------------
  mirror_steppe: [
    Z('mirror_glassfields', 'حقول الزجاج', 1, 85, 'سهوب من عشب زجاجي يرن تحت الأقدام، وكل حجر فيها مرآة.', [
      ['glass_grass', 6],
      ['mirror_shard', 1.5],
    ]),
    Z('mirror_hall_of_selves', 'قاعة الذوات', 2, 87, 'مرايا عملاقة، كل واحدة تعرض نسخة منك عاشت حياة أخرى.', [
      ['mirror_shard', 4],
      ['glass_grass', 3],
    ]),
    Z('mirror_shattered_lake', 'البحيرة المكسورة', 3, 89, 'بحيرة تجمدت كمرآة ثم انكسرت. تحت الشقوق، وجوه.', [
      ['mirror_shard', 4],
      ['moon_pearl', 1.5],
      ['nexus_essence', 0.1],
    ]),
    Z(
      'mirror_origin',
      'أصل المرايا',
      4,
      93,
      'المكان الذي انكسرت فيه المرآة الأولى.',
      [
        ['mirror_shard', 6],
        ['nexus_essence', 0.4],
      ],
      {
        secret: 'وجدت إطاراً فارغاً بحجم باب. حين نظرت فيه لم ترَ انعكاسك، بل رأيت ظهرك، كأن أحداً يقف خلفك وينظر من خلال عينيك.',
      },
    ),
  ],
  clockwork_isles: [
    Z('clock_brass_shore', 'الشاطئ النحاسي', 1, 88, 'جزر من نحاس وتروس تطفو على بحر من الزيت الساكن.', [
      ['brass_gear', 6],
      ['chrono_spring', 0.4],
    ]),
    Z('clock_great_engine', 'المحرك العظيم', 2, 90, 'آلة بحجم مدينة، تدور منذ ألف عام دون أن تعرف لماذا.', [
      ['brass_gear', 5],
      ['chrono_spring', 1],
    ]),
    Z('clock_still_hour', 'الساعة الساكنة', 3, 92, 'جزيرة توقف فيها الزمن. الأمواج معلقة في الهواء.', [
      ['chrono_spring', 2],
      ['brass_gear', 3],
    ]),
    Z(
      'clock_makers_room',
      'غرفة الصانع',
      4,
      95,
      'ورشة صغيرة في قلب المحرك، فيها مخطط لمدينة تشبه نكسس.',
      [
        ['chrono_spring', 3],
        ['nexus_essence', 0.4],
      ],
      {
        secret: 'المخطط موقع باسم «أوريل». ليس أوريل الذي تعرفه، بل أوريل آخر، من عالم آخر، صنع مدينته بيديه ثم أضاعها.',
      },
    ),
  ],
  eclipse_sanctum: [
    Z('eclipse_outer_court', 'الفناء الخارجي', 1, 92, 'معبد تحت كسوف دائم. الضوء هنا رمادي وبطيء.', [
      ['eclipse_ash', 5],
      ['penumbra_silk', 0.5],
    ]),
    Z('eclipse_dim_cloister', 'الرواق المعتم', 2, 94, 'رهبان بلا ظلال يصلّون لشمس لا تشرق.', [
      ['eclipse_ash', 4],
      ['penumbra_silk', 1.5],
    ]),
    Z('eclipse_altar', 'المذبح', 3, 96, 'مذبح من حجر أسود، فوقه قرص الكسوف يبدو قريباً بما يكفي للمسه.', [
      ['penumbra_silk', 3],
      ['eclipse_ash', 3],
      ['nexus_essence', 0.2],
    ]),
    Z(
      'eclipse_umbra',
      'الظل التام',
      4,
      98,
      'داخل الكسوف نفسه. لا ضوء، لا ظلام، فقط انتظار.',
      [
        ['penumbra_silk', 4],
        ['nexus_essence', 0.6],
      ],
      {
        secret: 'في الظل التام سمعت صوت الجائع، لكنه لم يكن جائعاً هذه المرة. كان يغني تهويدة، بصوت أب يحاول أن ينيم طفله.',
      },
    ),
  ],
  nexus_heart: [
    Z('heart_roots', 'جذور المدينة', 1, 96, 'تحت نكسس، جذور من ضوء تمتد إلى كل الأبعاد.', [
      ['nexus_essence', 0.8],
      ['star_shard', 3],
    ]),
    Z('heart_pulse', 'النبض', 2, 97, 'غرفة تنبض كالقلب. كل نبضة تفتح باباً وتغلق آخر.', [
      ['nexus_essence', 1.2],
      ['chrono_spring', 1],
    ]),
    Z('heart_core', 'النواة', 3, 99, 'مركز نكسس. هنا قررت المدينة أن توجد.', [
      ['nexus_essence', 2],
      ['hunger_ash', 0.5],
    ]),
    Z(
      'heart_first_dream',
      'الحلم الأول',
      4,
      100,
      'المكان الذي حلمت فيه الشجرة الأولى بالمدينة.',
      [
        ['nexus_essence', 3],
        ['heartwood_seed', 2],
      ],
      {
        secret: 'وجدت نفسك تحت شجرة بيضاء، وأمامك نافورة البلور كما كانت قبل أن يبنيها أحد. وعلى حافتها جلست طفلة تشبهك، قالت: «أخيراً. لقد حلمت بك طويلاً».',
      },
    ),
  ],
};

export const ZONE_BY_KEY = Object.fromEntries(Object.entries(ZONES).flatMap(([loc, zones]) => zones.map((z) => [z.key, { ...z, location: loc }])));

export function zonesOf(locationKey) {
  return (ZONES[locationKey] ?? []).map((z) => ZONE_BY_KEY[z.key]);
}

/** The zone a character is in; falls back to the location's first zone. */
export function currentZone(locationKey, zoneKey) {
  const z = ZONE_BY_KEY[zoneKey];
  if (z && z.location === locationKey) return z;
  return zonesOf(locationKey)[0] ?? null;
}

/** Zones of a location the character can enter now (level + exploration depth). */
export function zoneAccess(zone, { level, points }) {
  const reasons = [];
  if (level < zone.minLevel) reasons.push(`تحتاج المستوى ${zone.minLevel}`);
  if (points < DEPTH_UNLOCK[zone.depth]) reasons.push(`تحتاج ${DEPTH_UNLOCK[zone.depth]} نقطة استكشاف هنا (لديك ${points})`);
  return { ok: reasons.length === 0, reasons };
}

// --- Elites and wardens ------------------------------------------------------------------
/**
 * One elite per wild location (depth ≥ 2, rare encounter while exploring or hunting) and a
 * warden guarding each hidden zone. Their loot tables are the only PvE source of secret relics.
 */
const E = (key, name, archetype, palette, weights, skills, loot, extra = {}) => ({ key, name, archetype, palette, weights, skills, loot, ...extra });

export const ELITES = {
  forest: E(
    'elder_shade_wolf',
    'ذئب الظل العجوز',
    'beast',
    ['#0f172a', '#c4b5fd'],
    { strength: 1.3, agility: 1.3 },
    ['bite', 'howl', 'ambush'],
    [
      ['wolf_pelt', 1],
      ['firefly_jar', 0.6],
      ['heartwood_seed', 0.12],
      ['verdant_crown', 0.002],
    ],
  ),
  mountains: E(
    'thunder_roc',
    'رخ الرعد',
    'bird',
    ['#1e293b', '#facc15'],
    { agility: 1.4, strength: 1.2 },
    ['lightning', 'talon', 'gust'],
    [
      ['thunder_feather', 0.8],
      ['storm_quartz', 1],
      ['verdant_crown', 0.002],
    ],
  ),
  lake: E(
    'mirror_leviathan',
    'لوياثان المرآة',
    'serpent',
    ['#0c4a6e', '#e0f2fe'],
    { endurance: 1.4, strength: 1.3 },
    ['tide', 'coil', 'regen'],
    [
      ['moon_pearl', 0.6],
      ['mirror_scale', 1],
      ['verdant_crown', 0.002],
    ],
  ),
  desert: E(
    'sand_tyrant',
    'طاغية الرمال',
    'insect',
    ['#78350f', '#fde68a'],
    { strength: 1.4, defense: 1.3 },
    ['sting', 'rockslam', 'harden'],
    [
      ['scarab_shell', 1],
      ['sun_salt', 1],
      ['orin_scepter', 0.002],
    ],
  ),
  ruins: E(
    'orin_colossus',
    'عملاق أورين',
    'golem',
    ['#1c1433', '#c4b5fd'],
    { defense: 1.6, strength: 1.3 },
    ['rockslam', 'harden', 'curse'],
    [
      ['rune_fragment', 1],
      ['ancient_relic', 0.6],
      ['orin_scepter', 0.003],
    ],
  ),
  ashen_wastes: E(
    'cinder_marshal',
    'مشير الجمر',
    'humanoid',
    ['#3b0a05', '#fb923c'],
    { strength: 1.5, endurance: 1.2 },
    ['ember', 'ashstorm', 'riftfire'],
    [
      ['ember_core', 1],
      ['ash_iron', 1],
      ['orin_scepter', 0.003],
    ],
  ),
  crystal_caverns: E(
    'choir_matron',
    'أم الجوقة',
    'sprite',
    ['#2e1065', '#f0abfc'],
    { intelligence: 1.6, agility: 1.1 },
    ['crystalspike', 'echo', 'wail'],
    [
      ['song_crystal', 1],
      ['echo_dust', 0.6],
      ['singing_heart', 0.003],
    ],
  ),
  sunken_kingdom: E(
    'tide_queen_guard',
    'حارس الملكة الغريقة',
    'humanoid',
    ['#0b3442', '#5eead4'],
    { defense: 1.5, endurance: 1.4 },
    ['tide', 'siren', 'regen'],
    [
      ['drowned_bell', 0.8],
      ['abyssal_ink', 0.4],
      ['singing_heart', 0.003],
    ],
  ),
  sky_archipelago: E(
    'storm_admiral',
    'أميرال العاصفة',
    'humanoid',
    ['#1e3a8a', '#fef3c7'],
    { agility: 1.5, strength: 1.2 },
    ['lightning', 'ambush', 'gust'],
    [
      ['skyfall_ore', 0.8],
      ['cloud_silk', 1],
      ['skyfather_wings', 0.003],
    ],
  ),
  dimensional_gate: E(
    'rift_sovereign',
    'سيد الشق',
    'eldritch',
    ['#3b0764', '#e879f9'],
    { intelligence: 1.5, strength: 1.4 },
    ['riftfire', 'drain', 'voidrend'],
    [
      ['rift_ember', 1],
      ['star_shard', 0.6],
      ['hunger_fang', 0.002],
    ],
  ),
  shadow_citadel: E(
    'mask_inquisitor',
    'محقق الأقنعة',
    'ghost',
    ['#1e1030', '#f43f5e'],
    { intelligence: 1.6, agility: 1.3 },
    ['shadowbolt', 'curse', 'wail'],
    [
      ['stolen_mask', 0.8],
      ['shadow_thread', 1],
      ['hunger_fang', 0.003],
    ],
  ),
  the_abyss: E(
    'hunger_remnant',
    'بقايا الجوع',
    'eldritch',
    ['#000000', '#a855f7'],
    { strength: 1.6, intelligence: 1.5 },
    ['voidrend', 'abyssgaze', 'drain'],
    [
      ['hunger_ash', 0.5],
      ['void_crystal', 1],
      ['hunger_fang', 0.004],
    ],
  ),
  mirror_steppe: E(
    'mirror_double',
    'القرين',
    'humanoid',
    ['#e2e8f0', '#67e8f9'],
    { agility: 1.5, intelligence: 1.5 },
    ['echo', 'shadowbolt', 'drain'],
    [
      ['mirror_shard', 1],
      ['first_mirror', 0.003],
    ],
  ),
  clockwork_isles: E(
    'gear_titan',
    'عملاق التروس',
    'golem',
    ['#78350f', '#fbbf24'],
    { defense: 1.7, strength: 1.4 },
    ['rockslam', 'harden', 'lightning'],
    [
      ['brass_gear', 1],
      ['chrono_spring', 0.5],
      ['first_mirror', 0.003],
    ],
  ),
  eclipse_sanctum: E(
    'umbral_abbot',
    'رئيس الرهبان المعتم',
    'ghost',
    ['#111827', '#fde68a'],
    { intelligence: 1.7, endurance: 1.3 },
    ['abyssgaze', 'curse', 'mend'],
    [
      ['penumbra_silk', 0.8],
      ['eclipse_ash', 1],
      ['first_mirror', 0.003],
    ],
  ),
  nexus_heart: E(
    'heart_sentinel',
    'حارس القلب',
    'golem',
    ['#0e7490', '#cffafe'],
    { defense: 1.6, intelligence: 1.5 },
    ['crystalspike', 'riftfire', 'mend'],
    [
      ['nexus_essence', 0.6],
      ['nexus_spark', 0.001],
    ],
  ),
};

/** Elite stat boost (on top of the zone-scaled spawn). */
export const ELITE_MULT = { hpMult: 2.1, statMult: 1.12, levelOffset: 2 };

/** Chance an elite answers instead of a regular monster, by zone depth. */
export const ELITE_CHANCE = { 1: 0, 2: 0.04, 3: 0.07, 4: 0.12 };

/** Province XP multiplier on exploration rewards (deeper provinces pay more). */
export function provinceTier(provinceKey) {
  return { nexus: 0.6, verdant: 1, sands: 1.3, deep: 1.6, heights: 1.7, rift: 2, returned: 2.6 }[provinceKey] ?? 1;
}

export function zoneStats() {
  const zones = Object.values(ZONE_BY_KEY);
  return {
    provinces: PROVINCES.length,
    locations: Object.keys(ZONES).length,
    zones: zones.length,
    hidden: zones.filter((z) => z.depth === 4).length,
    elites: Object.keys(ELITES).length,
  };
}
