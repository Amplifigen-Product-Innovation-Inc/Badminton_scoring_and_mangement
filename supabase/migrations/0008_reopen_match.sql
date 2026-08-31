-- ============================================================================
-- 0008_reopen_match.sql — Phase 6.4/§45/§46: "reopen match".
--
-- SCOPE NOTE
--   6.3 (temporary team creation) and the "creation" half of 6.4
--   (cross-category matches) needed no new backend code: teams/
--   match_participants are already match-scoped with no permanent team
--   entity anywhere in the schema (0001_init_schema.sql), and createMatch
--   (3.6) already accepts an arbitrary player list and a nullable group_id
--   — a cross-category match IS just a match with group_id = NULL, built
--   from whichever players an admin selects (qualified or not; the "must
--   be qualified" business rule belongs to the UI's player picker, not a
--   DB constraint — nothing in PRODUCT_SPEC.md says the database itself
--   should reject a non-qualified player, and doing so would make manual
--   corrections harder for no real benefit). cancelMatch already exists
--   from 3.6 and works on any match regardless of group_id.
--
--   The one piece with no existing counterpart anywhere is "reopen" — §45
--   lists it as an explicit cross-category dashboard action, and §46 lists
--   it as part of admin full editing power. Nothing currently reverses a
--   COMPLETED match back to LIVE, which matters because complete_match
--   (0005) has real side effects (ratings, history, tournament_player_stats)
--   that must be undone precisely, not just have the match's own status
--   flipped back.
--
-- reopen_match(match_id) — the reverse of complete_match, admin-only:
--   1. For each participant, undo their rating update using the exact
--      values complete_match itself recorded in player_rating_history
--      (previous_rating, match_performance) — reverting to a stored value
--      rather than re-deriving one avoids any drift between the forward
--      and reverse operations.
--   2. Reverse their tournament_player_stats contribution the same way:
--      recompute this match's winners/drops/splits (same aggregation
--      complete_match used) and subtract them back out; reverse the
--      running average using the same match_performance value from step 1.
--   3. Clear matches.status/completed_at/winner_team_id back to LIVE/NULL.
--   4. Never touches rallies/games — the reopened match's game history is
--      exactly as it was, ready for correction (edit rallies, add a
--      missing one, etc. — §46) and re-completion.
-- ============================================================================

create function reopen_match(p_match_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status;
  v_tournament_id uuid;
  v_old_winner_team_id uuid;
  v_participant record;
  v_history record;
  v_winners integer;
  v_drops integer;
  v_splits integer;
  v_was_won boolean;
  v_old_matches_played integer;
  v_old_avg numeric;
  v_new_avg numeric;
  v_new_matches_count integer;
  v_new_confidence rating_confidence_status;
  v_new_category_id uuid;
begin
  if not is_admin() then
    raise exception 'only an admin can reopen a match';
  end if;

  select status, tournament_id, winner_team_id
    into v_status, v_tournament_id, v_old_winner_team_id
    from matches where id = p_match_id;

  if v_status is null then
    raise exception 'match % not found', p_match_id;
  end if;
  if v_status <> 'COMPLETED' then
    raise exception 'match must be COMPLETED to reopen (current status: %)', v_status;
  end if;

  for v_participant in
    select mp.player_id, mp.team_id
    from match_participants mp
    where mp.match_id = p_match_id
  loop
    -- Step 1: undo the rating update, using the exact history row
    -- complete_match wrote — there should be exactly one per player per
    -- match (apply_player_rating_update is called once per participant,
    -- per completion).
    select id, previous_rating, match_performance into v_history
      from player_rating_history
      where match_id = p_match_id and player_id = v_participant.player_id
      order by created_at desc
      limit 1;

    if v_history.id is not null then
      select matches_count into v_new_matches_count
        from player_ratings where player_id = v_participant.player_id;
      v_new_matches_count := greatest(coalesce(v_new_matches_count, 1) - 1, 0);

      v_new_confidence := case
        when v_new_matches_count <= 2 then 'PROVISIONAL'
        when v_new_matches_count <= 5 then 'EMERGING'
        else 'ESTABLISHED'
      end;

      select id into v_new_category_id
        from rating_categories
        where v_history.previous_rating >= min_rating and v_history.previous_rating <= max_rating
        order by display_order
        limit 1;

      update player_ratings
        set rating = v_history.previous_rating,
            matches_count = v_new_matches_count,
            confidence_status = v_new_confidence,
            category_id = v_new_category_id
        where player_id = v_participant.player_id;

      delete from player_rating_history where id = v_history.id;
    end if;

    -- Step 2: reverse tournament_player_stats. Recompute this match's raw
    -- winners/drops (same as complete_match) and this match-wide SPLIT
    -- count (assumption 1, 0005_match_completion.sql).
    select
        count(*) filter (where r.event_type = 'WINNER'),
        count(*) filter (where r.event_type = 'DROP')
      into v_winners, v_drops
      from rallies r join games g on g.id = r.game_id
      where g.match_id = p_match_id and r.player_id = v_participant.player_id;

    select count(*) into v_splits
      from rallies r join games g on g.id = r.game_id
      where g.match_id = p_match_id and r.event_type = 'SPLIT';

    v_was_won := v_participant.team_id = v_old_winner_team_id;

    select matches_played, average_performance into v_old_matches_played, v_old_avg
      from tournament_player_stats
      where tournament_id = v_tournament_id and player_id = v_participant.player_id;

    if v_old_matches_played is not null and v_old_matches_played > 0 and v_history.id is not null then
      if v_old_matches_played - 1 <= 0 then
        v_new_avg := null;
      else
        v_new_avg := round(
          ((coalesce(v_old_avg, 0) * v_old_matches_played) - v_history.match_performance)
          / (v_old_matches_played - 1), 1);
      end if;

      update tournament_player_stats
        set matches_played = matches_played - 1,
            matches_won = matches_won - (case when v_was_won then 1 else 0 end),
            matches_lost = matches_lost - (case when v_was_won then 0 else 1 end),
            tournament_points = tournament_points - (case when v_was_won then 2 else 0 end),
            winning_shots = winning_shots - v_winners,
            drops = drops - v_drops,
            splits = splits - v_splits,
            average_performance = v_new_avg,
            tournament_rating = v_history.previous_rating
        where tournament_id = v_tournament_id and player_id = v_participant.player_id;
    end if;
  end loop;

  -- Step 3: the match itself, back to LIVE.
  update matches
    set status = 'LIVE', completed_at = null, winner_team_id = null
    where id = p_match_id;
end;
$$;

revoke execute on function reopen_match(uuid) from public, anon, authenticated;
grant execute on function reopen_match(uuid) to authenticated;
