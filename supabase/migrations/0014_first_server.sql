-- ============================================================================
-- 0013_first_server.sql — ask the scorer once, at match start, who serves
-- first, instead of always defaulting to team 1's first listed player
-- (computeCurrentServer's documented fallback, src/lib/scoring/serve.ts).
--
-- Stored on `matches` (a match-level fact, decided once — the app-layer
-- serve derivation only ever needs it to seed game 1; games 2+ already
-- carry their own simplification, unaffected by this migration).
-- ============================================================================

alter table matches
  add column first_server_player_id uuid references players (id) on delete restrict;

-- ----------------------------------------------------------------------------
-- start_match() — accepts the chosen first server. The new parameter is
-- given a default so a one-arg call still type-checks, but a Postgres
-- function's identity is (name, argument types) — adding a parameter
-- creates a distinct overload rather than replacing the old one, and a
-- one-arg call would then resolve to the OLD exact-arity function instead
-- of falling through to this one's default. Drop the old single-arg
-- overload explicitly so callers only ever reach this version.
-- ----------------------------------------------------------------------------

drop function if exists start_match(uuid);

create or replace function start_match(p_match_id uuid, p_first_server_player_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status match_status;
  v_scorer_id uuid;
  v_is_participant boolean;
begin
  select status, scorer_id into v_status, v_scorer_id from matches where id = p_match_id;

  if v_status is null then
    raise exception 'match % not found', p_match_id;
  end if;

  if not is_admin() then
    if not is_scorer() or v_scorer_id is distinct from auth_profile_id() then
      raise exception 'not authorized to start this match';
    end if;
  end if;

  if v_status <> 'SCHEDULED' then
    raise exception 'match must be SCHEDULED to start (current status: %)', v_status;
  end if;

  if p_first_server_player_id is not null then
    select exists(
      select 1 from match_participants
      where match_id = p_match_id and player_id = p_first_server_player_id
    ) into v_is_participant;

    if not v_is_participant then
      raise exception 'first_server_player_id % is not a participant in match %',
        p_first_server_player_id, p_match_id;
    end if;
  end if;

  update matches
    set status = 'LIVE', started_at = now(), first_server_player_id = p_first_server_player_id
    where id = p_match_id;

  insert into games (match_id, game_number, status) values (p_match_id, 1, 'IN_PROGRESS');
end;
$$;

revoke execute on function start_match(uuid, uuid) from public, anon, authenticated;
grant execute on function start_match(uuid, uuid) to authenticated;
