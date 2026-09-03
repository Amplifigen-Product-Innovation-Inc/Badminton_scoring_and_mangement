-- ============================================================================
-- 0003_match_completion.test.sql — Phase 4.4-4.7 (TASKS.md), pgTAP.
--
-- Proves:
--   - complete_match's full orchestration (§29 steps 1-9) on a real Bo1
--     match: correct winner, individual performance (§30-31), match
--     performance blend (§32), rating update + confidence + category
--     (§33-35), and tournament_player_stats (§37) — including the shared
--     match-wide SPLIT count (assumption 1) and the neutral-performance
--     fallback for a player with zero WINNER/DROP rallies (assumption 2).
--   - average_performance and rating correctly roll forward across a
--     player's second completed match in the same tournament (running
--     average, not reset).
--   - calculate_match_result / complete_match correctly gate on Bo3's
--     "first to 2 games" — refuses to complete an undecided match.
--   - complete_match's own authorization (scorer: own LIVE match only)
--     and idempotency (can't complete an already-COMPLETED match).
--
-- Run the same way as 0001/0002 (no Docker in this sandbox):
--   supabase db query --linked -f supabase/tests/database/0003_match_completion.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(36);

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------

insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id)
values
  ('00000000-0000-0000-0000-00000000a201', 'admin@completion.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a202', 'scorer.a@completion.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a203', 'scorer.b@completion.test', 'x', now(), '00000000-0000-0000-0000-000000000000');

insert into profiles (id, player_id, auth_user_id, role) values
  ('00000000-0000-0000-0000-00000000b201', null, '00000000-0000-0000-0000-00000000a201', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000b202', null, '00000000-0000-0000-0000-00000000a202', 'SCORER'),
  ('00000000-0000-0000-0000-00000000b203', null, '00000000-0000-0000-0000-00000000a203', 'SCORER');

insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000c201', 'Player One', 'cp1@completion.test'),
  ('00000000-0000-0000-0000-00000000c202', 'Player Two', 'cp2@completion.test'),
  ('00000000-0000-0000-0000-00000000c203', 'Player Three', 'cp3@completion.test');

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000d201', 'Match Completion Test', 'IN_PROGRESS');

insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000e201', '00000000-0000-0000-0000-00000000d201', 'Stage', 'GROUP', 1, 'ACTIVE');

create or replace function test_login(p_auth_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- ============================================================================
-- MATCH A — Bo1, player1 vs player2, scorer A. Player1 wins 21-15 via 21
-- WINNER rallies (all team1/player1) against 15 SPLIT rallies (team2, no
-- player attribution — exercises assumption 1's shared-splits count).
--
-- Every WINNER rally now (0013) also pairs player2 as losing_player_id —
-- player2 has no clean winning shot of their own, so all 21 of player1's
-- winners double as 21 drops charged to player2 (normalized -1.0,
-- performance 0) rather than the pre-0013 "zero WINNER+DROP -> neutral 50
-- fallback" case (assumption 2 still applies, just no longer reachable by
-- this fixture — a real zero-signal player now needs a SPLIT-only game).
-- ============================================================================

select test_login('00000000-0000-0000-0000-00000000a201');
set local role authenticated;

insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000d201',
        '00000000-0000-0000-0000-00000000e201', 1, 'SINGLES', 1, 'LIVE', '00000000-0000-0000-0000-00000000b202');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f202', '00000000-0000-0000-0000-00000000f201', 1),
  ('00000000-0000-0000-0000-00000000f203', '00000000-0000-0000-0000-00000000f201', 2);
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f202', '00000000-0000-0000-0000-00000000c201'),
  ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f203', '00000000-0000-0000-0000-00000000c202');
insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f204', '00000000-0000-0000-0000-00000000f201', 1, 'IN_PROGRESS');

-- Team 2's (below-target) points must land FIRST — since 0012's game-status
-- guard, an insert into an already-COMPLETED game is rejected for every
-- role, and 21 straight WINNER rows for team 1 would complete the game at
-- 21-0 before team 2's 15 ever got recorded (same ordering pitfall as
-- 0002/0004's fixtures).
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select '00000000-0000-0000-0000-00000000f204', null, 'SPLIT',
         '00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f203'
  from generate_series(1, 15);
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id, losing_player_id)
  select '00000000-0000-0000-0000-00000000f204', '00000000-0000-0000-0000-00000000c201', 'WINNER',
         '00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f202', '00000000-0000-0000-0000-00000000c202'
  from generate_series(1, 21);

select is(
  (select status from games where id = '00000000-0000-0000-0000-00000000f204')::text,
  'COMPLETED',
  'match A game completes 21-15'
);

select complete_match('00000000-0000-0000-0000-00000000f201');

select is(
  (select status from matches where id = '00000000-0000-0000-0000-00000000f201')::text,
  'COMPLETED',
  'complete_match marks the match COMPLETED'
);
select is(
  (select winner_team_id from matches where id = '00000000-0000-0000-0000-00000000f201'),
  '00000000-0000-0000-0000-00000000f202'::uuid,
  'complete_match declares team 1 (player1) the winner'
);

-- Player 1: winners=21, drops=0 -> normalized=1.0 -> performance=100;
-- won -> match_result=100 -> match_performance = 100*.8+100*.2 = 100.
-- New rating = 50*.8 + 100*.2 = 60 (Advanced, 60-74).
select is(
  (select rating from player_ratings where player_id = '00000000-0000-0000-0000-00000000c201'),
  60.00,
  'player1 new rating: 50 -> 60 (perfect performance + win)'
);
select is(
  (select confidence_status from player_ratings where player_id = '00000000-0000-0000-0000-00000000c201')::text,
  'PROVISIONAL',
  'player1 confidence PROVISIONAL after 1 match'
);
select is(
  (select rc.name from player_ratings pr join rating_categories rc on rc.id = pr.category_id
    where pr.player_id = '00000000-0000-0000-0000-00000000c201'),
  'Advanced',
  'player1 category Advanced at rating 60'
);
select is(
  (select count(*) from player_rating_history where player_id = '00000000-0000-0000-0000-00000000c201'),
  1::bigint,
  'player1 has exactly one rating history row'
);

-- Player 2 (0013): winners=0, drops=21 (paired from player1's 21 WINNER
-- rallies) -> normalized=-1.0 -> performance=0; lost -> match_result=0 ->
-- match_performance = 0*.8+0*.2 = 0.
-- New rating = 50*.8 + 0*.2 = 40 (Developing, 30-44).
select is(
  (select rating from player_ratings where player_id = '00000000-0000-0000-0000-00000000c202'),
  40.00,
  'player2 new rating: 50 -> 40 (paired drops from player1''s winners + loss)'
);
select is(
  (select rc.name from player_ratings pr join rating_categories rc on rc.id = pr.category_id
    where pr.player_id = '00000000-0000-0000-0000-00000000c202'),
  'Developing',
  'player2 category Developing at rating 40'
);

-- tournament_player_stats: player1 (won).
select is((select matches_played from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'), 1, 'player1 matches_played=1');
select is((select matches_won from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'), 1, 'player1 matches_won=1');
select is((select matches_lost from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'), 0, 'player1 matches_lost=0');
select is((select tournament_points from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'), 2, 'player1 tournament_points=2 (win x2)');
select is((select winning_shots from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'), 21, 'player1 winning_shots=21');
select is((select drops from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'), 0, 'player1 drops=0');
select is((select splits from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'), 15, 'player1 splits=15 (match-wide, shared)');
select is((select average_performance from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'), 100.0, 'player1 average_performance=100');
select is((select tournament_rating from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'), 60.00, 'player1 tournament_rating=60');

-- tournament_player_stats: player2 (lost).
select is((select matches_lost from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c202'), 1, 'player2 matches_lost=1');
select is((select tournament_points from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c202'), 0, 'player2 tournament_points=0 (loss)');
select is((select winning_shots from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c202'), 0, 'player2 winning_shots=0');
select is((select drops from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c202'), 21, 'player2 drops=21 (0013: paired from player1''s 21 WINNER rallies)');
select is((select splits from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c202'), 15, 'player2 splits=15 (same shared match total)');
select is((select average_performance from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c202'), 0.0, 'player2 average_performance=0');

-- Idempotency: completing an already-COMPLETED match must fail.
select throws_ok(
  $$ select complete_match('00000000-0000-0000-0000-00000000f201') $$,
  'P0001',
  null,
  'complete_match refuses to re-complete an already-COMPLETED match'
);

-- ============================================================================
-- MATCH C — Bo1, player1 vs player3. Player1 loses 0-21 via 21 DROP
-- rallies, exercising the running average_performance/rating across a
-- SECOND completed match for the same player in the same tournament.
-- ============================================================================

insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f205', '00000000-0000-0000-0000-00000000d201',
        '00000000-0000-0000-0000-00000000e201', 2, 'SINGLES', 1, 'LIVE', '00000000-0000-0000-0000-00000000b202');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f206', '00000000-0000-0000-0000-00000000f205', 1),
  ('00000000-0000-0000-0000-00000000f207', '00000000-0000-0000-0000-00000000f205', 2);
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000f205', '00000000-0000-0000-0000-00000000f206', '00000000-0000-0000-0000-00000000c201'),
  ('00000000-0000-0000-0000-00000000f205', '00000000-0000-0000-0000-00000000f207', '00000000-0000-0000-0000-00000000c203');
insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f208', '00000000-0000-0000-0000-00000000f205', 1, 'IN_PROGRESS');

insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select '00000000-0000-0000-0000-00000000f208', '00000000-0000-0000-0000-00000000c201', 'DROP',
         '00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f207'
  from generate_series(1, 21);

select complete_match('00000000-0000-0000-0000-00000000f205');

-- Player1: match C performance = 0 (all drops), lost -> match_performance=0.
-- Running average across match A (100) and match C (0) = 50.
select is(
  (select average_performance from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'),
  50.0,
  'player1 average_performance rolls forward correctly across 2 matches: (100+0)/2=50'
);
select is(
  (select matches_played from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'),
  2,
  'player1 matches_played=2 after the second match'
);
select is(
  (select tournament_points from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d201' and player_id = '00000000-0000-0000-0000-00000000c201'),
  2,
  'player1 tournament_points still 2 (won match A, lost match C)'
);
-- New rating = 60*.8 + 0*.2 = 48.
select is(
  (select rating from player_ratings where player_id = '00000000-0000-0000-0000-00000000c201'),
  48.00,
  'player1 rating rolls forward: 60 -> 48 after losing match C 0-21'
);
select is(
  (select matches_count from player_ratings where player_id = '00000000-0000-0000-0000-00000000c201'),
  2,
  'player1 matches_count=2, still PROVISIONAL range'
);

-- ============================================================================
-- Bo3 win-condition gating — games are set up directly (status/winner_team_id)
-- rather than via real rallies, since this only exercises calculate_match_
-- result / complete_match's own game-counting logic, not recompute_game_score
-- (already covered by 0002).
-- ============================================================================

insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f209', '00000000-0000-0000-0000-00000000d201',
        '00000000-0000-0000-0000-00000000e201', 3, 'SINGLES', 3, 'LIVE', '00000000-0000-0000-0000-00000000b202');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f20a', '00000000-0000-0000-0000-00000000f209', 1),
  ('00000000-0000-0000-0000-00000000f20b', '00000000-0000-0000-0000-00000000f209', 2);
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000f209', '00000000-0000-0000-0000-00000000f20a', '00000000-0000-0000-0000-00000000c201'),
  ('00000000-0000-0000-0000-00000000f209', '00000000-0000-0000-0000-00000000f20b', '00000000-0000-0000-0000-00000000c202');

-- Game 1: team 1 wins.
insert into games (id, match_id, game_number, status, winner_team_id, team_1_score, team_2_score) values
  ('00000000-0000-0000-0000-00000000f20c', '00000000-0000-0000-0000-00000000f209', 1, 'COMPLETED', '00000000-0000-0000-0000-00000000f20a', 21, 15);

select throws_ok(
  $$ select complete_match('00000000-0000-0000-0000-00000000f209') $$,
  'P0001',
  null,
  'Bo3 match with only 1 game won cannot be completed yet'
);

-- Game 2: team 2 wins (1-1).
insert into games (id, match_id, game_number, status, winner_team_id, team_1_score, team_2_score) values
  ('00000000-0000-0000-0000-00000000f20d', '00000000-0000-0000-0000-00000000f209', 2, 'COMPLETED', '00000000-0000-0000-0000-00000000f20b', 18, 21);

select throws_ok(
  $$ select complete_match('00000000-0000-0000-0000-00000000f209') $$,
  'P0001',
  null,
  'Bo3 match tied 1-1 still cannot be completed'
);

-- Game 3: team 1 wins (2-1) — now decided.
insert into games (id, match_id, game_number, status, winner_team_id, team_1_score, team_2_score) values
  ('00000000-0000-0000-0000-00000000f20e', '00000000-0000-0000-0000-00000000f209', 3, 'COMPLETED', '00000000-0000-0000-0000-00000000f20a', 21, 19);

select lives_ok(
  $$ select complete_match('00000000-0000-0000-0000-00000000f209') $$,
  'Bo3 match decided 2-1 completes successfully'
);
select is(
  (select winner_team_id from matches where id = '00000000-0000-0000-0000-00000000f209'),
  '00000000-0000-0000-0000-00000000f20a'::uuid,
  'Bo3 match correctly awards the win to the team with 2 game wins'
);

-- ============================================================================
-- Authorization
-- ============================================================================

insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f20f', '00000000-0000-0000-0000-00000000d201',
        '00000000-0000-0000-0000-00000000e201', 4, 'SINGLES', 1, 'LIVE', '00000000-0000-0000-0000-00000000b202');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f210', '00000000-0000-0000-0000-00000000f20f', 1),
  ('00000000-0000-0000-0000-00000000f211', '00000000-0000-0000-0000-00000000f20f', 2);
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000f20f', '00000000-0000-0000-0000-00000000f210', '00000000-0000-0000-0000-00000000c201'),
  ('00000000-0000-0000-0000-00000000f20f', '00000000-0000-0000-0000-00000000f211', '00000000-0000-0000-0000-00000000c202');
insert into games (id, match_id, game_number, status, winner_team_id, team_1_score, team_2_score) values
  ('00000000-0000-0000-0000-00000000f212', '00000000-0000-0000-0000-00000000f20f', 1, 'COMPLETED', '00000000-0000-0000-0000-00000000f210', 21, 10);

select test_login('00000000-0000-0000-0000-00000000a203');
set local role authenticated;

select throws_ok(
  $$ select complete_match('00000000-0000-0000-0000-00000000f20f') $$,
  'P0001',
  null,
  'a scorer who is not assigned to the match cannot complete it'
);

select test_login('00000000-0000-0000-0000-00000000a202');
set local role authenticated;

select lives_ok(
  $$ select complete_match('00000000-0000-0000-0000-00000000f20f') $$,
  'the assigned scorer can complete their own LIVE match'
);

select finish();

rollback;
