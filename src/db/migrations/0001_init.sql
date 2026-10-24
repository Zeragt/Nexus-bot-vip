-- Nexus core schema.
-- Every table uses explicit constraints so impossible states (negative money,
-- level 0, guild without leader...) are rejected by the database itself.

CREATE SEQUENCE IF NOT EXISTS character_code_seq START 1;

CREATE TABLE users (
  discord_id      TEXT PRIMARY KEY,
  daily_streak    INTEGER NOT NULL DEFAULT 0 CHECK (daily_streak >= 0),
  last_daily_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE factions (
  id           SERIAL PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  name_ar      TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  color        TEXT NOT NULL DEFAULT '#22d3ee',
  joinable     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE locations (
  id                   SERIAL PRIMARY KEY,
  key                  TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  name_ar              TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  region               TEXT NOT NULL DEFAULT 'city',
  channel_name         TEXT,
  map_x                REAL NOT NULL DEFAULT 0.5 CHECK (map_x BETWEEN 0 AND 1),
  map_y                REAL NOT NULL DEFAULT 0.5 CHECK (map_y BETWEEN 0 AND 1),
  danger_level         INTEGER NOT NULL DEFAULT 0 CHECK (danger_level BETWEEN 0 AND 10),
  min_level            INTEGER NOT NULL DEFAULT 1 CHECK (min_level >= 1),
  required_quest_id    INTEGER,
  requires_permission  BOOLEAN NOT NULL DEFAULT FALSE,
  locked               BOOLEAN NOT NULL DEFAULT FALSE,
  is_start             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id                SERIAL PRIMARY KEY,
  key               TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  name_ar           TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  min_level         INTEGER NOT NULL DEFAULT 1 CHECK (min_level >= 1),
  base_pay          INTEGER NOT NULL CHECK (base_pay >= 0),
  xp_reward         INTEGER NOT NULL DEFAULT 5 CHECK (xp_reward >= 0),
  energy_cost       INTEGER NOT NULL DEFAULT 10 CHECK (energy_cost >= 0),
  cooldown_seconds  INTEGER NOT NULL DEFAULT 3600 CHECK (cooldown_seconds >= 0),
  main_stat         TEXT NOT NULL DEFAULT 'strength',
  faction_id        INTEGER REFERENCES factions(id) ON DELETE SET NULL
);

CREATE TABLE characters (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE DEFAULT ('NX-' || lpad(nextval('character_code_seq')::text, 6, '0')),
  user_id          TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  slot             SMALLINT NOT NULL DEFAULT 1 CHECK (slot >= 1),
  name             TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 32),
  age              TEXT,
  gender           TEXT,
  race             TEXT,
  origin           TEXT,
  occupation       TEXT,
  personality      TEXT,
  appearance       TEXT,
  backstory        TEXT,
  alignment        TEXT,
  abilities        TEXT,
  weaknesses       TEXT,
  avatar           BYTEA,
  level            INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp               BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  stat_points      INTEGER NOT NULL DEFAULT 0 CHECK (stat_points >= 0),
  skill_points     INTEGER NOT NULL DEFAULT 1 CHECK (skill_points >= 0),
  hp               INTEGER NOT NULL CHECK (hp >= 0),
  energy           INTEGER NOT NULL CHECK (energy >= 0),
  vitals_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  nx               BIGINT NOT NULL DEFAULT 0 CHECK (nx >= 0),
  reputation       INTEGER NOT NULL DEFAULT 0,
  location_id      INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  job_id           INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  job_changed_at   TIMESTAMPTZ,
  combat_wins      INTEGER NOT NULL DEFAULT 0 CHECK (combat_wins >= 0),
  combat_losses    INTEGER NOT NULL DEFAULT 0 CHECK (combat_losses >= 0),
  quests_completed INTEGER NOT NULL DEFAULT 0 CHECK (quests_completed >= 0),
  trades_completed INTEGER NOT NULL DEFAULT 0 CHECK (trades_completed >= 0),
  shifts_worked    INTEGER NOT NULL DEFAULT 0 CHECK (shifts_worked >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot)
);
CREATE INDEX characters_level_idx ON characters (level DESC, xp DESC);
CREATE INDEX characters_nx_idx ON characters (nx DESC);
CREATE INDEX characters_rep_idx ON characters (reputation DESC);
CREATE INDEX characters_quests_idx ON characters (quests_completed DESC);
CREATE INDEX characters_location_idx ON characters (location_id);

CREATE TABLE character_stats (
  character_id  INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  strength      INTEGER NOT NULL DEFAULT 5 CHECK (strength BETWEEN 0 AND 999),
  defense       INTEGER NOT NULL DEFAULT 5 CHECK (defense BETWEEN 0 AND 999),
  agility       INTEGER NOT NULL DEFAULT 5 CHECK (agility BETWEEN 0 AND 999),
  intelligence  INTEGER NOT NULL DEFAULT 5 CHECK (intelligence BETWEEN 0 AND 999),
  endurance     INTEGER NOT NULL DEFAULT 5 CHECK (endurance BETWEEN 0 AND 999),
  luck          INTEGER NOT NULL DEFAULT 5 CHECK (luck BETWEEN 0 AND 999)
);

CREATE TABLE character_jobs (
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  job_id        INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_level     INTEGER NOT NULL DEFAULT 1 CHECK (job_level >= 1),
  job_xp        INTEGER NOT NULL DEFAULT 0 CHECK (job_xp >= 0),
  shifts        INTEGER NOT NULL DEFAULT 0 CHECK (shifts >= 0),
  PRIMARY KEY (character_id, job_id)
);

CREATE TABLE character_locations (
  character_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  location_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  first_visit_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, location_id)
);

CREATE TABLE character_factions (
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  faction_id    INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  reputation    INTEGER NOT NULL DEFAULT 0 CHECK (reputation BETWEEN -10000 AND 100000),
  PRIMARY KEY (character_id, faction_id)
);

-- Skills ---------------------------------------------------------------
CREATE TABLE skills (
  id              SERIAL PRIMARY KEY,
  key             TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  name_ar         TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL CHECK (type IN ('attack','defense','healing','utility','passive','special')),
  discipline      TEXT NOT NULL DEFAULT 'martial',
  cooldown_turns  INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_turns >= 0),
  energy_cost     INTEGER NOT NULL DEFAULT 0 CHECK (energy_cost >= 0),
  power           INTEGER NOT NULL DEFAULT 0 CHECK (power >= 0),
  scaling_stat    TEXT NOT NULL DEFAULT 'strength',
  effect_key      TEXT,
  effect_chance   REAL NOT NULL DEFAULT 0 CHECK (effect_chance BETWEEN 0 AND 1),
  effect_turns    INTEGER NOT NULL DEFAULT 0 CHECK (effect_turns >= 0),
  target          TEXT NOT NULL DEFAULT 'enemy' CHECK (target IN ('enemy','self')),
  required_level  INTEGER NOT NULL DEFAULT 1 CHECK (required_level >= 1),
  required_stat   TEXT,
  required_value  INTEGER NOT NULL DEFAULT 0,
  starter         BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE character_skills (
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  skill_id      INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  rank          INTEGER NOT NULL DEFAULT 1 CHECK (rank BETWEEN 1 AND 5),
  learned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, skill_id)
);

-- Items / inventory -----------------------------------------------------
CREATE TABLE items (
  id           SERIAL PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  name_ar      TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL CHECK (type IN ('weapon','armor','accessory','consumable','quest','material','misc')),
  rarity       TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','uncommon','rare','epic','legendary','mythic')),
  value        INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
  weight       NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (weight >= 0),
  stats        JSONB NOT NULL DEFAULT '{}'::jsonb,
  use_effect   JSONB,
  usable       BOOLEAN NOT NULL DEFAULT FALSE,
  equippable   BOOLEAN NOT NULL DEFAULT FALSE,
  slot         TEXT CHECK (slot IN ('weapon','armor','accessory')),
  tradeable    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT equippable OR slot IS NOT NULL)
);

CREATE TABLE inventory_items (
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  acquired_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, item_id)
);

CREATE TABLE equipment (
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot          TEXT NOT NULL CHECK (slot IN ('weapon','armor','accessory')),
  item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  equipped_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, slot)
);

CREATE TABLE character_status_effects (
  id            SERIAL PRIMARY KEY,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  effect_key    TEXT NOT NULL,
  potency       REAL NOT NULL DEFAULT 1,
  expires_at    TIMESTAMPTZ NOT NULL,
  source        TEXT,
  UNIQUE (character_id, effect_key)
);
CREATE INDEX character_status_effects_exp_idx ON character_status_effects (expires_at);

-- Economy ---------------------------------------------------------------
CREATE TABLE transactions (
  id                 BIGSERIAL PRIMARY KEY,
  from_character_id  INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  to_character_id    INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  amount             BIGINT NOT NULL CHECK (amount > 0),
  kind               TEXT NOT NULL,
  note               TEXT,
  idempotency_key    TEXT UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_from_idx ON transactions (from_character_id, created_at DESC);
CREATE INDEX transactions_to_idx ON transactions (to_character_id, created_at DESC);

-- NPCs ------------------------------------------------------------------
CREATE TABLE npcs (
  id           SERIAL PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  location_id  INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  faction_id   INTEGER REFERENCES factions(id) ON DELETE SET NULL,
  color        TEXT NOT NULL DEFAULT '#22d3ee',
  has_shop     BOOLEAN NOT NULL DEFAULT FALSE,
  sell_rate    REAL NOT NULL DEFAULT 0.5 CHECK (sell_rate BETWEEN 0 AND 1),
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX npcs_location_idx ON npcs (location_id);

CREATE TABLE npc_dialogues (
  id              SERIAL PRIMARY KEY,
  npc_id          INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  trigger         TEXT NOT NULL DEFAULT 'talk' CHECK (trigger IN ('greet','talk','quest','farewell')),
  text            TEXT NOT NULL,
  min_reputation  INTEGER NOT NULL DEFAULT -100000
);

CREATE TABLE npc_shop_items (
  npc_id   INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  item_id  INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  price    INTEGER NOT NULL CHECK (price > 0),
  stock    INTEGER CHECK (stock IS NULL OR stock >= 0),
  PRIMARY KEY (npc_id, item_id)
);

-- Quests ----------------------------------------------------------------
CREATE TABLE quests (
  id                   SERIAL PRIMARY KEY,
  code                 TEXT NOT NULL UNIQUE,
  title                TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  difficulty           TEXT NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy','normal','hard','elite','legendary')),
  location_id          INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  giver_npc_id         INTEGER REFERENCES npcs(id) ON DELETE SET NULL,
  min_level            INTEGER NOT NULL DEFAULT 1 CHECK (min_level >= 1),
  required_quest_id    INTEGER REFERENCES quests(id) ON DELETE SET NULL,
  xp_reward            INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  nx_reward            INTEGER NOT NULL DEFAULT 0 CHECK (nx_reward >= 0),
  reputation_reward    INTEGER NOT NULL DEFAULT 0,
  faction_id           INTEGER REFERENCES factions(id) ON DELETE SET NULL,
  faction_rep_reward   INTEGER NOT NULL DEFAULT 0,
  repeatable           BOOLEAN NOT NULL DEFAULT FALSE,
  requires_review      BOOLEAN NOT NULL DEFAULT FALSE,
  time_limit_minutes   INTEGER CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at           TIMESTAMPTZ,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE locations ADD CONSTRAINT locations_required_quest_fk
  FOREIGN KEY (required_quest_id) REFERENCES quests(id) ON DELETE SET NULL;

CREATE TABLE quest_objectives (
  id              SERIAL PRIMARY KEY,
  quest_id        INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL DEFAULT 0,
  description     TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual','collect','visit','defeat','work')),
  target_key      TEXT,
  required_count  INTEGER NOT NULL DEFAULT 1 CHECK (required_count > 0)
);
CREATE INDEX quest_objectives_quest_idx ON quest_objectives (quest_id, position);

CREATE TABLE quest_reward_items (
  quest_id  INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  item_id   INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity  INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (quest_id, item_id)
);

CREATE TABLE character_quests (
  id            SERIAL PRIMARY KEY,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_id      INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending_review','completed','abandoned','failed','expired')),
  progress      JSONB NOT NULL DEFAULT '{}'::jsonb,
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX character_quests_one_open ON character_quests (character_id, quest_id)
  WHERE status IN ('active','pending_review');
CREATE INDEX character_quests_char_idx ON character_quests (character_id, status);
CREATE INDEX character_quests_exp_idx ON character_quests (expires_at) WHERE status = 'active';

-- Guilds ----------------------------------------------------------------
CREATE TABLE guilds (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL,
  tag                  TEXT NOT NULL CHECK (char_length(tag) BETWEEN 2 AND 5),
  description          TEXT NOT NULL DEFAULT '',
  color                TEXT NOT NULL DEFAULT '#22d3ee',
  leader_character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE RESTRICT,
  level                INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp                   BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  treasury             BIGINT NOT NULL DEFAULT 0 CHECK (treasury >= 0),
  reputation           INTEGER NOT NULL DEFAULT 0,
  max_members          INTEGER NOT NULL DEFAULT 20 CHECK (max_members > 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX guilds_name_ci ON guilds (lower(name));
CREATE UNIQUE INDEX guilds_tag_ci ON guilds (lower(tag));

CREATE TABLE guild_members (
  guild_id      INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  character_id  INTEGER NOT NULL UNIQUE REFERENCES characters(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader','officer','member')),
  contributed   BIGINT NOT NULL DEFAULT 0 CHECK (contributed >= 0),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, character_id)
);

CREATE TABLE guild_invites (
  guild_id      INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  invited_by    INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (guild_id, character_id)
);

-- Combat ----------------------------------------------------------------
CREATE TABLE combat_sessions (
  id                 UUID PRIMARY KEY,
  kind               TEXT NOT NULL DEFAULT 'pvp' CHECK (kind IN ('pvp','pve')),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','finished','declined','expired','cancelled')),
  channel_id         TEXT,
  message_id         TEXT,
  challenger_id      INTEGER REFERENCES characters(id) ON DELETE CASCADE,
  opponent_id        INTEGER REFERENCES characters(id) ON DELETE CASCADE,
  winner_id          INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  state              JSONB NOT NULL DEFAULT '{}'::jsonb,
  version            INTEGER NOT NULL DEFAULT 0,
  turn_deadline      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at        TIMESTAMPTZ
);
CREATE INDEX combat_sessions_status_idx ON combat_sessions (status, turn_deadline);

CREATE TABLE combat_participants (
  session_id    UUID NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  side          SMALLINT NOT NULL CHECK (side IN (0,1)),
  final_hp      INTEGER,
  PRIMARY KEY (session_id, character_id)
);
-- A character may only be in one live fight at a time.
CREATE TABLE combat_locks (
  character_id  INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE
);

-- Trading ---------------------------------------------------------------
CREATE TABLE trades (
  id               UUID PRIMARY KEY,
  initiator_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  partner_id       INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','cancelled','expired')),
  offer_initiator  JSONB NOT NULL DEFAULT '{"nx":0,"items":{}}'::jsonb,
  offer_partner    JSONB NOT NULL DEFAULT '{"nx":0,"items":{}}'::jsonb,
  confirmed_initiator BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_partner   BOOLEAN NOT NULL DEFAULT FALSE,
  version          INTEGER NOT NULL DEFAULT 0,
  channel_id       TEXT,
  message_id       TEXT,
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (initiator_id <> partner_id)
);
CREATE INDEX trades_open_idx ON trades (status, expires_at);

-- Events ----------------------------------------------------------------
CREATE TABLE events (
  id                SERIAL PRIMARY KEY,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  location_id       INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','ended','cancelled')),
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  current_phase     INTEGER NOT NULL DEFAULT 0 CHECK (current_phase >= 0),
  max_participants  INTEGER CHECK (max_participants IS NULL OR max_participants > 0),
  xp_reward         INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  nx_reward         INTEGER NOT NULL DEFAULT 0 CHECK (nx_reward >= 0),
  reward_items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  enemies           JSONB NOT NULL DEFAULT '[]'::jsonb,
  objectives        TEXT NOT NULL DEFAULT '',
  channel_id        TEXT,
  message_id        TEXT,
  rewards_paid      BOOLEAN NOT NULL DEFAULT FALSE,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX events_status_idx ON events (status, starts_at);

CREATE TABLE event_phases (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL CHECK (position >= 1),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  choices      JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome      JSONB,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','resolved')),
  UNIQUE (event_id, position)
);

CREATE TABLE event_participants (
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  contribution  INTEGER NOT NULL DEFAULT 0 CHECK (contribution >= 0),
  choices       JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, character_id)
);

CREATE TABLE random_event_definitions (
  key               TEXT PRIMARY KEY,
  name_ar           TEXT NOT NULL,
  description       TEXT NOT NULL,
  probability       REAL NOT NULL DEFAULT 0.1 CHECK (probability BETWEEN 0 AND 1),
  cooldown_minutes  INTEGER NOT NULL DEFAULT 120 CHECK (cooldown_minutes >= 0),
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  location_keys     TEXT[] NOT NULL DEFAULT '{}',
  rewards           JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_claims        INTEGER NOT NULL DEFAULT 3 CHECK (max_claims > 0),
  duration_minutes  INTEGER NOT NULL DEFAULT 15 CHECK (duration_minutes > 0),
  last_triggered_at TIMESTAMPTZ
);

CREATE TABLE random_event_instances (
  id           UUID PRIMARY KEY,
  def_key      TEXT NOT NULL REFERENCES random_event_definitions(key) ON DELETE CASCADE,
  location_id  INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  channel_id   TEXT,
  message_id   TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE random_event_claims (
  instance_id   UUID NOT NULL REFERENCES random_event_instances(id) ON DELETE CASCADE,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (instance_id, character_id)
);

-- Achievements, relationships, lore ------------------------------------
CREATE TABLE achievements (
  key          TEXT PRIMARY KEY,
  name_ar      TEXT NOT NULL,
  description  TEXT NOT NULL,
  metric       TEXT NOT NULL,
  threshold    INTEGER NOT NULL CHECK (threshold > 0),
  xp_reward    INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  nx_reward    INTEGER NOT NULL DEFAULT 0 CHECK (nx_reward >= 0),
  tier         TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','silver','gold','mythic')),
  position     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE character_achievements (
  character_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  achievement_key  TEXT NOT NULL REFERENCES achievements(key) ON DELETE CASCADE,
  unlocked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, achievement_key)
);

CREATE TABLE relationship_types (
  key      TEXT PRIMARY KEY,
  name_ar  TEXT NOT NULL,
  color    TEXT NOT NULL DEFAULT '#22d3ee'
);

CREATE TABLE relationships (
  character_id         INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  target_character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  type_key             TEXT NOT NULL REFERENCES relationship_types(key) ON DELETE CASCADE,
  note                 TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, target_character_id),
  CHECK (character_id <> target_character_id)
);

CREATE TABLE lore_entries (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  content     TEXT NOT NULL,
  author_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Infrastructure --------------------------------------------------------
CREATE TABLE rp_activity (
  character_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  day              DATE NOT NULL,
  messages         INTEGER NOT NULL DEFAULT 0 CHECK (messages >= 0),
  xp_awarded       INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  last_rewarded_at TIMESTAMPTZ,
  last_hash        TEXT,
  PRIMARY KEY (character_id, day)
);

CREATE TABLE cooldowns (
  subject     TEXT NOT NULL,
  key         TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (subject, key)
);
CREATE INDEX cooldowns_exp_idx ON cooldowns (expires_at);

CREATE TABLE scheduler_tasks (
  name          TEXT PRIMARY KEY,
  next_run_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until  TIMESTAMPTZ,
  last_run_at   TIMESTAMPTZ,
  last_error    TEXT
);

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_logs (
  id           BIGSERIAL PRIMARY KEY,
  actor_id     TEXT,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  before       JSONB,
  after        JSONB,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_logs_created_idx ON admin_logs (created_at DESC);
CREATE INDEX admin_logs_target_idx ON admin_logs (target_type, target_id);
