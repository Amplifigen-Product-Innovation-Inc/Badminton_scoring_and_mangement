-- ============================================================================
-- 0007_leaderboards.test.sql — cross_category_standings / player_leaderboard.
--
-- Proves: cross_category_standings correctly groups by teams.source_group_id
-- across separate match rows (recovering "team identity" with no permanent
-- team entity), computes points (2/win) and the total-score tie-break
-- (sum of points scored, not differential) correctly, and a 3-way round-
-- robin tie on points is broken by total_score as specified. Also proves
-- player_leaderboard aggregates career tournament points correctly across
-- MULTIPLE tournaments for the same player. Both admin-only.
--
-- Run the same way as 0001-0006 (no Docker in this sandbox):
--   supabase db query --linked -f supabase/tests/database/0007_leaderboards.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(16);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id)
values
  ('00000000-0000-0000-0000-00000000a601', 'admin@leaderboard.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a602', 'scorer@leaderboard.test', 'x', now(), '00000000-0000-0000-0000-000000000000');
insert into profiles (id, player_id, auth_user_id, role) values
  ('00000000-0000-0000-0000-00000000b601', null, '00000000-0000-0000-0000-00000000a601', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000b602', null, '00000000-0000-0000-0000-00000000a602', 'SCORER');

create or replace function test_login(p_auth_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select test_login('00000000-0000-0000-0000-00000000a601');
set local role authenticated;

-- ============================================================================
-- Cross-category: 3-team round robin, a 3-way cyclic tie on points (each
-- team 1 win/1 loss) broken by total points scored.
--   A beats B 21-15; B beats C 21-19; C beats A 21-17.
--   A: scored 21+17=38.  B: scored 15+21=36.  C: scored 19+21=40.
--   Expected order: C (40) > A (38) > B (36), all tied at 2 points.
-- ============================================================================

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000d601', 'Leaderboard Test', 'IN_PROGRESS');
insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000e601', '00000000-0000-0000-0000-00000000d601', 'Cross Category', 'CROSS_CATEGORY', 2, 'ACTIVE');
insert into tournament_groups (id, stage_id, name) values
  ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-00000000e601', 'Group A'),
  ('00000000-0000-0000-0000-00000000ea02', '00000000-0000-0000-0000-00000000e601', 'Group B'),
  ('00000000-0000-0000-0000-00000000ea03', '00000000-0000-0000-0000-00000000e601', 'Group C');
insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000ca01', 'Player A', 'plyra@leaderboard.test'),
  ('00000000-0000-0000-0000-00000000ca02', 'Player B', 'plyrb@leaderboard.test'),
  ('00000000-0000-0000-0000-00000000ca03', 'Player C', 'plyrc@leaderboard.test');

-- Match 1: A vs B, A wins 21-15.
insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, winner_team_id)
  values ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000d601',
          '00000000-0000-0000-0000-00000000e601', 1, 'SINGLES', 1, 'COMPLETED', null);
insert into teams (id, match_id, team_number, source_group_id) values
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01', 1, '00000000-0000-0000-0000-00000000ea01'),
  ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000fa01', 2, '00000000-0000-0000-0000-00000000ea02');
update matches set winner_team_id = '00000000-0000-0000-0000-00000000fb01' where id = '00000000-0000-0000-0000-00000000fa01';
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000ca01'),
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000ca02');
insert into games (match_id, game_number, status, team_1_score, team_2_score, winner_team_id) values
  ('00000000-0000-0000-0000-00000000fa01', 1, 'COMPLETED', 21, 15, '00000000-0000-0000-0000-00000000fb01');

-- Match 2: B vs C, B wins 21-19.
insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, winner_team_id)
  values ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000d601',
          '00000000-0000-0000-0000-00000000e601', 2, 'SINGLES', 1, 'COMPLETED', null);
insert into teams (id, match_id, team_number, source_group_id) values
  ('00000000-0000-0000-0000-00000000fb03', '00000000-0000-0000-0000-00000000fa02', 1, '00000000-0000-0000-0000-00000000ea02'),
  ('00000000-0000-0000-0000-00000000fb04', '00000000-0000-0000-0000-00000000fa02', 2, '00000000-0000-0000-0000-00000000ea03');
update matches set winner_team_id = '00000000-0000-0000-0000-00000000fb03' where id = '00000000-0000-0000-0000-00000000fa02';
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000fb03', '00000000-0000-0000-0000-00000000ca02'),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000fb04', '00000000-0000-0000-0000-00000000ca03');
insert into games (match_id, game_number, status, team_1_score, team_2_score, winner_team_id) values
  ('00000000-0000-0000-0000-00000000fa02', 1, 'COMPLETED', 21, 19, '00000000-0000-0000-0000-00000000fb03');

-- Match 3: C vs A, C wins 21-17.
insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, winner_team_id)
  values ('00000000-0000-0000-0000-00000000fa03', '00000000-0000-0000-0000-00000000d601',
          '00000000-0000-0000-0000-00000000e601', 3, 'SINGLES', 1, 'COMPLETED', null);
insert into teams (id, match_id, team_number, source_group_id) values
  ('00000000-0000-0000-0000-00000000fb05', '00000000-0000-0000-0000-00000000fa03', 1, '00000000-0000-0000-0000-00000000ea03'),
  ('00000000-0000-0000-0000-00000000fb06', '00000000-0000-0000-0000-00000000fa03', 2, '00000000-0000-0000-0000-00000000ea01');
update matches set winner_team_id = '00000000-0000-0000-0000-00000000fb05' where id = '00000000-0000-0000-0000-00000000fa03';
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000fa03', '00000000-0000-0000-0000-00000000fb05', '00000000-0000-0000-0000-00000000ca03'),
  ('00000000-0000-0000-0000-00000000fa03', '00000000-0000-0000-0000-00000000fb06', '00000000-0000-0000-0000-00000000ca01');
insert into games (match_id, game_number, status, team_1_score, team_2_score, winner_team_id) values
  ('00000000-0000-0000-0000-00000000fa03', 1, 'COMPLETED', 21, 17, '00000000-0000-0000-0000-00000000fb05');

select is(
  (select points from cross_category_standings('00000000-0000-0000-0000-00000000e601') where source_group_id = '00000000-0000-0000-0000-00000000ea01'),
  2, 'Group A team: 1 win, 1 loss -> 2 points'
);
select is(
  (select points from cross_category_standings('00000000-0000-0000-0000-00000000e601') where source_group_id = '00000000-0000-0000-0000-00000000ea02'),
  2, 'Group B team: also 2 points (1-1) -- 3-way tie'
);
select is(
  (select points from cross_category_standings('00000000-0000-0000-0000-00000000e601') where source_group_id = '00000000-0000-0000-0000-00000000ea03'),
  2, 'Group C team: also 2 points (1-1) -- 3-way tie'
);
select is(
  (select total_score from cross_category_standings('00000000-0000-0000-0000-00000000e601') where source_group_id = '00000000-0000-0000-0000-00000000ea01'),
  38, 'Group A total_score = 21+17 = 38'
);
select is(
  (select total_score from cross_category_standings('00000000-0000-0000-0000-00000000e601') where source_group_id = '00000000-0000-0000-0000-00000000ea02'),
  36, 'Group B total_score = 15+21 = 36'
);
select is(
  (select total_score from cross_category_standings('00000000-0000-0000-0000-00000000e601') where source_group_id = '00000000-0000-0000-0000-00000000ea03'),
  40, 'Group C total_score = 19+21 = 40'
);
select is(
  (select rank from cross_category_standings('00000000-0000-0000-0000-00000000e601') where source_group_id = '00000000-0000-0000-0000-00000000ea03'),
  1, 'Group C ranks 1st: tied on points, highest total_score breaks the tie'
);
select is(
  (select rank from cross_category_standings('00000000-0000-0000-0000-00000000e601') where source_group_id = '00000000-0000-0000-0000-00000000ea01'),
  2, 'Group A ranks 2nd (38 points scored, between C and B)'
);
select is(
  (select rank from cross_category_standings('00000000-0000-0000-0000-00000000e601') where source_group_id = '00000000-0000-0000-0000-00000000ea02'),
  3, 'Group B ranks 3rd (lowest total_score among the tied teams)'
);
select is(
  (select team_label from cross_category_standings('00000000-0000-0000-0000-00000000e601') where source_group_id = '00000000-0000-0000-0000-00000000ea01'),
  'Group A', 'team_label reflects the source group''s name'
);
select is(
  (select player_names from cross_category_standings('00000000-0000-0000-0000-00000000e601') where source_group_id = '00000000-0000-0000-0000-00000000ea01'),
  'Player A', 'player_names lists the participants sourced from that group'
);

-- ============================================================================
-- Global player leaderboard: career points sum across MULTIPLE tournaments.
-- ============================================================================

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000d602', 'Second Tournament', 'COMPLETED');
insert into player_ratings (player_id, rating, matches_count, confidence_status) values
  ('00000000-0000-0000-0000-00000000ca01', 65.00, 4, 'EMERGING');
insert into tournament_player_stats (tournament_id, player_id, matches_played, matches_won, tournament_points) values
  ('00000000-0000-0000-0000-00000000d601', '00000000-0000-0000-0000-00000000ca01', 2, 1, 2),
  ('00000000-0000-0000-0000-00000000d602', '00000000-0000-0000-0000-00000000ca01', 2, 2, 4);

select is(
  (select current_rating from player_leaderboard() where player_id = '00000000-0000-0000-0000-00000000ca01'),
  65.00, 'player_leaderboard shows the current rating'
);
select is(
  (select career_tournament_points from player_leaderboard() where player_id = '00000000-0000-0000-0000-00000000ca01'),
  6::bigint, 'player_leaderboard sums tournament_points across BOTH tournaments (2+4=6)'
);
select is(
  (select tournaments_played from player_leaderboard() where player_id = '00000000-0000-0000-0000-00000000ca01'),
  2::bigint, 'player_leaderboard counts 2 distinct tournaments'
);

-- ============================================================================
-- Authorization
-- ============================================================================

select test_login('00000000-0000-0000-0000-00000000a602');
set local role authenticated;

select throws_ok(
  $$ select * from cross_category_standings('00000000-0000-0000-0000-00000000e601') $$,
  'P0001', null, 'a scorer cannot view cross-category standings'
);
select throws_ok(
  $$ select * from player_leaderboard() $$,
  'P0001', null, 'a scorer cannot view the player leaderboard'
);

select finish();

rollback;
