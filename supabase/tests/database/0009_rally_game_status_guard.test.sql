-- ============================================================================
-- 0009_rally_game_status_guard.test.sql — validate_rally()'s new
-- games.status gate (0012_rally_game_status_guard.sql).
--
-- Proves: a rally can still be recorded into an IN_PROGRESS game (no
-- regression), but an INSERT into a COMPLETED game is now rejected for
-- EVERY role — including admin, which is the actual bug this closes (only
-- the scorer's own RLS policy checked game status before; admin's
-- full-CRUD policy didn't, letting a score run past its real stopping
-- point, e.g. to an impossible 29-24).
--
-- Per this sandbox's query-tool quirk (a throws_ok's internal savepoint
-- rollback can clobber earlier-committed state when a later statement in
-- the same file re-checks it), every state assertion here runs BEFORE any
-- throws_ok call — none come after.
--
-- Run the same way as the other test files (no Docker in this sandbox):
--   supabase db query --linked -f supabase/tests/database/0009_rally_game_status_guard.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(3);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id)
values
  ('00000000-0000-0000-0000-00000000a801', 'admin@rallyguard.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a802', 'scorer@rallyguard.test', 'x', now(), '00000000-0000-0000-0000-000000000000');
insert into profiles (id, player_id, auth_user_id, role) values
  ('00000000-0000-0000-0000-00000000b801', null, '00000000-0000-0000-0000-00000000a801', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000b802', null, '00000000-0000-0000-0000-00000000a802', 'SCORER');

insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000c801', 'Player One', 'p1@rallyguard.test'),
  ('00000000-0000-0000-0000-00000000c802', 'Player Two', 'p2@rallyguard.test');

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000d801', 'Rally Guard Test', 'IN_PROGRESS');
insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000e801', '00000000-0000-0000-0000-00000000d801', 'Stage', 'GROUP', 1, 'ACTIVE');

-- Match/game A — IN_PROGRESS, owned by the scorer. Positive path.
insert into matches (id, tournament_id, stage_id, match_number, match_type, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f801', '00000000-0000-0000-0000-00000000d801',
        '00000000-0000-0000-0000-00000000e801', 1, 'SINGLES', 'LIVE', '00000000-0000-0000-0000-00000000b802');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f811', '00000000-0000-0000-0000-00000000f801', 1),
  ('00000000-0000-0000-0000-00000000f812', '00000000-0000-0000-0000-00000000f801', 2);
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000f801', '00000000-0000-0000-0000-00000000f811', '00000000-0000-0000-0000-00000000c801'),
  ('00000000-0000-0000-0000-00000000f801', '00000000-0000-0000-0000-00000000f812', '00000000-0000-0000-0000-00000000c802');
insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f821', '00000000-0000-0000-0000-00000000f801', 1, 'IN_PROGRESS');

-- Match/game B — COMPLETED. Negative path (this is the bug scenario).
insert into matches (id, tournament_id, stage_id, match_number, match_type, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f802', '00000000-0000-0000-0000-00000000d801',
        '00000000-0000-0000-0000-00000000e801', 2, 'SINGLES', 'COMPLETED', '00000000-0000-0000-0000-00000000b802');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f831', '00000000-0000-0000-0000-00000000f802', 1),
  ('00000000-0000-0000-0000-00000000f832', '00000000-0000-0000-0000-00000000f802', 2);
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000f802', '00000000-0000-0000-0000-00000000f831', '00000000-0000-0000-0000-00000000c801'),
  ('00000000-0000-0000-0000-00000000f802', '00000000-0000-0000-0000-00000000f832', '00000000-0000-0000-0000-00000000c802');
insert into games (id, match_id, game_number, status, team_1_score, team_2_score, winner_team_id) values
  ('00000000-0000-0000-0000-00000000f841', '00000000-0000-0000-0000-00000000f802', 1, 'COMPLETED', 21, 15, '00000000-0000-0000-0000-00000000f831');

create or replace function test_login(p_auth_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- ============================================================================
-- Positive path FIRST: a rally into an IN_PROGRESS game still works exactly
-- as before this migration.
-- ============================================================================

select test_login('00000000-0000-0000-0000-00000000a802');
set local role authenticated;

-- losing_player_id required on every WINNER rally since 0013 (Player Two
-- is the only other participant in this singles match) — unrelated to
-- what this file is testing, just satisfying the schema.
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id, losing_player_id)
values ('00000000-0000-0000-0000-00000000f821', '00000000-0000-0000-0000-00000000c801', 'WINNER',
        '00000000-0000-0000-0000-00000000b802', '00000000-0000-0000-0000-00000000f811', '00000000-0000-0000-0000-00000000c802');

select is(
  (select team_1_score from games where id = '00000000-0000-0000-0000-00000000f821'),
  1,
  'no regression: a rally into an IN_PROGRESS game still scores normally'
);

-- ============================================================================
-- Negative paths — throws_ok calls last, per the sandbox's own quirk.
-- ============================================================================

-- The actual bug: admin's full-CRUD policy previously had no status gate
-- at all, so this insert used to silently succeed and push the game's
-- score past its real stopping point.
select test_login('00000000-0000-0000-0000-00000000a801');
set local role authenticated;

select throws_ok(
  $$ insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
     values ('00000000-0000-0000-0000-00000000f841', '00000000-0000-0000-0000-00000000c801', 'WINNER',
             '00000000-0000-0000-0000-00000000b801', '00000000-0000-0000-0000-00000000f831') $$,
  'P0001', null, 'admin can no longer insert a rally into a COMPLETED game'
);

-- Regression guard: the scorer's own RLS check already blocked this before
-- this migration — now the trigger blocks it too, independently.
select test_login('00000000-0000-0000-0000-00000000a802');
set local role authenticated;

select throws_ok(
  $$ insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
     values ('00000000-0000-0000-0000-00000000f841', '00000000-0000-0000-0000-00000000c801', 'WINNER',
             '00000000-0000-0000-0000-00000000b802', '00000000-0000-0000-0000-00000000f831') $$,
  null, null, 'scorer still cannot insert a rally into a COMPLETED game'
);

select finish();

rollback;
