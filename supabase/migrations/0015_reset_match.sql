-- ============================================================================
-- 0015_reset_match.sql — "Reset match": wipes all rallies/games for a
-- match and returns it to a fresh SCHEDULED state, keeping teams/players
-- assigned. Distinct from reopen_match (0008_reopen_match.sql), which
-- reverses a COMPLETED match back to LIVE while KEEPING its rally
-- history for correction — Reset is for the opposite case: the match was
-- scored so wrong that starting over is faster than correcting
-- individual rallies.
--
-- Admin-only — strictly more destructive than reopen_match (which is
-- already admin-only), since it discards rally history irrecoverably.
-- No reason to be less restrictive than the operation it's a superset of.
-- ============================================================================

create function reset_match(p_match_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status;
begin
  if not is_admin() then
    raise exception 'only an admin can reset a match';
  end if;

  select status into v_status from matches where id = p_match_id;
  if v_status is null then
    raise exception 'match % not found', p_match_id;
  end if;

  -- Reuse reopen_match's own rating/tournament_player_stats undo logic
  -- rather than reimplementing it — a COMPLETED match's side effects must
  -- be precisely reversed before its rallies disappear (reopen_match
  -- reads them to compute what to undo).
  if v_status = 'COMPLETED' then
    perform reopen_match(p_match_id);
  end if;

  -- Delete rallies FIRST, explicitly — not by relying on the games->
  -- rallies cascade. rallies_apply_to_game's AFTER DELETE trigger calls
  -- recompute_game_score(old.game_id) per deleted rally, which needs the
  -- game row to still exist; deleting games first would cascade-delete
  -- rallies while (or after) their own game rows are already gone,
  -- and recompute_game_score raises "game % not found" for a game_id
  -- that no longer exists.
  delete from rallies where game_id in (select id from games where match_id = p_match_id);
  delete from games where match_id = p_match_id;

  update matches
    set status = 'SCHEDULED',
        started_at = null,
        completed_at = null,
        winner_team_id = null
    where id = p_match_id;
end;
$$;

revoke execute on function reset_match(uuid) from public, anon, authenticated;
grant execute on function reset_match(uuid) to authenticated;
