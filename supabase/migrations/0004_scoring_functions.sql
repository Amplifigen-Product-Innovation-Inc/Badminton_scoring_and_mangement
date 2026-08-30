-- ============================================================================
-- 0004_scoring_functions.sql — Phase 4.1-4.3 (TASKS.md): rally recording,
-- badminton score update (deuce/cap per §70), and undo.
--
-- SPLIT SCORING DESIGN DECISION
--   §27 requires `player_id = NULL` for a SPLIT rally (no individual
--   attribution), but also says "the rally still counts toward the actual
--   badminton score" (§27/§28). With no player to infer a team from, there
--   was no column anywhere recording which team a SPLIT rally's point goes
--   to. Resolved (user decision) by adding `rallies.winning_team_id`,
--   always required, independent of player attribution:
--     WINNER -> must equal the scoring player's own team (they won the point)
--     DROP   -> must equal the OPPOSING team (their unforced error gives the
--               point away)
--     SPLIT  -> no player to check against; the scorer records the team
--               directly (any of the match's two teams)
--   Enforced below by the validate_rally() trigger — a data-integrity
--   guard on every write (including admin corrections), separate from RLS's
--   job of gating WHICH match/game a given caller may write to at all
--   (0002_rls_policies.sql).
--
-- SCORE AS DERIVED STATE
--   games.team_1_score/team_2_score/winner_team_id/status are never
--   hand-computed incrementally — recompute_game_score() always recomputes
--   them fresh from the raw rallies for that game (§46/§47: never trust a
--   stored total as source of truth). It's called automatically after every
--   rally insert/delete (trigger below), by undo_last_rally() (4.3), and is
--   the same function a future admin "Recalculate" action (7.5) can reuse
--   without new logic.
--
-- "LAST RALLY" NEEDS A REAL ORDERING COLUMN
--   undo_last_rally (§53/4.3) needs to unambiguously find "the most
--   recently recorded rally" for a game. `created_at timestamptz` is NOT
--   reliable for that: it's `now()`, which is the transaction start time in
--   Postgres, not per-statement — any bulk/multi-row insert (and, in
--   principle, two individual inserts landing in the same transaction or
--   the same clock tick) can share an identical value with no defined tie-
--   break. `sequence_number` is a real identity column, guaranteed strictly
--   increasing in insertion order regardless of timestamp collisions.
-- ============================================================================

alter table rallies
  add column winning_team_id uuid not null references teams (id) on delete restrict,
  add column sequence_number bigint generated always as identity;

create index rallies_winning_team_id_idx on rallies (winning_team_id);
create index rallies_game_id_sequence_idx on rallies (game_id, sequence_number);

-- ----------------------------------------------------------------------------
-- validate_rally() — BEFORE INSERT/UPDATE. See design note above.
--
-- SECURITY DEFINER (matching auth_profile_id()/is_admin() in
-- 0002_rls_policies.sql): this is a data-integrity check, not an
-- authorization one, so its internal lookups must see the real
-- games/teams/match_participants rows regardless of the calling scorer's
-- own RLS visibility. Without this, a scorer inserting into a match that
-- isn't theirs would have its `games`/`teams` SELECTs return nothing (RLS
-- hides those rows from them), making this trigger raise a false "game not
-- found" instead of correctly falling through to RLS's own 42501 rejection
-- on the actual authorization check.
-- ----------------------------------------------------------------------------

create function validate_rally() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_match_id uuid;
  v_player_team_id uuid;
  v_other_team_id uuid;
  v_valid_team_ids uuid[];
begin
  select match_id into v_match_id from games where id = new.game_id;
  if v_match_id is null then
    raise exception 'rallies.game_id % does not reference an existing game', new.game_id;
  end if;

  select array_agg(id) into v_valid_team_ids from teams where match_id = v_match_id;
  if v_valid_team_ids is null or not (new.winning_team_id = any(v_valid_team_ids)) then
    raise exception 'winning_team_id % is not one of match %''s teams', new.winning_team_id, v_match_id;
  end if;

  if new.event_type in ('WINNER', 'DROP') then
    select team_id into v_player_team_id
      from match_participants
      where match_id = v_match_id and player_id = new.player_id;

    if v_player_team_id is null then
      raise exception 'player % is not a participant in match %', new.player_id, v_match_id;
    end if;

    select id into v_other_team_id from teams
      where match_id = v_match_id and id <> v_player_team_id;

    if new.event_type = 'WINNER' and new.winning_team_id <> v_player_team_id then
      raise exception 'WINNER rally must credit the scoring player''s own team (%), got %',
        v_player_team_id, new.winning_team_id;
    end if;

    if new.event_type = 'DROP' and new.winning_team_id <> v_other_team_id then
      raise exception 'DROP rally must credit the opposing team (%), got %',
        v_other_team_id, new.winning_team_id;
    end if;
  end if;
  -- SPLIT: player_id is NULL (enforced by the existing
  -- rallies_split_has_no_player CHECK), so there's no player/team
  -- consistency to verify beyond winning_team_id already being one of this
  -- match's two teams, checked above.

  return new;
end;
$$;

create trigger rallies_validate
  before insert or update on rallies
  for each row execute function validate_rally();

-- Trigger-only: PostgreSQL grants EXECUTE to PUBLIC by default on every new
-- function, which PostgREST/Supabase would otherwise expose as a directly
-- callable RPC (even to anon) — revoke it. Doesn't affect the trigger
-- itself: firing a trigger doesn't go through the invoking role's own
-- EXECUTE grant on the function (CREATE TRIGGER checks that once, at
-- creation time, not on every firing).
-- Supabase's default privileges grant EXECUTE directly to anon/authenticated
-- on every new function (separate from the PUBLIC grant) — both must be
-- revoked explicitly, or the function stays reachable via PostgREST's
-- /rest/v1/rpc/<name> despite "revoke ... from public" doing nothing here.
revoke execute on function validate_rally() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- recompute_game_score(game_id) — see design note above. SECURITY DEFINER
-- for the same reason as validate_rally(): its cross-table lookups
-- (games/matches/tournaments/teams/rallies) must not depend on the calling
-- role's own RLS visibility, since it's invoked from an AFTER trigger that
-- fires for every role (scorer, admin) and, later, from undo_last_rally().
-- ----------------------------------------------------------------------------

create function recompute_game_score(p_game_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match_id uuid;
  v_team1_id uuid;
  v_team2_id uuid;
  v_team1_score integer;
  v_team2_score integer;
  v_target smallint;
  v_win_by smallint;
  v_max smallint;
  v_winner_team_id uuid;
  v_status game_status;
begin
  select g.match_id, t.target_score, t.win_by, t.max_score
    into v_match_id, v_target, v_win_by, v_max
    from games g
    join matches m on m.id = g.match_id
    join tournaments t on t.id = m.tournament_id
    where g.id = p_game_id;

  if v_match_id is null then
    raise exception 'game % not found', p_game_id;
  end if;

  select id into v_team1_id from teams where match_id = v_match_id and team_number = 1;
  select id into v_team2_id from teams where match_id = v_match_id and team_number = 2;

  select
      count(*) filter (where winning_team_id = v_team1_id),
      count(*) filter (where winning_team_id = v_team2_id)
    into v_team1_score, v_team2_score
    from rallies
    where game_id = p_game_id;

  v_winner_team_id := null;
  v_status := 'IN_PROGRESS';

  -- Cap takes priority: reaching max_score always wins outright (§70 —
  -- e.g. 30-29 is a valid win despite only a 1-point lead), regardless of
  -- whether the win-by requirement below would otherwise be satisfied.
  if v_team1_score >= v_max or v_team2_score >= v_max then
    v_winner_team_id := case when v_team1_score > v_team2_score then v_team1_id else v_team2_id end;
    v_status := 'COMPLETED';
  elsif (v_team1_score >= v_target or v_team2_score >= v_target)
        and abs(v_team1_score - v_team2_score) >= v_win_by then
    v_winner_team_id := case when v_team1_score > v_team2_score then v_team1_id else v_team2_id end;
    v_status := 'COMPLETED';
  end if;

  update games
    set team_1_score = v_team1_score,
        team_2_score = v_team2_score,
        winner_team_id = v_winner_team_id,
        status = v_status
    where id = p_game_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Keep games in sync automatically on every rally write, whatever the path
-- (scorer INSERT, admin correction UPDATE/DELETE, undo_last_rally below).
--
-- SECURITY DEFINER matters here for a subtler reason than validate_rally()'s
-- (RLS visibility): a plain SECURITY INVOKER function's *nested* calls to
-- another function are checked against the CURRENT caller's own EXECUTE
-- grant, even when the outer function was itself invoked as a trigger (the
-- "no EXECUTE grant needed to fire a trigger" exemption only covers this
-- function's own invocation, not what it calls next). Since
-- recompute_game_score()'s direct-RPC EXECUTE is revoked from
-- anon/authenticated below (it must not be callable directly), this
-- wrapper has to run as its owner so the nested call still succeeds for a
-- scorer's own rally insert.
-- ----------------------------------------------------------------------------

create function trigger_recompute_game_score() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform recompute_game_score(old.game_id);
    return old;
  else
    perform recompute_game_score(new.game_id);
    return new;
  end if;
end;
$$;

create trigger rallies_apply_to_game
  after insert or update or delete on rallies
  for each row execute function trigger_recompute_game_score();

-- Both trigger-only, same reasoning as validate_rally() above.
-- recompute_game_score() in particular does no authorization check of its
-- own (it's meant to run only from this trigger, or in future from a
-- higher-level admin-gated "Recalculate" RPC that wraps it, per TASKS.md
-- 7.5) — it must not be directly callable by anyone.
revoke execute on function trigger_recompute_game_score() from public, anon, authenticated;
revoke execute on function recompute_game_score(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- undo_last_rally(game_id) — §53/4.3. SECURITY DEFINER so it can perform
-- the DELETE regardless of the caller's own RLS grants (scorer has no
-- DELETE policy on rallies at all, by design — see 0002's comment on this
-- table), while doing its own authorization check internally: admin may
-- undo anything; a scorer may only undo the most recent rally of their own
-- currently-LIVE assigned match, and only a rally they themselves created
-- (redundant with how RLS's insert policy already ties created_by to the
-- inserting scorer, but checked explicitly here too in case a match is ever
-- reassigned to a different scorer mid-match).
-- ----------------------------------------------------------------------------

create function undo_last_rally(p_game_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match_id uuid;
  v_match_status match_status;
  v_scorer_id uuid;
  v_rally_id uuid;
  v_rally_created_by uuid;
begin
  select m.id, m.status, m.scorer_id
    into v_match_id, v_match_status, v_scorer_id
    from games g
    join matches m on m.id = g.match_id
    where g.id = p_game_id;

  if v_match_id is null then
    raise exception 'game % not found', p_game_id;
  end if;

  select id, created_by into v_rally_id, v_rally_created_by
    from rallies
    where game_id = p_game_id
    order by sequence_number desc
    limit 1;

  if v_rally_id is null then
    raise exception 'no rallies to undo for game %', p_game_id;
  end if;

  if not is_admin() then
    if not is_scorer() or v_scorer_id is distinct from auth_profile_id() then
      raise exception 'not authorized to undo rallies for this match';
    end if;
    if v_match_status <> 'LIVE' then
      raise exception 'match is not LIVE — cannot undo';
    end if;
    if v_rally_created_by is distinct from auth_profile_id() then
      raise exception 'cannot undo a rally you did not record';
    end if;
  end if;

  delete from rallies where id = v_rally_id;
  -- games.team_1_score/team_2_score/winner_team_id/status resync
  -- automatically via rallies_apply_to_game (AFTER DELETE).
end;
$$;

revoke execute on function undo_last_rally(uuid) from public, anon, authenticated;
grant execute on function undo_last_rally(uuid) to authenticated;
