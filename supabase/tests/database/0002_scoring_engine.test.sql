-- ============================================================================
-- 0002_scoring_engine.test.sql — Phase 4.1-4.3 (TASKS.md), pgTAP.
--
-- Proves:
--   - WINNER/DROP/SPLIT rallies correctly update games.team_1_score/
--     team_2_score via recompute_game_score (§25-28).
--   - validate_rally rejects a winning_team_id that doesn't match the
--     scoring player's own team (WINNER), doesn't match the opposing team
--     (DROP), or doesn't belong to the rally's match at all.
--   - Deuce/cap boundaries from §70: 20-20 continues, win-by-2 completes a
--     game, reaching the score cap (30) wins outright even with only a
--     1-point lead.
--   - undo_last_rally reverses the latest rally, recomputes score/status,
--     and enforces its own authorization (scorer: own LIVE match, own
--     rally only; admin: any match).
--
-- Wrapped in BEGIN/ROLLBACK — safe to run repeatedly. Run the same way as
-- 0001_rls.test.sql (no Docker in this sandbox):
--   supabase db query --linked -f supabase/tests/database/0002_scoring_engine.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(28);

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------

insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id)
values
  ('00000000-0000-0000-0000-00000000a101', 'admin@scoring.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a102', 'scorer.a@scoring.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a103', 'scorer.b@scoring.test', 'x', now(), '00000000-0000-0000-0000-000000000000');

insert into profiles (id, player_id, auth_user_id, role) values
  ('00000000-0000-0000-0000-00000000b101', null, '00000000-0000-0000-0000-00000000a101', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000b102', null, '00000000-0000-0000-0000-00000000a102', 'SCORER'),
  ('00000000-0000-0000-0000-00000000b103', null, '00000000-0000-0000-0000-00000000a103', 'SCORER');

insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000c101', 'Player One', 'p1@scoring.test'),
  ('00000000-0000-0000-0000-00000000c102', 'Player Two', 'p2@scoring.test');

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000d101', 'Scoring Engine Test', 'IN_PROGRESS');

insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000d101', 'Stage', 'GROUP', 1, 'ACTIVE');

-- Match, owned by scorer A, LIVE. Player 1 on team 1, Player 2 on team 2.
insert into matches (id, tournament_id, stage_id, match_number, match_type, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000d101',
        '00000000-0000-0000-0000-00000000e101', 1, 'SINGLES', 'LIVE', '00000000-0000-0000-0000-00000000b102');

insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000f101', 1),
  ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-00000000f101', 2);

insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000c101'),
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-00000000c102');

insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-00000000f101', 1, 'IN_PROGRESS');

create or replace function test_login(p_auth_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- ----------------------------------------------------------------------------
-- AS SCORER A — basic WINNER/DROP/SPLIT scoring.
-- ----------------------------------------------------------------------------

select test_login('00000000-0000-0000-0000-00000000a102');
set local role authenticated;

-- Player 1 (team 1) hits a winner -> team 1's score.
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
values ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-00000000c101', 'WINNER',
        '00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f102');

select is(
  (select team_1_score from games where id = '00000000-0000-0000-0000-00000000f104'),
  1,
  'WINNER credits the scoring player''s own team'
);

-- Player 1 (team 1) drops -> opposing team (team 2) gets the point.
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
values ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-00000000c101', 'DROP',
        '00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f103');

select is(
  (select team_2_score from games where id = '00000000-0000-0000-0000-00000000f104'),
  1,
  'DROP credits the opposing team'
);

-- SPLIT: no player, scorer records the team directly (team 1 again).
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
values ('00000000-0000-0000-0000-00000000f104', null, 'SPLIT',
        '00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f102');

select is(
  (select team_1_score from games where id = '00000000-0000-0000-0000-00000000f104'),
  2,
  'SPLIT credits whichever team the scorer records, with no player attribution'
);

select is(
  (select status from games where id = '00000000-0000-0000-0000-00000000f104')::text,
  'IN_PROGRESS',
  'game still IN_PROGRESS well below target score'
);

-- validate_rally rejections.
select throws_ok(
  $$ insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
     values ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-00000000c101', 'WINNER',
             '00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f103') $$,
  'P0001',
  null,
  'WINNER rejected when winning_team_id is not the scoring player''s own team'
);

select throws_ok(
  $$ insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
     values ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-00000000c101', 'DROP',
             '00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f102') $$,
  'P0001',
  null,
  'DROP rejected when winning_team_id is the scoring player''s own team instead of the opponent''s'
);

-- ----------------------------------------------------------------------------
-- AS ADMIN — deuce/cap boundary tests, on fresh games (bulk-inserted via
-- generate_series to jump straight to the score under test, since the exact
-- path taken to a score doesn't matter to recompute_game_score — only the
-- final tally does).
-- ----------------------------------------------------------------------------

select test_login('00000000-0000-0000-0000-00000000a101');
set local role authenticated;

-- validate_rally rejects a winning_team_id from a different match entirely.
insert into matches (id, tournament_id, stage_id, match_number, match_type, status)
values ('00000000-0000-0000-0000-00000000f105', '00000000-0000-0000-0000-00000000d101',
        '00000000-0000-0000-0000-00000000e101', 2, 'SINGLES', 'LIVE');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f106', '00000000-0000-0000-0000-00000000f105', 1),
  ('00000000-0000-0000-0000-00000000f107', '00000000-0000-0000-0000-00000000f105', 2);
insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f108', '00000000-0000-0000-0000-00000000f105', 1, 'IN_PROGRESS');

select throws_ok(
  $$ insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
     values ('00000000-0000-0000-0000-00000000f108', null, 'SPLIT',
             '00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f102') $$,
  'P0001',
  null,
  'rejected when winning_team_id belongs to a different match'
);

-- Scenario: normal win, 21-19. Team 2's 19 rallies are inserted first and
-- team 1's winning 21st rally last on purpose — undo_last_rally must
-- reverse whichever rally was truly inserted last (by sequence_number, not
-- by which team "feels like" the interesting one), so the fixture below
-- deliberately makes that the actual winning point.
insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f109', '00000000-0000-0000-0000-00000000f105', 2, 'IN_PROGRESS');
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select '00000000-0000-0000-0000-00000000f109', null, 'SPLIT', '00000000-0000-0000-0000-00000000b101',
         '00000000-0000-0000-0000-00000000f107'
  from generate_series(1, 19);
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select '00000000-0000-0000-0000-00000000f109', null, 'SPLIT', '00000000-0000-0000-0000-00000000b101',
         '00000000-0000-0000-0000-00000000f106'
  from generate_series(1, 21);

select is(
  (select status from games where id = '00000000-0000-0000-0000-00000000f109')::text,
  'COMPLETED',
  '21-19 completes the game'
);
select is(
  (select winner_team_id from games where id = '00000000-0000-0000-0000-00000000f109'),
  '00000000-0000-0000-0000-00000000f106'::uuid,
  '21-19 declares the 21-point team the winner'
);

-- Scenario: 20-20 must continue (win-by-2 not yet satisfied).
insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f110', '00000000-0000-0000-0000-00000000f105', 3, 'IN_PROGRESS');
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select '00000000-0000-0000-0000-00000000f110', null, 'SPLIT', '00000000-0000-0000-0000-00000000b101',
         (case when i % 2 = 0 then '00000000-0000-0000-0000-00000000f106' else '00000000-0000-0000-0000-00000000f107' end)::uuid
  from generate_series(1, 40) as i;

select is(
  (select team_1_score from games where id = '00000000-0000-0000-0000-00000000f110'),
  20,
  '40 alternating rallies produce a 20-20 score (team 1)'
);
select is(
  (select team_2_score from games where id = '00000000-0000-0000-0000-00000000f110'),
  20,
  '40 alternating rallies produce a 20-20 score (team 2)'
);
select is(
  (select status from games where id = '00000000-0000-0000-0000-00000000f110')::text,
  'IN_PROGRESS',
  '20-20 does not complete the game — must continue past deuce'
);

-- One more pair each way keeps it tied at 21-21, still not complete.
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
values
  ('00000000-0000-0000-0000-00000000f110', null, 'SPLIT', '00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f106'),
  ('00000000-0000-0000-0000-00000000f110', null, 'SPLIT', '00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f107');

select is(
  (select status from games where id = '00000000-0000-0000-0000-00000000f110')::text,
  'IN_PROGRESS',
  '21-21 still does not complete the game'
);

-- Now team 1 pulls ahead by 2 (23-21) — completes.
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
values
  ('00000000-0000-0000-0000-00000000f110', null, 'SPLIT', '00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f106'),
  ('00000000-0000-0000-0000-00000000f110', null, 'SPLIT', '00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f106');

select is(
  (select team_1_score from games where id = '00000000-0000-0000-0000-00000000f110'),
  23,
  '23-21 (win-by-2 past deuce): team 1 score'
);
select is(
  (select team_2_score from games where id = '00000000-0000-0000-0000-00000000f110'),
  21,
  '23-21 (win-by-2 past deuce): team 2 score'
);
select is(
  (select status from games where id = '00000000-0000-0000-0000-00000000f110')::text,
  'COMPLETED',
  '23-21 (win-by-2 past deuce) completes the game'
);

-- Scenario: cap wins outright even with only a 1-point lead (30-29).
insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f111', '00000000-0000-0000-0000-00000000f105', 4, 'IN_PROGRESS');
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select '00000000-0000-0000-0000-00000000f111', null, 'SPLIT', '00000000-0000-0000-0000-00000000b101',
         '00000000-0000-0000-0000-00000000f106'
  from generate_series(1, 30);
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select '00000000-0000-0000-0000-00000000f111', null, 'SPLIT', '00000000-0000-0000-0000-00000000b101',
         '00000000-0000-0000-0000-00000000f107'
  from generate_series(1, 29);

select is(
  (select team_1_score from games where id = '00000000-0000-0000-0000-00000000f111'),
  30,
  '30-29 via score cap: team 1 score'
);
select is(
  (select team_2_score from games where id = '00000000-0000-0000-0000-00000000f111'),
  29,
  '30-29 via score cap: team 2 score'
);
select is(
  (select status from games where id = '00000000-0000-0000-0000-00000000f111')::text,
  'COMPLETED',
  '30-29 completes via the score cap despite only a 1-point lead'
);
select is(
  (select winner_team_id from games where id = '00000000-0000-0000-0000-00000000f111'),
  '00000000-0000-0000-0000-00000000f106'::uuid,
  '30-29 declares the 30-point team the winner'
);

-- ----------------------------------------------------------------------------
-- undo_last_rally
-- ----------------------------------------------------------------------------

-- Undo the last rally of the 21-19 game (f109) — should drop team 1 back to
-- 20, revert status to IN_PROGRESS, clear the winner.
select undo_last_rally('00000000-0000-0000-0000-00000000f109');
select is(
  (select team_1_score from games where id = '00000000-0000-0000-0000-00000000f109'),
  20,
  'admin undo_last_rally reverses the winning rally: team 1 score drops back'
);
select is(
  (select team_2_score from games where id = '00000000-0000-0000-0000-00000000f109'),
  19,
  'admin undo_last_rally: team 2 score unchanged'
);
select is(
  (select status from games where id = '00000000-0000-0000-0000-00000000f109')::text,
  'IN_PROGRESS',
  'admin undo_last_rally un-completes the game'
);
select is(
  (select winner_team_id from games where id = '00000000-0000-0000-0000-00000000f109'),
  null::uuid,
  'admin undo_last_rally clears the winner'
);

-- Scorer B (not this match's assigned scorer) cannot undo match A's rallies.
select test_login('00000000-0000-0000-0000-00000000a103');
set local role authenticated;

select throws_ok(
  $$ select undo_last_rally('00000000-0000-0000-0000-00000000f104') $$,
  'P0001',
  null,
  'a scorer who does not own the match cannot undo its rallies'
);

-- Scorer A can undo their own rally on their own LIVE match (the SPLIT
-- rally recorded earlier, currently the most recent on game f104).
select test_login('00000000-0000-0000-0000-00000000a102');
set local role authenticated;

select is(
  (select team_1_score from games where id = '00000000-0000-0000-0000-00000000f104'),
  2,
  'sanity check before undo: team 1 at 2 (WINNER + SPLIT)'
);

select undo_last_rally('00000000-0000-0000-0000-00000000f104');

select is(
  (select team_1_score from games where id = '00000000-0000-0000-0000-00000000f104'),
  1,
  'scorer A undo removes their own most recent (SPLIT) rally'
);

-- No rallies left to undo on the never-scored match-2 game (f108).
select throws_ok(
  $$ select undo_last_rally('00000000-0000-0000-0000-00000000f108') $$,
  'P0001',
  null,
  'undo_last_rally raises when there is nothing to undo'
);

select finish();

rollback;
