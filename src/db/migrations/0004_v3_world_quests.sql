-- v3: secret rarity, zones and exploration, daily/weekly quests, a server-wide daily goal,
-- PvP stakes bookkeeping, crafting stats, and the Returned Worlds (story act 5).

-- Secret rarity (above mythic) ----------------------------------------------------------
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_rarity_check;
ALTER TABLE items ADD CONSTRAINT items_rarity_check
  CHECK (rarity IN ('common','uncommon','rare','epic','legendary','mythic','secret'));

-- Characters -----------------------------------------------------------------------------
ALTER TABLE characters
  ADD COLUMN zone_key          TEXT,
  ADD COLUMN quest_streak      INTEGER NOT NULL DEFAULT 0 CHECK (quest_streak >= 0),
  ADD COLUMN quest_streak_best INTEGER NOT NULL DEFAULT 0 CHECK (quest_streak_best >= 0),
  ADD COLUMN quest_streak_day  DATE,
  ADD COLUMN dailies_completed INTEGER NOT NULL DEFAULT 0 CHECK (dailies_completed >= 0),
  ADD COLUMN explorations      INTEGER NOT NULL DEFAULT 0 CHECK (explorations >= 0),
  ADD COLUMN items_crafted     INTEGER NOT NULL DEFAULT 0 CHECK (items_crafted >= 0),
  ADD COLUMN pvp_wins          INTEGER NOT NULL DEFAULT 0 CHECK (pvp_wins >= 0),
  ADD COLUMN pvp_losses        INTEGER NOT NULL DEFAULT 0 CHECK (pvp_losses >= 0),
  ADD COLUMN xp_lost           BIGINT  NOT NULL DEFAULT 0 CHECK (xp_lost >= 0),
  ADD COLUMN elites_slain      INTEGER NOT NULL DEFAULT 0 CHECK (elites_slain >= 0);
CREATE INDEX characters_pvp_idx ON characters (pvp_wins DESC);
CREATE INDEX characters_dailies_idx ON characters (dailies_completed DESC);

-- Exploration ------------------------------------------------------------------------------
CREATE TABLE character_exploration (
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  location_key  TEXT NOT NULL,
  points        INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  zones         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- discovered zone keys
  secrets       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- zone keys whose secret was read
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, location_key)
);

-- Daily and weekly quests -----------------------------------------------------------------
CREATE TABLE daily_quests (
  id            BIGSERIAL PRIMARY KEY,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  period        TEXT NOT NULL CHECK (period IN ('daily','weekly')),
  period_key    DATE NOT NULL,
  slot          SMALLINT NOT NULL CHECK (slot >= 1),
  template_key  TEXT NOT NULL,
  tier          TEXT NOT NULL DEFAULT 'normal' CHECK (tier IN ('easy','normal','hard','elite','legendary')),
  kind          TEXT NOT NULL,
  target        TEXT,
  required      INTEGER NOT NULL CHECK (required > 0),
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  rewards       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','claimed','replaced')),
  rerolls       SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at       TIMESTAMPTZ,
  claimed_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX daily_quests_slot ON daily_quests (character_id, period, period_key, slot) WHERE status <> 'replaced';
CREATE INDEX daily_quests_track ON daily_quests (character_id, status, kind) WHERE status = 'active';
CREATE INDEX daily_quests_period ON daily_quests (period, period_key);

CREATE TABLE daily_meta (
  character_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  period         TEXT NOT NULL CHECK (period IN ('daily','weekly')),
  period_key     DATE NOT NULL,
  rerolls        SMALLINT NOT NULL DEFAULT 0,
  chest_claimed  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (character_id, period, period_key)
);

-- Server-wide daily goal -------------------------------------------------------------------
CREATE TABLE world_goals (
  day           DATE PRIMARY KEY,
  template_key  TEXT NOT NULL,
  kind          TEXT NOT NULL,
  target        TEXT,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  required      INTEGER NOT NULL CHECK (required > 0),
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  rewards       JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at  TIMESTAMPTZ
);

CREATE TABLE world_goal_contributions (
  day           DATE NOT NULL REFERENCES world_goals(day) ON DELETE CASCADE,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  claimed       BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (day, character_id)
);
CREATE INDEX world_goal_contrib_top ON world_goal_contributions (day, amount DESC);

-- PvP stakes log ------------------------------------------------------------------------------
CREATE TABLE pvp_stakes (
  id             BIGSERIAL PRIMARY KEY,
  session_id     UUID REFERENCES combat_sessions(id) ON DELETE SET NULL,
  winner_id      INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  loser_id       INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  xp_lost        INTEGER NOT NULL DEFAULT 0,
  item_id        INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_rarity    TEXT,
  drop_chance    REAL,
  roll           REAL,
  protected      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pvp_stakes_loser_idx ON pvp_stakes (loser_id, created_at DESC);

-- The Returned Worlds (opened by story act 5) ----------------------------------------------
INSERT INTO locations (key, name, name_ar, description, region, channel_name, map_x, map_y, danger_level, min_level, is_start) VALUES
  ('mirror_steppe',   'Mirror Steppe',   'سهوب المرايا',   'سهوب من عشب زجاجي، وكل حجر فيها مرآة تُريك من كان يمكن أن تكون.', 'rift', 'mirror-steppe',   0.06, 0.06, 10, 85, FALSE),
  ('clockwork_isles', 'Clockwork Isles', 'جزر الساعات',    'جزر من نحاس وتروس تطفو على بحر من الزيت، يحكمها محرك لا يتوقف.',  'rift', 'clockwork-isles', 0.96, 0.92, 10, 88, FALSE),
  ('eclipse_sanctum', 'Eclipse Sanctum', 'محراب الكسوف',   'معبد تحت كسوف أبدي، رهبانه بلا ظلال يصلّون لشمس لا تشرق.',        'rift', 'eclipse-sanctum', 0.28, 0.04, 10, 92, FALSE),
  ('nexus_heart',     'Nexus Heart',     'قلب نكسس',       'ما تحت المدينة: جذور من ضوء تمتد إلى كل الأبعاد.',                  'rift', 'nexus-heart',     0.50, 0.70, 10, 96, FALSE)
ON CONFLICT (key) DO NOTHING;

-- New achievements -----------------------------------------------------------------------------
INSERT INTO achievements (key, name_ar, description, metric, threshold, xp_reward, nx_reward, tier, position) VALUES
  ('daily_first',    'يوم منجز',        'أكمل كل مهامك اليومية مرة واحدة.',     'dailies_completed', 1,    80,   150,  'bronze', 20),
  ('daily_week',     'أسبوع بلا انقطاع', 'سلسلة مهام يومية من 7 أيام.',          'quest_streak_best', 7,    400,  1200, 'silver', 21),
  ('daily_month',    'الملتزم',          'سلسلة مهام يومية من 30 يوماً.',         'quest_streak_best', 30,   2500, 8000, 'mythic', 22),
  ('explorer_100',   'خطوات لا تُعد',     'استكشف 100 مرة.',                       'explorations',      100,  300,  600,  'silver', 23),
  ('explorer_1000',  'رسام الخرائط',      'استكشف 1000 مرة.',                      'explorations',      1000, 3000, 6000, 'gold',   24),
  ('crafter_10',     'يد صانع',           'اصنع 10 أغراض.',                        'items_crafted',     10,   150,  300,  'bronze', 25),
  ('crafter_100',    'معلم الحرفة',       'اصنع 100 غرض.',                         'items_crafted',     100,  1500, 3000, 'gold',   26),
  ('duelist_10',     'المبارز',           'انتصر في 10 مبارزات ضد لاعبين.',       'pvp_wins',          10,   400,  800,  'silver', 27),
  ('duelist_100',    'سيد الحلبة',        'انتصر في 100 مبارزة ضد لاعبين.',       'pvp_wins',          100,  4000, 10000,'mythic', 28),
  ('elite_hunter',   'صائد النخبة',        'اهزم 10 من وحوش النخبة.',               'elites_slain',      10,   800,  1500, 'gold',   29),
  ('hidden_zones',   'كاشف الأسرار',       'اكتشف 5 مناطق مخفية.',                  'hidden_zones',      5,    1200, 2500, 'gold',   30)
ON CONFLICT (key) DO NOTHING;

-- Settings -------------------------------------------------------------------------------------
INSERT INTO settings (key, value) VALUES
  ('pvp_xp_loss_pct', '30'),
  ('pve_xp_loss_pct', '10'),
  ('pvp_item_drop_enabled', 'true'),
  ('daily_reset_offset_hours', '3'),
  ('daily_free_rerolls', '1'),
  ('world_goal_enabled', 'true'),
  ('explore_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
