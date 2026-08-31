-- ============================================================================
-- 0006_match_lifecycle.sql — Phase 5 dependency: transitioning a match
-- SCHEDULED -> LIVE and creating each game row.
--
-- GAP THIS FILLS
--   0002_rls_policies.sql's own design comment anticipated "Phase 4,
--   0003_functions.sql: start_match, complete_match, undo_last_rally" as
--   the three match-lifecycle RPCs — but TASKS.md's actual Phase 4 item
--   list (4.1-4.7) never included start_match, so it was never built.
--   Without it, a match can never leave SCHEDULED: scorers have no direct
--   UPDATE grant on `matches` (by design), and rallies_scorer_insert_
--   assigned_live's own check requires `m.status = 'LIVE'` — so no rally
--   could ever be recorded at all. Surfaced while building Phase 5 (the
--   scorer UI needs this to exist before "start scoring" can mean
--   anything). Same gap applies to `games`: scorer has SELECT only, so
--   creating the game 1 row (and game 2/3 for Bo3) also needs an RPC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- start_match(match_id) — SCHEDULED -> LIVE, creates game 1.
-- ----------------------------------------------------------------------------

create function start_match(p_match_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status;
  v_scorer_id uuid;
begin
  select status, scorer_id into v_status, v_scorer_id from matches where id = p_match_id;

  if v_status is null then
    raise exception 'match % not found', p_match_id;
  end if;

  if not is_admin() then
    if not is_scorer() or v_scorer_id is distinct from auth_profile_id() then
      raise exception 'not authorized to start this match';
    end if;
  end if;

  if v_status <> 'SCHEDULED' then
    raise exception 'match must be SCHEDULED to start (current status: %)', v_status;
  end if;

  update matches set status = 'LIVE', started_at = now() where id = p_match_id;

  insert into games (match_id, game_number, status) values (p_match_id, 1, 'IN_PROGRESS');
end;
$$;

revoke execute on function start_match(uuid) from public, anon, authenticated;
grant execute on function start_match(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- start_next_game(match_id) — Bo3 continuation (§29, TASKS.md 5.4): the
-- current game must be COMPLETED, the match must not already be decided
-- (calculate_match_result — that's complete_match's job instead), and the
-- next game_number must not exceed best_of.
-- ----------------------------------------------------------------------------

create function start_next_game(p_match_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status;
  v_scorer_id uuid;
  v_best_of smallint;
  v_current_game_number smallint;
  v_current_game_status game_status;
  v_result record;
begin
  select status, scorer_id, best_of into v_status, v_scorer_id, v_best_of
    from matches where id = p_match_id;

  if v_status is null then
    raise exception 'match % not found', p_match_id;
  end if;

  if not is_admin() then
    if not is_scorer() or v_scorer_id is distinct from auth_profile_id() then
      raise exception 'not authorized to start a game for this match';
    end if;
  end if;

  if v_status <> 'LIVE' then
    raise exception 'match must be LIVE to start another game (current status: %)', v_status;
  end if;

  select game_number, status into v_current_game_number, v_current_game_status
    from games where match_id = p_match_id
    order by game_number desc limit 1;

  if v_current_game_number is null then
    raise exception 'match % has no games yet — call start_match first', p_match_id;
  end if;

  if v_current_game_status <> 'COMPLETED' then
    raise exception 'current game must be COMPLETED before starting the next one';
  end if;

  if v_current_game_number >= v_best_of then
    raise exception 'match is already at its maximum game count (best_of %)', v_best_of;
  end if;

  select * into v_result from calculate_match_result(p_match_id);
  if v_result.winner_team_id is not null then
    raise exception 'match % is already decided — complete it instead of starting another game', p_match_id;
  end if;

  insert into games (match_id, game_number, status)
    values (p_match_id, v_current_game_number + 1, 'IN_PROGRESS');
end;
$$;

revoke execute on function start_next_game(uuid) from public, anon, authenticated;
grant execute on function start_next_game(uuid) to authenticated;
