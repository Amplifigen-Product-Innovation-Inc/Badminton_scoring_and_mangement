-- ============================================================================
-- 0001_rls.test.sql — RLS test suite (TASKS.md 1.2 / spec §66 "Security").
--
-- Run with the Supabase CLI (needs Docker):
--   supabase start
--   supabase test db
--
-- Verified green (25/25) 2026-08-30 against the linked remote project via
-- `supabase db query --linked -f`, since this sandbox has no Docker. Four
-- assertions were rewritten in that pass (see the players/tournaments/
-- rating_categories UPDATE/DELETE block below) — they originally expected
-- `throws_ok(..., '42501', ...)`, but a blocked scorer UPDATE/DELETE just
-- matches zero rows under RLS rather than raising an exception; matching
-- Postgres behavior confirmed the data was untouched either way.
--
-- Proves, using pgTAP, the core claims from spec §50/§68.13:
--   - A scorer can see and act on ONLY their own assigned match — its
--     tournament, court, teams, participants, players, games, rallies.
--   - A scorer cannot see or touch another scorer's match or its data.
--   - A scorer cannot write to players, tournaments, ratings, categories,
--     tournament structure, or historical stats tables at all.
--   - A scorer can INSERT a rally into their own LIVE match attributed to
--     themselves, and cannot insert one attributed to someone else or into
--     a match that isn't theirs / isn't LIVE.
--   - An admin has full access everywhere.
--
-- Wrapped in BEGIN/ROLLBACK so it never leaves fixture data behind, and is
-- safe to run repeatedly against the same database.
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(25);

-- ----------------------------------------------------------------------------
-- Fixtures (inserted as the migration-owning role, which bypasses RLS).
-- ----------------------------------------------------------------------------

-- Fake auth.users rows — acceptable in a test/local-dev context only.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id)
values
  ('00000000-0000-0000-0000-00000000a001', 'admin@test.local', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a002', 'scorer.a@test.local', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a003', 'scorer.b@test.local', 'x', now(), '00000000-0000-0000-0000-000000000000');

insert into profiles (id, player_id, auth_user_id, role) values
  ('00000000-0000-0000-0000-00000000b001', null, '00000000-0000-0000-0000-00000000a001', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000b002', null, '00000000-0000-0000-0000-00000000a002', 'SCORER'),
  ('00000000-0000-0000-0000-00000000b003', null, '00000000-0000-0000-0000-00000000a003', 'SCORER');

insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000c001', 'Player One', 'p1@test.local'),
  ('00000000-0000-0000-0000-00000000c002', 'Player Two', 'p2@test.local'),
  ('00000000-0000-0000-0000-00000000c003', 'Player Three', 'p3@test.local'),
  ('00000000-0000-0000-0000-00000000c004', 'Player Four', 'p4@test.local');

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000d001', 'Test Open', 'IN_PROGRESS');

insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000d001', 'Group Stage', 'GROUP', 1, 'ACTIVE');

insert into courts (id, name) values
  ('00000000-0000-0000-0000-00000000f001', 'RLS Test Court 1'),
  ('00000000-0000-0000-0000-00000000f002', 'RLS Test Court 2');

insert into rating_categories (id, name, min_rating, max_rating, display_order) values
  ('00000000-0000-0000-0000-0000000ca701', 'RLS Test Category', 40, 60, 99);

-- Match A: assigned to scorer A, players 1 & 2 (singles).
insert into matches (id, tournament_id, stage_id, court_id, match_number, match_type, status, scorer_id)
values ('00000000-0000-0000-0000-000000001a01', '00000000-0000-0000-0000-00000000d001',
        '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000f001',
        1, 'SINGLES', 'LIVE', '00000000-0000-0000-0000-00000000b002');

insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-000000001a02', '00000000-0000-0000-0000-000000001a01', 1),
  ('00000000-0000-0000-0000-000000001a03', '00000000-0000-0000-0000-000000001a01', 2);

insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-000000001a01', '00000000-0000-0000-0000-000000001a02', '00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-000000001a01', '00000000-0000-0000-0000-000000001a03', '00000000-0000-0000-0000-00000000c002');

insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-000000001a04', '00000000-0000-0000-0000-000000001a01', 1, 'IN_PROGRESS');

-- Match B: assigned to scorer B, players 3 & 4 (singles). Scorer A must never see this.
insert into matches (id, tournament_id, stage_id, court_id, match_number, match_type, status, scorer_id)
values ('00000000-0000-0000-0000-000000001b01', '00000000-0000-0000-0000-00000000d001',
        '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000f002',
        2, 'SINGLES', 'LIVE', '00000000-0000-0000-0000-00000000b003');

insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-000000001b02', '00000000-0000-0000-0000-000000001b01', 1),
  ('00000000-0000-0000-0000-000000001b03', '00000000-0000-0000-0000-000000001b01', 2);

insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-000000001b01', '00000000-0000-0000-0000-000000001b02', '00000000-0000-0000-0000-00000000c003'),
  ('00000000-0000-0000-0000-000000001b01', '00000000-0000-0000-0000-000000001b03', '00000000-0000-0000-0000-00000000c004');

insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-000000001b04', '00000000-0000-0000-0000-000000001b01', 1, 'IN_PROGRESS');

-- ----------------------------------------------------------------------------
-- Helper: switch the session to look like a given authenticated user, the
-- same way PostgREST does it (JWT claims -> auth.uid()).
-- ----------------------------------------------------------------------------

create or replace function test_login(p_auth_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- ============================================================================
-- AS SCORER A — sees only Match A.
-- ============================================================================

select test_login('00000000-0000-0000-0000-00000000a002');
set local role authenticated;

select is(
  (select count(*) from matches),
  1::bigint,
  'scorer A sees exactly their own assigned match, not scorer B''s'
);

select is(
  (select id from matches limit 1),
  '00000000-0000-0000-0000-000000001a01'::uuid,
  'scorer A''s visible match is Match A'
);

select is(
  (select count(*) from tournaments),
  1::bigint,
  'scorer A sees the tournament containing their assigned match'
);

select is(
  (select count(*) from courts),
  1::bigint,
  'scorer A sees only the court their assigned match is on'
);

select is(
  (select count(*) from teams),
  2::bigint,
  'scorer A sees both teams of their assigned match only'
);

select is(
  (select count(*) from match_participants),
  2::bigint,
  'scorer A sees only participants of their assigned match'
);

select is(
  (select count(*) from players),
  2::bigint,
  'scorer A sees only players participating in their assigned match (not players 3/4)'
);

select is(
  (select count(*) from games),
  1::bigint,
  'scorer A sees only the game belonging to their assigned match'
);

select is(
  (select count(*) from rating_categories),
  0::bigint,
  'scorer A has no visibility into rating_categories at all'
);

select is(
  (select count(*) from player_ratings),
  0::bigint,
  'scorer A has no visibility into player_ratings at all'
);

select is(
  (select count(*) from tournament_player_stats),
  0::bigint,
  'scorer A has no visibility into tournament_player_stats at all'
);

-- Scorer A can record a rally on their own LIVE match, attributed to
-- themselves. winning_team_id (0004) must be player c001's own team
-- (1a02) for a WINNER rally to pass validate_rally; losing_player_id
-- (0013) must be a participant on the opposing team (c002).
select lives_ok(
  $$ insert into rallies (game_id, player_id, event_type, created_by, winning_team_id, losing_player_id)
     values ('00000000-0000-0000-0000-000000001a04', '00000000-0000-0000-0000-00000000c001', 'WINNER', '00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-000000001a02', '00000000-0000-0000-0000-00000000c002') $$,
  'scorer A can insert a rally into their own LIVE assigned match, attributed to themselves'
);

-- Scorer A cannot record a rally attributed to someone else. winning_team_id/
-- losing_player_id still correctly credit c001/c002 so this fails on the
-- intended RLS check (created_by), not on validate_rally.
select throws_ok(
  $$ insert into rallies (game_id, player_id, event_type, created_by, winning_team_id, losing_player_id)
     values ('00000000-0000-0000-0000-000000001a04', '00000000-0000-0000-0000-00000000c001', 'WINNER', '00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-000000001a02', '00000000-0000-0000-0000-00000000c002') $$,
  '42501',
  null,
  'scorer A cannot insert a rally attributed to a different recorder'
);

-- Scorer A cannot record a rally into scorer B's match. winning_team_id/
-- losing_player_id correctly credit c003/c004 within match B (1b02/1b03) so
-- this fails on the intended RLS check (match ownership), not on
-- validate_rally.
select throws_ok(
  $$ insert into rallies (game_id, player_id, event_type, created_by, winning_team_id, losing_player_id)
     values ('00000000-0000-0000-0000-000000001b04', '00000000-0000-0000-0000-00000000c003', 'WINNER', '00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-000000001b02', '00000000-0000-0000-0000-00000000c004') $$,
  '42501',
  null,
  'scorer A cannot insert a rally into scorer B''s match'
);

-- Scorer cannot modify players (§3, §50 explicit rule).
--
-- Note: players/tournaments/rating_categories carry a blanket
-- `GRANT UPDATE/DELETE ... TO authenticated` (RLS does the real restricting
-- per-role), so a scorer's UPDATE/DELETE against a row their USING clause
-- filters out doesn't raise 42501 — it just matches zero rows, same as any
-- Postgres RLS setup without an explicit REVOKE. So these assert "unchanged
-- afterward", not "throws", which is what the admin FOR ALL / no-scorer-
-- policy split actually guarantees.
update players set name = 'Hacked' where id = '00000000-0000-0000-0000-00000000c001';
select is(
  (select name from players where id = '00000000-0000-0000-0000-00000000c001'),
  'Player One',
  'scorer A cannot UPDATE a player'
);

delete from players where id = '00000000-0000-0000-0000-00000000c001';
select is(
  (select count(*) from players where id = '00000000-0000-0000-0000-00000000c001'),
  1::bigint,
  'scorer A cannot DELETE a player'
);

-- Scorer cannot modify tournaments.
update tournaments set status = 'CANCELLED' where id = '00000000-0000-0000-0000-00000000d001';
select is(
  (select status from tournaments where id = '00000000-0000-0000-0000-00000000d001')::text,
  'IN_PROGRESS',
  'scorer A cannot UPDATE a tournament'
);

-- Scorer cannot change ratings.
select throws_ok(
  $$ insert into player_ratings (player_id, rating) values ('00000000-0000-0000-0000-00000000c001', 90) $$,
  '42501',
  null,
  'scorer A cannot write to player_ratings'
);

-- Scorer cannot change category thresholds. Scorer has zero SELECT
-- visibility into rating_categories (test 9 above), so the verification
-- read has to bypass RLS — reset to the migration-owning role, which isn't
-- subject to these policies at all, rather than relying on the scorer's own
-- (nonexistent) read access.
update rating_categories set min_rating = 0 where id = '00000000-0000-0000-0000-0000000ca701';
reset role;
select is(
  (select min_rating from rating_categories where id = '00000000-0000-0000-0000-0000000ca701'),
  40::numeric,
  'scorer A cannot UPDATE rating_categories'
);
set local role authenticated;

-- Scorer cannot create tournament structure.
select throws_ok(
  $$ insert into tournament_groups (stage_id, name) values ('00000000-0000-0000-0000-00000000e001', 'Sneaky Group') $$,
  '42501',
  null,
  'scorer A cannot INSERT a tournament_group'
);

-- ============================================================================
-- AS SCORER B — sees only Match B, confirming isolation is symmetric.
-- ============================================================================

select test_login('00000000-0000-0000-0000-00000000a003');
set local role authenticated;

select is(
  (select count(*) from matches),
  1::bigint,
  'scorer B sees exactly their own assigned match'
);

select is(
  (select id from matches limit 1),
  '00000000-0000-0000-0000-000000001b01'::uuid,
  'scorer B''s visible match is Match B, not Match A'
);

-- ============================================================================
-- AS ADMIN — full access.
-- ============================================================================

select test_login('00000000-0000-0000-0000-00000000a001');
set local role authenticated;

select is(
  (select count(*) from matches),
  2::bigint,
  'admin sees both matches'
);

select is(
  (select count(*) from players),
  4::bigint,
  'admin sees all players'
);

select lives_ok(
  $$ update tournaments set status = 'COMPLETED' where id = '00000000-0000-0000-0000-00000000d001' $$,
  'admin can UPDATE a tournament'
);

select finish();

rollback;
