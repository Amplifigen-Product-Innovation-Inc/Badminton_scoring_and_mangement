-- ============================================================================
-- 0009_leaderboards.sql — cross-category standings + global player
-- leaderboard, per user request while using the deployed app.
--
-- CROSS-CATEGORY STANDINGS DESIGN
--   A cross-category match's two teams are qualified pairs from different
--   groups (§17/§45). teams has no persistent identity across matches
--   (0001_init_schema.sql: "no permanent team table/entity anywhere in the
--   schema") — "Team A" playing two round-robin matches produces two
--   separate `teams` rows, one per match. teams.source_group_id is what
--   ties them back together: both rows for "the pair that qualified from
--   Group A" carry the same source_group_id, so grouping by it recovers
--   the team's identity across its matches without needing one.
--
--   This only works if each team's source_group_id is actually set to ITS
--   OWN originating group — createMatch previously applied one groupId to
--   both teams uniformly (fine for group-stage matches, wrong for cross-
--   category ones). Fixed alongside this migration:
--   src/lib/validation/match.ts / match-actions.ts now accept optional
--   per-team team1SourceGroupId/team2SourceGroupId, falling back to the
--   match-level groupId when omitted (backward compatible with the
--   existing group-stage flow).
--
--   Scoring (user-specified): 2 points per win, 0 per loss/unplayed.
--   Tie-break: total badminton points SCORED across all of a team's
--   matches (not differential) — summed straight from games.team_N_score
--   for whichever side that team was on in each game.
-- ============================================================================

create function cross_category_standings(p_stage_id uuid)
returns table (
  source_group_id uuid,
  team_label text,
  player_names text,
  played integer,
  won integer,
  lost integer,
  points integer,
  total_score integer,
  rank integer
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'only an admin can view cross-category standings';
  end if;

  return query
  with stage_matches as (
    select m.id, m.winner_team_id
    from matches m
    where m.stage_id = p_stage_id and m.status = 'COMPLETED'
  ),
  team_appearances as (
    -- One row per (source_group_id, match, team) — a team's own row in
    -- that match, plus which team it played and beat/lost to.
    select
      t.source_group_id,
      sm.id as match_id,
      t.id as team_id,
      (t.id = sm.winner_team_id) as won
    from stage_matches sm
    join teams t on t.match_id = sm.id
    where t.source_group_id is not null
  ),
  scores as (
    select
      ta.source_group_id,
      ta.match_id,
      ta.team_id,
      ta.won,
      -- Whichever of the match's two games-score columns belongs to this
      -- team, summed across every game in the match (Bo3-safe).
      sum(case when tm.team_number = 1 then g.team_1_score else g.team_2_score end) as scored
    from team_appearances ta
    join teams tm on tm.id = ta.team_id
    join games g on g.match_id = ta.match_id
    group by ta.source_group_id, ta.match_id, ta.team_id, ta.won
  )
  select
    tg.id as source_group_id,
    coalesce(tg.name, 'Unassigned') as team_label,
    (
      select string_agg(distinct p.name, ' / ' order by p.name)
      from teams t2
      join match_participants mp on mp.team_id = t2.id
      join players p on p.id = mp.player_id
      where t2.source_group_id = tg.id
    ) as player_names,
    coalesce(agg.played, 0) as played,
    coalesce(agg.won, 0) as won,
    coalesce(agg.played, 0) - coalesce(agg.won, 0) as lost,
    coalesce(agg.won, 0) * 2 as points,
    coalesce(agg.total_score, 0) as total_score,
    (row_number() over (
      order by coalesce(agg.won, 0) * 2 desc, coalesce(agg.total_score, 0) desc
    ))::integer as rank
  from (select distinct scores.source_group_id from scores) sg
  join tournament_groups tg on tg.id = sg.source_group_id
  left join (
    select
      scores.source_group_id,
      count(*)::integer as played,
      count(*) filter (where scores.won)::integer as won,
      sum(scored)::integer as total_score
    from scores
    group by scores.source_group_id
  ) agg on agg.source_group_id = tg.id
  order by rank;
end;
$$;

revoke execute on function cross_category_standings(uuid) from public, anon, authenticated;
grant execute on function cross_category_standings(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- player_leaderboard() — global, across every tournament. Two independent
-- ranking columns (current_rating, career_tournament_points) rather than
-- one blended score, per user request — the UI sorts by whichever it wants
-- to show. Admin-only, same reasoning as group_standings: SECURITY DEFINER
-- bypasses RLS internally, and a scorer has no business reading the full
-- player directory.
-- ----------------------------------------------------------------------------

create function player_leaderboard()
returns table (
  player_id uuid,
  name text,
  current_rating numeric,
  confidence rating_confidence_status,
  category text,
  career_tournament_points bigint,
  tournaments_played bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'only an admin can view the player leaderboard';
  end if;

  return query
  select
    p.id as player_id,
    p.name,
    coalesce(pr.rating, 50) as current_rating,
    coalesce(pr.confidence_status, 'PROVISIONAL'::rating_confidence_status) as confidence,
    rc.name as category,
    coalesce(sum(tps.tournament_points), 0)::bigint as career_tournament_points,
    count(distinct tps.tournament_id)::bigint as tournaments_played
  from players p
  left join player_ratings pr on pr.player_id = p.id
  left join rating_categories rc on rc.id = pr.category_id
  left join tournament_player_stats tps on tps.player_id = p.id
  group by p.id, p.name, pr.rating, pr.confidence_status, rc.name
  order by current_rating desc;
end;
$$;

revoke execute on function player_leaderboard() from public, anon, authenticated;
grant execute on function player_leaderboard() to authenticated;
