-- ============================================================================
-- 0011_cross_category_random_group.test.sql — compute_group_qualification's
-- new "Random" auto-group (0016_cross_category_random_group.sql).
--
-- Proves: qualifying a GROUP-stage group auto-creates/reuses a single
-- "Random" tournament_groups row under a CROSS_CATEGORY stage and pools
-- the newly-qualified players into it; recomputing doesn't duplicate the
-- group or its rows; a tournament with no CROSS_CATEGORY stage still
-- succeeds (best-effort, never fails the parent qualification).
--
-- Run the same way as the other test files (no Docker in this sandbox):
--   supabase db query --linked -f supabase/tests/database/0011_cross_category_random_group.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(5);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id)
values ('00000000-0000-0000-0000-00000000aa01', 'admin@randomgroup.test', 'x', now(), '00000000-0000-0000-0000-000000000000');
insert into profiles (id, player_id, auth_user_id, role) values
  ('00000000-0000-0000-0000-00000000ba01', null, '00000000-0000-0000-0000-00000000aa01', 'ADMIN');

insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000ca21', 'Player A', 'plyra@randomgroup.test'),
  ('00000000-0000-0000-0000-00000000ca22', 'Player B', 'plyrb@randomgroup.test');

create or replace function test_login(p_auth_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select test_login('00000000-0000-0000-0000-00000000aa01');
set local role authenticated;

-- ============================================================================
-- Case A: a tournament WITH a CROSS_CATEGORY stage.
-- ============================================================================

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000da01', 'Random Group Test', 'IN_PROGRESS');
insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-00000000da01', 'Group Stage', 'GROUP', 1, 'ACTIVE'),
  ('00000000-0000-0000-0000-00000000ea02', '00000000-0000-0000-0000-00000000da01', 'Cross Category', 'CROSS_CATEGORY', 2, 'PENDING');
insert into tournament_groups (id, stage_id, name) values
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000ea01', 'Group A');
insert into group_players (group_id, player_id) values
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000ca21'),
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000ca22');

-- A single match so group_standings has something to rank (A beats B 21-15).
insert into matches (id, tournament_id, stage_id, group_id, match_number, match_type, best_of, status, winner_team_id)
  values ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000da01',
          '00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-00000000fa01', 1, 'SINGLES', 1, 'COMPLETED', null);
insert into teams (id, match_id, team_number, source_group_id) values
  ('00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-00000000fb01', 1, '00000000-0000-0000-0000-00000000fa01'),
  ('00000000-0000-0000-0000-00000000fc02', '00000000-0000-0000-0000-00000000fb01', 2, '00000000-0000-0000-0000-00000000fa01');
update matches set winner_team_id = '00000000-0000-0000-0000-00000000fc01' where id = '00000000-0000-0000-0000-00000000fb01';
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-00000000ca21'),
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fc02', '00000000-0000-0000-0000-00000000ca22');
insert into games (match_id, game_number, status, team_1_score, team_2_score, winner_team_id) values
  ('00000000-0000-0000-0000-00000000fb01', 1, 'COMPLETED', 21, 15, '00000000-0000-0000-0000-00000000fc01');

select compute_group_qualification('00000000-0000-0000-0000-00000000fa01');

select is(
  (select count(*)::int from tournament_groups where stage_id = '00000000-0000-0000-0000-00000000ea02' and name = 'Random'),
  1, 'exactly one Random group is created under the CROSS_CATEGORY stage'
);
select is(
  (select count(*)::int from group_players gp
     join tournament_groups tg on tg.id = gp.group_id
     where tg.stage_id = '00000000-0000-0000-0000-00000000ea02' and tg.name = 'Random'),
  2, 'both qualified players (top 2 of a 2-player group) are pooled into it'
);

-- Recompute — must not duplicate the group or its rows.
select compute_group_qualification('00000000-0000-0000-0000-00000000fa01');

select is(
  (select count(*)::int from tournament_groups where stage_id = '00000000-0000-0000-0000-00000000ea02' and name = 'Random'),
  1, 'recompute does not create a second Random group'
);
select is(
  (select count(*)::int from group_players gp
     join tournament_groups tg on tg.id = gp.group_id
     where tg.stage_id = '00000000-0000-0000-0000-00000000ea02' and tg.name = 'Random'),
  2, 'recompute does not duplicate the pooled players'
);

-- ============================================================================
-- Case B: a tournament with NO CROSS_CATEGORY stage at all — qualification
-- must still succeed (best-effort, never fails the parent action).
-- ============================================================================

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000da02', 'No Cross Category Test', 'IN_PROGRESS');
insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000ea03', '00000000-0000-0000-0000-00000000da02', 'Group Stage', 'GROUP', 1, 'ACTIVE');
insert into tournament_groups (id, stage_id, name) values
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000ea03', 'Group A');
insert into group_players (group_id, player_id) values
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000ca21'),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000ca22');

select lives_ok(
  $$ select compute_group_qualification('00000000-0000-0000-0000-00000000fa02') $$,
  'qualification succeeds even with no CROSS_CATEGORY stage present'
);

select finish();

rollback;
