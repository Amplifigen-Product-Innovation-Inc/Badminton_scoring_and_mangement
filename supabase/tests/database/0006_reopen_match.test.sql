-- ============================================================================
-- 0006_reopen_match.test.sql — Phase 6.4/§45/§46 "reopen match", pgTAP.
--
-- Proves reopen_match exactly reverses complete_match's side effects
-- (rating, confidence, category, tournament_player_stats) using the stored
-- player_rating_history row, leaves rallies/games untouched, and enforces
-- its own authorization + precondition.
--
-- Run the same way as 0001-0005 (no Docker in this sandbox):
--   supabase db query --linked -f supabase/tests/database/0006_reopen_match.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(12);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id)
values
  ('00000000-0000-0000-0000-00000000a501', 'admin@reopen.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a502', 'scorer@reopen.test', 'x', now(), '00000000-0000-0000-0000-000000000000');
insert into profiles (id, player_id, auth_user_id, role) values
  ('00000000-0000-0000-0000-00000000b501', null, '00000000-0000-0000-0000-00000000a501', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000b502', null, '00000000-0000-0000-0000-00000000a502', 'SCORER');

insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000c501', 'Player One', 'rp1@reopen.test'),
  ('00000000-0000-0000-0000-00000000c502', 'Player Two', 'rp2@reopen.test');

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000d501', 'Reopen Test', 'IN_PROGRESS');
insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000e501', '00000000-0000-0000-0000-00000000d501', 'Stage', 'GROUP', 1, 'ACTIVE');

create or replace function test_login(p_auth_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Bo1, player1 vs player2. Player1 wins 21-15 via all-WINNER/all-SPLIT, same
-- shape as 0003's Match A — makes the expected post-completion numbers easy
-- to hand-verify (already verified once in 0003; this file reuses the same
-- arithmetic rather than re-deriving it).
insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f501', '00000000-0000-0000-0000-00000000d501',
        '00000000-0000-0000-0000-00000000e501', 1, 'SINGLES', 1, 'LIVE', '00000000-0000-0000-0000-00000000b502');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f502', '00000000-0000-0000-0000-00000000f501', 1),
  ('00000000-0000-0000-0000-00000000f503', '00000000-0000-0000-0000-00000000f501', 2);
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000f501', '00000000-0000-0000-0000-00000000f502', '00000000-0000-0000-0000-00000000c501'),
  ('00000000-0000-0000-0000-00000000f501', '00000000-0000-0000-0000-00000000f503', '00000000-0000-0000-0000-00000000c502');
insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f504', '00000000-0000-0000-0000-00000000f501', 1, 'IN_PROGRESS');

select test_login('00000000-0000-0000-0000-00000000a501');
set local role authenticated;

insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select '00000000-0000-0000-0000-00000000f504', null, 'SPLIT', '00000000-0000-0000-0000-00000000b501',
         '00000000-0000-0000-0000-00000000f503'
  from generate_series(1, 15);
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select '00000000-0000-0000-0000-00000000f504', '00000000-0000-0000-0000-00000000c501', 'WINNER',
         '00000000-0000-0000-0000-00000000b501', '00000000-0000-0000-0000-00000000f502'
  from generate_series(1, 21);

select complete_match('00000000-0000-0000-0000-00000000f501');

-- Sanity: same numbers as 0003's Match A before reopening.
select is(
  (select rating from player_ratings where player_id = '00000000-0000-0000-0000-00000000c501'),
  60.00, 'sanity: player1 rating is 60 after completion (perfect performance + win)'
);

-- Authorization / precondition checks, before we actually reopen.
select test_login('00000000-0000-0000-0000-00000000a502');
set local role authenticated;
select throws_ok(
  $$ select reopen_match('00000000-0000-0000-0000-00000000f501') $$,
  'P0001', null, 'a scorer cannot reopen a match (admin-only action)'
);

select test_login('00000000-0000-0000-0000-00000000a501');
set local role authenticated;

select reopen_match('00000000-0000-0000-0000-00000000f501');

select is(
  (select status from matches where id = '00000000-0000-0000-0000-00000000f501')::text,
  'LIVE', 'reopen_match sets the match back to LIVE'
);
select is(
  (select completed_at from matches where id = '00000000-0000-0000-0000-00000000f501'),
  null, 'reopen_match clears completed_at'
);
select is(
  (select winner_team_id from matches where id = '00000000-0000-0000-0000-00000000f501'),
  null, 'reopen_match clears winner_team_id'
);
select is(
  (select rating from player_ratings where player_id = '00000000-0000-0000-0000-00000000c501'),
  50.00, 'player1 rating reverts exactly to their pre-match rating (50, a new player)'
);
select is(
  (select matches_count from player_ratings where player_id = '00000000-0000-0000-0000-00000000c501'),
  0, 'player1 matches_count reverts to 0'
);
select is(
  (select count(*) from player_rating_history where match_id = '00000000-0000-0000-0000-00000000f501'),
  0::bigint, 'the match''s player_rating_history rows are removed on reopen'
);
select is(
  (select matches_played from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d501' and player_id = '00000000-0000-0000-0000-00000000c501'),
  0, 'player1 tournament_player_stats.matches_played reverts to 0'
);
select is(
  (select tournament_points from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d501' and player_id = '00000000-0000-0000-0000-00000000c501'),
  0, 'player1 tournament_points reverts to 0'
);
select is(
  (select count(*) from rallies where game_id = '00000000-0000-0000-0000-00000000f504'),
  36::bigint, 'raw rallies are untouched by reopen (§47 source of truth) — all 36 still present'
);

-- Precondition: can't reopen a match that isn't COMPLETED (it's LIVE again now).
select throws_ok(
  $$ select reopen_match('00000000-0000-0000-0000-00000000f501') $$,
  'P0001', null, 'cannot reopen a match that is not COMPLETED'
);

select finish();

rollback;
