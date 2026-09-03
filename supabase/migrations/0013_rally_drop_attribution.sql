-- ============================================================================
-- 0013_rally_drop_attribution.sql — mandatory paired winner/drop
-- attribution on every WINNER rally.
--
-- WHY
--   §26-28's original design only attributes ONE player per rally: either
--   the player who hit a winning shot (WINNER), or the player whose
--   unforced error gave the point away (DROP) — never both, since a rally
--   was assumed to end one way or the other. The tournament's points/
--   rating calculator needs more: on a WINNER rally, the scorer must also
--   identify the specific opposing player who failed to return the
--   winning shot, so BOTH sides of that single point are attributed —
--   the same "drops" stat DROP rallies already feed
--   (tournament_player_stats.drops, calculate_player_match_performance's
--   winners/drops formula), just now populated from WINNER rallies too.
--
--   DROP and SPLIT rallies are untouched: DROP's existing player_id
--   already *is* the dropper (no clean winner to separately name), and
--   SPLIT has no attribution at all (§27).
-- ============================================================================

alter table rallies
  add column losing_player_id uuid references players (id) on delete restrict;

-- NOT VALID: this table already has real WINNER rallies with no
-- losing_player_id (recorded before this migration), and there's no
-- honest way to backfill who the opposing player "really" was after the
-- fact. NOT VALID grandfathers those existing rows in without checking
-- them, while still enforcing the constraint on every INSERT and on any
-- future UPDATE from here on (§46 admin corrections to an old WINNER row
-- will need to supply losing_player_id too, going forward).
alter table rallies
  add constraint rallies_winner_requires_losing_player
  check (
    (event_type = 'WINNER' and losing_player_id is not null)
    or (event_type <> 'WINNER' and losing_player_id is null)
  ) not valid;

create index rallies_losing_player_id_idx on rallies (losing_player_id);

-- ----------------------------------------------------------------------------
-- validate_rally() — extend the existing WINNER/DROP team-consistency
-- checks (0004_scoring_functions.sql, since amended by
-- 0012_rally_game_status_guard.sql's IN_PROGRESS guard + row lock, both
-- carried forward unchanged below) to also verify losing_player_id, when
-- present, is a participant on the match's OTHER team (v_other_team_id is
-- already computed there for the DROP check).
-- ----------------------------------------------------------------------------

create or replace function validate_rally() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_match_id uuid;
  v_game_status game_status;
  v_player_team_id uuid;
  v_other_team_id uuid;
  v_valid_team_ids uuid[];
  v_losing_player_team_id uuid;
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

  -- New: a WINNER rally's losing_player_id must be a participant on the
  -- opposing team. A NULL losing_player_id is deliberately left for the
  -- rallies_winner_requires_losing_player CHECK constraint to reject
  -- (23514) rather than raised here — this trigger only judges a
  -- *present-but-wrong* losing_player_id (P0001), keeping "missing" vs.
  -- "wrong" as two distinguishable failure modes for callers.
  if new.event_type = 'WINNER' and new.losing_player_id is not null then
    select team_id into v_losing_player_team_id
      from match_participants
      where match_id = v_match_id and player_id = new.losing_player_id;

    if v_losing_player_team_id is null then
      raise exception 'losing_player_id % is not a participant in match %', new.losing_player_id, v_match_id;
    end if;

    if v_losing_player_team_id <> v_other_team_id then
      raise exception 'losing_player_id % must be on the opposing team (%), got team %',
        new.losing_player_id, v_other_team_id, v_losing_player_team_id;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function validate_rally() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- calculate_player_match_performance() — a player's drops now come from
-- their own DROP rallies AND any WINNER rally where they're the
-- losing_player_id (0005_match_completion.sql).
-- ----------------------------------------------------------------------------

create or replace function calculate_player_match_performance(p_match_id uuid, p_player_id uuid)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_winners integer;
  v_drops integer;
  v_normalized numeric;
begin
  select
      count(*) filter (where r.event_type = 'WINNER' and r.player_id = p_player_id),
      count(*) filter (
        where (r.event_type = 'DROP' and r.player_id = p_player_id)
           or (r.event_type = 'WINNER' and r.losing_player_id = p_player_id)
      )
    into v_winners, v_drops
    from rallies r
    join games g on g.id = r.game_id
    where g.match_id = p_match_id
      and (r.player_id = p_player_id or r.losing_player_id = p_player_id);

  if v_winners + v_drops = 0 then
    return null;
  end if;

  v_normalized := (v_winners - v_drops)::numeric / (v_winners + v_drops);
  return round((v_normalized + 1) * 50, 1);
end;
$$;

revoke execute on function calculate_player_match_performance(uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- complete_match() — same dual-source drops count for the raw
-- winning_shots/drops tally folded into tournament_player_stats.
-- ----------------------------------------------------------------------------

create or replace function complete_match(p_match_id uuid) returns void
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

    -- Raw winners/drops for this player, this match — drops now paired
    -- from either their own DROP rallies or a WINNER rally where they're
    -- the losing_player_id (0013_rally_drop_attribution.sql).
    select
        count(*) filter (where r.event_type = 'WINNER' and r.player_id = v_participant.player_id),
        count(*) filter (
          where (r.event_type = 'DROP' and r.player_id = v_participant.player_id)
             or (r.event_type = 'WINNER' and r.losing_player_id = v_participant.player_id)
        )
      into v_winners, v_drops
      from rallies r join games g on g.id = r.game_id
      where g.match_id = p_match_id
        and (r.player_id = v_participant.player_id or r.losing_player_id = v_participant.player_id);

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

-- ----------------------------------------------------------------------------
-- group_standings() — its aggregate_performance calculation
-- (0007_group_standings.sql) independently re-derives raw winners/drops
-- straight from `rallies` rather than reusing
-- calculate_player_match_performance, so it needs the same dual-source
-- drops fix or its §70 tie-break would silently drift from the per-match
-- performance every other calculation now uses.
-- ----------------------------------------------------------------------------

create or replace function group_standings(p_group_id uuid)
returns table (
  player_id uuid,
  player_name text,
  played integer,
  won integer,
  lost integer,
  tournament_points integer,
  aggregate_performance numeric,
  game_differential integer,
  rank integer
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'only an admin can view group standings';
  end if;

  return query
  with group_matches as (
    select m.id, m.winner_team_id
    from matches m
    where m.group_id = p_group_id and m.status = 'COMPLETED'
  ),
  per_player_matches as (
    select
      mp.player_id,
      gm.id as match_id,
      mp.team_id,
      (mp.team_id = gm.winner_team_id) as won
    from group_matches gm
    join match_participants mp on mp.match_id = gm.id
  )
  select
    p.id as player_id,
    p.name as player_name,
    coalesce(pp.played, 0) as played,
    coalesce(pp.won, 0) as won,
    coalesce(pp.lost, 0) as lost,
    coalesce(pp.tournament_points, 0) as tournament_points,
    perf.aggregate_performance,
    coalesce(gd.game_differential, 0) as game_differential,
    (row_number() over (
      order by
        coalesce(pp.tournament_points, 0) desc,
        coalesce(h2h.h2h_key, 0) desc,
        perf.aggregate_performance desc nulls last,
        coalesce(gd.game_differential, 0) desc
    ))::integer as rank
  from group_players gp
  join players p on p.id = gp.player_id
  left join (
    select
      ppm.player_id,
      count(*)::integer as played,
      count(*) filter (where ppm.won)::integer as won,
      count(*) filter (where not ppm.won)::integer as lost,
      (count(*) filter (where ppm.won) * 2)::integer as tournament_points
    from per_player_matches ppm
    group by ppm.player_id
  ) pp on pp.player_id = p.id
  left join (
    -- §30/§70: aggregate raw winners/drops across this group's completed
    -- matches (never averaged per-match), converted to the 0-100 scale.
    -- NULL (not 0) when winners+drops=0, so it's correctly skipped by the
    -- "nulls last" ordering above rather than sorting as the worst score.
    -- 0013: a player's drops now come from their own DROP rallies AND any
    -- WINNER rally (by anyone) where they're the losing_player_id — same
    -- dual-source rule as calculate_player_match_performance.
    select
      ppm.player_id,
      case when sum(w.c) + sum(d.c) = 0 then null
        else round(((sum(w.c) - sum(d.c))::numeric / (sum(w.c) + sum(d.c)) + 1) * 50, 1)
      end as aggregate_performance
    from per_player_matches ppm
    join games g on g.match_id = ppm.match_id
    left join lateral (
      select count(*) as c from rallies r
      where r.game_id = g.id and r.player_id = ppm.player_id and r.event_type = 'WINNER'
    ) w on true
    left join lateral (
      select count(*) as c from rallies r
      where r.game_id = g.id
        and (
          (r.event_type = 'DROP' and r.player_id = ppm.player_id)
          or (r.event_type = 'WINNER' and r.losing_player_id = ppm.player_id)
        )
    ) d on true
    group by ppm.player_id
  ) perf on perf.player_id = p.id
  left join (
    -- Games won minus games lost, across this group's completed matches,
    -- for whichever team this player was on in each match.
    select
      ppm.player_id,
      sum(
        (case when g.winner_team_id = ppm.team_id then 1 else 0 end)
        - (case when g.winner_team_id is not null and g.winner_team_id <> ppm.team_id then 1 else 0 end)
      )::integer as game_differential
    from per_player_matches ppm
    join games g on g.match_id = ppm.match_id and g.status = 'COMPLETED'
    group by ppm.player_id
  ) gd on gd.player_id = p.id
  left join lateral (
    -- H2H, 2-way ties only (0007_group_standings.sql's file header).
    -- tied_count excludes self.
    select case
      when (
        select count(*) from group_players gp2
        left join (
          select ppm2.player_id, (count(*) filter (where ppm2.won) * 2) as pts
          from per_player_matches ppm2 group by ppm2.player_id
        ) pp2 on pp2.player_id = gp2.player_id
        where gp2.group_id = p_group_id
          and coalesce(pp2.pts, 0) = coalesce(pp.tournament_points, 0)
      ) = 2
      then (
        select case when gm2.winner_team_id = ppm_self.team_id then 1 else 0 end
        from per_player_matches ppm_self
        join per_player_matches ppm_other
          on ppm_other.match_id = ppm_self.match_id and ppm_other.player_id <> ppm_self.player_id
        join group_matches gm2 on gm2.id = ppm_self.match_id
        where ppm_self.player_id = p.id
        limit 1
      )
      else null
    end as h2h_key
  ) h2h on true
  where gp.group_id = p_group_id
  order by rank;
end;
$$;

revoke execute on function group_standings(uuid) from public, anon, authenticated;
grant execute on function group_standings(uuid) to authenticated;
