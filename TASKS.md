# Implementation Backlog

Source of truth for scope/rules: `PRODUCT_SPEC.md` (the master prompt). This file breaks it
into scoped tasks meant to be handed one at a time to Cursor/Claude, each independently
reviewable. Do not skip ahead — later tasks assume earlier ones are merged and working.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Foundation

- [x] **0.1 Repo scaffold** — Next.js (App Router) + TypeScript + Tailwind, ESLint/Prettier,
      folder structure (`app/`, `lib/`, `components/`, `supabase/`).
- [x] **0.2 Supabase project wiring** — env vars, `lib/supabase/client.ts` (browser) and
      `lib/supabase/server.ts` (server component / route handler clients), typed via generated
      `database.types.ts` (placeholder until schema lands).
- [x] **0.3 Database schema (migration 001)** — all tables from spec §48, constraints, enums,
      indexes, `updated_at` triggers. No RLS yet, no functions yet — just structure.
- [ ] **0.4 Seed script skeleton** — empty seed file wired to `supabase db seed`, filled in
      Phase 6. *(Not started — needs a linked Supabase project to `supabase db seed` against.)*
- [x] **0.5 Auth scaffold** — Supabase Auth (password-based, §70), `profiles` table linkage,
      login page, forgot/reset-password flow, role-based redirect (ADMIN → `/admin`, SCORER →
      `/scorer`).
- [x] **0.6 Testing tooling** — Vitest + Playwright installed and configured per §70 (no Jest,
      no Cypress). Playwright browsers need `npx playwright install` run once locally/in CI —
      not run automatically by this scaffold.

## Phase 1 — RLS & Access Control

- [x] **1.1 RLS policies (migration 002)** — `supabase/migrations/0002_rls_policies.sql`.
      Admin: blanket `FOR ALL` on every table. Scorer: SELECT only, every policy chained back
      to `matches.scorer_id = auth_profile_id()`; zero access to players/tournaments/ratings/
      categories/tournament-structure tables beyond that. Scorer's only direct write is
      `INSERT` on `rallies` (self-attributed, own LIVE match only) — match state transitions
      and rally undo are deliberately NOT raw scorer UPDATE/DELETE grants; they're SECURITY
      DEFINER RPCs to be added in Phase 4 (`start_match`, `complete_match`,
      `undo_last_rally`) so the authorization + validity-of-transition logic lives in one
      place. See the design-decision comment at the top of the migration file.
- [x] **1.2 RLS test suite** — `supabase/tests/database/0001_rls.test.sql`, pgTAP, 25
      assertions: scorer A/B isolation (matches, tournaments, courts, teams, participants,
      players, games all scoped correctly and symmetrically), zero scorer visibility into
      ratings/categories/stats tables, rally insert succeeds only for own+LIVE+self-attributed,
      fails for other-attributed and for another scorer's match, players/tournaments/ratings/
      categories/groups all reject scorer writes, admin passes every check.
      **✅ Verified green (25/25)** 2026-08-30 against the linked live project
      (`udsbnuavvhzblbpedjiz`) via `supabase db query --linked -f` (no Docker in this
      sandbox, so `supabase test db` itself is untried — same SQL, different runner). Four
      assertions were corrected in the process: they expected a blocked scorer UPDATE/DELETE
      to throw `42501`, but Postgres RLS just matches zero rows in that case (no REVOKE at
      the grant level) — confirmed the underlying data was untouched either way, so this was
      a test-expectation bug, not a policy gap.

## Phase 2 — Player Management (Admin)

- [x] **2.1 Player CRUD + email normalization** — `normalizeEmail()` +
      `addPlayerSchema` (`src/lib/validation/player.ts`), `addPlayer()` server action
      (`src/app/admin/players/actions.ts`): validate → normalize → duplicate check → insert,
      with a `23505`-race fallback in case two submissions land at once. DB-level
      `players_email_is_normalized` CHECK + UNIQUE remain the backstop (0001).
- [x] **2.2 Admin Players page** — `src/app/admin/players/page.tsx`, reads the
      `player_directory` view (0003). Search (name/email via `ilike`), filter (All/New/
      Returning) as URL params so the page stays server-rendered. Sorting/pagination
      deliberately deferred to the fuller §42 dashboard in Phase 7.7 — this is the simpler §7
      list.
- [x] **2.3 New vs Returning derivation** — `player_directory.is_returning`
      (0003_player_directory_view.sql): `EXISTS` against `tournament_players` joined to a
      `COMPLETED` tournament. No boolean column anywhere — recomputed on every query.
- [x] **2.4 Add Player flow** — `AddPlayerDialog` (inline panel, not a modal, per §54) +
      server action. Duplicate-found UX shows the existing player's name/email inline (§9).
      Used plain `useState`/`FormData` rather than React Hook Form — the form is two fields;
      pulling in RHF here would be exactly the "unnecessary library" §2 warns against. Revisit
      if a later form (tournament creation, match editing) is complex enough to justify it.

  **✅ Run against a live database** 2026-08-30: linked to Supabase project
  `udsbnuavvhzblbpedjiz`, pushed migrations 0001–0003 clean (`supabase db push`), ran the RLS
  suite green (see 1.2), and regenerated `src/lib/types/database.types.ts` from the real
  schema (`supabase gen types typescript --linked`) — no more `any` placeholder. `npm run
  build`, `npm run lint`, and `npx vitest run` all pass against the real types.
  `supabase db advisors --linked` reports no ERROR-level findings; 72 WARN-level notices (60
  are "multiple permissive policies" perf notices, the rest are `search_path`/`SECURITY
  DEFINER` hardening items) — deferred to 9.2 (final RLS/security pass), not a blocker here.

## Phase 3 — Tournament & Stage Structure (Admin)

- [x] **3.1 Tournament CRUD** — `src/lib/validation/tournament.ts` (create/update schemas,
      empty-string-to-null coercion for the nullable §10 fields), `src/app/admin/tournaments/
      actions.ts` (createTournament/updateTournament/cancelTournament), list page
      (`src/app/admin/tournaments/page.tsx`) with `CreateTournamentDialog` (inline panel, same
      pattern as `AddPlayerDialog`), and a detail/edit page (`[id]/page.tsx` +
      `TournamentEditForm`) covering all §10 fields plus a status dropdown — admin can set any
      status directly (no state-machine guard yet; that belongs with the stage/match engine in
      later phases). Status starts `DRAFT` on create per §10.
      **Verified end-to-end** 2026-08-30: `npm run build`/`lint` pass; drove the real app in a
      headless browser (Playwright, `next dev`) as a live admin account (created via the
      Supabase Admin API, deleted after) — logged in, created a tournament through the dialog,
      landed on its detail page, edited a field and saved (confirmed both the "Saved." UI
      state and the actual DB row), no console errors. Test fixtures (tournament + admin user)
      cleaned up afterward.
- [x] **3.2 Tournament stage model** — `src/lib/validation/stage.ts`,
      `src/app/admin/tournaments/stage-actions.ts` (createStage/updateStage/deleteStage/
      moveStage), `StagesManager` embedded in the tournament detail page. New stages append
      at `max(stage_order)+1`; reordering swaps two rows through a temporary negative
      `stage_order` (the `unique (tournament_id, stage_order)` constraint isn't DEFERRABLE, so
      a direct two-row swap would collide mid-transaction).
      **Verified end-to-end** 2026-08-30: same Playwright session as 3.1 — added two stages,
      clicked "Move up" on the second, confirmed both the on-screen reordering and the
      underlying `stage_order` values in the DB swapped correctly, no console errors.
- [x] **3.3 Add players to tournament** — `src/app/admin/tournaments/player-actions.ts`
      (searchAvailablePlayers excludes players already on the roster; addPlayersToTournament
      for the checkbox "Add Selected" flow; addNewPlayerAndAddToTournament reuses the same
      validate/normalize/duplicate-check path as the main Players page, §9, then links to this
      tournament; removePlayerFromTournament deletes the roster row outright — no match/group
      data can reference a player yet at this phase, so there's nothing to preserve; revisit to
      a WITHDRAWN status flip once matches exist, TASKS.md 3.6+). `TournamentPlayersManager`
      embedded in the tournament detail page (debounced search, checkbox multi-select, inline
      "+ Add New Player").
      **Verified end-to-end** 2026-08-30: same live-browser Playwright pattern as 3.1/3.2 —
      searched and added an existing global player, added a brand-new player through the
      inline form, removed one, confirmed roster counts/rows in both the UI and the DB at each
      step, no console errors. Test fixtures cleaned up afterward.
- [x] **3.4 Groups** — `src/lib/validation/group.ts`,
      `src/app/admin/tournaments/group-actions.ts` (createGroup/deleteGroup/addPlayerToGroup/
      removePlayerFromGroup, scoped per stage), `GroupsManager` embedded in the tournament
      detail page — per-stage group list, assignment dropdown sourced from the tournament's
      existing roster (3.3).
      **Found and fixed a real gap while verifying:** `group_players` has no FK back to
      `tournament_players` — a player is only linked to a group via player_id, through
      tournament_groups -> tournament_stages -> tournament_id. Removing a player from the
      tournament roster (3.3's removePlayerFromTournament) left them stranded in any group
      they'd already been assigned to. Fixed by explicitly deleting the player's
      `group_players` rows (scoped to this tournament's own stages/groups) before removing the
      roster row.
      **Verified end-to-end** 2026-08-30: live-browser Playwright — added a GROUP stage,
      added two roster players, created "Group A", assigned both, removed one from the group
      only (roster unaffected), then removed the other from the tournament roster entirely and
      confirmed the cascade-cleanup dropped them from the group too — checked in both the UI
      and the DB at each step, no console errors. Build/lint/vitest all pass. Test fixtures
      cleaned up afterward.
- [x] **3.5 Courts** — global registry: `src/lib/validation/court.ts`,
      `src/app/admin/courts/actions.ts` (createCourt/deleteCourt — delete surfaces the
      `on delete restrict` FK violation as a plain message, not a stack trace), `/admin/courts`
      list page. Per-tournament: `src/app/admin/tournaments/court-actions.ts`
      (searchAvailableCourts/addCourtsToTournament/addNewCourtAndAddToTournament/
      updateTournamentCourtStatus/removeCourtFromTournament), `TournamentCourtsManager`
      embedded in the tournament detail page — same search-and-select + inline "add new"
      shape as players (3.3), plus a status dropdown per court
      (AVAILABLE/ASSIGNED/LIVE/COMPLETED).
      **Mobile-responsiveness pass:** per user direction, admin stays desktop-first (§54) but
      must degrade cleanly on narrow screens. Fixed two `grid-cols-2` layouts (create-tournament
      dialog, tournament edit form) that didn't wrap below `sm:`, and the edit form's
      save/cancel row to wrap instead of overflow. Confirmed at a 390px viewport: nav wraps,
      forms stack to one column, table/list rows stay legible, no horizontal scroll.
      **Verified end-to-end** 2026-08-30: live-browser Playwright at both desktop and mobile
      viewports — created a global court, attached it to a tournament via search, added a new
      court inline, changed a court's status to LIVE, removed one court from the tournament
      (confirmed it stayed in the global registry, not deleted), no console errors. Build/
      lint/vitest all pass. Test fixtures cleaned up afterward.
- [x] **3.6 Match creation** — `src/lib/validation/match.ts` (matchType/bestOf enums, team-size
      cross-validation against matchType via superRefine, rejects a player on both teams),
      `src/app/admin/tournaments/match-actions.ts` (createMatch/cancelMatch/deleteMatch),
      `MatchesManager` embedded in the tournament detail page — pick a stage (+ optional group,
      which also narrows the player picker to that group's roster), format, best-of, court,
      scorer, and both teams' players via checkboxes.
      **Scorer assignment decision:** §22 states MVP should prefer court-level scorer
      assignment, but the schema only has `scorer_id` on `matches`, and `tournament_courts`
      itself is currently admin-only in RLS (no scorer visibility at all) — true court-level
      assignment needs a migration (new column) plus a new RLS policy on top of the already-
      verified Phase 1 security model. Per user direction, deferred: this phase uses
      match-level `scorer_id` only. Revisit court-level assignment as a follow-up once it's
      worth reopening the RLS suite for.
      **createMatch isn't atomic** — supabase-js issues the matches/teams/match_participants
      inserts as separate statements (no transaction). On a teams/participants insert failure,
      the code deletes the just-created match as compensation rather than leaving a teamless
      orphan, but this is best-effort, not a real rollback. A proper atomic version belongs in
      a Postgres RPC alongside the Phase 4 scoring-engine functions.
      **Found and fixed two real bugs while verifying:**
      1. `MatchesManager`'s `stageId` was a `useState(stages[0]?.id ?? "")` one-time
         initializer — since the component is already mounted (rendering the "add a stage
         first" placeholder) before any stage exists, that initial value stayed `""` forever
         even after a stage was added and `stages` changed via `router.refresh()`. The
         `<select>` visually showed the first stage anyway (a controlled `<select>` with a
         `value` that matches no `<option>` falls back to displaying the first one without
         firing `onChange`), masking the bug until submit failed with "Invalid UUID". Fixed by
         deriving the effective stageId at render time (falling back to `stages[0]` only when
         the raw selection isn't in the current list) instead of storing/syncing it as state.
      2. The matches list's scorer label read only `profiles.players.name`, with no fallback
         for a scorer profile with no linked player (`profiles.player_id` is nullable by
         design) — a match with a real `scorer_id` set rendered as "No scorer assigned". Fixed
         to match the same `Scorer <id>` fallback the scorer-picker dropdown already used.
      **Verified end-to-end** 2026-08-30: live-browser Playwright — created a SINGLES match
      (with court + scorer assigned) and a DOUBLES match, confirmed correct team/player display
      and the scorer-label fallback in the UI, confirmed a mismatched-team-size submission is
      rejected with a clear per-field error and creates nothing, cancelled one match and
      deleted the other, confirmed both outcomes directly in the DB. No console errors. Build/
      lint/vitest all pass. Test fixtures cleaned up afterward.

## Phase 4 — Scoring Engine (pure logic, DB functions)

- [x] **4.1 Rally recording** — `supabase/migrations/0004_scoring_functions.sql`. Attribution
      (§25–27) enforced by the `validate_rally()` trigger, not just application code: WINNER
      must credit the scoring player's own team, DROP must credit the opponent, SPLIT (no
      player) credits whichever team the scorer records directly. Idempotent client-generated
      IDs (§51): `rallies.id` is a normal `uuid primary key` a client can supply explicitly: a
      retried insert with the same id hits the PK unique-violation, which the client should
      treat as "already recorded" — no schema change needed, this is a Phase 5 client-side
      concern (documented for when the scorer UI is built).
      **Schema decision (user-approved):** added `rallies.winning_team_id` (always required,
      independent of player attribution) to make SPLIT scoring representable at all — see the
      design note at the top of the migration for the full reasoning. Also added
      `rallies.sequence_number` (a real identity column) because `created_at` alone can't
      reliably order "the last rally": `now()` is transaction-start-time in Postgres, not
      per-statement, so any bulk/multi-row insert shares one timestamp with no defined
      tie-break — needed for 4.3's undo below.
- [x] **4.2 Badminton score update** — `recompute_game_score(game_id)`, same migration. Never
      hand-increments — always recomputes `games.team_1_score/team_2_score/winner_team_id/
      status` fresh from that game's raw rallies (§46/§47: never trust a stored total),
      applying §70's deuce/cap rules read from the parent tournament (configurable
      target/win-by/max, not hard-coded). Runs automatically via an AFTER INSERT/UPDATE/DELETE
      trigger on `rallies`, and is reused as-is by undo (4.3) and, later, by 7.5's
      "Recalculate". Bo1/Bo3 *match* completion (§29 steps 1–9) is explicitly NOT here — that's
      4.7, a separate, much larger orchestration.
- [x] **4.3 Undo** — `undo_last_rally(game_id)` SECURITY DEFINER RPC. Finds the rally with the
      highest `sequence_number` for that game, authorizes (admin: anything; scorer: only their
      own currently-LIVE assigned match, only a rally they themselves created), deletes it —
      the AFTER DELETE trigger recomputes the game automatically, so "undo" is just "delete +
      let 4.2 do its job," not separate reversal logic.
      **Found and fixed three real bugs while verifying** (pgTAP,
      `supabase/tests/database/0002_scoring_engine.test.sql`, 28 assertions, run the same way
      as 0001 — `supabase db query --linked -f`, no Docker in this sandbox):
      1. `validate_rally()` and `recompute_game_score()` were plain (SECURITY INVOKER)
         functions doing cross-table SELECTs — under a scorer's own restricted RLS visibility,
         a lookup into another scorer's match/game returns nothing, so the trigger raised a
         false "game not found" instead of correctly falling through to RLS's own 42501
         rejection. Fixed by making both SECURITY DEFINER (matching the auth_profile_id()/
         is_admin() pattern in 0002), same as data-integrity checks needing to see the real
         data regardless of caller — authorization stays RLS's job.
      2. `trigger_recompute_game_score()` (the AFTER-trigger wrapper) is itself SECURITY
         INVOKER, and its *nested* call to `recompute_game_score()` is checked against the
         current caller's own EXECUTE grant even though firing the trigger itself needs no such
         grant — so revoking direct-RPC EXECUTE on `recompute_game_score()` (see bug 3) broke
         every rally insert with "permission denied for function recompute_game_score" until
         the wrapper was also made SECURITY DEFINER.
      3. `validate_rally()`/`recompute_game_score()` are internal, trigger-only helpers with no
         business being directly callable — but `supabase db advisors --linked` caught that
         Supabase's default privileges grant `EXECUTE` directly to `anon`/`authenticated` on
         every new function (separate from the `PUBLIC` grant), so both were reachable via
         `/rest/v1/rpc/<name>` including by unauthenticated callers. Fixed by revoking from
         `public, anon, authenticated` explicitly (revoking from `public` alone, as the
         migration first tried, does nothing to those two direct grants).
      **Verified:** 25/25 (0001) + 28/28 (0002) green; `npm run build`/`lint`/`vitest` pass
      against regenerated types; `supabase db advisors --linked` shows no new findings beyond
      the pre-existing, already-logged ones (60 "multiple permissive policies" perf notices,
      one unrelated pre-existing `search_path` warning on `set_updated_at`) plus
      `undo_last_rally` itself being `authenticated`-callable, which is intentional (scorers/
      admins call it directly).
- [x] **4.4 Individual performance calc** — `calculate_player_match_performance(match_id,
      player_id)`, `supabase/migrations/0005_match_completion.sql`. §30-31 exactly: normalized
      performance from WINNER/DROP rallies across every game in the match (a Bo3 match's
      performance is match-wide, not per-game), converted to the 0-100 scale. Returns NULL
      when winners+drops=0 (§32's blend is 4.7's job, not this function's).
- [x] **4.5 Rating update function** — `apply_player_rating_update(player_id,
      match_performance, tournament_id, match_id)`, same migration. §33 (80/20 rolling, clamped
      0-100), appends one `player_rating_history` row every call — never overwrites without a
      trail (§61).
- [x] **4.6 Rating confidence + category** — folded into `apply_player_rating_update` (same
      function updates rating, confidence, and category together in one upsert — they're not
      independent values, all three derive from the same new-rating calculation). §34 buckets
      (0-2/3-5/6+ completed matches -> PROVISIONAL/EMERGING/ESTABLISHED) and §35 category
      lookup against the editable `rating_categories` thresholds (never hard-coded).
- [x] **4.7 Match completion orchestration** — `complete_match(match_id)`, same migration.
      Runs §29 steps 1-9 as one PL/pgSQL function call, which — unlike application-level
      multi-statement work elsewhere in this codebase (see the compensating-delete comment on
      `createMatch` in `src/app/admin/tournaments/match-actions.ts`) — genuinely is one
      transaction: lock (status/completed_at/winner_team_id), determine the winner via
      `calculate_match_result` (Bo1/Bo3 = first to ceil(best_of/2) games, refuses to complete
      an undecided match), then per participant: performance (4.4) -> blend with win/loss
      (§32) -> rating/confidence/category (4.5-4.6) -> tournament_points/tournament_player_stats
      (§13, §37) -> leaves `rallies` completely untouched (step 9). SECURITY DEFINER with its
      own authorization (admin: any match; scorer: only their own assigned LIVE match), same
      shape as `undo_last_rally`.
      **Documented assumptions** (spec doesn't fully specify these; see the migration's file
      header for the full reasoning, easy to revisit):
      1. `tournament_player_stats.splits` (§37) can't be "splits caused by this player" the way
         winners/drops can, since SPLIT rallies have no `player_id` at all (§27) — credited
         instead as "SPLIT rallies in games this player took part in," shared across every
         participant of a match.
      2. A player with zero WINNER+DROP rallies in a whole match has an undefined normalized
         performance (§30 divides by winners+drops), but §33 requires a rating update after
         *every* completed match — falls back to a neutral performance score of 50 rather than
         skipping the update.
      3. `tournament_player_stats.tournament_rating` is read as "this player's current global
         rating as of this tournament," not a second, tournament-scoped rating system (§36
         keeps points and rating separate but doesn't describe two rating scales).
      4. `tournament_player_stats.average_performance` averages the blended Match Performance
         (§32, post win/loss), matching that section's naming, not the raw pre-blend
         Individual Performance Score (§31).
      **Found and fixed one real bug while verifying:** `calculate_match_result`'s
      `winner_team_id` OUT parameter has the same name as the `games.winner_team_id` column it
      queries against, and PL/pgSQL resolved the bare column reference to the OUT parameter
      instead of the table column ("column reference is ambiguous"). Fixed by table-aliasing
      the query (`games g`, `g.winner_team_id`).
      **Verified end-to-end** 2026-08-30: 34 pgTAP assertions
      (`supabase/tests/database/0003_match_completion.test.sql`, run via `supabase db query
      --linked -f`, no Docker in this sandbox) covering a full Bo1 happy path with hand-checked
      performance/rating/category/stats arithmetic, a second completed match proving
      average_performance and rating roll forward (not reset) across a tournament, Bo3's
      "first to 2 games" gating (including refusing an undecided match and a 1-1 tie), refusing
      to re-complete an already-COMPLETED match, and scorer-vs-admin authorization. Reran
      0001/0002's suites (25/25, 28/28) to confirm no regression. Build/lint/vitest pass against
      regenerated types; `supabase db advisors --linked` clean beyond the same pre-existing
      findings as 4.1-4.3, plus `complete_match` itself being `authenticated`-callable, which is
      intentional.

- [x] **4.8 Match lifecycle RPCs (gap-fill, discovered building 5.1)** —
      `supabase/migrations/0006_match_lifecycle.sql`. 0002_rls_policies.sql's own design comment
      anticipated three RPCs — "start_match, complete_match, undo_last_rally" — but the actual
      4.1-4.7 item list never included `start_match`, so it was never built. Without it a match
      can never leave `SCHEDULED`: scorers have no direct UPDATE grant on `matches`, and the
      rallies insert policy requires `m.status = 'LIVE'` — no rally could ever be recorded at
      all. Same gap for `games`: scorer is SELECT-only, so game-row creation (game 1 at match
      start, game 2/3 for Bo3) also needs an RPC, not a client insert.
      - `start_match(match_id)`: SCHEDULED -> LIVE, creates game 1.
      - `start_next_game(match_id)`: creates the next game once the current one is COMPLETED
        and the match isn't already decided (that's `complete_match`'s job instead) — refuses
        past `best_of`.
      Same SECURITY DEFINER + admin/scorer-authorization shape as `undo_last_rally`/
      `complete_match`.
      **Found and fixed one real bug while verifying (again, insertion order):** a fixture bulk-
      inserted a match's winning team's full point total *before* the losing team's — which
      auto-completes the game after the first insert (via 4.2's trigger), so the second bulk
      insert then got rejected by RLS as a write into a no-longer-`IN_PROGRESS` game. Same class
      of mistake as 0003's fixtures; fixed the same way (below-target team's points land first).
      **Verified end-to-end** 2026-08-30: 12 pgTAP assertions
      (`supabase/tests/database/0004_match_lifecycle.test.sql`) — SCHEDULED->LIVE + game 1
      creation, authorization, can't restart, can't skip ahead while a game is in progress,
      Bo3 continuation once a game completes, refusing to start another game once the match is
      already decided, refusing past `best_of`. Reran 0001-0003 (25/25, 28/28, 34/34) to confirm
      no regression. Build/lint/vitest pass against regenerated types; `db advisors` clean
      beyond the same pre-existing findings plus these two functions being intentionally
      `authenticated`-callable.

## Phase 5 — Scorer UI (highest priority UX)

- [x] **5.1 Scorer login + assigned court view** — `src/app/scorer/page.tsx`. Queries
      `matches` filtered to `scorer_id = <caller's profile>` and status LIVE/SCHEDULED — RLS
      (`matches_scorer_select_assigned`) is what actually enforces this, the query filter is
      belt-and-suspenders UX only. A LIVE match redirects straight to the live scoring screen
      (nothing to choose, they're already scoring); SCHEDULED matches list with a
      `StartMatchButton` (calls the `start_match` RPC from 4.8).
- [x] **5.2 Live scoring screen** — `src/components/scorer/live-scoring-screen.tsx`, backed by
      `src/app/scorer/actions.ts` (`recordRally`, a plain scorer-owned INSERT — RLS already
      restricts it to the caller's own LIVE match/IN_PROGRESS game, no RPC needed here) and
      `src/lib/validation/rally.ts`. Flow exactly per §23/§55: tap a player -> tap WINNING
      SHOT/DROP (DROP resolves the opposing team automatically) -> next rally; SPLIT is a
      separate always-available button (tap it -> tap which side won, since SPLIT has no player
      to infer team from — 4.1's `winning_team_id` schema decision). §52 double-tap protection:
      every action button disables while a request is in flight. §51 idempotent rally IDs: each
      rally gets a client-generated `crypto.randomUUID()` up front, stored alongside its exact
      payload; a retry reuses that same id/payload rather than minting a new one, so the
      rallies table's own primary-key uniqueness — not application logic — is what prevents a
      duplicate on retry. Optimistic score display: computed from a `{baseScore, bumped}` pair
      recorded at submit time, naturally superseded (no `useEffect`/state-sync needed) the
      moment the server's real score no longer matches that baseline.
- [x] **5.3 Undo control** — always-visible while a game is in progress, calls the
      `undo_last_rally` RPC (4.3) via `undoLastRally` in the same actions file.
- [x] **5.4 Game/match completion flow** — derives "game complete, match undecided" vs "match
      decided" client-side from the `games` list (games won per team vs `ceil(best_of/2)`) to
      choose which prompt to show: "Start Game N" (`start_next_game`, 4.8) or "Complete Match"
      (`complete_match`, 4.7) — the RPCs themselves remain the actual source of truth/validation
      either way, this is just which button to offer. A COMPLETED (or CANCELLED) match renders
      a read-only summary (per-game final scores) instead of the scoring UI — "locks the
      screen" per spec, achieved by branching on `matches.status` rather than a separate lock
      flag.
      **Verified end-to-end** 2026-08-30: live-browser Playwright at a 390px mobile viewport,
      logged in as a real scorer account — started an assigned SCHEDULED match, recorded a
      WINNER, a DROP, and a SPLIT rally through the actual tap flow, undid the SPLIT, confirmed
      every step's score against the database directly (not just the screenshot, which raced
      `router.refresh()` a few times harmlessly), fast-forwarded to a decided Bo1 match and
      confirmed the "Complete Match" prompt appears and works, and confirmed the completed
      match's read-only summary. Cross-checked `complete_match`'s actual side effects
      end-to-end through the real UI: both players' `player_ratings` matched hand-calculated
      expected values exactly. No console errors. Build/lint/vitest pass. Test fixtures cleaned
      up afterward (surfaced that `rallies.winning_team_id` needs its `teams` rows' rallies
      deleted before a cascading tournament delete can reach them, since that FK is
      `ON DELETE RESTRICT`, not `CASCADE` — documented here for the next cleanup).
- [ ] **5.5 Connection resilience** — connection-state indicator, in-memory match-state
      preservation across a dropped connection. Deliberately scoped out of 5.1-5.4 (same split
      as Phase 4's two commits) — retry-safety and idempotency (the "don't create duplicate
      rallies on retry" half of §51) are already in place via 5.2's client-generated rally IDs;
      what's left is the network-awareness UI layer (offline indicator, queuing/replay while
      disconnected, resuming in-memory state after a reconnect).

## Phase 6 — Group Standings, Qualification, Temporary Teams

- [x] **6.1 Group standings view** — `group_standings(p_group_id)`,
      `supabase/migrations/0007_group_standings.sql`. §70 tie-break chain: tournament_points
      DESC → head-to-head → aggregate group-stage performance → game differential. Scoped
      strictly to `matches.group_id = p_group_id AND status = 'COMPLETED'` — cross-category/
      final matches (`group_id` NULL) structurally cannot leak in. Admin-only (SECURITY
      DEFINER bypasses RLS internally, so this needed its own `is_admin()` check — a scorer
      has zero RLS visibility into group/tournament data by design, and this function
      shouldn't be the backdoor around that).
      **Scope decision:** head-to-head is only applied for a clean 2-way tie on points — a
      3+-way tie falls straight through to aggregate performance instead. PRODUCT_SPEC.md
      defines H2H unambiguously for two players (did A beat B?) but doesn't specify a
      round-robin mini-league tie-break for 3+, which is a substantially larger, separately-
      specified problem. Documented in the migration's file header.
- [x] **6.2 Top-2 qualification** — `compute_group_qualification(p_group_id)` (same
      migration): reads `group_standings`, **persists** ranks 1-2 into `group_qualifications`
      (§15 — never recalculated-and-discarded), and leaves any admin-overridden rank
      untouched on a recompute. `override_group_qualification(p_group_id, p_player_id,
      p_rank)`: admin manually sets a rank (§44), marked `is_override` so it survives future
      recomputes. Both admin-only.
      **Verified end-to-end** 2026-08-30: 27 pgTAP assertions
      (`supabase/tests/database/0005_group_standings.test.sql`) — three hand-constructed
      scenarios each isolating one tie-break level (no ties; a clean 2-way H2H tie; a 2-way
      tie where H2H is unavailable because the pair never played each other, resolved by
      performance), a cross-category match proven not to affect group points, qualification
      persistence, override survival across a recompute, and authorization (scorer blocked
      from all three functions, including calling `group_standings` directly). Found and fixed
      two real bugs while verifying: matches never actually reached `status = 'COMPLETED'` in
      the fixtures (that only happens via `complete_match`, not automatically when a game
      completes — the test was checking a filter against data it never actually satisfied),
      and the missing `is_admin()` check on `group_standings` itself (caught by writing the
      "scorer cannot call this" test the same way every other RPC in this codebase gets one).
      Reran 0001-0004 to confirm no regression.
- [x] **6.3 Temporary team creation** — needed no new backend code. `teams`/
      `match_participants` are already match-scoped with no permanent team entity anywhere in
      the schema (0001_init_schema.sql), and `createMatch` (3.6) already accepts an arbitrary
      player list — "Create Qualified Team" is a UI-level concern (picking from
      `group_qualifications` instead of the full roster), not a new database capability.
- [x] **6.4 Cross-category match creation** — likewise needed no new match-creation backend:
      a cross-category match is just `createMatch` with `group_id` omitted, and `cancelMatch`
      (3.6) already works regardless of `group_id`. The one genuinely missing piece — "reopen
      match" (§45/§46, listed explicitly in this task and nowhere else in the codebase) — is
      `reopen_match(p_match_id)`, `supabase/migrations/0008_reopen_match.sql`: the reverse of
      `complete_match`, admin-only. Undoes each participant's rating update and
      `tournament_player_stats` contribution using the exact values `complete_match` itself
      recorded in `player_rating_history` (previous_rating, match_performance) rather than
      re-deriving them, then clears `matches.status/completed_at/winner_team_id` back to
      LIVE/NULL. Never touches `rallies`/`games` — a reopened match's history is exactly as it
      was, ready for correction and re-completion.
      **Found and fixed a real bug while verifying:** a `CASE WHEN ... THEN NULL ELSE
      <division> END` guarding a divide-by-zero, written inline inside an `UPDATE ... SET`
      list, still raised `division by zero` — the short-circuit didn't prevent evaluation the
      way the identical expression does as a standalone `SELECT`. Fixed by computing the
      value as a plain plpgsql variable (`IF ... THEN ... ELSE ... END IF`) before the
      `UPDATE` instead of inline in the SQL. Verified via 12 pgTAP assertions
      (`supabase/tests/database/0006_reopen_match.test.sql`): a completed match's rating/
      confidence/category/stats revert to exactly their pre-match values, `player_rating_
      history` rows are removed, raw rallies are untouched, a scorer cannot reopen, and a
      non-COMPLETED match cannot be reopened. Reran 0001-0005 to confirm no regression.
      **Coordination note:** built alongside a concurrent session
      (`badminton-scoring-app-f3`) doing the Phase 6 UI + a broader admin dashboard redesign
      on the same working tree. Confirmed no overlap (they reached the same "6.3/6.4 needs no
      new DB entity" conclusion independently); ran a real `supabase gen types` pass to
      replace their hand-typed stub for 0007 and pick up 0008. This commit is scoped to
      `supabase/migrations`, `supabase/tests/database`, `TASKS.md`, and the regenerated
      `database.types.ts` only — their UI changes are theirs to commit.
      **UI wiring:** `reopenMatch` added to `src/app/admin/tournaments/match-actions.ts`
      (clean isolated diff, committed) and a "Reopen" button for `COMPLETED` matches in
      `src/components/admin/matches-manager.tsx` (not committed — that file already carried
      the other session's uncommitted redesign, so the two are now interleaved there; the
      button ships whenever they commit that file). Verified live end-to-end via Playwright
      against the real (redesigned) admin UI: completed a match, clicked Reopen, confirmed
      the LIVE badge and the DB's rating/matches_count/tournament_player_stats reversion, no
      console errors.

## Phase 7 — Admin Dashboards & History

- [ ] **7.1 Admin home dashboard** — KPIs (§40) + live court monitor (§41), all derived queries.
- [ ] **7.2 Tournament dashboard** — overview/players/groups/courts/matches/scorers/leaderboard/
      statistics tabs (§43).
- [ ] **7.3 Group dashboard** — standings + qualified badges + override control (§44).
- [ ] **7.4 Cross-category dashboard** — §45 full admin editing power on live/upcoming matches.
- [ ] **7.5 Match edit + recalculate** — §46: edit players/teams/court/scorer/scores/rallies,
      "Recalculate" re-runs 4.4–4.7 from raw rallies, never trusts stored totals as source.
- [ ] **7.6 Tournament history browser** — §39, read-only view into completed (immutable except
      admin-corrected) tournaments.
- [ ] **7.7 Player admin table + career stats** — §42, §38: sortable/filterable/paginated,
      career stats aggregated across tournaments from raw match/rally data.
- [ ] **7.8 Rating history display** — §61 chart (Recharts) per player.
- [ ] **7.9 Simple analytics** — §64: player growth, participation, rating distribution, match
      activity, top performers. No advanced analytics.
- [ ] **7.10 Categories settings page** — admin edits `rating_categories` thresholds (§35).

## Phase 8 — Seed Data & Testing

- [ ] **8.1 Seed data** — §65: 30 players, 3 tournaments, 6 courts, multiple groups/matches,
      rotating partners, mix of completed/live matches, WINNER/DROP/SPLIT events, historical
      participation across tournaments for at least a few players.
- [ ] **8.2 Automated tests** — §66 checklist as actual test suite: Vitest for scoring math/
      deuce-cap logic/rating/standings/tie-breaks/qualification, Playwright for the full admin
      + scorer e2e flow (§70). RLS gets its own SQL-level suite in 1.2, not Vitest/Playwright.
- [ ] **8.3 End-to-end acceptance run** — manually or via Playwright, walk the full §67 flow
      (admin setup → scorer live scoring → system calc → qualification → cross-category →
      historical access) and record results.

## Phase 9 — Deployment

- [ ] **9.1 Vercel deployment** — env vars, production Supabase project, preview deployments.
- [ ] **9.2 Final RLS/security pass** — re-verify §50 and §68 rules against the live schema
      before calling MVP done.

---

## Resolved decisions (see PRODUCT_SPEC.md §70 for the authoritative text)

1. **Auth:** password-based (Supabase Auth email+password). Admin accounts provisioned
   directly; scorer accounts via admin invite-by-email (recipient sets their own password).
2. **Scoring rules:** rally scoring, target 21 / win-by 2 / cap 30, configurable per tournament
   (defaults as above). Best-of-3 = first to 2 games.
3. **Group-stage tie-break chain:** Tournament Points → head-to-head → aggregate group-stage
   normalized performance (summed winners/drops across completed group-stage matches only,
   never averaged per-match) → game differential → admin override. Cross-category/final
   matches never affect group-stage standings.
4. **Testing:** Vitest (unit/integration — scoring math, rating, standings, tie-breaks,
   qualification) + Playwright (e2e — full admin/scorer workflows). No Jest, no Cypress.
5. Single-tenant for MVP (unchanged assumption, still no spec input needed).

## Remaining open question

1. Multi-tenant is still just an assumption, not a confirmed decision — revisit only if it
   comes up; doesn't block any current phase.

## Post-launch fixes & additions (found using the deployed app)

- [x] **Mobile link visibility** — tournament/player list names relied on `hover:underline` only
      (no visible affordance on touch devices) — this was the actual cause of a "no option to
      edit the tournament" report. Fixed with an always-visible brand-colored underline.
- [x] **Per-team source group for cross-category matches** — `createMatch` (3.6) applied one
      `groupId` to both teams uniformly; correct for group-stage matches (both players share a
      group) but wrong for cross-category ones, where team1/team2 are qualified pairs from
      *different* groups. Added optional `team1SourceGroupId`/`team2SourceGroupId` (fall back
      to `groupId` when omitted — the existing group-stage form needs no changes).
- [x] **Cross-category standings** — `cross_category_standings(p_stage_id)`,
      `supabase/migrations/0009_leaderboards.sql`. Per user spec: 2 points/win, tie-break =
      total badminton points scored (not differential) across all of a team's matches. Grouped
      by `teams.source_group_id` — since there's no permanent team entity, a team's rows across
      separate round-robin matches are recovered by which group they were sourced from, not a
      shared team id. Admin-only (SECURITY DEFINER bypasses RLS, same reasoning as
      `group_standings`). UI is `badminton-scoring-app-f3`'s to build (Phase 6 DB/UI split).
- [x] **Global player leaderboard** — `player_leaderboard()`, same migration. Two independent
      columns per user request — current rating and cumulative career tournament points (summed
      across every tournament a player has played, not just one) — rather than one blended
      score; the UI sorts by whichever it wants. Admin-only.
      **Found and fixed two real bugs while verifying:**
      1. Same class of bug as `calculate_match_result` (Phase 4): `cross_category_standings`'s
         own OUT parameters (`source_group_id`, `won`) shadowed bare column references to the
         same names inside nested subqueries/FILTER clauses, causing "ambiguous column"
         errors. Fixed by qualifying every occurrence with its table/CTE alias.
      2. `player_names` returned each player's name once per match their team had played,
         since a "team" is really the same 2 people re-inserted as fresh `teams` rows per
         match. Fixed with `string_agg(DISTINCT ...)`.
      **Verified end-to-end** 2026-08-30: 16 pgTAP assertions
      (`supabase/tests/database/0007_leaderboards.test.sql`) — a 3-team round-robin with a
      deliberate 3-way tie on points, verified broken correctly by total score; career points
      summed correctly across two separate tournaments for the same player; both functions'
      admin-only authorization. Reran 0001-0006 to confirm no regression (0001 shows one
      count-based assertion now off by one — not a regression, an artifact of intentionally
      leaving demo data live in the project; noted as a test-suite fragility, not a product
      bug). Build/lint/vitest pass against regenerated types; `db advisors` clean beyond
      pre-existing findings plus these two functions' intentional `authenticated`-callable
      status.
