// Sample view models for every card. Used by `npm run render:preview` and the renderer tests.
import { createFighter, createBattle, performAction } from '../src/engine/combat.js';
import { createRng } from '../src/engine/rng.js';
import { CHAPTERS } from '../src/content/story/index.js';
import { CODEX, CODEX_CATEGORIES } from '../src/content/lore.js';
import { ENEMIES, MONSTER_SKILLS } from '../src/engine/enemies.js';
import { CLASS_BY_KEY, classesIn } from '../src/content/classes.js';
import { subclassesOf } from '../src/content/classGen.js';

const chapter = CHAPTERS[19];
const finale = CHAPTERS[23];

const stats = { strength: 14, defense: 9, agility: 17, intelligence: 8, endurance: 11, luck: 6 };

function battle(finish) {
  const rng = createRng(7);
  const skill = {
    key: 'venom_blade',
    name: 'نصل السم',
    type: 'attack',
    energyCost: 18,
    cooldownTurns: 3,
    power: 110,
    scalingStat: 'agility',
    effectKey: 'poison',
    effectChance: 1,
    effectTurns: 3,
    target: 'enemy',
  };
  const a = createFighter({ id: 1, name: 'كايل الأزرق', level: 12, maxHp: 260, maxEnergy: 120, stats: { ...stats, attack: 11, armor: 10 }, skills: [skill] });
  const b = createFighter({
    id: 2,
    name: 'سيلين',
    level: 11,
    maxHp: 240,
    maxEnergy: 110,
    stats: { ...stats, strength: 12, agility: 12, attack: 9, armor: 15 },
  });
  let s = createBattle(a, b, rng);
  s = performAction(s, { type: 'skill', key: 'venom_blade' }, rng);
  s = performAction(s, { type: 'attack' }, rng);
  s = performAction(s, { type: 'defend' }, rng);
  s = performAction(s, { type: 'attack' }, rng);
  if (finish) s = performAction(s, { type: 'forfeit' }, rng);
  return s;
}

export const samples = {
  profile: [
    'renderProfile',
    {
      name: 'كايل الأزرق',
      code: 'NX-000042',
      title: 'فارس البوابة',
      occupation: 'صائد جوائز',
      race: 'إلف',
      origin: 'مملكة الضباب',
      age: '27',
      alignment: 'محايد طيب',
      level: 12,
      xp: 840,
      xpNeed: 4157,
      hp: 180,
      maxHp: 260,
      energy: 70,
      maxEnergy: 120,
      nx: 15430,
      reputation: 320,
      location: 'الساحة المركزية',
      guild: { name: 'حراس الفجر', tag: 'DAWN' },
      job: 'حارس',
      wins: 14,
      stats,
      statPoints: 3,
      equipment: { weapon: { name: 'خنجر الظل', rarity: 'rare' }, armor: { name: 'رداء السديم', rarity: 'epic' } },
      footer: 'استخدم الأزرار بالأسفل للتنقل',
    },
  ],
  stats: [
    'renderStats',
    {
      name: 'كايل',
      code: 'NX-000042',
      base: stats,
      effective: { ...stats, agility: 20, intelligence: 14 },
      statPoints: 3,
      skillPoints: 1,
      critChance: 0.14,
      dodgeChance: 0.08,
      attack: 11,
      armor: 10,
      carry: 130,
    },
  ],
  inventory: [
    'renderInventory',
    {
      owner: 'كايل',
      code: 'NX-000042',
      nx: 15430,
      weight: 23.4,
      capacity: 130,
      page: 1,
      pages: 2,
      items: [
        { name: 'خنجر الظل', rarity: 'rare', type: 'weapon', quantity: 1, value: 560, equipped: true },
        { name: 'جرعة شفاء', rarity: 'common', type: 'consumable', quantity: 7, value: 35 },
        { name: 'رداء السديم', rarity: 'epic', type: 'armor', quantity: 1, value: 2100, equipped: true },
        { name: 'نواة الشق', rarity: 'mythic', type: 'accessory', quantity: 1, value: 12000 },
        { name: 'عشبة متوهجة', rarity: 'common', type: 'material', quantity: 12, value: 14 },
        { name: 'شظية نجمية', rarity: 'epic', type: 'material', quantity: 2, value: 900 },
        { name: 'رسالة مختومة', rarity: 'uncommon', type: 'quest', quantity: 1, value: 0 },
        { name: 'حاصد الفراغ', rarity: 'legendary', type: 'weapon', quantity: 1, value: 6000 },
      ],
    },
  ],
  item: [
    'renderItem',
    {
      name: 'نصل النجوم',
      nameEn: 'Starforged Blade',
      description: 'صُهر في قلب نجم ميت.',
      rarity: 'epic',
      type: 'weapon',
      value: 1800,
      weight: 4,
      stats: { attack: 20, strength: 4, luck: 2 },
      quantity: 1,
      equippable: true,
      slot: 'weapon',
    },
  ],
  leaderboard: [
    'renderList',
    {
      title: 'لوحة الشرف: المستوى',
      subtitle: 'أقوى شخصيات نكسس',
      iconName: 'trophy',
      color: '#f5c451',
      rows: [
        { rank: 1, title: 'كايل الأزرق', subtitle: 'NX-000042', value: 'LV 24', avatar: null },
        { rank: 2, title: 'سيلين', subtitle: 'NX-000007', value: 'LV 22', avatar: null },
        { rank: 3, title: 'ميرا', subtitle: 'NX-000013', value: 'LV 19', avatar: null },
        { rank: 4, title: 'أورين', subtitle: 'NX-000021', value: 'LV 15', avatar: null, highlight: true },
      ],
      page: 1,
      pages: 3,
    },
  ],
  notice: [
    'renderNotice',
    {
      title: 'ارتقاء في المستوى!',
      subtitle: 'كايل الأزرق وصل إلى المستوى 13',
      iconName: 'sparkle',
      highlight: 'LV 13',
      tiles: [
        { label: 'نقاط إحصائيات', value: '+3', iconName: 'eye' },
        { label: 'نقاط مهارة', value: '+1', iconName: 'zap' },
        { label: 'مكافأة', value: '325 NX', iconName: 'coin', color: '#f5c451' },
      ],
    },
  ],
  combat: ['renderCombat', { state: battle(false), deadline: new Date(Date.now() + 75000) }],
  combatEnd: ['renderCombat', { state: battle(true), rewards: '+80 XP' }],
  map: [
    'renderMap',
    {
      currentKey: 'market',
      visitedKeys: ['nexus_city', 'market', 'forest'],
      playerLevel: 4,
      locations: [
        ['nexus_city', 'مدينة نكسس', 0.5, 0.5, 'city', 0, 1],
        ['central_plaza', 'الساحة المركزية', 0.5, 0.4, 'city', 0, 1],
        ['cafe', 'المقهى', 0.4, 0.44, 'city', 0, 1],
        ['tavern', 'الحانة', 0.6, 0.44, 'city', 0, 1],
        ['market', 'السوق', 0.42, 0.56, 'city', 0, 1],
        ['library', 'المكتبة', 0.58, 0.56, 'city', 0, 1],
        ['blacksmith', 'الحداد', 0.5, 0.62, 'city', 0, 1],
        ['residential', 'الحي السكني', 0.36, 0.34, 'city', 0, 1],
        ['forest', 'الغابة', 0.16, 0.48, 'wild', 2, 1],
        ['mountains', 'الجبال', 0.4, 0.12, 'wild', 4, 3],
        ['lake', 'البحيرة', 0.84, 0.46, 'wild', 2, 1],
        ['desert', 'الصحراء', 0.62, 0.88, 'wild', 5, 4],
        ['ruins', 'الأطلال', 0.22, 0.8, 'wild', 6, 5],
        ['dimensional_gate', 'البوابة البعدية', 0.84, 0.14, 'rift', 9, 10],
      ].map(([key, nameAr, mapX, mapY, region, danger, minLevel]) => ({ key, nameAr, mapX, mapY, region, danger, minLevel, locked: false })),
    },
  ],
  location: [
    'renderLocation',
    {
      nameAr: 'الغابة',
      name: 'Forest',
      description: 'أشجار عملاقة تتوهج أوراقها، ومخلوقات تراقب من الظلال.',
      region: 'wild',
      danger: 2,
      minLevel: 1,
      npcs: [{ name: 'Lyra', title: 'حارسة الغابة', color: '#34d399' }],
      players: 5,
      here: true,
      channelName: 'forest',
    },
  ],
  npc: [
    'renderNpc',
    {
      name: 'Selene',
      title: 'تاجرة الأبعاد',
      description: 'بضاعتها من عوالم لا تظهر على أي خريطة.',
      color: '#f5b942',
      location: 'السوق',
      faction: 'نقابة التجار',
      line: 'كل شيء للبيع... حتى الذكريات، إن دفعت السعر المناسب.',
      hasShop: true,
    },
  ],
  questBoard: [
    'renderQuestBoard',
    {
      playerLevel: 3,
      quests: [
        {
          code: 'Q-0002',
          title: 'أعشاب القمر',
          difficulty: 'easy',
          location: 'الغابة',
          giver: 'Lyra',
          minLevel: 1,
          xp: 80,
          nx: 120,
          items: [{ name: 'منشط الطاقة', rarity: 'common', quantity: 1 }],
          repeatable: true,
        },
        { code: 'Q-0004', title: 'ذئاب الغابة', difficulty: 'normal', location: 'الغابة', minLevel: 2, xp: 150, nx: 200, reputation: 10 },
        {
          code: 'Q-0006',
          title: 'همسات الأطلال',
          difficulty: 'hard',
          location: 'الأطلال',
          minLevel: 5,
          xp: 400,
          nx: 500,
          items: [{ name: 'أثر قديم', rarity: 'rare', quantity: 1 }],
        },
      ],
    },
  ],
  quest: [
    'renderQuest',
    {
      status: 'active',
      quest: {
        code: 'Q-0001',
        title: 'أولى الخطوات',
        description: 'تجول في المدينة وتعرّف على الساحة المركزية والسوق.',
        difficulty: 'easy',
        location: 'مدينة نكسس',
        xpReward: 60,
        nxReward: 80,
        reputationReward: 5,
        items: [{ name: 'جرعة شفاء', rarity: 'common', quantity: 2 }],
      },
      objectives: [
        { description: 'زر الساحة المركزية', kind: 'visit', current: 1, requiredCount: 1, done: true },
        { description: 'اجمع عشبة متوهجة', kind: 'collect', current: 1, requiredCount: 3, done: false },
      ],
    },
  ],
  shop: [
    'renderShop',
    {
      npcName: 'Borin',
      npcTitle: 'الحداد العجوز',
      nx: 500,
      items: [
        { name: 'سيف صدئ', rarity: 'common', type: 'weapon', price: 50, stock: null },
        { name: 'سيف حديدي', rarity: 'uncommon', type: 'weapon', price: 220, stock: null },
        { name: 'درع زرد', rarity: 'uncommon', type: 'armor', price: 320, stock: null },
        { name: 'درع الحرس', rarity: 'rare', type: 'armor', price: 850, stock: 0 },
      ],
    },
  ],
  guild: [
    'renderGuild',
    {
      name: 'حراس الفجر',
      tag: 'DAWN',
      description: 'نحمي من لا يستطيع حماية نفسه.',
      level: 3,
      xp: 1200,
      xpNeed: 3000,
      treasury: 25400,
      reputation: 410,
      members: 8,
      maxMembers: 30,
      leader: 'كايل الأزرق',
      createdAt: '2026-10-24',
      topMembers: [{ name: 'كايل', role: 'leader' }, { name: 'سيلين' }, { name: 'ميرا' }, { name: 'أورين' }],
    },
  ],
  event: [
    'renderEvent',
    {
      title: 'ليلة الشق الأحمر',
      description: 'انشقت السماء فوق البوابة البعدية، وخرجت منها كائنات لم يرها أحد. على المغامرين صدّها قبل الفجر.',
      status: 'active',
      location: 'البوابة البعدية',
      startsAt: '24/10 20:00',
      endsAt: '24/10 23:00',
      participants: 12,
      maxParticipants: 20,
      currentPhase: 2,
      rewards: { xp: 500, nx: 800 },
      phases: [
        { position: 1, title: 'الإنذار', status: 'resolved', outcome: { winner: 'الدفاع' } },
        { position: 2, title: 'الموجة الأولى', status: 'active' },
        { position: 3, title: 'الحارس', status: 'pending' },
        { position: 4, title: 'الختام', status: 'pending' },
      ],
    },
  ],
  achievements: [
    'renderAchievements',
    {
      name: 'كايل',
      achievements: [
        { name: 'الخطوة الأولى', description: 'أنشئ شخصيتك في نكسس.', tier: 'bronze', unlocked: true },
        { name: 'الرحالة', description: 'زُر 5 مواقع مختلفة.', tier: 'bronze', unlocked: true },
        { name: 'المقاتل', description: 'انتصر في أول قتال.', tier: 'bronze', unlocked: true },
        { name: 'البطل', description: 'انتصر في 25 قتالاً.', tier: 'gold', unlocked: false, progress: 0.56 },
        { name: 'الثري', description: 'امتلك 10,000 NX.', tier: 'gold', unlocked: false, progress: 0.3 },
        { name: 'الأسطورة', description: 'صل إلى المستوى 25.', tier: 'mythic', unlocked: false, progress: 0.48 },
      ],
    },
  ],
  trade: [
    'renderTrade',
    {
      status: 'open',
      expiresIn: 'بعد 9 دقائق',
      right: { name: 'كايل', nx: 500, items: [{ name: 'خنجر الظل', rarity: 'rare', type: 'weapon', quantity: 1 }], confirmed: true },
      left: {
        name: 'سيلين',
        nx: 0,
        items: [
          { name: 'شظية نجمية', rarity: 'epic', type: 'material', quantity: 2 },
          { name: 'جرعة شفاء', rarity: 'common', type: 'consumable', quantity: 5 },
        ],
        confirmed: false,
      },
    },
  ],
  wallet: [
    'renderWallet',
    {
      name: 'كايل',
      code: 'NX-000042',
      nx: 15430,
      rank: 3,
      streak: 4,
      transactions: [
        { direction: 'in', amount: 120, label: 'مكافأة مهمة: أعشاب القمر', when: 'قبل ساعة' },
        { direction: 'out', amount: 220, label: 'شراء: سيف حديدي', when: 'قبل 3 ساعات' },
        { direction: 'in', amount: 175, label: 'المكافأة اليومية', when: 'أمس' },
      ],
    },
  ],
  storyPage: [
    'renderStoryPage',
    {
      act: chapter.act,
      chapter,
      page: 3,
      total: chapter.pages.length,
      text: chapter.pages[2].text.replaceAll('{name}', 'آريا'),
      speaker: chapter.pages[2].speaker,
      classKey: 'paladin',
      locationName: 'قلعة الظلال',
    },
  ],
  storyCover: [
    'renderChapterCover',
    {
      act: chapter.act,
      chapter,
      boss: chapter.boss,
      classKey: 'paladin',
      heroName: 'آريا',
      locationName: 'قلعة الظلال',
      status: { completed: 19, total: 25 },
      blockers: [],
      here: true,
      readPages: 5,
    },
  ],
  storyChoice: ['renderChoice', { act: finale.act, chapter: finale, prompt: finale.choice.prompt, options: finale.choice.options, chosen: null }],
  storyList: [
    'renderChapterList',
    {
      act: { ...chapter.act },
      chapters: CHAPTERS.filter((c) => c.act.number === 4).map((c, i) => ({
        ...c,
        bossName: c.boss.name,
        state: i < 2 ? 'done' : i === 2 ? 'current' : 'locked',
      })),
      total: 25,
    },
  ],
  bosses: [
    'renderBossGallery',
    { bosses: CHAPTERS.slice(0, 10).map((c, i) => ({ ...c.boss, defeated: i < 6, chapter: c.index + 1 })), totalBosses: 25, page: 1, pages: 3 },
  ],
  codexIndex: [
    'renderCodexIndex',
    { category: CODEX_CATEGORIES[6], entries: CODEX.filter((e) => e.category === 'characters').slice(0, 15), unlocked: 15, total: 21, page: 1, pages: 2 },
  ],
  codexEntry: ['renderCodexEntry', { title: CODEX[0].title, text: CODEX[0].text, category: CODEX_CATEGORIES[0], number: 1, total: 8 }],
  bestiary: [
    'renderBestiary',
    {
      location: { key: 'forest', nameAr: 'غابة الضياء', danger: 2 },
      monsters: ENEMIES.forest.map((m) => ({ ...m, skills: m.skills.map((k) => MONSTER_SKILLS[k].name), loot: [] })),
    },
  ],
  classGallery: ['renderClassGallery', { category: 'divine', classes: classesIn('divine') }],
  classPaths: [
    'renderPaths',
    {
      cls: CLASS_BY_KEY.paladin,
      paths: subclassesOf(CLASS_BY_KEY.paladin)
        .slice(0, 10)
        .map((p, i) => ({ ...p, index: i })),
      page: 1,
      pages: 3,
      level: 22,
    },
  ],
  emblem: ['renderEmblemCard', { classKey: 'pyromancer', pathKey: 'sovereign', label: 'سيّد الدخان' }],
  welcome: ['renderWelcome', { userName: 'اكبما', avatar: null, hasCharacter: false }],
  lore: [
    'renderLore',
    {
      title: 'أصل نكسس',
      category: 'العالم',
      content:
        'لا أحد يعرف متى ظهرت نكسس. يقول الشيوخ إنها لم تُبنَ، بل وُجدت عند نقطة تلتقي فيها كل الأبعاد. من يدخلها يجد نفسه قد وصل من عالمه، دون أن يتذكر كيف.',
      author: 'Elder Ka',
    },
  ],
};
