-- ============================================================================
-- 0010_reset_match.test.sql — reset_match (0015_reset_match.sql).
--
-- Proves: resetting a LIVE match with rallies wipes them and returns it to
-- SCHEDULED; resetting a COMPLETED match precisely reverses its rating/
-- tournament_player_stats effects (reusing reopen_match's own logic,
-- verified in 0006_reopen_match.test.sql) AND wipes its rallies/games too
-- (unlike reopen_match, which keeps them); admin-only.
--
-- Run the same way as the other test files (no Docker in this sandbox):
--   supabase db query --linked -f supabase/tests/database/0010_reset_match.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(9);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id)
values
  ('00000000-0000-0000-0000-00000000a901', 'admin@resetmatch.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a902', 'scorer@resetmatch.test', 'x', now(), '00000000-0000-0000-0000-000000000000');
insert into profiles (id, player_id, auth_user_id, role) values
  ('00000000-0000-0000-0000-00000000b901', null, '00000000-0000-0000-0000-00000000a901', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000b902', null, '00000000-0000-0000-0000-00000000a902', 'SCORER');

insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000c901', 'Player One', 'rm1@resetmatch.test'),
  ('00000000-0000-0000-0000-00000000c902', 'Player Two', 'rm2@resetmatch.test');

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000d901', 'Reset Match Test', 'IN_PROGRESS');
insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000e901', '00000000-0000-0000-0000-00000000d901', 'Stage', 'GROUP', 1, 'ACTIVE');

create or replace function test_login(p_auth_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- ============================================================================
-- Case A: reset a LIVE match with rallies but never completed.
-- ============================================================================

insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f901', '00000000-0000-0000-0000-00000000d901',
        '00000000-0000-0000-0000-00000000e901', 1, 'SINGLES', 1, 'LIVE', '00000000-0000-0000-0000-00000000b902');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f911', '00000000-0000-0000-0000-00000000f901', 1),
  ('00000000-0000-0000-0000-00000000f912', '00000000-0000-0000-0000-00000000f901', 2);
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000f901', '00000000-0000-0000-0000-00000000f911', '00000000-0000-0000-0000-00000000c901'),
  ('00000000-0000-0000-0000-00000000f901', '00000000-0000-0000-0000-00000000f912', '00000000-0000-0000-0000-00000000c902');
insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f921', '00000000-0000-0000-0000-00000000f901', 1, 'IN_PROGRESS');

select test_login('00000000-0000-0000-0000-00000000a901');
set local role authenticated;

insert into rallies (game_id, player_id, event_type, created_by, winning_team_id, losing_player_id)
values ('00000000-0000-0000-0000-00000000f921', '00000000-0000-0000-0000-00000000c901', 'WINNER',
        '00000000-0000-0000-0000-00000000b901', '00000000-0000-0000-0000-00000000f911', '00000000-0000-0000-0000-00000000c902');

select reset_match('00000000-0000-0000-0000-00000000f901');

select is(
  (select status from matches where id = '00000000-0000-0000-0000-00000000f901')::text,
  'SCHEDULED', 'Case A: reset returns a LIVE match to SCHEDULED'
);
select is(
  (select count(*)::int from games where match_id = '00000000-0000-0000-0000-00000000f901'),
  0, 'Case A: all games are wiped'
);
select is(
  (select count(*)::int from match_participants where match_id = '00000000-0000-0000-0000-00000000f901'),
  2, 'Case A: teams/players stay assigned'
);

-- ============================================================================
-- Case B: reset a COMPLETED match — reverses rating/stats, same numbers as
-- 0006_reopen_match.test.sql's own scenario (player1 wins 21-15 all-
-- WINNER/all-SPLIT, perfect performance -> rating 60 after completion,
-- reverts to 50 — a new player's default).
-- ============================================================================

insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f902', '00000000-0000-0000-0000-00000000d901',
        '00000000-0000-0000-0000-00000000e901', 2, 'SINGLES', 1, 'LIVE', '00000000-0000-0000-0000-00000000b902');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f931', '00000000-0000-0000-0000-00000000f902', 1),
  ('00000000-0000-0000-0000-00000000f932', '00000000-0000-0000-0000-00000000f902', 2);
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000f902', '00000000-0000-0000-0000-00000000f931', '00000000-0000-0000-0000-00000000c901'),
  ('00000000-0000-0000-0000-00000000f902', '00000000-0000-0000-0000-00000000f932', '00000000-0000-0000-0000-00000000c902');
insert into games (id, match_id, game_number, status) values
  ('00000000-0000-0000-0000-00000000f941', '00000000-0000-0000-0000-00000000f902', 1, 'IN_PROGRESS');

insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select '00000000-0000-0000-0000-00000000f941', null, 'SPLIT', '00000000-0000-0000-0000-00000000b901',
         '00000000-0000-0000-0000-00000000f932'
  from generate_series(1, 15);
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id, losing_player_id)
  select '00000000-0000-0000-0000-00000000f941', '00000000-0000-0000-0000-00000000c901', 'WINNER',
         '00000000-0000-0000-0000-00000000b901', '00000000-0000-0000-0000-00000000f931', '00000000-0000-0000-0000-00000000c902'
  from generate_series(1, 21);

select complete_match('00000000-0000-0000-0000-00000000f902');

select is(
  (select rating from player_ratings where player_id = '00000000-0000-0000-0000-00000000c901'),
  60.00, 'sanity: player1 rating is 60 after completion'
);

select reset_match('00000000-0000-0000-0000-00000000f902');

select is(
  (select status from matches where id = '00000000-0000-0000-0000-00000000f902')::text,
  'SCHEDULED', 'Case B: reset returns a COMPLETED match to SCHEDULED'
);
select is(
  (select rating from player_ratings where player_id = '00000000-0000-0000-0000-00000000c901'),
  50.00, 'Case B: rating reverts exactly (reused reopen_match logic)'
);
select is(
  (select matches_played from tournament_player_stats where tournament_id = '00000000-0000-0000-0000-00000000d901' and player_id = '00000000-0000-0000-0000-00000000c901'),
  0, 'Case B: tournament_player_stats.matches_played reverts to 0'
);
select is(
  (select count(*)::int from games where match_id = '00000000-0000-0000-0000-00000000f902'),
  0, 'Case B: games/rallies are ALSO wiped (unlike plain reopen_match)'
);

-- ============================================================================
-- Authorization — throws_ok last, no state assertions after (sandbox quirk).
-- ============================================================================

insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, scorer_id)
values ('00000000-0000-0000-0000-00000000f903', '00000000-0000-0000-0000-00000000d901',
        '00000000-0000-0000-0000-00000000e901', 3, 'SINGLES', 1, 'LIVE', '00000000-0000-0000-0000-00000000b902');
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000f951', '00000000-0000-0000-0000-00000000f903', 1),
  ('00000000-0000-0000-0000-00000000f952', '00000000-0000-0000-0000-00000000f903', 2);

select test_login('00000000-0000-0000-0000-00000000a902');
set local role authenticated;

select throws_ok(
  $$ select reset_match('00000000-0000-0000-0000-00000000f903') $$,
  'P0001', null, 'a scorer cannot reset a match (admin-only action)'
);

select finish();

rollback;
