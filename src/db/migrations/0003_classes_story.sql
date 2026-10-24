-- v2: classes and paths, generated class skills, skill loadouts, the main story and new regions.

-- Classes ----------------------------------------------------------------
ALTER TABLE characters
  ADD COLUMN class_key        TEXT,
  ADD COLUMN subclass_key     TEXT,
  ADD COLUMN class_chosen_at  TIMESTAMPTZ,
  ADD COLUMN class_changes    INTEGER NOT NULL DEFAULT 0 CHECK (class_changes >= 0);
CREATE INDEX characters_class_idx ON characters (class_key);

-- Generated skills carry their class/path; hand-made skills keep these NULL.
ALTER TABLE skills
  ADD COLUMN class_key     TEXT,
  ADD COLUMN subclass_key  TEXT,
  ADD COLUMN tier          SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN element       TEXT,
  ADD COLUMN extra         JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX skills_class_idx ON skills (class_key, subclass_key, required_level);

-- Loadout: only equipped active skills appear in combat (passives always apply).
ALTER TABLE character_skills ADD COLUMN equipped BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE character_skills SET equipped = TRUE;

-- Story ------------------------------------------------------------------
CREATE TABLE character_story (
  character_id  INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  chapter       INTEGER NOT NULL DEFAULT 0 CHECK (chapter >= 0),  -- chapters completed
  choices       JSONB NOT NULL DEFAULT '{}'::jsonb,                -- chapter key -> choice index
  read_pages    JSONB NOT NULL DEFAULT '{}'::jsonb,                -- chapter key -> furthest page read
  boss_attempts INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX character_story_chapter_idx ON character_story (chapter DESC);

-- New regions opened by the story ----------------------------------------
INSERT INTO locations (key, name, name_ar, description, region, channel_name, map_x, map_y, danger_level, min_level, is_start) VALUES
  ('crystal_caverns', 'Crystal Caverns', 'كهوف البلور',     'أنفاق تغني فيها البلورات، وكل صدى يحمل ذكرى لمن مرّ قبلك.',        'wild', 'crystal-caverns', 0.12, 0.22, 5, 12, FALSE),
  ('ashen_wastes',    'Ashen Wastes',    'القفار الرمادية', 'أرض احترقت في حرب نسيها التاريخ، والرماد ما زال دافئاً.',           'wild', 'ashen-wastes',    0.90, 0.72, 7, 22, FALSE),
  ('sky_archipelago', 'Sky Archipelago', 'أرخبيل السماء',   'جزر معلّقة بين الغيوم تربطها جسور من الضوء.',                        'wild', 'sky-archipelago', 0.64, 0.07, 6, 30, FALSE),
  ('sunken_kingdom',  'Sunken Kingdom',  'المملكة الغارقة', 'عاصمة ابتلعها البحر في ليلة واحدة. أجراسها ما زالت تدق تحت الماء.', 'wild', 'sunken-kingdom',  0.94, 0.30, 7, 42, FALSE),
  ('shadow_citadel',  'Shadow Citadel',  'قلعة الظلال',     'معقل الطائفة المجهولة. جدرانه لا تعكس الضوء.',                       'rift', 'shadow-citadel',  0.07, 0.66, 9, 60, FALSE),
  ('the_abyss',       'The Abyss',       'الهاوية',         'ما تحت الأبعاد كلها. المكان الذي جاءت منه البوابة.',                 'rift', 'the-abyss',       0.40, 0.94, 10, 75, FALSE)
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('class_change_free_below', '10'),
  ('class_change_cost_per_level', '150'),
  ('story_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
