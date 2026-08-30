-- ============================================================================
-- 0002_rls_policies.sql
-- Row Level Security — §50, §68.13. Every table gets RLS enabled; nothing is
-- readable/writable by default. Access is granted back explicitly, per role,
-- below. Never rely on the frontend to enforce any of this (§50) — these
-- policies are what actually stops a SCORER from reaching admin data, not the
-- UI's role check.
--
-- ROLE MODEL
--   - Supabase's built-in `authenticated` Postgres role = "any logged-in user".
--     Within that, the *product* role (ADMIN / SCORER) lives in `profiles.role`
--     and is resolved per-request via the auth_role() helper below.
--   - `anon` gets no grants on any application table — the whole product
--     requires login (§3 only defines ADMIN/SCORER, no public/anonymous use).
--
-- SCORER WRITE-ACCESS DESIGN DECISION
--   Spec §50 lists scorer writes as: "INSERT rally", "UNDO own recent rally",
--   "UPDATE allowed active match state". Rather than grant scorer a raw
--   UPDATE on `matches` (which RLS row policies can't cleanly restrict to
--   "only the status/timestamp columns, only valid transitions"), match
--   start/complete and rally-undo are implemented as SECURITY DEFINER RPC
--   functions (Phase 4, 0003_functions.sql: start_match, complete_match,
--   undo_last_rally). Those functions do their own authorization check
--   against auth_profile_id() internally, then perform the write with the
--   function owner's privileges — the same "controlled write" outcome as a
--   scoped UPDATE policy, but with the validation logic in one place (SQL)
--   instead of split across an RLS policy and a trigger. Scorer's only DIRECT
--   table write in this migration is INSERT on `rallies`.
--
-- Every SELECT policy below is intentionally scoped through
-- `matches.scorer_id = auth_profile_id()` — i.e. the match the admin assigned
-- this scorer to (§22: admin assigns scorer to a court; the app is expected to
-- set matches.scorer_id for that court's matches). That single relationship is
-- the root of every scorer read permission in this file.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER + fixed search_path so they can read
-- `profiles` regardless of the caller's own RLS visibility into it (avoids
-- infinite recursion: profiles' own RLS policy calls auth_role()/is_admin()
-- too), and so they can't be tricked by a caller-controlled search_path.
-- ----------------------------------------------------------------------------

create function auth_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid();
$$;

create function auth_role() returns profile_role
language sql stable security definer set search_path = public as $$
  select role from profiles where auth_user_id = auth.uid();
$$;

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() = 'ADMIN';
$$;

create function is_scorer() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() = 'SCORER';
$$;

revoke execute on function auth_profile_id() from public;
revoke execute on function auth_role() from public;
revoke execute on function is_admin() from public;
revoke execute on function is_scorer() from public;
grant execute on function auth_profile_id() to authenticated;
grant execute on function auth_role() to authenticated;
grant execute on function is_admin() to authenticated;
grant execute on function is_scorer() to authenticated;

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere.
-- ----------------------------------------------------------------------------

alter table players enable row level security;
alter table profiles enable row level security;
alter table tournaments enable row level security;
alter table tournament_players enable row level security;
alter table tournament_stages enable row level security;
alter table tournament_groups enable row level security;
alter table group_players enable row level security;
alter table group_qualifications enable row level security;
alter table courts enable row level security;
alter table tournament_courts enable row level security;
alter table matches enable row level security;
alter table teams enable row level security;
alter table match_participants enable row level security;
alter table games enable row level security;
alter table rallies enable row level security;
alter table rating_categories enable row level security;
alter table player_ratings enable row level security;
alter table player_rating_history enable row level security;
alter table tournament_player_stats enable row level security;

-- ----------------------------------------------------------------------------
-- players — §7, §50. Admin: full CRUD. Scorer: read-only, and only players
-- who are participants in one of the scorer's assigned matches (never the
-- full roster — §3 "Scorer cannot: modify players", and reading the whole
-- player directory isn't in the scorer's spec'd capability list either).
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on players to authenticated;

create policy players_admin_all on players for all
  using (is_admin()) with check (is_admin());

create policy players_scorer_select_assigned on players for select
  using (
    is_scorer() and exists (
      select 1 from match_participants mp
      join matches m on m.id = mp.match_id
      where mp.player_id = players.id
        and m.scorer_id = auth_profile_id()
    )
  );

-- ----------------------------------------------------------------------------
-- profiles — §48, §63. Admin: full CRUD (provisioning scorer accounts, §2.4
-- admin invite flow lands in Phase 2). Everyone: can read their own row —
-- needed just to resolve "am I admin or scorer" client-side after login.
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on profiles to authenticated;

create policy profiles_admin_all on profiles for all
  using (is_admin()) with check (is_admin());

create policy profiles_self_select on profiles for select
  using (auth_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- tournaments — §3, §50. Admin: full CRUD. Scorer: read-only, scoped to
-- tournaments containing a match assigned to them.
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on tournaments to authenticated;

create policy tournaments_admin_all on tournaments for all
  using (is_admin()) with check (is_admin());

create policy tournaments_scorer_select_assigned on tournaments for select
  using (
    is_scorer() and exists (
      select 1 from matches m
      where m.tournament_id = tournaments.id
        and m.scorer_id = auth_profile_id()
    )
  );

-- ----------------------------------------------------------------------------
-- Tournament structure / stats tables — admin-only. Not in the scorer's
-- spec'd read or write surface (§3, §50): the scorer screen (§23) shows only
-- its own court/match/players/score, never groups, standings, or ratings.
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on tournament_players to authenticated;
create policy tournament_players_admin_all on tournament_players for all
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on tournament_stages to authenticated;
create policy tournament_stages_admin_all on tournament_stages for all
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on tournament_groups to authenticated;
create policy tournament_groups_admin_all on tournament_groups for all
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on group_players to authenticated;
create policy group_players_admin_all on group_players for all
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on group_qualifications to authenticated;
create policy group_qualifications_admin_all on group_qualifications for all
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on tournament_courts to authenticated;
create policy tournament_courts_admin_all on tournament_courts for all
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on rating_categories to authenticated;
create policy rating_categories_admin_all on rating_categories for all
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on player_ratings to authenticated;
create policy player_ratings_admin_all on player_ratings for all
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on player_rating_history to authenticated;
create policy player_rating_history_admin_all on player_rating_history for all
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on tournament_player_stats to authenticated;
create policy tournament_player_stats_admin_all on tournament_player_stats for all
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- courts — §21, §50. Admin: full CRUD. Scorer: read-only, scoped to courts
-- used by one of their assigned matches.
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on courts to authenticated;

create policy courts_admin_all on courts for all
  using (is_admin()) with check (is_admin());

create policy courts_scorer_select_assigned on courts for select
  using (
    is_scorer() and exists (
      select 1 from matches m
      where m.court_id = courts.id
        and m.scorer_id = auth_profile_id()
    )
  );

-- ----------------------------------------------------------------------------
-- matches — §3, §19, §50. Admin: full CRUD. Scorer: read-only on their own
-- assigned matches — no direct scorer UPDATE (see design note at top of file).
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on matches to authenticated;

create policy matches_admin_all on matches for all
  using (is_admin()) with check (is_admin());

create policy matches_scorer_select_own on matches for select
  using (is_scorer() and scorer_id = auth_profile_id());

-- ----------------------------------------------------------------------------
-- teams / match_participants — §16–§20, §50. Admin: full CRUD. Scorer:
-- read-only, scoped through the parent match's scorer assignment.
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on teams to authenticated;

create policy teams_admin_all on teams for all
  using (is_admin()) with check (is_admin());

create policy teams_scorer_select_assigned on teams for select
  using (
    is_scorer() and exists (
      select 1 from matches m
      where m.id = teams.match_id
        and m.scorer_id = auth_profile_id()
    )
  );

grant select, insert, update, delete on match_participants to authenticated;

create policy match_participants_admin_all on match_participants for all
  using (is_admin()) with check (is_admin());

create policy match_participants_scorer_select_assigned on match_participants for select
  using (
    is_scorer() and exists (
      select 1 from matches m
      where m.id = match_participants.match_id
        and m.scorer_id = auth_profile_id()
    )
  );

-- ----------------------------------------------------------------------------
-- games — §29, §50. Admin: full CRUD. Scorer: read-only, scoped via the
-- parent match. Score updates happen through the rally-insert trigger
-- (Phase 4, SECURITY DEFINER), not a direct scorer UPDATE grant.
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on games to authenticated;

create policy games_admin_all on games for all
  using (is_admin()) with check (is_admin());

create policy games_scorer_select_assigned on games for select
  using (
    is_scorer() and exists (
      select 1 from matches m
      where m.id = games.match_id
        and m.scorer_id = auth_profile_id()
    )
  );

-- ----------------------------------------------------------------------------
-- rallies — §24–§28, §50, §53. Admin: full CRUD (corrections, §46). Scorer:
-- read own assigned match's rallies, and INSERT new ones — but only while
-- that match is LIVE, only for a game that belongs to it, and only
-- attributed to themselves as the recorder. No scorer UPDATE/DELETE grant —
-- undo is the `undo_last_rally` SECURITY DEFINER RPC (Phase 4), which can
-- enforce "only the single most recent rally, only if it's yours" in a way a
-- row policy cannot.
-- ----------------------------------------------------------------------------

grant select, insert on rallies to authenticated;
grant update, delete on rallies to authenticated; -- exercised by admin policy only; scorer has no matching policy for these commands

create policy rallies_admin_all on rallies for all
  using (is_admin()) with check (is_admin());

create policy rallies_scorer_select_assigned on rallies for select
  using (
    is_scorer() and exists (
      select 1 from games g
      join matches m on m.id = g.match_id
      where g.id = rallies.game_id
        and m.scorer_id = auth_profile_id()
    )
  );

create policy rallies_scorer_insert_assigned_live on rallies for insert
  with check (
    is_scorer()
    and created_by = auth_profile_id()
    and exists (
      select 1 from games g
      join matches m on m.id = g.match_id
      where g.id = rallies.game_id
        and m.scorer_id = auth_profile_id()
        and m.status = 'LIVE'
        and g.status = 'IN_PROGRESS'
    )
  );
