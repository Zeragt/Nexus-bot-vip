-- Starter world content. Admins can change or extend all of it from Discord.

INSERT INTO factions (key, name, name_ar, description, color) VALUES
  ('nexus_guard',  'Nexus Guard',       'حرس نكسس',        'الحماة الرسميون لمدينة نكسس وبواباتها.', '#3b82f6'),
  ('adventurers',  'Adventurers Guild', 'نقابة المغامرين', 'من يجوبون البراري ويكشفون أسرار العالم.', '#22d3ee'),
  ('merchants',    'Merchant Guild',    'نقابة التجار',    'شبكة التجارة التي تحرك ذهب المدينة.',      '#f5b942'),
  ('unknown_order','Unknown Order',     'الطائفة المجهولة', 'لا أحد يعرف أهدافهم... ولا وجوههم.',      '#a78bfa')
ON CONFLICT (key) DO NOTHING;

INSERT INTO locations (key, name, name_ar, description, region, channel_name, map_x, map_y, danger_level, min_level, is_start) VALUES
  ('nexus_city',     'Nexus City',           'مدينة نكسس',       'قلب العالم، حيث تلتقي الأبعاد وتبدأ كل الحكايات.',             'city',  'nexus-city',           0.50, 0.50, 0, 1, TRUE),
  ('central_plaza',  'Central Plaza',        'الساحة المركزية',  'نافورة البلور تتوسط الساحة، والأخبار تنتشر هنا أسرع من الضوء.', 'city',  'central-plaza',        0.50, 0.40, 0, 1, FALSE),
  ('cafe',           'Cafe',                 'المقهى',           'رائحة القهوة السحرية، وأحاديث هادئة عن عوالم بعيدة.',          'city',  'cafe',                 0.40, 0.44, 0, 1, FALSE),
  ('tavern',         'Tavern',               'الحانة',           'مكان المغامرين المتعبين، والإشاعات، والصفقات المشبوهة.',         'city',  'tavern',               0.60, 0.44, 0, 1, FALSE),
  ('market',         'Market',               'السوق',            'أكشاك من كل الأبعاد، وكل شيء له ثمن.',                          'city',  'market',               0.42, 0.56, 0, 1, FALSE),
  ('library',        'Library',              'المكتبة',          'رفوف لا نهاية لها، وكتب تهمس بأسرار نسيها الزمن.',               'city',  'library',              0.58, 0.56, 0, 1, FALSE),
  ('blacksmith',     'Blacksmith',           'الحداد',           'سندان يرن ليلاً ونهاراً، وأسلحة تولد من نار زرقاء.',             'city',  'blacksmith',           0.50, 0.62, 0, 1, FALSE),
  ('residential',    'Residential District', 'الحي السكني',      'بيوت متلاصقة، ونوافذ مضيئة، وجيران يعرفون كل شيء.',             'city',  'residential-district', 0.36, 0.34, 0, 1, FALSE),
  ('forest',         'Forest',               'الغابة',           'أشجار عملاقة تتوهج أوراقها، ومخلوقات تراقب من الظلال.',          'wild',  'forest',               0.16, 0.48, 2, 1, FALSE),
  ('mountains',      'Mountains',            'الجبال',           'قمم مكسوة بالثلج والصواعق، وكهوف لم يدخلها أحد.',                'wild',  'mountains',            0.40, 0.12, 4, 3, FALSE),
  ('lake',           'Lake',                 'البحيرة',          'مياه ساكنة تعكس سماءً غير هذه السماء.',                          'wild',  'lake',                 0.84, 0.46, 2, 1, FALSE),
  ('desert',         'Desert',               'الصحراء',          'رمال تبتلع القوافل، وسراب يخفي مدناً مدفونة.',                   'wild',  'desert',               0.62, 0.88, 5, 4, FALSE),
  ('ruins',          'Ruins',                'الأطلال',          'بقايا حضارة سقطت فجأة، وما زال شيء ما يحرسها.',                  'wild',  'ruins',                0.22, 0.80, 6, 5, FALSE),
  ('dimensional_gate','Dimensional Gate',    'البوابة البعدية',  'شق في نسيج الواقع، يقود إلى ما لا يعرفه أحد.',                   'rift',  'dimensional-gate',     0.84, 0.14, 9, 10, FALSE)
ON CONFLICT (key) DO NOTHING;

INSERT INTO jobs (key, name, name_ar, description, min_level, base_pay, xp_reward, energy_cost, cooldown_seconds, main_stat, faction_id) VALUES
  ('blacksmith',   'Blacksmith',    'حداد',         'تطرق المعادن وتصنع العتاد.',             1, 60,  8, 15, 3600, 'strength',     NULL),
  ('merchant',     'Merchant',      'تاجر',         'تشتري بثمن وتبيع بأعلى.',                1, 55,  6, 10, 3600, 'luck',         (SELECT id FROM factions WHERE key='merchants')),
  ('hunter',       'Hunter',        'صياد',         'تتعقب الطرائد في البراري.',              2, 70,  9, 18, 3600, 'agility',      NULL),
  ('guard',        'Guard',         'حارس',         'تحرس أسوار المدينة وبواباتها.',          2, 65,  8, 15, 3600, 'defense',      (SELECT id FROM factions WHERE key='nexus_guard')),
  ('doctor',       'Doctor',        'طبيب',         'تداوي الجرحى من كل الأبعاد.',            3, 80,  9, 12, 3600, 'intelligence', NULL),
  ('scholar',      'Scholar',       'باحث',         'تفك رموز المخطوطات القديمة.',            1, 50,  10, 8, 3600, 'intelligence', NULL),
  ('adventurer',   'Adventurer',    'مغامر',        'تقبل أي عمل مقابل الذهب والمجد.',        1, 60,  10, 20, 3600, 'endurance',    (SELECT id FROM factions WHERE key='adventurers')),
  ('bounty_hunter','Bounty Hunter', 'صائد جوائز',   'تلاحق المطلوبين مقابل مكافآت ضخمة.',     6, 120, 14, 25, 5400, 'agility',      NULL),
  ('farmer',       'Farmer',        'مزارع',        'تزرع محاصيل تنمو على ضوء القمرين.',      1, 45,  6, 10, 2700, 'endurance',    NULL),
  ('alchemist',    'Alchemist',     'خيميائي',      'تمزج الأعشاب والجواهر لصنع الأعاجيب.',   4, 95,  12, 14, 4500, 'intelligence', NULL)
ON CONFLICT (key) DO NOTHING;

INSERT INTO skills (key, name, name_ar, description, type, discipline, cooldown_turns, energy_cost, power, scaling_stat, effect_key, effect_chance, effect_turns, target, required_level, starter) VALUES
  ('power_strike',  'Power Strike',   'ضربة قاصمة',     'ضربة مركزة بكل القوة.',                      'attack',  'swordsmanship', 2, 15, 160, 'strength',     NULL,         0,    0, 'enemy', 1, TRUE),
  ('guard_stance',  'Guard Stance',   'وضعية الحراسة',  'ترفع دفاعك لعدة أدوار.',                     'defense', 'martial',       3, 10, 0,   'defense',      'defense_up', 1,    3, 'self',  1, TRUE),
  ('first_aid',     'First Aid',      'إسعاف أولي',     'تضمد جراحك سريعاً.',                         'healing', 'medicine',      3, 15, 25,  'intelligence', NULL,         0,    0, 'self',  1, TRUE),
  ('venom_blade',   'Venom Blade',    'نصل السم',       'ضربة تترك سماً يسري في الدم.',               'attack',  'assassination', 3, 18, 110, 'agility',      'poison',     0.8,  3, 'enemy', 2, FALSE),
  ('rending_slash', 'Rending Slash',  'شق نازف',        'جرح عميق يسبب نزيفاً.',                      'attack',  'swordsmanship', 3, 18, 120, 'strength',     'bleeding',   0.7,  3, 'enemy', 3, FALSE),
  ('fireball',      'Fireball',       'كرة اللهب',      'لهب أزرق يحرق الهدف.',                       'attack',  'magic',         2, 22, 150, 'intelligence', 'burn',       0.6,  2, 'enemy', 3, FALSE),
  ('frost_lance',   'Frost Lance',    'رمح الجليد',     'رمح جليدي قد يجمّد الخصم.',                  'attack',  'magic',         4, 25, 130, 'intelligence', 'freeze',     0.35, 1, 'enemy', 5, FALSE),
  ('shield_bash',   'Shield Bash',    'صدمة الدرع',     'صدمة قد تشل الخصم لدور.',                    'attack',  'martial',       4, 20, 90,  'defense',      'stun',       0.4,  1, 'enemy', 4, FALSE),
  ('mind_spike',    'Mind Spike',     'وخزة ذهنية',     'هجوم نفسي يُسكت قدرات الخصم.',               'attack',  'psychic',       4, 22, 100, 'intelligence', 'silence',    0.6,  2, 'enemy', 6, FALSE),
  ('war_cry',       'War Cry',        'صرخة الحرب',     'صرخة تشعل الحماس وتزيد الهجوم.',             'utility', 'martial',       4, 12, 0,   'strength',     'attack_up',  1,    3, 'self',  2, FALSE),
  ('regenerate',    'Regenerate',     'تجدد',           'طاقة حيوية ترمم الجسد مع الوقت.',            'healing', 'alchemy',       5, 20, 0,   'endurance',    'regeneration',1,   3, 'self',  4, FALSE),
  ('tangle_trap',   'Tangle Trap',    'فخ التشابك',     'فخ تقني يبطئ حركة الخصم.',                   'utility', 'technology',    3, 14, 40,  'agility',      'slow',       0.9,  3, 'enemy', 2, FALSE),
  ('rift_breaker',  'Rift Breaker',   'كاسر البُعد',    'ضربة تمزق الواقع حول الخصم.',                'special', 'dimensional',   6, 40, 260, 'intelligence', 'stun',       0.3,  1, 'enemy', 10, FALSE),
  ('iron_skin',     'Iron Skin',      'جلد حديدي',      'مهارة سلبية: دفاع إضافي دائم.',              'passive', 'martial',       0, 0,  6,   'defense',      NULL,         0,    0, 'self',  3, FALSE),
  ('keen_eye',      'Keen Eye',       'عين ثاقبة',      'مهارة سلبية: فرصة ضربة حرجة أعلى.',          'passive', 'assassination', 0, 0,  6,   'luck',         NULL,         0,    0, 'self',  3, FALSE)
ON CONFLICT (key) DO NOTHING;

INSERT INTO items (key, name, name_ar, description, type, rarity, value, weight, stats, use_effect, usable, equippable, slot) VALUES
  ('rusty_sword',     'Rusty Sword',      'سيف صدئ',          'رفيق كل مبتدئ.',                         'weapon',     'common',    40,   4,   '{"attack":4}',                         NULL, FALSE, TRUE,  'weapon'),
  ('iron_sword',      'Iron Sword',       'سيف حديدي',        'متوازن وموثوق.',                         'weapon',     'uncommon',  180,  5,   '{"attack":9,"strength":1}',            NULL, FALSE, TRUE,  'weapon'),
  ('hunter_bow',      'Hunter Bow',       'قوس الصياد',       'خفيف ودقيق.',                            'weapon',     'uncommon',  200,  3,   '{"attack":8,"agility":2}',             NULL, FALSE, TRUE,  'weapon'),
  ('arcane_staff',    'Arcane Staff',     'عصا السحر',        'تتوهج بطاقة زرقاء.',                     'weapon',     'rare',      520,  3,   '{"attack":6,"intelligence":5}',        NULL, FALSE, TRUE,  'weapon'),
  ('shadow_dagger',   'Shadow Dagger',    'خنجر الظل',        'لا يُرى إلا بعد فوات الأوان.',            'weapon',     'rare',      560,  1.5, '{"attack":11,"agility":3,"luck":2}',   NULL, FALSE, TRUE,  'weapon'),
  ('starforged_blade','Starforged Blade', 'نصل النجوم',       'صُهر في قلب نجم ميت.',                   'weapon',     'epic',      1800, 4,   '{"attack":20,"strength":4,"luck":2}',  NULL, FALSE, TRUE,  'weapon'),
  ('void_reaver',     'Void Reaver',      'حاصد الفراغ',      'سلاح من خلف البوابة البعدية.',            'weapon',     'legendary', 6000, 5,   '{"attack":34,"strength":6,"intelligence":4}', NULL, FALSE, TRUE, 'weapon'),
  ('leather_armor',   'Leather Armor',    'درع جلدي',         'حماية بسيطة وخفيفة.',                    'armor',      'common',    60,   6,   '{"armor":4}',                          NULL, FALSE, TRUE,  'armor'),
  ('chainmail',       'Chainmail',        'درع زرد',          'حلقات فولاذية متشابكة.',                 'armor',      'uncommon',  260,  10,  '{"armor":9,"endurance":1}',            NULL, FALSE, TRUE,  'armor'),
  ('guard_plate',     'Guard Plate',      'درع الحرس',        'زي حرس نكسس الرسمي.',                    'armor',      'rare',      700,  14,  '{"armor":15,"defense":3}',             NULL, FALSE, TRUE,  'armor'),
  ('nebula_robe',     'Nebula Robe',      'رداء السديم',      'منسوج من غبار النجوم.',                  'armor',      'epic',      2100, 3,   '{"armor":10,"intelligence":6,"agility":2}', NULL, FALSE, TRUE, 'armor'),
  ('lucky_charm',     'Lucky Charm',      'تميمة الحظ',       'يقال إنها تجلب الحظ... أحياناً.',         'accessory',  'uncommon',  220,  0.2, '{"luck":4}',                           NULL, FALSE, TRUE,  'accessory'),
  ('cyan_pendant',    'Cyan Pendant',     'قلادة سماوية',     'حجر يخزن طاقة الأبعاد.',                 'accessory',  'rare',      650,  0.3, '{"intelligence":3,"endurance":3}',     NULL, FALSE, TRUE,  'accessory'),
  ('rift_core',       'Rift Core',        'نواة الشق',        'قلب ينبض بطاقة غير مستقرة.',             'accessory',  'mythic',    12000,0.5, '{"strength":6,"defense":6,"agility":6,"intelligence":6,"endurance":6,"luck":6}', NULL, FALSE, TRUE, 'accessory'),
  ('health_potion',   'Health Potion',    'جرعة شفاء',        'تعيد 40 نقطة صحة.',                      'consumable', 'common',    35,   0.3, '{}', '{"heal":40}',                        TRUE,  FALSE, NULL),
  ('greater_potion',  'Greater Potion',   'جرعة شفاء كبرى',   'تعيد 120 نقطة صحة.',                     'consumable', 'rare',      140,  0.4, '{}', '{"heal":120}',                       TRUE,  FALSE, NULL),
  ('energy_tonic',    'Energy Tonic',     'منشط الطاقة',      'يعيد 35 نقطة طاقة.',                     'consumable', 'common',    30,   0.3, '{}', '{"energy":35}',                      TRUE,  FALSE, NULL),
  ('nexus_coffee',    'Nexus Coffee',     'قهوة نكسس',        'تعيد 15 طاقة، ومزاجاً رائعاً.',            'consumable', 'common',    12,   0.2, '{}', '{"energy":15}',                      TRUE,  FALSE, NULL),
  ('antidote',        'Antidote',         'ترياق',            'يزيل التأثيرات السلبية المستمرة.',        'consumable', 'uncommon',  60,   0.2, '{}', '{"cleanse":true}',                   TRUE,  FALSE, NULL),
  ('fury_elixir',     'Fury Elixir',      'إكسير الغضب',      'يرفع الهجوم لمدة 30 دقيقة.',              'consumable', 'rare',      220,  0.3, '{}', '{"buff":"attack_up","minutes":30}',  TRUE,  FALSE, NULL),
  ('stone_elixir',    'Stone Elixir',     'إكسير الصخر',      'يرفع الدفاع لمدة 30 دقيقة.',              'consumable', 'rare',      220,  0.3, '{}', '{"buff":"defense_up","minutes":30}', TRUE,  FALSE, NULL),
  ('wolf_pelt',       'Wolf Pelt',        'فرو ذئب',          'فرو ناعم من ذئاب الغابة.',                'material',   'common',    18,   1,   '{}', NULL, FALSE, FALSE, NULL),
  ('glow_herb',       'Glow Herb',        'عشبة متوهجة',      'تنمو فقط تحت ضوء القمرين.',               'material',   'common',    14,   0.1, '{}', NULL, FALSE, FALSE, NULL),
  ('iron_ore',        'Iron Ore',         'خام الحديد',       'ثقيل، لكنه أساس كل سلاح.',                'material',   'common',    20,   2,   '{}', NULL, FALSE, FALSE, NULL),
  ('star_shard',      'Star Shard',       'شظية نجمية',       'شظية تسقط حين تنشق السماء.',             'material',   'epic',      900,  0.2, '{}', NULL, FALSE, FALSE, NULL),
  ('ancient_relic',   'Ancient Relic',    'أثر قديم',         'نقوش لا يفهمها أحد في المدينة.',          'quest',      'rare',      0,    1,   '{}', NULL, FALSE, FALSE, NULL),
  ('sealed_letter',   'Sealed Letter',    'رسالة مختومة',     'ختم شمعي بشعار مجهول.',                  'quest',      'uncommon',  0,    0.1, '{}', NULL, FALSE, FALSE, NULL),
  ('old_map',         'Old Map',          'خريطة قديمة',      'تشير إلى مكان ما في الأطلال.',            'misc',       'uncommon',  75,   0.1, '{}', NULL, FALSE, FALSE, NULL),
  ('crystal_rose',    'Crystal Rose',     'وردة بلورية',      'هدية مثالية... لمن يستحق.',               'misc',       'rare',      300,  0.2, '{}', NULL, FALSE, FALSE, NULL)
ON CONFLICT (key) DO NOTHING;
UPDATE items SET tradeable = FALSE WHERE type = 'quest';

INSERT INTO npcs (key, name, title, description, location_id, faction_id, color, has_shop) VALUES
  ('aurel',   'Aurel',   'حارس البوابة الأول', 'رجل بدرع أزرق لا يبتسم أبداً، يعرف كل وجه يدخل المدينة.', (SELECT id FROM locations WHERE key='nexus_city'),    (SELECT id FROM factions WHERE key='nexus_guard'),  '#3b82f6', FALSE),
  ('mira',    'Mira',    'صاحبة المقهى',       'تعرف طلبك قبل أن تنطق، وتعرف أسرارك أيضاً.',              (SELECT id FROM locations WHERE key='cafe'),          NULL,                                                '#67e8f9', TRUE),
  ('borin',   'Borin',   'الحداد العجوز',      'يداه من حديد، وقلبه من ذهب... أحياناً.',                  (SELECT id FROM locations WHERE key='blacksmith'),    NULL,                                                '#f59e0b', TRUE),
  ('selene',  'Selene',  'تاجرة الأبعاد',      'بضاعتها من عوالم لا تظهر على أي خريطة.',                  (SELECT id FROM locations WHERE key='market'),        (SELECT id FROM factions WHERE key='merchants'),    '#f5b942', TRUE),
  ('elder_ka','Elder Ka','أمين المكتبة',        'شيخ يقرأ ثلاثة كتب في وقت واحد.',                        (SELECT id FROM locations WHERE key='library'),       NULL,                                                '#a5b4fc', TRUE),
  ('rook',    'Rook',    'صاحب الحانة',        'يسمع كل شيء، ويبيع المعلومات لمن يدفع.',                  (SELECT id FROM locations WHERE key='tavern'),        (SELECT id FROM factions WHERE key='adventurers'),  '#fb923c', TRUE),
  ('lyra',    'Lyra',    'حارسة الغابة',        'تتحدث مع الأشجار، والأشجار تجيبها.',                     (SELECT id FROM locations WHERE key='forest'),        (SELECT id FROM factions WHERE key='adventurers'),  '#34d399', FALSE),
  ('veil',    'Veil',    '???',                'ظل مقنّع يقف قرب البوابة... ينتظر.',                     (SELECT id FROM locations WHERE key='dimensional_gate'), (SELECT id FROM factions WHERE key='unknown_order'), '#a78bfa', TRUE)
ON CONFLICT (key) DO NOTHING;

INSERT INTO npc_dialogues (npc_id, trigger, text, min_reputation)
SELECT n.id, d.trigger, d.text, d.min_rep FROM (VALUES
  ('aurel','greet','مرحباً بك في نكسس، أيها الغريب. القواعد بسيطة: لا تُحدث فوضى.', -100000),
  ('aurel','talk','الأبعاد تتشقق أكثر هذه الأيام... إن رأيت شيئاً غريباً، أخبر الحرس.', -100000),
  ('aurel','talk','سمعت أن الأطلال بدأت تتوهج ليلاً. لا تذهب وحدك.', 50),
  ('mira','greet','أهلاً! قهوتك جاهزة، كالعادة.', -100000),
  ('mira','talk','الزبون الذي جلس هناك أمس... لم يكن له ظل. غريب، أليس كذلك؟', -100000),
  ('mira','talk','لو تريد أن تعرف أي شيء عن هذه المدينة، اسأل روك في الحانة. لكن احذر من ثمنه.', 20),
  ('borin','greet','هه! أداة جديدة؟ أم سيف مكسور آخر؟', -100000),
  ('borin','talk','الحديد الجيد يأتي من الجبال. أحضر لي خاماً وسأريك العجب.', -100000),
  ('selene','greet','كل شيء للبيع... حتى الذكريات، إن دفعت السعر المناسب.', -100000),
  ('selene','talk','وصلتني اليوم شظية نجمية. لا، ليست للبيع... ليس بعد.', -100000),
  ('elder_ka','greet','ادخل بهدوء. الكتب هنا تستيقظ بسهولة.', -100000),
  ('elder_ka','talk','نكسس لم تُبنَ... بل وُجدت. وهذا ما يخيفني.', -100000),
  ('rook','greet','اجلس. الشراب الأول على حسابك.', -100000),
  ('rook','talk','هناك جائزة على رأس قاطع طريق في الصحراء. مهتم؟', -100000),
  ('lyra','greet','الغابة تشعر بك. خطواتك ثقيلة.', -100000),
  ('lyra','talk','الذئاب أصبحت أكثر عدوانية منذ ظهور الشق. شيء ما يناديها.', -100000),
  ('veil','greet','...كنت أنتظرك.', -100000),
  ('veil','talk','الطائفة لا تُطلب... الطائفة تختار.', -100000)
) AS d(npc_key, trigger, text, min_rep)
JOIN npcs n ON n.key = d.npc_key;

INSERT INTO npc_shop_items (npc_id, item_id, price, stock)
SELECT n.id, i.id, s.price, s.stock FROM (VALUES
  ('mira','nexus_coffee',15,NULL::int), ('mira','energy_tonic',40,NULL),
  ('borin','rusty_sword',50,NULL), ('borin','iron_sword',220,NULL), ('borin','leather_armor',75,NULL), ('borin','chainmail',320,NULL), ('borin','guard_plate',850,5),
  ('selene','health_potion',45,NULL), ('selene','antidote',75,NULL), ('selene','lucky_charm',280,NULL), ('selene','hunter_bow',250,NULL), ('selene','old_map',95,10), ('selene','crystal_rose',380,8),
  ('elder_ka','arcane_staff',640,NULL), ('elder_ka','cyan_pendant',800,5), ('elder_ka','greater_potion',170,NULL),
  ('rook','health_potion',50,NULL), ('rook','fury_elixir',260,NULL), ('rook','stone_elixir',260,NULL), ('rook','shadow_dagger',700,3),
  ('veil','starforged_blade',2400,2), ('veil','nebula_robe',2700,2), ('veil','star_shard',1200,3)
) AS s(npc_key, item_key, price, stock)
JOIN npcs n ON n.key = s.npc_key
JOIN items i ON i.key = s.item_key
ON CONFLICT DO NOTHING;

INSERT INTO quests (code, title, description, difficulty, location_id, giver_npc_id, min_level, xp_reward, nx_reward, reputation_reward, faction_id, faction_rep_reward, repeatable, requires_review) VALUES
  ('Q-0001','أولى الخطوات','تجول في المدينة وتعرّف على الساحة المركزية والسوق.','easy',(SELECT id FROM locations WHERE key='nexus_city'),(SELECT id FROM npcs WHERE key='aurel'),1,60,80,5,(SELECT id FROM factions WHERE key='nexus_guard'),10,FALSE,FALSE),
  ('Q-0002','أعشاب القمر','اجمع 3 أعشاب متوهجة من الغابة للطبيب.','easy',(SELECT id FROM locations WHERE key='forest'),(SELECT id FROM npcs WHERE key='lyra'),1,80,120,5,(SELECT id FROM factions WHERE key='adventurers'),15,TRUE,FALSE),
  ('Q-0003','خام للحداد','أحضر 4 قطع من خام الحديد إلى بورين.','normal',(SELECT id FROM locations WHERE key='blacksmith'),(SELECT id FROM npcs WHERE key='borin'),2,120,180,8,NULL,0,TRUE,FALSE),
  ('Q-0004','ذئاب الغابة','اهزم 3 مخلوقات في الغابة لحماية الطريق.','normal',(SELECT id FROM locations WHERE key='forest'),(SELECT id FROM npcs WHERE key='lyra'),2,150,200,10,(SELECT id FROM factions WHERE key='adventurers'),25,TRUE,FALSE),
  ('Q-0005','ورديات الحرس','اعمل 3 ورديات في أي وظيفة لإثبات التزامك.','normal',(SELECT id FROM locations WHERE key='nexus_city'),(SELECT id FROM npcs WHERE key='aurel'),1,130,150,10,(SELECT id FROM factions WHERE key='nexus_guard'),25,FALSE,FALSE),
  ('Q-0006','همسات الأطلال','اذهب إلى الأطلال واكتب مشهد RP عما وجدته هناك. يراجعه الإداريون.','hard',(SELECT id FROM locations WHERE key='ruins'),(SELECT id FROM npcs WHERE key='elder_ka'),5,400,500,25,NULL,0,FALSE,TRUE),
  ('Q-0007','الرسالة المختومة','سلّم الرسالة المختومة إلى الظل عند البوابة البعدية.','elite',(SELECT id FROM locations WHERE key='dimensional_gate'),(SELECT id FROM npcs WHERE key='veil'),10,900,1200,40,(SELECT id FROM factions WHERE key='unknown_order'),80,FALSE,FALSE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO quest_objectives (quest_id, position, description, kind, target_key, required_count)
SELECT q.id, o.pos, o.descr, o.kind, o.target, o.cnt FROM (VALUES
  ('Q-0001',1,'زر الساحة المركزية','visit','central_plaza',1),
  ('Q-0001',2,'زر السوق','visit','market',1),
  ('Q-0002',1,'اجمع عشبة متوهجة','collect','glow_herb',3),
  ('Q-0003',1,'أحضر خام الحديد','collect','iron_ore',4),
  ('Q-0004',1,'اهزم مخلوقات الغابة','defeat','forest',3),
  ('Q-0005',1,'أنجز ورديات عمل','work','any',3),
  ('Q-0006',1,'زر الأطلال','visit','ruins',1),
  ('Q-0006',2,'اكتب مشهد RP عن الأطلال','manual',NULL,1),
  ('Q-0007',1,'زر البوابة البعدية','visit','dimensional_gate',1),
  ('Q-0007',2,'سلّم الرسالة المختومة','collect','sealed_letter',1)
) AS o(code,pos,descr,kind,target,cnt)
JOIN quests q ON q.code = o.code
WHERE NOT EXISTS (SELECT 1 FROM quest_objectives x WHERE x.quest_id = q.id);

INSERT INTO quest_reward_items (quest_id, item_id, quantity)
SELECT q.id, i.id, r.qty FROM (VALUES
  ('Q-0001','health_potion',2), ('Q-0002','energy_tonic',1), ('Q-0003','iron_sword',1),
  ('Q-0004','wolf_pelt',2), ('Q-0005','sealed_letter',1), ('Q-0006','ancient_relic',1), ('Q-0007','rift_core',1)
) AS r(code,item,qty)
JOIN quests q ON q.code = r.code JOIN items i ON i.key = r.item
ON CONFLICT DO NOTHING;

INSERT INTO random_event_definitions (key, name_ar, description, probability, cooldown_minutes, location_keys, rewards, max_claims, duration_minutes) VALUES
  ('merchant_caravan','قافلة تجار','قافلة من بُعد آخر توقفت للحظات. من يصل أولاً يحصل على صفقة!',0.25,180,'{market,central_plaza,desert}','{"nx":[40,120],"items":[["health_potion",1]]}',4,15),
  ('monster_attack','هجوم وحش','وحش خرج من الظلال يهاجم المارة! من يتصدى له؟',0.2,150,'{forest,mountains,ruins,lake}','{"xp":[40,90],"nx":[30,80],"items":[["wolf_pelt",1]]}',3,15),
  ('mysterious_stranger','غريب غامض','غريب بعباءة رمادية يعرض سراً... مقابل لا شيء؟',0.15,240,'{tavern,cafe,central_plaza}','{"xp":[30,60],"items":[["old_map",1]]}',2,15),
  ('treasure_discovery','كنز مدفون','بريق تحت التراب! صندوق قديم ينتظر من يفتحه.',0.12,300,'{desert,ruins,lake,forest}','{"nx":[100,300]}',2,10),
  ('dimensional_rift','شق بُعدي','السماء تتشقق! طاقة غريبة تتسرب من الشق.',0.08,360,'{dimensional_gate,central_plaza,mountains}','{"xp":[80,160],"items":[["star_shard",1]]}',2,10),
  ('lost_child','طفل تائه','طفل صغير يبكي، فقد أهله في الزحام.',0.18,200,'{market,residential,central_plaza}','{"xp":[30,60],"reputation":5}',1,20),
  ('bandit_ambush','كمين قطاع طرق','قطاع طرق يحاصرون الطريق! قاوم أو اهرب.',0.18,180,'{desert,forest,mountains}','{"xp":[50,100],"nx":[40,100]}',3,15),
  ('ancient_ruins','أطلال منسية','زلزال صغير كشف مدخلاً لم يره أحد من قبل.',0.1,300,'{ruins,mountains,desert}','{"xp":[60,120],"items":[["ancient_relic",1]]}',2,15),
  ('strange_weather','طقس غريب','مطر أزرق متوهج يتساقط... ويشفي الجروح؟',0.2,240,'{nexus_city,lake,residential,forest}','{"heal":true,"xp":[15,30]}',6,20),
  ('missing_person','شخص مفقود','ملصقات في كل مكان: "مفقود منذ ثلاثة أيام". هل رأيته؟',0.15,240,'{residential,tavern,library}','{"xp":[40,80],"reputation":8}',2,20)
ON CONFLICT (key) DO NOTHING;

INSERT INTO achievements (key, name_ar, description, metric, threshold, xp_reward, nx_reward, tier, position) VALUES
  ('first_step',   'الخطوة الأولى', 'أنشئ شخصيتك في نكسس.',          'created',          1,     20,   50,   'bronze', 1),
  ('traveler',     'الرحالة',       'زُر 5 مواقع مختلفة.',             'locations',        5,     60,   100,  'bronze', 2),
  ('explorer',     'المستكشف',      'زُر 10 مواقع مختلفة.',            'locations',        10,    150,  300,  'silver', 3),
  ('fighter',      'المقاتل',       'انتصر في أول قتال.',              'combat_wins',      1,     40,   60,   'bronze', 4),
  ('champion',     'البطل',         'انتصر في 25 قتالاً.',             'combat_wins',      25,    300,  800,  'gold',   5),
  ('quester',      'صاحب المهام',   'أنجز 5 مهام.',                    'quests_completed', 5,     120,  200,  'silver', 6),
  ('worker',       'المجتهد',       'أنجز 25 وردية عمل.',              'shifts_worked',    25,    120,  250,  'silver', 7),
  ('trader',       'التاجر الماهر', 'أتمّ 5 صفقات تداول.',             'trades_completed', 5,     80,   150,  'bronze', 8),
  ('rich',         'الثري',         'امتلك 10,000 NX.',               'nx',               10000, 200,  0,    'gold',   9),
  ('veteran',      'المحارب القديم','صل إلى المستوى 10.',              'level',            10,    0,    1000, 'silver', 10),
  ('legend',       'الأسطورة',      'صل إلى المستوى 25.',              'level',            25,    0,    5000, 'mythic', 11)
ON CONFLICT (key) DO NOTHING;

INSERT INTO relationship_types (key, name_ar, color) VALUES
  ('friend','صديق','#34d399'), ('ally','حليف','#22d3ee'), ('family','عائلة','#f5b942'), ('partner','شريك','#f472b6'),
  ('mentor','معلّم','#a5b4fc'), ('student','تلميذ','#93c5fd'), ('rival','منافس','#fb923c'), ('enemy','عدو','#f43f5e')
ON CONFLICT (key) DO NOTHING;

INSERT INTO lore_entries (slug, title, category, content) VALUES
  ('nexus-origin','أصل نكسس','world','لا أحد يعرف متى ظهرت نكسس. يقول الشيوخ إنها لم تُبنَ، بل وُجدت عند نقطة تلتقي فيها كل الأبعاد. من يدخلها يجد نفسه قد وصل من عالمه، دون أن يتذكر كيف.'),
  ('the-gate','البوابة البعدية','places','شق في نسيج الواقع شمال شرق المدينة. يحرسه الحرس نهاراً، وتحرسه أشياء أخرى ليلاً. لا يُسمح بالاقتراب منه إلا للأقوياء.'),
  ('nx-currency','عملة NX','economy','العملة الرسمية في نكسس. بلورات صغيرة تنبض بضوء سماوي، يقال إنها شظايا من البوابة نفسها.'),
  ('unknown-order','الطائفة المجهولة','factions','جماعة لا يُعرف قائدها ولا عدد أفرادها. يظهر رمزها — عين داخل مثلث — في الأماكن التي تحدث فيها أغرب الأحداث.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('xp_multiplier', '1'),
  ('nx_multiplier', '1'),
  ('rp_xp_enabled', 'true'),
  ('random_events_enabled', 'true'),
  ('rp_channel_ids', '[]'),
  ('random_event_channel_ids', '[]'),
  ('quest_board_channel_id', 'null'),
  ('announce_channel_id', 'null')
ON CONFLICT (key) DO NOTHING;
