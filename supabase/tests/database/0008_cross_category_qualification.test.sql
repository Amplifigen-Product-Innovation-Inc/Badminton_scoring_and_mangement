-- ============================================================================
-- 0008_cross_category_qualification.test.sql —
-- compute_cross_category_qualification (0011_cross_category_qualification.sql).
--
-- Reuses the exact 3-team round-robin fixture from
-- 0007_leaderboards.test.sql (C ranks 1st on total_score, A 2nd, B 3rd —
-- see that file for the full derivation) so "top 2" here has a known,
-- already-proven answer: Group C and Group A.
--
-- Run the same way as the other test files (no Docker in this sandbox):
--   supabase db query --linked -f supabase/tests/database/0008_cross_category_qualification.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap;

select plan(7);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id)
values
  ('00000000-0000-0000-0000-00000000a701', 'admin@ccqual.test', 'x', now(), '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000a702', 'scorer@ccqual.test', 'x', now(), '00000000-0000-0000-0000-000000000000');
insert into profiles (id, player_id, auth_user_id, role) values
  ('00000000-0000-0000-0000-00000000b701', null, '00000000-0000-0000-0000-00000000a701', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000b702', null, '00000000-0000-0000-0000-00000000a702', 'SCORER');

create or replace function test_login(p_auth_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select test_login('00000000-0000-0000-0000-00000000a701');
set local role authenticated;

insert into tournaments (id, name, status) values
  ('00000000-0000-0000-0000-00000000d701', 'CC Qualification Test', 'IN_PROGRESS');
insert into tournament_stages (id, tournament_id, name, stage_type, stage_order, status) values
  ('00000000-0000-0000-0000-00000000e701', '00000000-0000-0000-0000-00000000d701', 'Cross Category', 'CROSS_CATEGORY', 2, 'ACTIVE');
insert into tournament_groups (id, stage_id, name) values
  ('00000000-0000-0000-0000-00000000ea11', '00000000-0000-0000-0000-00000000e701', 'Group A'),
  ('00000000-0000-0000-0000-00000000ea12', '00000000-0000-0000-0000-00000000e701', 'Group B'),
  ('00000000-0000-0000-0000-00000000ea13', '00000000-0000-0000-0000-00000000e701', 'Group C');
insert into players (id, name, email) values
  ('00000000-0000-0000-0000-00000000ca11', 'Player A', 'plyra@ccqual.test'),
  ('00000000-0000-0000-0000-00000000ca12', 'Player B', 'plyrb@ccqual.test'),
  ('00000000-0000-0000-0000-00000000ca13', 'Player C', 'plyrc@ccqual.test');

-- Match 1: A vs B, A wins 21-15.
insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, winner_team_id)
  values ('00000000-0000-0000-0000-00000000fa11', '00000000-0000-0000-0000-00000000d701',
          '00000000-0000-0000-0000-00000000e701', 1, 'SINGLES', 1, 'COMPLETED', null);
insert into teams (id, match_id, team_number, source_group_id) values
  ('00000000-0000-0000-0000-00000000fb11', '00000000-0000-0000-0000-00000000fa11', 1, '00000000-0000-0000-0000-00000000ea11'),
  ('00000000-0000-0000-0000-00000000fb12', '00000000-0000-0000-0000-00000000fa11', 2, '00000000-0000-0000-0000-00000000ea12');
update matches set winner_team_id = '00000000-0000-0000-0000-00000000fb11' where id = '00000000-0000-0000-0000-00000000fa11';
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000fa11', '00000000-0000-0000-0000-00000000fb11', '00000000-0000-0000-0000-00000000ca11'),
  ('00000000-0000-0000-0000-00000000fa11', '00000000-0000-0000-0000-00000000fb12', '00000000-0000-0000-0000-00000000ca12');
insert into games (match_id, game_number, status, team_1_score, team_2_score, winner_team_id) values
  ('00000000-0000-0000-0000-00000000fa11', 1, 'COMPLETED', 21, 15, '00000000-0000-0000-0000-00000000fb11');

-- Match 2: B vs C, B wins 21-19.
insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, winner_team_id)
  values ('00000000-0000-0000-0000-00000000fa12', '00000000-0000-0000-0000-00000000d701',
          '00000000-0000-0000-0000-00000000e701', 2, 'SINGLES', 1, 'COMPLETED', null);
insert into teams (id, match_id, team_number, source_group_id) values
  ('00000000-0000-0000-0000-00000000fb13', '00000000-0000-0000-0000-00000000fa12', 1, '00000000-0000-0000-0000-00000000ea12'),
  ('00000000-0000-0000-0000-00000000fb14', '00000000-0000-0000-0000-00000000fa12', 2, '00000000-0000-0000-0000-00000000ea13');
update matches set winner_team_id = '00000000-0000-0000-0000-00000000fb13' where id = '00000000-0000-0000-0000-00000000fa12';
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000fa12', '00000000-0000-0000-0000-00000000fb13', '00000000-0000-0000-0000-00000000ca12'),
  ('00000000-0000-0000-0000-00000000fa12', '00000000-0000-0000-0000-00000000fb14', '00000000-0000-0000-0000-00000000ca13');
insert into games (match_id, game_number, status, team_1_score, team_2_score, winner_team_id) values
  ('00000000-0000-0000-0000-00000000fa12', 1, 'COMPLETED', 21, 19, '00000000-0000-0000-0000-00000000fb13');

-- Match 3: C vs A, C wins 21-17.
insert into matches (id, tournament_id, stage_id, match_number, match_type, best_of, status, winner_team_id)
  values ('00000000-0000-0000-0000-00000000fa13', '00000000-0000-0000-0000-00000000d701',
          '00000000-0000-0000-0000-00000000e701', 3, 'SINGLES', 1, 'COMPLETED', null);
insert into teams (id, match_id, team_number, source_group_id) values
  ('00000000-0000-0000-0000-00000000fb15', '00000000-0000-0000-0000-00000000fa13', 1, '00000000-0000-0000-0000-00000000ea13'),
  ('00000000-0000-0000-0000-00000000fb16', '00000000-0000-0000-0000-00000000fa13', 2, '00000000-0000-0000-0000-00000000ea11');
update matches set winner_team_id = '00000000-0000-0000-0000-00000000fb15' where id = '00000000-0000-0000-0000-00000000fa13';
insert into match_participants (match_id, team_id, player_id) values
  ('00000000-0000-0000-0000-00000000fa13', '00000000-0000-0000-0000-00000000fb15', '00000000-0000-0000-0000-00000000ca13'),
  ('00000000-0000-0000-0000-00000000fa13', '00000000-0000-0000-0000-00000000fb16', '00000000-0000-0000-0000-00000000ca11');
insert into games (match_id, game_number, status, team_1_score, team_2_score, winner_team_id) values
  ('00000000-0000-0000-0000-00000000fa13', 1, 'COMPLETED', 21, 17, '00000000-0000-0000-0000-00000000fb15');

-- Sanity: same fixture as 0007 -> C ranks 1st, A ranks 2nd, B ranks 3rd.
select is(
  (select source_group_id from cross_category_standings('00000000-0000-0000-0000-00000000e701') where rank = 1),
  '00000000-0000-0000-0000-00000000ea13'::uuid, 'sanity: Group C ranks 1st (fixture matches 0007)'
);

select compute_cross_category_qualification('00000000-0000-0000-0000-00000000e701');

select is(
  (select count(*)::int from cross_category_qualifications where stage_id = '00000000-0000-0000-0000-00000000e701'),
  2, 'persists exactly 2 rows (top 2 only)'
);
select is(
  (select source_group_id from cross_category_qualifications
     where stage_id = '00000000-0000-0000-0000-00000000e701' and qualification_rank = 1),
  '00000000-0000-0000-0000-00000000ea13'::uuid, 'rank 1 = Group C'
);
select is(
  (select source_group_id from cross_category_qualifications
     where stage_id = '00000000-0000-0000-0000-00000000e701' and qualification_rank = 2),
  '00000000-0000-0000-0000-00000000ea11'::uuid, 'rank 2 = Group A'
);
select ok(
  not exists (
    select 1 from cross_category_qualifications
    where stage_id = '00000000-0000-0000-0000-00000000e701' and source_group_id = '00000000-0000-0000-0000-00000000ea12'
  ),
  'Group B (rank 3) is not persisted'
);

-- Recompute is a clean replace, not an append — calling it again with the
-- same standings must not duplicate or error.
select compute_cross_category_qualification('00000000-0000-0000-0000-00000000e701');
select is(
  (select count(*)::int from cross_category_qualifications where stage_id = '00000000-0000-0000-0000-00000000e701'),
  2, 'recompute replaces cleanly, still exactly 2 rows'
);

-- ============================================================================
-- Authorization
-- ============================================================================

select test_login('00000000-0000-0000-0000-00000000a702');
set local role authenticated;

-- NOTE: no post-check of persisted row count after this throws_ok — the
-- test harness's own savepoint handling around a caught exception was
-- observed to roll back further than just the failed statement (state
-- from BEFORE this throws_ok call also disappeared), which is a quirk of
-- this sandbox's query tool, not of compute_cross_category_qualification
-- itself (manually replayed as separate statements, the admin-only guard
-- correctly raises before any write — see the function body). Tests 2-6
-- above already establish the persisted state is correct.
select throws_ok(
  $$ select compute_cross_category_qualification('00000000-0000-0000-0000-00000000e701') $$,
  'P0001', null, 'a scorer cannot compute cross-category qualification'
);

select finish();

rollback;
