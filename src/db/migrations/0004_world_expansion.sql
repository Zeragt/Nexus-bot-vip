-- v2.5 world expansion: daily/weekly contracts, region bosses, exploration and landmarks,
-- crafting, the secret rarity, story locks on places, and the ten returned worlds.

-- Secret rarity -----------------------------------------------------------------
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_rarity_check;
ALTER TABLE items ADD CONSTRAINT items_rarity_check
  CHECK (rarity IN ('common','uncommon','rare','epic','legendary','mythic','secret'));

-- Counters used by achievements and profiles ---------------------------------------
ALTER TABLE characters
  ADD COLUMN contracts_completed INTEGER NOT NULL DEFAULT 0 CHECK (contracts_completed >= 0),
  ADD COLUMN items_crafted       INTEGER NOT NULL DEFAULT 0 CHECK (items_crafted >= 0),
  ADD COLUMN explorations        INTEGER NOT NULL DEFAULT 0 CHECK (explorations >= 0),
  ADD COLUMN pvp_wins            INTEGER NOT NULL DEFAULT 0 CHECK (pvp_wins >= 0),
  ADD COLUMN pvp_losses          INTEGER NOT NULL DEFAULT 0 CHECK (pvp_losses >= 0);

-- Places opened by the story ------------------------------------------------------
ALTER TABLE locations ADD COLUMN required_chapter INTEGER NOT NULL DEFAULT 0 CHECK (required_chapter >= 0);

INSERT INTO locations (key, name, name_ar, description, region, channel_name, map_x, map_y, danger_level, min_level, is_start) VALUES
  ('frost_reach',       'Frost Reach',       'حافة الصقيع',     'عالم مات نجمه فتجمد كل شيء فيه. عاد من الهاوية، وما زال بارداً.',            'beyond', 'frost-reach',       0.26, 0.05, 8, 92,  FALSE),
  ('ember_isles',       'Ember Isles',       'جزر الجمر',       'جزر بركانية تولد وتغرق كل يوم في بحر من الحمم.',                              'beyond', 'ember-isles',       0.97, 0.88, 8, 96,  FALSE),
  ('emerald_wilds',     'Emerald Wilds',     'البراري الزمردية', 'وطن التنين المحرر: غابات زمردية وأنهار تغني.',                               'beyond', 'emerald-wilds',     0.04, 0.40, 8, 100, FALSE),
  ('clockwork_bastion', 'Clockwork Bastion', 'معقل التروس',     'مدينة من نحاس وبخار بنتها بقايا الطائفة في الشمال.',                         'beyond', 'clockwork-bastion', 0.56, 0.02, 9, 104, FALSE),
  ('whispering_marsh',  'Whispering Marsh',  'مستنقع الهمس',    'مستنقع يهمس بأسرار كل من غرق فيه.',                                         'beyond', 'whispering-marsh',  0.08, 0.90, 9, 108, FALSE),
  ('starfall_crater',   'Starfall Crater',   'فوهة النجم الساقط', 'فوهة هائلة سقط فيها نجم من سماء أخرى، ومعه رسل البلاط بلا نجوم.',          'beyond', 'starfall-crater',   0.76, 0.96, 9, 116, FALSE),
  ('mirror_realm',      'Mirror Realm',      'عالم المرايا',     'عالم من الزجاج تعيش فيه الانعكاسات التي هربت من أصحابها.',                   'beyond', 'mirror-realm',      0.98, 0.52, 10, 120, FALSE),
  ('bone_sea',          'Bone Sea',          'بحر العظام',      'بحر جاف من العظام البيضاء تحت قمر شاحب.',                                   'beyond', 'bone-sea',          0.30, 0.97, 10, 128, FALSE),
  ('celestial_spire',   'Celestial Spire',   'البرج السماوي',    'برج يصعد فوق كل السماوات ويحرسه حراس من نور.',                              'beyond', 'celestial-spire',   0.74, 0.03, 10, 134, FALSE),
  ('the_origin',        'The Origin',        'الأصل',           'المكان الذي نُسج فيه نكسس: نول بحجم السماء وخيوط من نور.',                   'beyond', 'the-origin',        0.50, 0.99, 10, 140, FALSE)
ON CONFLICT (key) DO NOTHING;

-- Each place opens with the first chapter that happens there.
UPDATE locations l SET required_chapter = v.ch FROM (VALUES
  ('crystal_caverns', 6), ('ashen_wastes', 9), ('sky_archipelago', 12), ('sunken_kingdom', 14),
  ('shadow_citadel', 18), ('the_abyss', 21),
  ('frost_reach', 25), ('ember_isles', 27), ('emerald_wilds', 29), ('clockwork_bastion', 31), ('whispering_marsh', 33),
  ('starfall_crater', 37), ('mirror_realm', 39), ('bone_sea', 43), ('celestial_spire', 46), ('the_origin', 49)
) AS v(key, ch) WHERE l.key = v.key;

-- Daily and weekly contracts ------------------------------------------------------
CREATE TABLE character_contracts (
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  period        TEXT NOT NULL,                       -- 'd:2026-10-25' or 'w:2026-10-19'
  slot          SMALLINT NOT NULL CHECK (slot >= 1),
  template      TEXT NOT NULL,
  event         TEXT NOT NULL,
  target        TEXT,
  target_name   TEXT,
  title         TEXT NOT NULL,
  tier          TEXT NOT NULL,
  required      INTEGER NOT NULL CHECK (required > 0),
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  xp_reward     INTEGER NOT NULL DEFAULT 0,
  nx_reward     INTEGER NOT NULL DEFAULT 0,
  claimed_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, period, slot)
);
CREATE INDEX character_contracts_open_idx ON character_contracts (character_id, period) WHERE claimed_at IS NULL;

CREATE TABLE contract_state (
  character_id   INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  streak         INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0),
  best_streak    INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  last_clear     TEXT,                                -- daily period of the last full clear
  bonus_claimed  TEXT,                                -- period whose all-clear bonus was paid
  weekly_bonus   TEXT,
  reroll_period  TEXT,
  rerolls        INTEGER NOT NULL DEFAULT 0 CHECK (rerolls >= 0)
);

-- Region bosses -------------------------------------------------------------------
CREATE TABLE character_bosses (
  character_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  boss_key        TEXT NOT NULL,
  kills           INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0),
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  first_kill_at   TIMESTAMPTZ,
  last_fight_at   TIMESTAMPTZ,
  PRIMARY KEY (character_id, boss_key)
);
CREATE INDEX character_bosses_kills_idx ON character_bosses (boss_key) WHERE kills > 0;

-- Exploration ---------------------------------------------------------------------
CREATE TABLE character_landmarks (
  character_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  landmark_key   TEXT NOT NULL,
  location_key   TEXT NOT NULL,
  found_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, landmark_key)
);

CREATE TABLE character_region_stats (
  character_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  location_key   TEXT NOT NULL,
  explored       INTEGER NOT NULL DEFAULT 0 CHECK (explored >= 0),
  gathered       INTEGER NOT NULL DEFAULT 0 CHECK (gathered >= 0),
  hunted         INTEGER NOT NULL DEFAULT 0 CHECK (hunted >= 0),
  mastery_paid   BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (character_id, location_key)
);

-- Defeat log (shown on profiles and used to prevent repeat farming of a friend's bag) ---
CREATE TABLE pvp_drops (
  id             BIGSERIAL PRIMARY KEY,
  session_id     UUID,
  loser_id       INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  winner_id      INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  item_id        INTEGER REFERENCES items(id) ON DELETE SET NULL,
  xp_lost        INTEGER NOT NULL DEFAULT 0,
  warded         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pvp_drops_loser_idx ON pvp_drops (loser_id, created_at DESC);

-- NPCs of the returned worlds (their shop stock is synced with the item content) ------
INSERT INTO npcs (key, name, title, description, location_id, color, has_shop) VALUES
  ('hrafn',  'Hrafn',  'الناجي الأخير',      'رجل عجوز ذاب عنه الجليد بعد ألف عام. يتذكر نجماً كان دافئاً.',       (SELECT id FROM locations WHERE key='frost_reach'),       '#7dd3fc', TRUE),
  ('ignia',  'Ignia',  'حدادة البركان',       'تطرق الحديد على الحمم مباشرة، ولا تلبس قفازات.',                      (SELECT id FROM locations WHERE key='ember_isles'),       '#fb923c', TRUE),
  ('verdan', 'Verdan', 'حارس العش',           'شيخ من شعب التنانين، يتكلم بصوت كالريح بين الأشجار.',                 (SELECT id FROM locations WHERE key='emerald_wilds'),     '#4ade80', TRUE),
  ('cogwin', 'Cogwin', 'المهندس المنشق',      'كان يبني آلات الطائفة، ثم رأى ما تصنعه فهرب بأسرارها.',              (SELECT id FROM locations WHERE key='clockwork_bastion'), '#f59e0b', TRUE),
  ('astra',  'Astra',  'راصدة النجوم',        'فتاة تعيش على حافة الفوهة وتعد النجوم كل ليلة لتعرف أيها اختفى.',     (SELECT id FROM locations WHERE key='starfall_crater'),   '#fde68a', TRUE),
  ('nil',    'Nil',    'انعكاس بلا صاحب',     'انعكاس هرب من صاحبه منذ زمن طويل، ونسي وجه من كان يقلده.',           (SELECT id FROM locations WHERE key='mirror_realm'),      '#e2e8f0', TRUE),
  ('charon', 'Charon', 'المعدّي الشاحب',      'يعبر بحر العظام بقارب من جمجمة، ويقبل أي عملة إلا الذهب.',           (SELECT id FROM locations WHERE key='bone_sea'),          '#e4e4e7', TRUE),
  ('ilun',   'Ilun',   'السيرافي الجريح',     'حارس سقط من البرج بجناح مكسور، ويرفض أن يعود.',                       (SELECT id FROM locations WHERE key='celestial_spire'),   '#facc15', TRUE),
  ('weaver', 'The Weaver', 'الحائكة',          'امرأة من ضوء تجلس على النول الأول. لا تنظر إليك، لكنها تعرفك.',       (SELECT id FROM locations WHERE key='the_origin'),        '#f5f5f4', TRUE)
ON CONFLICT (key) DO NOTHING;

INSERT INTO npc_dialogues (npc_id, trigger, text, min_reputation)
SELECT n.id, d.trigger, d.text, -100000 FROM (VALUES
  ('hrafn','greet','أنت دافئ... نسيت كيف يبدو إنسان دافئ.'),
  ('hrafn','talk','كان لملكنا ابنة. حين انطفأ النجم، خرجت تبحث عن نار جديدة ولم تعد.'),
  ('hrafn','talk','الجليد لا يذوب هنا، لكنه صار يبكي في الليل. أظن أن هذا شيء جيد.'),
  ('ignia','greet','لا تلمس السندان. لا تلمس الحمم. لا تلمسني. اشترِ شيئاً.'),
  ('ignia','talk','العنقاء الأولى علمتنا أن النار لا تموت، بل تغير مكانها.'),
  ('verdan','greet','التنين الزمردي حدثنا عنك. أنت من أعاده إلى بيته.'),
  ('verdan','talk','الجذر الكبير يمتد إلى نكسس. إن قُطع، تذبل مدينتك.'),
  ('cogwin','greet','شش! لا تقل اسمي بصوت عالٍ. التروس تسمع.'),
  ('cogwin','talk','الطائفة لم تمت. صارت آلة. والآلات لا تحزن على قادتها، بل تستبدلهم.'),
  ('astra','greet','ثلاثة نجوم اختفت هذا الأسبوع. لا أحد يصدقني.'),
  ('astra','talk','البلاط بلا نجوم... يأكلون الضوء كما كان الملك يأكل الظلال.'),
  ('nil','greet','هل رأيت صاحبي؟ كان... يشبهك قليلاً. ربما.'),
  ('nil','talk','الملكة المحطمة تريد أن تكون الأصل. لكن لا أحد منا هو الأصل.'),
  ('charon','greet','العبور له ثمن. ليس ذهباً. ذكرى صغيرة.'),
  ('charon','talk','الملكة الشاحبة تبحث عن أبيها. أخبرتها مرة أنه مات. لم تصدقني.'),
  ('ilun','greet','لا تصعد. البرج لا يحب الأسئلة.'),
  ('ilun','talk','الأركون كسر هالته لأنه رأى ما فوق البرج. وأنا رأيته أيضاً.'),
  ('weaver','greet','...أخيراً. خيطك كان الوحيد الذي لم أنسجه بنفسي.'),
  ('weaver','talk','كل شيء نُسج مرة. وكل نسيج يمكن أن يُفك.')
) AS d(npc_key, trigger, text)
JOIN npcs n ON n.key = d.npc_key;

-- Achievements ------------------------------------------------------------------------
INSERT INTO achievements (key, name_ar, description, metric, threshold, xp_reward, nx_reward, tier, position) VALUES
  ('contractor',     'صاحب العقود',      'أنجز 10 عقود يومية.',               'contracts',   10,   200,  300,  'bronze', 20),
  ('contract_master','سيد العقود',       'أنجز 100 عقد.',                     'contracts',   100,  2000, 3000, 'gold',   21),
  ('boss_hunter',    'صائد الزعماء',     'اهزم 5 زعماء مناطق مختلفين.',        'world_bosses', 5,   500,  800,  'silver', 22),
  ('boss_slayer',    'قاتل الزعماء',     'اهزم 25 زعيم منطقة مختلفاً.',        'world_bosses', 25,  5000, 6000, 'gold',   23),
  ('boss_legend',    'أسطورة الزعماء',   'اهزم كل زعماء المناطق الـ45.',       'world_bosses', 45,  20000, 30000, 'mythic', 24),
  ('cartographer',   'رسام الخرائط',     'اكتشف 10 معالم.',                   'landmarks',   10,   400,  600,  'silver', 25),
  ('pathfinder',     'دليل الدروب',      'اكتشف 40 معلماً.',                  'landmarks',   40,   4000, 5000, 'gold',   26),
  ('artisan',        'الحرفي',           'اصنع 10 أغراض.',                    'crafted',     10,   300,  400,  'bronze', 27),
  ('duelist',        'المبارز',          'انتصر في 10 تحديات ضد لاعبين.',      'pvp_wins',    10,   600,  800,  'silver', 28),
  ('saga_one',       'الملحمة الأولى',   'أكمل القصة الكبرى (25 فصلاً).',       'chapters',    25,   5000, 8000, 'gold',   29),
  ('saga_two',       'ما وراء الأبواب',  'أكمل كل فصول القصة الـ55.',           'chapters',    55,   30000, 50000, 'mythic', 30),
  ('ascendant',      'الصاعد',           'صل إلى المستوى 120.',               'level',       120,  0,    50000, 'mythic', 31)
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('contracts_enabled', 'true'),
  ('pvp_item_drops', 'true')
ON CONFLICT (key) DO NOTHING;
