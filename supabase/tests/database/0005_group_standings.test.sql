-- ============================================================================
-- 0005_group_standings.test.sql — Phase 6.1-6.2 (TASKS.md), pgTAP.
--
-- Proves group_standings' §70 tie-break chain one level at a time (each
-- scenario is hand-constructed so only ONE tie-break level actually
-- decides it), persisted qualification (compute_group_qualification),
-- override survival across a recompute, authorization, and that
-- cross-category matches (group_id NULL) never leak into a group's
-- standings.
--
-- Run the same way as 0001-0004 (no Docker in this sandbox):
--   supabase db query --linked -f supabase/tests/database/0005_group_standings.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(27);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id)
values
  ('00000000-0000-0000-0000-00000000a401', 'admin@standings.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a402', 'scorer@standings.test', 'x', now(), '00000000-0000-0000-0000-000000000000');
insert into profiles (id, player_id, auth_user_id, role) values
  ('00000000-0000-0000-0000-00000000b401', null, '00000000-0000-0000-0000-00000000a401', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000b402', null, '00000000-0000-0000-0000-00000000a402', 'SCORER');

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000d401', 'Standings Test', 'IN_PROGRESS');
insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000e401', '00000000-0000-0000-0000-00000000d401', 'Group Stage', 'GROUP', 1, 'ACTIVE');

create or replace function test_login(p_auth_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Helper to create a completed Bo1 SINGLES match between two players in a
-- given group, with the winning team's points built from an explicit rally
-- recipe (kept in the test body, not a function, so each scenario's
-- attribution stays easy to read and reason about).
create or replace function _mk_match(
  p_match_id uuid, p_group_id uuid, p_number int,
  p_team1 uuid, p_team2 uuid, p_p1 uuid, p_p2 uuid
) returns void language sql as $$
  insert into matches (id, tournament_id, stage_id, group_id, match_number, match_type, best_of, status)
    values (p_match_id, '00000000-0000-0000-0000-00000000d401', '00000000-0000-0000-0000-00000000e401',
            p_group_id, p_number, 'SINGLES', 1, 'LIVE');
  insert into teams (id, match_id, team_number) values (p_team1, p_match_id, 1), (p_team2, p_match_id, 2);
  insert into match_participants (match_id, team_id, player_id) values
    (p_match_id, p_team1, p_p1), (p_match_id, p_team2, p_p2);
  insert into games (match_id, game_number, status) values (p_match_id, 1, 'IN_PROGRESS');
$$;

select test_login('00000000-0000-0000-0000-00000000a401');
set local role authenticated;

-- ============================================================================
-- GROUP A — no ties. pa1 beats both, pa2 beats pa3 only.
-- ============================================================================

insert into tournament_groups (id, stage_id, name) values
  ('00000000-0000-0000-0000-00000000ea11', '00000000-0000-0000-0000-00000000e401', 'Group A');
insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000ca11', 'PA One', 'pa1@standings.test'),
  ('00000000-0000-0000-0000-00000000ca12', 'PA Two', 'pa2@standings.test'),
  ('00000000-0000-0000-0000-00000000ca13', 'PA Three', 'pa3@standings.test');
insert into group_players (group_id, player_id) values
  ('00000000-0000-0000-0000-00000000ea11', '00000000-0000-0000-0000-00000000ca11'),
  ('00000000-0000-0000-0000-00000000ea11', '00000000-0000-0000-0000-00000000ca12'),
  ('00000000-0000-0000-0000-00000000ea11', '00000000-0000-0000-0000-00000000ca13');

select _mk_match('00000000-0000-0000-0000-00000000ba11', '00000000-0000-0000-0000-00000000ea11', 1,
  '00000000-0000-0000-0000-00000000fa11', '00000000-0000-0000-0000-00000000fa12',
  '00000000-0000-0000-0000-00000000ca11', '00000000-0000-0000-0000-00000000ca12');
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000ba11'),
         '00000000-0000-0000-0000-00000000ca11', 'WINNER', '00000000-0000-0000-0000-00000000b401',
         '00000000-0000-0000-0000-00000000fa11'
  from generate_series(1, 21);
select complete_match('00000000-0000-0000-0000-00000000ba11');

select _mk_match('00000000-0000-0000-0000-00000000ba12', '00000000-0000-0000-0000-00000000ea11', 2,
  '00000000-0000-0000-0000-00000000fa21', '00000000-0000-0000-0000-00000000fa22',
  '00000000-0000-0000-0000-00000000ca11', '00000000-0000-0000-0000-00000000ca13');
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000ba12'),
         null, 'SPLIT', '00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-00000000fa21'
  from generate_series(1, 21);
select complete_match('00000000-0000-0000-0000-00000000ba12');

select _mk_match('00000000-0000-0000-0000-00000000ba13', '00000000-0000-0000-0000-00000000ea11', 3,
  '00000000-0000-0000-0000-00000000fa31', '00000000-0000-0000-0000-00000000fa32',
  '00000000-0000-0000-0000-00000000ca12', '00000000-0000-0000-0000-00000000ca13');
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000ba13'),
         null, 'SPLIT', '00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-00000000fa31'
  from generate_series(1, 21);
select complete_match('00000000-0000-0000-0000-00000000ba13');

select is(
  (select tournament_points from group_standings('00000000-0000-0000-0000-00000000ea11') where player_id = '00000000-0000-0000-0000-00000000ca11'),
  4, 'Group A: pa1 (2 wins) has 4 tournament points'
);
select is(
  (select rank from group_standings('00000000-0000-0000-0000-00000000ea11') where player_id = '00000000-0000-0000-0000-00000000ca11'),
  1, 'Group A: pa1 ranks 1st (no ties)'
);
select is(
  (select rank from group_standings('00000000-0000-0000-0000-00000000ea11') where player_id = '00000000-0000-0000-0000-00000000ca12'),
  2, 'Group A: pa2 ranks 2nd'
);
select is(
  (select rank from group_standings('00000000-0000-0000-0000-00000000ea11') where player_id = '00000000-0000-0000-0000-00000000ca13'),
  3, 'Group A: pa3 ranks 3rd (0 points)'
);
select is(
  (select game_differential from group_standings('00000000-0000-0000-0000-00000000ea11') where player_id = '00000000-0000-0000-0000-00000000ca11'),
  2, 'Group A: pa1 game_differential = +2 (2 games won, 0 lost)'
);

-- Cross-category match (group_id NULL) between pa1/pa2 must not affect
-- Group A's standings at all.
insert into matches (id, tournament_id, stage_id, group_id, match_number, match_type, best_of, status, winner_team_id)
  values ('00000000-0000-0000-0000-00000000ba41', '00000000-0000-0000-0000-00000000d401',
          '00000000-0000-0000-0000-00000000e401', null, 99, 'SINGLES', 1, 'COMPLETED', null);
insert into teams (id, match_id, team_number) values
  ('00000000-0000-0000-0000-00000000fd11', '00000000-0000-0000-0000-00000000ba41', 1),
  ('00000000-0000-0000-0000-00000000fd12', '00000000-0000-0000-0000-00000000ba41', 2);
update matches set winner_team_id = '00000000-0000-0000-0000-00000000fd12' where id = '00000000-0000-0000-0000-00000000ba41';
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000ba41', '00000000-0000-0000-0000-00000000fd11', '00000000-0000-0000-0000-00000000ca11'),
  ('00000000-0000-0000-0000-00000000ba41', '00000000-0000-0000-0000-00000000fd12', '00000000-0000-0000-0000-00000000ca12');

select is(
  (select tournament_points from group_standings('00000000-0000-0000-0000-00000000ea11') where player_id = '00000000-0000-0000-0000-00000000ca11'),
  4, 'a cross-category match (group_id NULL) does not change pa1''s group points'
);
select is(
  (select tournament_points from group_standings('00000000-0000-0000-0000-00000000ea11') where player_id = '00000000-0000-0000-0000-00000000ca12'),
  2, 'a cross-category match (group_id NULL) does not change pa2''s group points either'
);

-- ============================================================================
-- GROUP B — 2-way tie on points, resolved by head-to-head.
-- pb1 beats pb2; pb3 beats pb1. pb2-pb3 never play. pb1 and pb3 both land
-- on 2 points; their own match decides it in pb3's favor.
-- ============================================================================

insert into tournament_groups (id, stage_id, name) values
  ('00000000-0000-0000-0000-00000000ea12', '00000000-0000-0000-0000-00000000e401', 'Group B');
insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000ca21', 'PB One', 'pb1@standings.test'),
  ('00000000-0000-0000-0000-00000000ca22', 'PB Two', 'pb2@standings.test'),
  ('00000000-0000-0000-0000-00000000ca23', 'PB Three', 'pb3@standings.test');
insert into group_players (group_id, player_id) values
  ('00000000-0000-0000-0000-00000000ea12', '00000000-0000-0000-0000-00000000ca21'),
  ('00000000-0000-0000-0000-00000000ea12', '00000000-0000-0000-0000-00000000ca22'),
  ('00000000-0000-0000-0000-00000000ea12', '00000000-0000-0000-0000-00000000ca23');

select _mk_match('00000000-0000-0000-0000-00000000ba21', '00000000-0000-0000-0000-00000000ea12', 4,
  '00000000-0000-0000-0000-00000000fb11', '00000000-0000-0000-0000-00000000fb12',
  '00000000-0000-0000-0000-00000000ca21', '00000000-0000-0000-0000-00000000ca22');
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000ba21'),
         null, 'SPLIT', '00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-00000000fb11'
  from generate_series(1, 21);
select complete_match('00000000-0000-0000-0000-00000000ba21');

select _mk_match('00000000-0000-0000-0000-00000000ba22', '00000000-0000-0000-0000-00000000ea12', 5,
  '00000000-0000-0000-0000-00000000fb21', '00000000-0000-0000-0000-00000000fb22',
  '00000000-0000-0000-0000-00000000ca21', '00000000-0000-0000-0000-00000000ca23');
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000ba22'),
         null, 'SPLIT', '00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-00000000fb22'
  from generate_series(1, 21);
select complete_match('00000000-0000-0000-0000-00000000ba22');

select is(
  (select tournament_points from group_standings('00000000-0000-0000-0000-00000000ea12') where player_id = '00000000-0000-0000-0000-00000000ca21'),
  2, 'Group B: pb1 has 2 points (1-1)'
);
select is(
  (select tournament_points from group_standings('00000000-0000-0000-0000-00000000ea12') where player_id = '00000000-0000-0000-0000-00000000ca23'),
  2, 'Group B: pb3 also has 2 points (1-0, tied with pb1)'
);
select is(
  (select rank from group_standings('00000000-0000-0000-0000-00000000ea12') where player_id = '00000000-0000-0000-0000-00000000ca23'),
  1, 'Group B: pb3 ranks above pb1 on head-to-head (beat pb1 directly)'
);
select is(
  (select rank from group_standings('00000000-0000-0000-0000-00000000ea12') where player_id = '00000000-0000-0000-0000-00000000ca21'),
  2, 'Group B: pb1 ranks 2nd despite equal points, losing the head-to-head'
);
select is(
  (select rank from group_standings('00000000-0000-0000-0000-00000000ea12') where player_id = '00000000-0000-0000-0000-00000000ca22'),
  3, 'Group B: pb2 ranks 3rd (0 points, not part of the tie)'
);

-- ============================================================================
-- GROUP C — 2-way tie on points, head-to-head UNAVAILABLE (pc1 and pc2
-- never played each other — both beat pc3 instead), resolved by aggregate
-- performance.
-- ============================================================================

insert into tournament_groups (id, stage_id, name) values
  ('00000000-0000-0000-0000-00000000ea13', '00000000-0000-0000-0000-00000000e401', 'Group C');
insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000ca31', 'PC One', 'pc1@standings.test'),
  ('00000000-0000-0000-0000-00000000ca32', 'PC Two', 'pc2@standings.test'),
  ('00000000-0000-0000-0000-00000000ca33', 'PC Three', 'pc3@standings.test');
insert into group_players (group_id, player_id) values
  ('00000000-0000-0000-0000-00000000ea13', '00000000-0000-0000-0000-00000000ca31'),
  ('00000000-0000-0000-0000-00000000ea13', '00000000-0000-0000-0000-00000000ca32'),
  ('00000000-0000-0000-0000-00000000ea13', '00000000-0000-0000-0000-00000000ca33');

-- pc1 beats pc3, 21-0, entirely via pc1 WINNER -> pc1 perf = 100.
select _mk_match('00000000-0000-0000-0000-00000000ba31', '00000000-0000-0000-0000-00000000ea13', 6,
  '00000000-0000-0000-0000-00000000fc11', '00000000-0000-0000-0000-00000000fc12',
  '00000000-0000-0000-0000-00000000ca31', '00000000-0000-0000-0000-00000000ca33');
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000ba31'),
         '00000000-0000-0000-0000-00000000ca31', 'WINNER', '00000000-0000-0000-0000-00000000b401',
         '00000000-0000-0000-0000-00000000fc11'
  from generate_series(1, 21);
select complete_match('00000000-0000-0000-0000-00000000ba31');

-- pc2 beats pc3, 21-10: 15 pc2-WINNER + 6 SPLIT for the 21; 8 SPLIT + 2
-- pc2-DROP for pc3's 10 -> pc2 winners=15, drops=2 -> normalized=13/17,
-- perf=88.2 (< pc1's 100).
select _mk_match('00000000-0000-0000-0000-00000000ba32', '00000000-0000-0000-0000-00000000ea13', 7,
  '00000000-0000-0000-0000-00000000fc21', '00000000-0000-0000-0000-00000000fc22',
  '00000000-0000-0000-0000-00000000ca32', '00000000-0000-0000-0000-00000000ca33');
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000ba32'),
         '00000000-0000-0000-0000-00000000ca32', 'WINNER', '00000000-0000-0000-0000-00000000b401',
         '00000000-0000-0000-0000-00000000fc21'
  from generate_series(1, 15);
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000ba32'),
         null, 'SPLIT', '00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-00000000fc21'
  from generate_series(1, 6);
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000ba32'),
         null, 'SPLIT', '00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-00000000fc22'
  from generate_series(1, 8);
insert into rallies (game_id, player_id, event_type, created_by, winning_team_id)
  select (select id from games where match_id = '00000000-0000-0000-0000-00000000ba32'),
         '00000000-0000-0000-0000-00000000ca32', 'DROP', '00000000-0000-0000-0000-00000000b401',
         '00000000-0000-0000-0000-00000000fc22'
  from generate_series(1, 2);
select complete_match('00000000-0000-0000-0000-00000000ba32');

select is(
  (select tournament_points from group_standings('00000000-0000-0000-0000-00000000ea13') where player_id = '00000000-0000-0000-0000-00000000ca31'),
  2, 'Group C: pc1 has 2 points'
);
select is(
  (select tournament_points from group_standings('00000000-0000-0000-0000-00000000ea13') where player_id = '00000000-0000-0000-0000-00000000ca32'),
  2, 'Group C: pc2 also has 2 points (tied, never played pc1)'
);
select is(
  (select aggregate_performance from group_standings('00000000-0000-0000-0000-00000000ea13') where player_id = '00000000-0000-0000-0000-00000000ca31'),
  100.0, 'Group C: pc1 aggregate_performance = 100 (all winners)'
);
select is(
  (select aggregate_performance from group_standings('00000000-0000-0000-0000-00000000ea13') where player_id = '00000000-0000-0000-0000-00000000ca32'),
  88.2, 'Group C: pc2 aggregate_performance = 88.2 (15 winners, 2 drops)'
);
select is(
  (select rank from group_standings('00000000-0000-0000-0000-00000000ea13') where player_id = '00000000-0000-0000-0000-00000000ca31'),
  1, 'Group C: pc1 ranks above pc2 on aggregate performance (H2H unavailable, never played)'
);
select is(
  (select rank from group_standings('00000000-0000-0000-0000-00000000ea13') where player_id = '00000000-0000-0000-0000-00000000ca32'),
  2, 'Group C: pc2 ranks 2nd'
);

-- ============================================================================
-- Qualification: compute, persist, override survives recompute.
-- ============================================================================

select lives_ok(
  $$ select compute_group_qualification('00000000-0000-0000-0000-00000000ea11') $$,
  'admin can compute qualification for Group A'
);
select is(
  (select player_id from group_qualifications where group_id = '00000000-0000-0000-0000-00000000ea11' and qualification_rank = 1),
  '00000000-0000-0000-0000-00000000ca11'::uuid,
  'Group A qualification rank 1 = pa1 (matches standings)'
);
select is(
  (select player_id from group_qualifications where group_id = '00000000-0000-0000-0000-00000000ea11' and qualification_rank = 2),
  '00000000-0000-0000-0000-00000000ca12'::uuid,
  'Group A qualification rank 2 = pa2'
);

-- Admin overrides rank 1 to pa3 (contradicting the computed standings —
-- that's the point of an override).
select override_group_qualification('00000000-0000-0000-0000-00000000ea11', '00000000-0000-0000-0000-00000000ca13', 1::smallint);
select is(
  (select player_id from group_qualifications where group_id = '00000000-0000-0000-0000-00000000ea11' and qualification_rank = 1),
  '00000000-0000-0000-0000-00000000ca13'::uuid,
  'override_group_qualification sets rank 1 to pa3'
);

select compute_group_qualification('00000000-0000-0000-0000-00000000ea11');
select is(
  (select player_id from group_qualifications where group_id = '00000000-0000-0000-0000-00000000ea11' and qualification_rank = 1),
  '00000000-0000-0000-0000-00000000ca13'::uuid,
  'recompute does not clobber the overridden rank 1'
);
select is(
  (select player_id from group_qualifications where group_id = '00000000-0000-0000-0000-00000000ea11' and qualification_rank = 2),
  '00000000-0000-0000-0000-00000000ca12'::uuid,
  'recompute leaves the non-overridden rank 2 correctly as pa2'
);

-- Authorization: scorer cannot compute or override qualification.
select test_login('00000000-0000-0000-0000-00000000a402');
set local role authenticated;

select throws_ok(
  $$ select compute_group_qualification('00000000-0000-0000-0000-00000000ea12') $$,
  'P0001', null, 'a scorer cannot compute group qualification'
);
select throws_ok(
  $$ select override_group_qualification('00000000-0000-0000-0000-00000000ea12', '00000000-0000-0000-0000-00000000ca21', 1::smallint) $$,
  'P0001', null, 'a scorer cannot override group qualification'
);
select throws_ok(
  $$ select * from group_standings('00000000-0000-0000-0000-00000000ea12') $$,
  'P0001', null, 'a scorer cannot call group_standings directly (SECURITY DEFINER bypasses their own RLS visibility)'
);

select finish();

rollback;
