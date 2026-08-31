-- ============================================================================
-- 0007_group_standings.sql — Phase 6.1-6.2 (TASKS.md): group standings with
-- the §70 tie-break chain, and persisted top-2 qualification (§15).
--
-- SCOPE DECISION: H2H tie-break only for a clean 2-way tie
--   §70's tie-break chain is: Tournament Points -> head-to-head -> aggregate
--   group-stage performance -> game differential -> admin override. Head-
--   to-head is well-defined for exactly two players tied on points (did
--   player A beat player B in their group match?), but has no single
--   well-defined meaning for a 3+-way tie (a round-robin "mini-league"
--   tie-break among 3+ tied players is a much larger, separately-specified
--   problem that PRODUCT_SPEC.md doesn't address). Applied only when
--   exactly two players share a points total; a 3+-way tie on points falls
--   straight through to aggregate performance instead.
--
-- Everything here is a plain function computed fresh from raw matches/
-- games/rallies every call (§47: never trust a stored total) — the only
-- thing actually PERSISTED is group_qualifications (§15's explicit
-- requirement), via compute_group_qualification().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- group_standings(group_id) — §70 group-stage ranking. Scoped strictly to
-- `matches.group_id = p_group_id AND status = 'COMPLETED'` — cross-category
-- and final-stage matches (group_id NULL) can never leak into a group's
-- standings, and an in-progress match doesn't count yet either.
-- ----------------------------------------------------------------------------

create function group_standings(p_group_id uuid)
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
  -- SECURITY DEFINER bypasses RLS for the query below, so without this
  -- check any authenticated caller — including a scorer, who has zero RLS
  -- visibility into tournament/group data by design (0002_rls_policies.sql)
  -- — could call this RPC directly and read standings for a tournament
  -- they have no business seeing.
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
    -- One row per (player, match) they appeared in, within this group.
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
      where r.game_id = g.id and r.player_id = ppm.player_id and r.event_type = 'DROP'
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
    -- H2H, 2-way ties only (see file header). tied_count excludes self.
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

-- ----------------------------------------------------------------------------
-- compute_group_qualification(group_id) — §15: top 2 by group_standings,
-- PERSISTED into group_qualifications, not recalculated-and-discarded on
-- every render. Admin-overridden ranks (is_override = true) are left
-- untouched by a recompute — see override_group_qualification below.
-- ----------------------------------------------------------------------------

create function compute_group_qualification(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rank record;
begin
  if not is_admin() then
    raise exception 'only an admin can compute group qualification';
  end if;

  for v_rank in
    select player_id, rank from group_standings(p_group_id) where rank in (1, 2)
  loop
    -- Skip a rank an admin has explicitly overridden.
    if exists (
      select 1 from group_qualifications
      where group_id = p_group_id and qualification_rank = v_rank.rank and is_override
    ) then
      continue;
    end if;

    -- The computed player might already hold the OTHER (overridden) rank —
    -- unique(group_id, player_id) would reject inserting them twice.
    if exists (
      select 1 from group_qualifications
      where group_id = p_group_id and player_id = v_rank.player_id and is_override
    ) then
      continue;
    end if;

    delete from group_qualifications
      where group_id = p_group_id and qualification_rank = v_rank.rank and not is_override;

    insert into group_qualifications (group_id, player_id, qualification_rank, is_override)
      values (p_group_id, v_rank.player_id, v_rank.rank, false)
      on conflict (group_id, player_id) do update set qualification_rank = excluded.qualification_rank;
  end loop;
end;
$$;

revoke execute on function compute_group_qualification(uuid) from public, anon, authenticated;
grant execute on function compute_group_qualification(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- override_group_qualification(group_id, player_id, rank) — §44 "Admin can
-- manually override qualification." Marks the row is_override so a future
-- compute_group_qualification leaves it alone.
-- ----------------------------------------------------------------------------

create function override_group_qualification(
  p_group_id uuid,
  p_player_id uuid,
  p_rank smallint
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'only an admin can override group qualification';
  end if;

  if p_rank not in (1, 2) then
    raise exception 'qualification_rank must be 1 or 2';
  end if;

  delete from group_qualifications
    where group_id = p_group_id and (qualification_rank = p_rank or player_id = p_player_id);

  insert into group_qualifications (group_id, player_id, qualification_rank, is_override, overridden_by)
    values (p_group_id, p_player_id, p_rank, true, auth_profile_id());
end;
$$;

revoke execute on function override_group_qualification(uuid, uuid, smallint) from public, anon, authenticated;
grant execute on function override_group_qualification(uuid, uuid, smallint) to authenticated;
