-- ============================================================================
-- 0011_cross_category_qualification.sql — "Qualify top 2" for a
-- CROSS_CATEGORY stage, mirroring compute_group_qualification
-- (0007_group_standings.sql) but keyed by source_group_id rather than
-- player_id: a cross-category standings row represents a whole team (the
-- pair/single that already qualified out of one GROUP stage), not an
-- individual, so what "qualifies" here is that group's team, not a player.
--
-- Persisted the same way group_qualifications is (never recalculated-and-
-- discarded) so the UI can show a stable "Qualified" badge and the app
-- layer (computeCrossCategoryQualification in group-actions.ts) can use it
-- to auto-create the next match between the top 2 without re-deriving
-- anything.
-- ============================================================================

create table cross_category_qualifications (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references tournament_stages (id) on delete cascade,
  source_group_id uuid not null references tournament_groups (id) on delete cascade,
  qualification_rank smallint not null check (qualification_rank in (1, 2)),
  created_at timestamptz not null default now(),
  unique (stage_id, qualification_rank),
  unique (stage_id, source_group_id)
);

create index cross_category_qualifications_stage_id_idx
  on cross_category_qualifications (stage_id);

alter table cross_category_qualifications enable row level security;

grant select, insert, update, delete on cross_category_qualifications to authenticated;
create policy cross_category_qualifications_admin_all on cross_category_qualifications for all
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- compute_cross_category_qualification(stage_id) — top 2 by
-- cross_category_standings, persisted. No override support (not asked
-- for) — a straight recompute-and-replace each call, same as
-- compute_group_qualification minus its is_override bookkeeping.
-- ----------------------------------------------------------------------------

create function compute_cross_category_qualification(p_stage_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rank record;
begin
  if not is_admin() then
    raise exception 'only an admin can compute cross-category qualification';
  end if;

  delete from cross_category_qualifications where stage_id = p_stage_id;

  for v_rank in
    select source_group_id, rank from cross_category_standings(p_stage_id) where rank in (1, 2)
  loop
    insert into cross_category_qualifications (stage_id, source_group_id, qualification_rank)
      values (p_stage_id, v_rank.source_group_id, v_rank.rank);
  end loop;
end;
$$;

revoke execute on function compute_cross_category_qualification(uuid) from public, anon, authenticated;
grant execute on function compute_cross_category_qualification(uuid) to authenticated;
