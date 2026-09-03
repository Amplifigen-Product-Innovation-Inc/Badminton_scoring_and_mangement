-- ============================================================================
-- 0016_cross_category_random_group.sql — auto-populate a "Random" group
-- under a tournament's CROSS_CATEGORY stage whenever GROUP-stage
-- qualification is computed.
--
-- DESIGN: purely organizational, low-risk
--   The "Random" group is a display/organizational convenience — a tab
--   showing "who's qualified, pooled together" — not a new grouping key
--   for match creation or standings. It does NOT change
--   teams.source_group_id on cross-category matches (those keep pointing
--   at the ORIGINAL group-stage groups, exactly as createMatch/
--   cross_category_standings/cross_category_qualifications already do —
--   all of that stays completely untouched and already tested,
--   0008_cross_category_qualification.test.sql). This just gives every
--   newly-qualified pair a second, pooled home to be seen together in,
--   regardless of which original group they came from.
--
--   Wrapped in its own exception handler so a qualification computation
--   NEVER fails because of this extra step (no CROSS_CATEGORY stage yet,
--   an unexpected shape, etc.) — group_qualifications, the actual §15
--   requirement, is what matters; this is a bonus.
-- ============================================================================

create or replace function compute_group_qualification(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rank record;
  v_tournament_id uuid;
  v_cross_category_stage_id uuid;
  v_random_group_id uuid;
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

    -- Best-effort: pool this newly-qualified player into a "Random" group
    -- under the tournament's CROSS_CATEGORY stage, if one exists. Never
    -- lets a failure here roll back the group_qualifications write above.
    begin
      select ts.tournament_id into v_tournament_id
        from tournament_groups tg
        join tournament_stages ts on ts.id = tg.stage_id
        where tg.id = p_group_id;

      select id into v_cross_category_stage_id
        from tournament_stages
        where tournament_id = v_tournament_id and stage_type = 'CROSS_CATEGORY'
        limit 1;

      if v_cross_category_stage_id is not null then
        select id into v_random_group_id
          from tournament_groups
          where stage_id = v_cross_category_stage_id and name = 'Random';

        if v_random_group_id is null then
          insert into tournament_groups (stage_id, name, category)
            values (v_cross_category_stage_id, 'Random', null)
            returning id into v_random_group_id;
        end if;

        insert into group_players (group_id, player_id)
          values (v_random_group_id, v_rank.player_id)
          on conflict (group_id, player_id) do nothing;
      end if;
    exception when others then
      null;
    end;
  end loop;
end;
$$;
