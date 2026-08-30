-- ============================================================================
-- 0005_match_completion.sql — Phase 4.4-4.7 (TASKS.md): individual
-- performance, rating update, confidence/category, match completion
-- orchestration (§29-38, §70).
--
-- ASSUMPTIONS NOT FULLY SPECIFIED IN PRODUCT_SPEC.md — documented rather
-- than silently guessed, so they're easy to revisit:
--
--   1. SPLIT rallies have no player_id (§27), so a per-player "splits"
--      count (§37's tournament_player_stats.splits) can't mean "splits
--      caused by this player" the way winners/drops do. Treated instead as
--      "SPLIT rallies that occurred in games this player took part in" —
--      every participant of a match is credited with that match's total
--      SPLIT count. Doesn't affect scoring/rating (§30 already excludes
--      SPLIT from normalized_performance), only the display/tracking stat.
--
--   2. A player with zero WINNER+DROP rallies in an entire match (only
--      SPLITs) has an undefined normalized_performance (§30's formula
--      divides by winners+drops). §70's tie-break rule handles this by
--      skipping to the next rule — but §33 says rating updates
--      unconditionally after "each completed match", so skipping isn't an
--      option here. Falls back to a neutral performance_score of 50 (the
--      same "no signal either way" value §31's own formula maps 0.0
--      normalized performance to), so match_performance still reflects
--      the win/loss component honestly rather than being undefined.
--
--   3. tournament_player_stats.tournament_rating (§37) is read as "this
--      player's current (global) rating, as of their last match in this
--      tournament" — not a separately-computed tournament-scoped rating
--      system (§36 keeps tournament points and rating explicitly separate,
--      but doesn't describe a second rating scale).
--
--   4. tournament_player_stats.average_performance (§37) averages the
--      blended Match Performance (§32, 80/20 individual+result) — matching
--      that section's naming — not the raw per-match Individual
--      Performance Score (§31) before the win/loss blend.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- calculate_match_result(match_id) — determines whether a match's win
-- condition (§29, Bo1/Bo3 = first to ceil(best_of/2) games) has actually
-- been met yet, and if so, which team won. Returns NULL winner_team_id
-- when not yet decided (caller decides what to do with that — complete_match
-- below raises rather than completing early).
-- ----------------------------------------------------------------------------

create function calculate_match_result(p_match_id uuid)
returns table (winner_team_id uuid, team1_games_won integer, team2_games_won integer)
language plpgsql security definer set search_path = public as $$
declare
  v_best_of smallint;
  v_games_needed smallint;
  v_team1_id uuid;
  v_team2_id uuid;
  v_team1_wins integer;
  v_team2_wins integer;
begin
  select m.best_of into v_best_of from matches m where m.id = p_match_id;
  if v_best_of is null then
    raise exception 'match % not found', p_match_id;
  end if;
  v_games_needed := ceil(v_best_of::numeric / 2);

  select id into v_team1_id from teams where match_id = p_match_id and team_number = 1;
  select id into v_team2_id from teams where match_id = p_match_id and team_number = 2;

  -- Table alias required: the OUT parameter above is also named
  -- winner_team_id, and PL/pgSQL would otherwise resolve the bare column
  -- reference against that instead of games.winner_team_id.
  select count(*) into v_team1_wins from games g
    where g.match_id = p_match_id and g.status = 'COMPLETED' and g.winner_team_id = v_team1_id;
  select count(*) into v_team2_wins from games g
    where g.match_id = p_match_id and g.status = 'COMPLETED' and g.winner_team_id = v_team2_id;

  team1_games_won := v_team1_wins;
  team2_games_won := v_team2_wins;

  if v_team1_wins >= v_games_needed then
    winner_team_id := v_team1_id;
  elsif v_team2_wins >= v_games_needed then
    winner_team_id := v_team2_id;
  else
    winner_team_id := null;
  end if;

  return next;
end;
$$;

revoke execute on function calculate_match_result(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- calculate_player_match_performance(match_id, player_id) — §30-31.
-- Aggregates WINNER/DROP rallies for this player across every game in the
-- match (a Bo3 match's performance is match-wide, not per-game). Returns
-- NULL when winners+drops=0 (see assumption 2 above for how callers should
-- treat that).
-- ----------------------------------------------------------------------------

create function calculate_player_match_performance(p_match_id uuid, p_player_id uuid)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_winners integer;
  v_drops integer;
  v_normalized numeric;
begin
  select
      count(*) filter (where r.event_type = 'WINNER'),
      count(*) filter (where r.event_type = 'DROP')
    into v_winners, v_drops
    from rallies r
    join games g on g.id = r.game_id
    where g.match_id = p_match_id and r.player_id = p_player_id;

  if v_winners + v_drops = 0 then
    return null;
  end if;

  v_normalized := (v_winners - v_drops)::numeric / (v_winners + v_drops);
  return round((v_normalized + 1) * 50, 1);
end;
$$;

revoke execute on function calculate_player_match_performance(uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- apply_player_rating_update(player_id, match_performance, tournament_id,
-- match_id) — §33-35. Upserts player_ratings (80/20 rolling blend, clamped
-- 0-100), appends one player_rating_history row (§61 — never overwritten),
-- and derives confidence (§34) and category (§35, editable thresholds —
-- never hard-coded). Returns the new rating for the caller to fold into
-- tournament_player_stats without a second read.
-- ----------------------------------------------------------------------------

create function apply_player_rating_update(
  p_player_id uuid,
  p_match_performance numeric,
  p_tournament_id uuid,
  p_match_id uuid
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_previous_rating numeric;
  v_matches_count integer;
  v_new_rating numeric;
  v_new_matches_count integer;
  v_new_confidence rating_confidence_status;
  v_new_category_id uuid;
begin
  select rating, matches_count into v_previous_rating, v_matches_count
    from player_ratings where player_id = p_player_id;

  if v_previous_rating is null then
    v_previous_rating := 50; -- §33: new players start at 50
    v_matches_count := 0;
  end if;

  v_new_rating := least(100, greatest(0, v_previous_rating * 0.8 + p_match_performance * 0.2));
  v_new_rating := round(v_new_rating, 2);
  v_new_matches_count := v_matches_count + 1;

  v_new_confidence := case
    when v_new_matches_count <= 2 then 'PROVISIONAL'
    when v_new_matches_count <= 5 then 'EMERGING'
    else 'ESTABLISHED'
  end;

  select id into v_new_category_id
    from rating_categories
    where v_new_rating >= min_rating and v_new_rating <= max_rating
    order by display_order
    limit 1;

  insert into player_ratings (player_id, rating, category_id, matches_count, confidence_status)
    values (p_player_id, v_new_rating, v_new_category_id, v_new_matches_count, v_new_confidence)
    on conflict (player_id) do update
      set rating = excluded.rating,
          category_id = excluded.category_id,
          matches_count = excluded.matches_count,
          confidence_status = excluded.confidence_status;

  insert into player_rating_history
    (player_id, tournament_id, match_id, previous_rating, match_performance, new_rating)
    values (p_player_id, p_tournament_id, p_match_id, v_previous_rating, p_match_performance, v_new_rating);

  return v_new_rating;
end;
$$;

revoke execute on function apply_player_rating_update(uuid, numeric, uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- complete_match(match_id) — §29 steps 1-9, the single entry point that
-- runs the whole thing atomically (one PL/pgSQL function = one transaction,
-- unlike application-level multi-statement inserts elsewhere in this
-- codebase — see the comment on createMatch's compensating delete in
-- src/app/admin/tournaments/match-actions.ts for the contrast).
--
-- SECURITY DEFINER, with its own authorization check (same shape as
-- undo_last_rally): admin may complete anything; a scorer only their own
-- assigned LIVE match.
-- ----------------------------------------------------------------------------

create function complete_match(p_match_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match_status match_status;
  v_scorer_id uuid;
  v_tournament_id uuid;
  v_result record;
  v_participant record;
  v_performance numeric;
  v_match_result_component numeric;
  v_match_performance numeric;
  v_new_rating numeric;
  v_winners integer;
  v_drops integer;
  v_splits integer;
  v_won boolean;
  v_old_matches_played integer;
  v_old_avg numeric;
begin
  select status, scorer_id, tournament_id into v_match_status, v_scorer_id, v_tournament_id
    from matches where id = p_match_id;

  if v_match_status is null then
    raise exception 'match % not found', p_match_id;
  end if;

  if not is_admin() then
    if not is_scorer() or v_scorer_id is distinct from auth_profile_id() then
      raise exception 'not authorized to complete this match';
    end if;
  end if;

  if v_match_status <> 'LIVE' then
    raise exception 'match must be LIVE to complete (current status: %)', v_match_status;
  end if;

  select * into v_result from calculate_match_result(p_match_id);
  if v_result.winner_team_id is null then
    raise exception 'match % has not been won yet (best_of not satisfied)', p_match_id;
  end if;

  -- Step 1: lock. Step 3: determine winner (already computed above).
  update matches
    set status = 'COMPLETED', completed_at = now(), winner_team_id = v_result.winner_team_id
    where id = p_match_id;

  -- Steps 2, 4-8: per participant.
  for v_participant in
    select mp.player_id, mp.team_id
    from match_participants mp
    where mp.match_id = p_match_id
  loop
    -- Step 2: individual performance (§30-31).
    v_performance := calculate_player_match_performance(p_match_id, v_participant.player_id);
    v_won := v_participant.team_id = v_result.winner_team_id;

    if v_performance is null then
      v_performance := 50; -- assumption 2, see file header
    end if;

    -- §32: blend with match result (win=100, loss=0).
    v_match_result_component := case when v_won then 100 else 0 end;
    v_match_performance := round(v_performance * 0.8 + v_match_result_component * 0.2, 1);

    -- Steps 6-7: rating + confidence/category (§33-35).
    v_new_rating := apply_player_rating_update(
      v_participant.player_id, v_match_performance, v_tournament_id, p_match_id
    );

    -- Raw winners/drops for this player, this match (recomputed, not
    -- reusing calculate_player_match_performance's internals, since that
    -- function returns the normalized score, not the raw counts).
    select
        count(*) filter (where r.event_type = 'WINNER'),
        count(*) filter (where r.event_type = 'DROP')
      into v_winners, v_drops
      from rallies r join games g on g.id = r.game_id
      where g.match_id = p_match_id and r.player_id = v_participant.player_id;

    -- Match-wide SPLIT count, shared across all participants — assumption 1.
    select count(*) into v_splits
      from rallies r join games g on g.id = r.game_id
      where g.match_id = p_match_id and r.event_type = 'SPLIT';

    -- Step 5 + step 8: tournament points + tournament_player_stats (§13, §37).
    select matches_played, average_performance into v_old_matches_played, v_old_avg
      from tournament_player_stats
      where tournament_id = v_tournament_id and player_id = v_participant.player_id;

    if v_old_matches_played is null then
      v_old_matches_played := 0;
      v_old_avg := 0;
    end if;

    insert into tournament_player_stats (
      tournament_id, player_id, matches_played, matches_won, matches_lost,
      tournament_points, winning_shots, drops, splits, average_performance, tournament_rating
    ) values (
      v_tournament_id, v_participant.player_id, 1,
      case when v_won then 1 else 0 end,
      case when v_won then 0 else 1 end,
      case when v_won then 2 else 0 end, -- §13: Matches Won x 2, no participation points
      v_winners, v_drops, v_splits,
      v_match_performance,
      v_new_rating
    )
    on conflict (tournament_id, player_id) do update
      set matches_played = tournament_player_stats.matches_played + 1,
          matches_won = tournament_player_stats.matches_won + (case when v_won then 1 else 0 end),
          matches_lost = tournament_player_stats.matches_lost + (case when v_won then 0 else 1 end),
          tournament_points = tournament_player_stats.tournament_points + (case when v_won then 2 else 0 end),
          winning_shots = tournament_player_stats.winning_shots + v_winners,
          drops = tournament_player_stats.drops + v_drops,
          splits = tournament_player_stats.splits + v_splits,
          average_performance =
            round(((coalesce(v_old_avg, 0) * v_old_matches_played) + v_match_performance)
                  / (v_old_matches_played + 1), 1),
          tournament_rating = v_new_rating;
  end loop;

  -- Step 9: raw rally data untouched — this function never writes to
  -- `rallies` at all.
end;
$$;

revoke execute on function complete_match(uuid) from public, anon, authenticated;
grant execute on function complete_match(uuid) to authenticated;
