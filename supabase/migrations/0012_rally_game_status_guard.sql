-- ============================================================================
-- 0012_rally_game_status_guard.sql — fixes a real scoring bug: a match's
-- score could reach an impossible state (e.g. 29-24, a 5-point gap that
-- can never legitimately arise under win-by-2 scoring — the leading side
-- would already have won around 21-19).
--
-- ROOT CAUSE
--   validate_rally() never checked games.status before allowing an INSERT.
--   The ONLY place that gate existed was the scorer's own RLS insert policy
--   (rallies_scorer_insert_assigned_live, 0002_rls_policies.sql), which
--   requires g.status = 'IN_PROGRESS' — but:
--     1. rallies_admin_all is a full-CRUD `for all` policy with no status
--        gate at all, so any admin-role write (a correction, a bug, a
--        script) could insert extra rallies into an already-COMPLETED
--        game, and recompute_game_score would happily recompute past the
--        real stopping point.
--     2. Even the scorer's own RLS check has a TOCTOU race: it re-reads
--        games.status per INSERT statement with no row lock taken first,
--        so two near-simultaneous inserts (e.g. a fast double-tap) can
--        both read status = 'IN_PROGRESS' before either one's own
--        trigger-driven UPDATE to games.status has committed.
--
-- FIX
--   Move the status gate into validate_rally() itself — a BEFORE INSERT
--   trigger that fires for every role, closing gap #1 — and take a
--   `for update` lock on the game row as part of that same check, closing
--   gap #2 for the SQL side of the race window (both concurrent inserts
--   now serialize on that lock; the second one re-reads the post-first-
--   commit status and correctly sees it's no longer IN_PROGRESS, once the
--   first insert's trigger has updated it — this does depend on
--   recompute_game_score's UPDATE happening within the same transaction as
--   the validating INSERT, which it already does, since both run inside
--   Postgres's single-statement-plus-triggers execution).
--
--   Only applied to INSERT — an UPDATE to an existing rally row must stay
--   legal even in a since-completed game, since that's exactly the
--   documented admin correction flow (reopen_match brings the match back
--   to LIVE for editing, but leaves the game's own last-computed status
--   as whatever it already was; the rally rows being corrected already
--   exist, this trigger only gates new insertions).
-- ============================================================================

create or replace function validate_rally() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_match_id uuid;
  v_game_status game_status;
  v_player_team_id uuid;
  v_other_team_id uuid;
  v_valid_team_ids uuid[];
begin
  select match_id, status into v_match_id, v_game_status
    from games where id = new.game_id
    for update;

  if v_match_id is null then
    raise exception 'rallies.game_id % does not reference an existing game', new.game_id;
  end if;

  if tg_op = 'INSERT' and v_game_status <> 'IN_PROGRESS' then
    raise exception 'cannot record a rally into game % — status is %, not IN_PROGRESS',
      new.game_id, v_game_status;
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
