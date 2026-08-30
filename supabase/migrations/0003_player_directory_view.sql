-- ============================================================================
-- 0003_player_directory_view.sql
-- Player admin dashboard view — §7, §8. Every column here is derived from
-- raw match/tournament participation (§47 "source of truth" hierarchy),
-- never a stored redundant total. In particular `is_returning` is NOT a
-- stored boolean (§8, §68.9) — it's computed from tournament participation
-- every time the view is queried.
--
-- `security_invoker = true` (PG15+) makes this view respect the QUERYING
-- user's RLS, not the view owner's — defense in depth, since 0002 already
-- restricts a scorer to nothing on players/tournaments/player_ratings
-- directly, this view must not accidentally become a bypass.
-- ============================================================================

create view player_directory
with (security_invoker = true) as
select
  base.*,
  case
    when base.matches_played > 0
      then round(base.matches_won::numeric / base.matches_played * 100, 1)
    else null
  end as win_pct
from (
  select
    p.id,
    p.name,
    p.email,
    p.phone,
    p.created_at as first_joined,
    (
      select max(t.date)
      from match_participants mp
      join matches m on m.id = mp.match_id
      join tournaments t on t.id = m.tournament_id
      where mp.player_id = p.id and m.status = 'COMPLETED'
    ) as last_played,
    (
      select count(distinct tp.tournament_id)
      from tournament_players tp
      where tp.player_id = p.id
    ) as tournaments_played,
    (
      select count(*)
      from match_participants mp
      join matches m on m.id = mp.match_id
      where mp.player_id = p.id and m.status = 'COMPLETED'
    ) as matches_played,
    (
      select count(*)
      from match_participants mp
      join matches m on m.id = mp.match_id
      where mp.player_id = p.id
        and m.status = 'COMPLETED'
        and m.winner_team_id = mp.team_id
    ) as matches_won,
    coalesce(pr.rating, 50) as current_rating,
    coalesce(pr.confidence_status, 'PROVISIONAL') as rating_confidence,
    rc.name as current_category,
    -- §8: returning = participated in at least one COMPLETED tournament.
    -- Everyone else (including players sitting in an OPEN/IN_PROGRESS
    -- tournament that hasn't finished yet) is "new".
    exists (
      select 1
      from tournament_players tp
      join tournaments t on t.id = tp.tournament_id
      where tp.player_id = p.id and t.status = 'COMPLETED'
    ) as is_returning
  from players p
  left join player_ratings pr on pr.player_id = p.id
  left join rating_categories rc on rc.id = pr.category_id
) base;

grant select on player_directory to authenticated;
