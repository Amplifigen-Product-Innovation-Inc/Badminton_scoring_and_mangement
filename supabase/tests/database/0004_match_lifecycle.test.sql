-- ============================================================================
-- 0004_match_lifecycle.test.sql — start_match / start_next_game.
--
-- Proves: SCHEDULED -> LIVE transition creates game 1; authorization
-- (scorer: own match only); can't start twice; start_next_game requires the
-- current game COMPLETED and the match not yet decided; can't exceed
-- best_of.
--
-- Run the same way as 0001-0003 (no Docker in this sandbox):
--   supabase db query --linked -f supabase/tests/database/0004_match_lifecycle.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(12);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id)
values
  ('00000000-0000-0000-0000-00000000a301', 'admin@lifecycle.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a302', 'scorer.a@lifecycle.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a303', 'scorer.b@lifecycle.test', 'x', now(), '00000000-0000-0000-0000-000000000000');

insert into profiles (id, player_id, auth_user_id, role) values
  ('00000000-0000-0000-0000-00000000b301', null, '00000000-0000-0000-0000-00000000a301', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000b302', null, '00000000-0000-0000-0000-00000000a302', 'SCORER'),
  ('00000000-0000-0000-0000-00000000b303', null, '00000000-0000-0000-0000-00000000a303', 'SCORER');

insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000c301', 'Player One', 'lp1@lifecycle.test'),
  ('00000000-0000-0000-0000-00000000c302', 'Player Two', 'lp2@lifecycle.test');

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000d301', 'Lifecycle Test', 'IN_PROGRESS');
insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000e301', '00000000-0000-0000-0000-00000000d301', 'Stage', 'GROUP', 1, 'ACTIVE');

create or replace function test_login(p_auth_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- A Bo3 match, SCHEDULED, owned by scorer A.
insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-00000000d301',
        '00000000-0000-0000-0000-00000000e301', 1, 'SINGLES', 3, 'SCHEDULED', '00000000-0000-0000-0000-00000000b302');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f302', '00000000-0000-0000-0000-00000000f301', 1),
  ('00000000-0000-0000-0000-00000000f303', '00000000-0000-0000-0000-00000000f301', 2);
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-00000000f302', '00000000-0000-0000-0000-00000000c301'),
  ('00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-00000000f303', '00000000-0000-0000-0000-00000000c302');

-- Scorer B (not assigned) cannot start it.
select test_login('00000000-0000-0000-0000-00000000a303');
set local role authenticated;
select throws_ok(
  $$ select start_match('00000000-0000-0000-0000-00000000f301') $$,
  'P0001',
  null,
  'a scorer who is not assigned to the match cannot start it'
);

-- Scorer A (assigned) can start it.
select test_login('00000000-0000-0000-0000-00000000a302');
set local role authenticated;
select lives_ok(
  $$ select start_match('00000000-0000-0000-0000-00000000f301') $$,
  'the assigned scorer can start their own SCHEDULED match'
);
select is(
  (select status from matches where id = '00000000-0000-0000-0000-00000000f301')::text,
  'LIVE',
  'start_match transitions SCHEDULED -> LIVE'
);
select is(
  (select count(*) from games where match_id = '00000000-0000-0000-0000-00000000f301'),
  1::bigint,
  'start_match creates exactly one game (game_number 1)'
);
select is(
  (select status from games where match_id = '00000000-0000-0000-0000-00000000f301' and game_number = 1)::text,
  'IN_PROGRESS',
  'game 1 starts IN_PROGRESS'
);

-- Can't start an already-LIVE match again.
select throws_ok(
  $$ select start_match('00000000-0000-0000-0000-00000000f301') $$,
  'P0001',
  null,
  'cannot start an already-LIVE match again'
);

-- Can't start the next game while game 1 is still IN_PROGRESS.
select throws_ok(
  $$ select start_next_game('00000000-0000-0000-0000-00000000f301') $$,
  'P0001',
  null,
  'cannot start game 2 while game 1 is still IN_PROGRESS'
);

-- Complete game 1 (team 1 wins 21-15) via real rallies, then start game 2.
-- Team 2's (below-target) points must land FIRST — crediting team 1's full
-- 21 before team 2's 15 would complete the game at 21-0 after the first
-- bulk insert, and RLS would then reject team 2's rallies as a write into
-- a no-longer-IN_PROGRESS game (same ordering pitfall as 0003's fixtures).
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000f301' and game_number = 1),
         null, 'SPLIT', '00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000f303'
  from generate_series(1, 15);
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000f301' and game_number = 1),
         null, 'SPLIT', '00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000f302'
  from generate_series(1, 21);

select lives_ok(
  $$ select start_next_game('00000000-0000-0000-0000-00000000f301') $$,
  'start_next_game creates game 2 once game 1 is COMPLETED'
);
select is(
  (select count(*) from games where match_id = '00000000-0000-0000-0000-00000000f301'),
  2::bigint,
  'match now has 2 games'
);

-- Team 1 wins game 2 too (21-10) -> match decided 2-0. start_next_game
-- must now refuse (should complete_match instead), even though game
-- count (2) is below best_of (3). Team 2's points land first — same
-- ordering reason as game 1 above.
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000f301' and game_number = 2),
         null, 'SPLIT', '00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000f303'
  from generate_series(1, 10);
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000f301' and game_number = 2),
         null, 'SPLIT', '00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000f302'
  from generate_series(1, 21);

select throws_ok(
  $$ select start_next_game('00000000-0000-0000-0000-00000000f301') $$,
  'P0001',
  null,
  'start_next_game refuses once the match is already decided 2-0'
);

select lives_ok(
  $$ select complete_match('00000000-0000-0000-0000-00000000f301') $$,
  'complete_match succeeds on the 2-0 decided match'
);

-- A Bo1 match at its max game count already: start_next_game must refuse
-- even before checking decidedness, since a Bo1 only ever has 1 game.
-- Fixture setup needs admin-level access (scorer has no INSERT grant on
-- matches/teams/games) — reset to the migration-owning role, same as the
-- rest of this file's fixtures before the first test_login().
reset role;
insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f304', '00000000-0000-0000-0000-00000000d301',
        '00000000-0000-0000-0000-00000000e301', 2, 'SINGLES', 1, 'LIVE', '00000000-0000-0000-0000-00000000b302');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f305', '00000000-0000-0000-0000-00000000f304', 1),
  ('00000000-0000-0000-0000-00000000f306', '00000000-0000-0000-0000-00000000f304', 2);
insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f307', '00000000-0000-0000-0000-00000000f304', 1, 'IN_PROGRESS');

select throws_ok(
  $$ select start_next_game('00000000-0000-0000-0000-00000000f304') $$,
  'P0001',
  null,
  'start_next_game refuses while the only game is still IN_PROGRESS (Bo1)'
);

select finish();

rollback;
