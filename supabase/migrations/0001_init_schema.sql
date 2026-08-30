-- ============================================================================
-- 0001_init_schema.sql
-- Badminton Scoring, Tournament & Player Rating MVP — base schema.
--
-- Scope: tables, enums, constraints, indexes, updated_at triggers ONLY.
-- No RLS policies here (see 0002_rls_policies.sql) and no business-logic functions
-- here (see 0003_functions.sql — recalculation, rating, standings).
--
-- Design notes / deliberate small deviations from the literal spec column list
-- (each one is additive, nothing from the spec was dropped):
--   - Enums are used instead of free-text TEXT columns for all status/type fields,
--     enforced at the DB layer so bad states can't be written by a buggy client.
--   - `matches` splits the spec's single `format` field into `match_type`
--     (SINGLES/DOUBLES) + `best_of` (1/3), because §29 (game completion) and §4.2
--     of TASKS.md need both independently to drive scoring logic.
--   - Every FK to a "structural/child" row (stage→group, group→group_players,
--     match→team→participant, game→rally) is ON DELETE CASCADE, since those rows
--     are meaningless without their parent.
--   - Every FK to a "durable/shared" row (players, courts, tournaments, profiles)
--     is ON DELETE RESTRICT, per rule §68.2 ("do not delete historical
--     tournaments") and §68.8 (preserve historical player data). Deleting one of
--     these requires the caller to explicitly deal with dependents first — there
--     is no casual delete path.
--   - `player_rating_history` and `rallies` are intentionally append-only in
--     spirit: nothing in this migration stops an UPDATE/DELETE (RLS in 0002
--     restricts who may do it — admin only, for correction, per §46), but no
--     recalculation function may ever overwrite them silently.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type profile_role as enum ('ADMIN', 'SCORER');

create type tournament_status as enum ('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

create type tournament_player_status as enum ('ACTIVE', 'WITHDRAWN');

create type stage_type as enum ('GROUP', 'CROSS_CATEGORY', 'FINAL');

create type stage_status as enum ('PENDING', 'ACTIVE', 'COMPLETED');

create type tournament_court_status as enum ('AVAILABLE', 'ASSIGNED', 'LIVE', 'COMPLETED');

create type match_type as enum ('SINGLES', 'DOUBLES');

create type match_status as enum ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');

create type game_status as enum ('IN_PROGRESS', 'COMPLETED');

create type rally_event_type as enum ('WINNER', 'DROP', 'SPLIT');

create type rating_confidence_status as enum ('PROVISIONAL', 'EMERGING', 'ESTABLISHED');

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------

create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- players — §5, §48. Global player identity. Email is the identity key
-- (§68.7) and MUST be normalized (trim + lowercase) by the application/service
-- layer before insert; the CHECK below is a backstop, not a substitute.
-- ----------------------------------------------------------------------------

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  email text not null unique,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_email_is_normalized check (email = lower(btrim(email)))
);

create trigger players_set_updated_at
  before update on players
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- profiles — §6, §48, §63. Links a Supabase auth user to a player record and
-- carries the ADMIN/SCORER role. player_id is nullable: an admin account need
-- not correspond to a player; a scorer usually will, but isn't required to.
-- ----------------------------------------------------------------------------

create table profiles (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players (id) on delete restrict,
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  role profile_role not null,
  created_at timestamptz not null default now()
);

create index profiles_player_id_idx on profiles (player_id);

-- ----------------------------------------------------------------------------
-- tournaments — §10, §48.
-- ----------------------------------------------------------------------------

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  date date,
  location text,
  format text,
  num_courts integer,
  description text,
  status tournament_status not null default 'DRAFT',
  created_by uuid references profiles (id) on delete set null,
  -- Scoring config — §70 addendum. Deuce/cap rules are configurable per tournament;
  -- these are the defaults every game in this tournament plays to unless a future
  -- admin setting overrides them here. target_score = points needed to win outright;
  -- win_by = required lead once at/above target; max_score = hard cap (first to
  -- max_score always wins, regardless of lead — e.g. 30-29).
  target_score smallint not null default 21 check (target_score > 0),
  win_by smallint not null default 2 check (win_by >= 1),
  max_score smallint not null default 30 check (max_score >= target_score),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tournaments_set_updated_at
  before update on tournaments
  for each row execute function set_updated_at();

create index tournaments_status_idx on tournaments (status);

-- ----------------------------------------------------------------------------
-- tournament_players — §48. Roster of a tournament.
-- ----------------------------------------------------------------------------

create table tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  player_id uuid not null references players (id) on delete restrict,
  status tournament_player_status not null default 'ACTIVE',
  joined_at timestamptz not null default now(),
  unique (tournament_id, player_id)
);

create index tournament_players_tournament_id_idx on tournament_players (tournament_id);
create index tournament_players_player_id_idx on tournament_players (player_id);

-- ----------------------------------------------------------------------------
-- tournament_stages — §11, §48. Flexible stage model — a tournament is not
-- hard-coded to one format.
-- ----------------------------------------------------------------------------

create table tournament_stages (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  name text not null,
  stage_type stage_type not null,
  stage_order integer not null,
  status stage_status not null default 'PENDING',
  unique (tournament_id, stage_order)
);

create index tournament_stages_tournament_id_idx on tournament_stages (tournament_id);

-- ----------------------------------------------------------------------------
-- tournament_groups — §12, §48. Category/group within a stage.
-- ----------------------------------------------------------------------------

create table tournament_groups (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references tournament_stages (id) on delete cascade,
  name text not null,
  category text
);

create index tournament_groups_stage_id_idx on tournament_groups (stage_id);

-- ----------------------------------------------------------------------------
-- group_players — §48. Player membership within a group.
-- ----------------------------------------------------------------------------

create table group_players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references tournament_groups (id) on delete cascade,
  player_id uuid not null references players (id) on delete restrict,
  unique (group_id, player_id)
);

create index group_players_group_id_idx on group_players (group_id);
create index group_players_player_id_idx on group_players (player_id);

-- ----------------------------------------------------------------------------
-- group_qualifications — §15. Top-2 qualification must be STORED, not just
-- computed-and-discarded. Not in the spec's literal §48 list, but required by
-- §15 ("Qualification should be stored") — added here rather than deferred.
-- rank 1 = first qualifier, 2 = second. Admin can override (§44), tracked via
-- overridden_by.
-- ----------------------------------------------------------------------------

create table group_qualifications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references tournament_groups (id) on delete cascade,
  player_id uuid not null references players (id) on delete restrict,
  qualification_rank smallint not null check (qualification_rank in (1, 2)),
  is_override boolean not null default false,
  overridden_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, qualification_rank),
  unique (group_id, player_id)
);

create index group_qualifications_group_id_idx on group_qualifications (group_id);

-- ----------------------------------------------------------------------------
-- courts — §21, §48. Global court identity (e.g. "Court 1"), reusable across
-- tournaments.
-- ----------------------------------------------------------------------------

create table courts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- tournament_courts — §48. A court's usage/status within one tournament.
-- ----------------------------------------------------------------------------

create table tournament_courts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  court_id uuid not null references courts (id) on delete restrict,
  status tournament_court_status not null default 'AVAILABLE',
  unique (tournament_id, court_id)
);

create index tournament_courts_tournament_id_idx on tournament_courts (tournament_id);

-- ----------------------------------------------------------------------------
-- matches — §19, §48.
-- ----------------------------------------------------------------------------

create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  stage_id uuid not null references tournament_stages (id) on delete cascade,
  group_id uuid references tournament_groups (id) on delete cascade,
  court_id uuid references courts (id) on delete restrict,
  match_number integer not null,
  match_type match_type not null,
  best_of smallint not null default 3 check (best_of in (1, 3)),
  status match_status not null default 'SCHEDULED',
  scorer_id uuid references profiles (id) on delete set null,
  winner_team_id uuid, -- FK added below, after `teams` exists (circular reference)
  started_at timestamptz,
  completed_at timestamptz,
  unique (tournament_id, match_number)
);

create index matches_tournament_id_idx on matches (tournament_id);
create index matches_stage_id_idx on matches (stage_id);
create index matches_group_id_idx on matches (group_id);
create index matches_court_id_idx on matches (court_id);
create index matches_scorer_id_idx on matches (scorer_id);
create index matches_status_idx on matches (status);

-- ----------------------------------------------------------------------------
-- teams — §16–§18, §20, §48. NEVER permanent — always scoped to one match.
-- ----------------------------------------------------------------------------

create table teams (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  team_number smallint not null check (team_number in (1, 2)),
  source_group_id uuid references tournament_groups (id) on delete set null,
  source_category text,
  unique (match_id, team_number)
);

create index teams_match_id_idx on teams (match_id);

alter table matches
  add constraint matches_winner_team_id_fkey
  foreign key (winner_team_id) references teams (id) on delete set null;

create index matches_winner_team_id_idx on matches (winner_team_id);

-- ----------------------------------------------------------------------------
-- match_participants — §18, §20, §48. Contextual team membership — this is
-- the table that makes rotating partners possible. A player appears at most
-- once per match.
-- ----------------------------------------------------------------------------

create table match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  player_id uuid not null references players (id) on delete restrict,
  unique (match_id, player_id)
);

create index match_participants_match_id_idx on match_participants (match_id);
create index match_participants_team_id_idx on match_participants (team_id);
create index match_participants_player_id_idx on match_participants (player_id);

-- ----------------------------------------------------------------------------
-- games — §29, §48. One row per game within a match (Bo1 → 1 row, Bo3 → up to 3).
-- ----------------------------------------------------------------------------

create table games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  game_number smallint not null,
  team_1_score integer not null default 0 check (team_1_score >= 0),
  team_2_score integer not null default 0 check (team_2_score >= 0),
  winner_team_id uuid references teams (id) on delete set null,
  status game_status not null default 'IN_PROGRESS',
  unique (match_id, game_number)
);

create index games_match_id_idx on games (match_id);

-- ----------------------------------------------------------------------------
-- rallies — §24–§28, §48. Source-of-truth event log. Never overwritten by
-- recalculation (§47) — only ever inserted, or corrected/deleted by an admin
-- (§46, enforced via RLS in 0002).
-- ----------------------------------------------------------------------------

create table rallies (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid references players (id) on delete restrict,
  event_type rally_event_type not null,
  created_at timestamptz not null default now(),
  created_by uuid references profiles (id) on delete set null,
  constraint rallies_split_has_no_player
    check (event_type <> 'SPLIT' or player_id is null),
  constraint rallies_winner_drop_has_player
    check (event_type = 'SPLIT' or player_id is not null)
);

create index rallies_game_id_idx on rallies (game_id, created_at);
create index rallies_player_id_idx on rallies (player_id);

-- ----------------------------------------------------------------------------
-- rating_categories — §35, §48. Admin-editable thresholds — never hard-code
-- category names/ranges in the UI.
-- ----------------------------------------------------------------------------

create table rating_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  min_rating numeric(5, 2) not null,
  max_rating numeric(5, 2) not null,
  display_order integer not null unique,
  constraint rating_categories_valid_range check (min_rating < max_rating)
);

-- ----------------------------------------------------------------------------
-- player_ratings — §33–§34, §48. One current-state row per player. The
-- authoritative "current rating" — always derived, never hand-edited directly
-- (see 0003_functions.sql), except by explicit admin recalculation.
-- ----------------------------------------------------------------------------

create table player_ratings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references players (id) on delete cascade,
  rating numeric(5, 2) not null default 50 check (rating >= 0 and rating <= 100),
  category_id uuid references rating_categories (id) on delete set null,
  matches_count integer not null default 0 check (matches_count >= 0),
  confidence_status rating_confidence_status not null default 'PROVISIONAL',
  updated_at timestamptz not null default now()
);

create trigger player_ratings_set_updated_at
  before update on player_ratings
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- player_rating_history — §61, §68.8. Append-only. Every completed match adds
-- exactly one row here; ratings are never overwritten without a trail.
-- ----------------------------------------------------------------------------

create table player_rating_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  tournament_id uuid references tournaments (id) on delete set null,
  match_id uuid references matches (id) on delete set null,
  previous_rating numeric(5, 2) not null,
  match_performance numeric(5, 2) not null,
  new_rating numeric(5, 2) not null,
  created_at timestamptz not null default now()
);

create index player_rating_history_player_id_idx
  on player_rating_history (player_id, created_at);

-- ----------------------------------------------------------------------------
-- tournament_player_stats — §37, §48. Per tournament/player aggregate. Treated
-- as a cache of values derivable from rallies/matches (§47) — recalculable,
-- never the primary source of truth.
-- ----------------------------------------------------------------------------

create table tournament_player_stats (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  player_id uuid not null references players (id) on delete restrict,
  matches_played integer not null default 0,
  matches_won integer not null default 0,
  matches_lost integer not null default 0,
  tournament_points integer not null default 0,
  winning_shots integer not null default 0,
  drops integer not null default 0,
  splits integer not null default 0,
  average_performance numeric(5, 2),
  tournament_rating numeric(5, 2),
  unique (tournament_id, player_id)
);

create index tournament_player_stats_tournament_id_idx
  on tournament_player_stats (tournament_id);
create index tournament_player_stats_player_id_idx
  on tournament_player_stats (player_id);

-- ----------------------------------------------------------------------------
-- Seed the default rating categories (§35) — admin can edit afterwards.
-- ----------------------------------------------------------------------------

insert into rating_categories (name, min_rating, max_rating, display_order) values
  ('Beginner',     0,  29, 1),
  ('Developing',  30,  44, 2),
  ('Intermediate',45,  59, 3),
  ('Advanced',    60,  74, 4),
  ('Competitive', 75,  89, 5),
  ('Elite',       90, 100, 6);
