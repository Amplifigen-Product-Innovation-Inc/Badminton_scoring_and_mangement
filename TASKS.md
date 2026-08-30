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
- [x] **0.5 Auth scaffold** — Supabase Auth, `profiles` table linkage, login page, role-based
      redirect (ADMIN → `/admin`, SCORER → `/scorer`). Defaulted to **magic link** (open
      question #1 below) — swap `/login` + `/auth/callback` if password auth is wanted instead.

## Phase 1 — RLS & Access Control

- [ ] **1.1 RLS policies (migration 002)** — implement spec §50 exactly: admin full CRUD;
      scorer scoped to assigned match/court/players/rallies; no scorer access to
      players/tournaments/ratings/categories tables.
- [ ] **1.2 RLS test suite** — pgTAP or scripted SQL tests proving: scorer cannot read/write
      other scorers' matches; scorer cannot touch `player_ratings`, `rating_categories`,
      `tournaments`; admin can do everything. This must pass before any UI work trusts RLS.

## Phase 2 — Player Management (Admin)

- [ ] **2.1 Player CRUD + email normalization** — `players` table service layer: trim/lowercase
      email, duplicate detection on insert, unique constraint enforced at DB level too.
- [ ] **2.2 Admin Players page** — list with columns from §7 (tournaments played, matches,
      win %, rating, category, first/last played) — all derived via view/function, not stored
      redundantly. Search (name/email), filter (All/New/Returning).
- [ ] **2.3 New vs Returning derivation** — SQL view or function: "returning" = participated in
      ≥1 tournament with status COMPLETED; no boolean column.
- [ ] **2.4 Add Player flow** — form (React Hook Form + Zod), duplicate-found UX (§9).

## Phase 3 — Tournament & Stage Structure (Admin)

- [ ] **3.1 Tournament CRUD** — create/edit/cancel, status enum, fields from §10.
- [ ] **3.2 Tournament stage model** — `tournament_stages` CRUD, flexible stage_type
      (GROUP/CROSS_CATEGORY/FINAL), ordering.
- [ ] **3.3 Add players to tournament** — search-and-select existing players + inline "add new
      player" (§58), writes to `tournament_players`.
- [ ] **3.4 Groups** — `tournament_groups` + `group_players` CRUD; admin UI to create groups
      and assign players within a stage.
- [ ] **3.5 Courts** — global `courts` table CRUD + per-tournament `tournament_courts` with
      status (AVAILABLE/ASSIGNED/LIVE/COMPLETED).
- [ ] **3.6 Match creation** — create matches within a group/stage, assign court, format
      (singles/doubles, Bo1/Bo3), scorer assignment (prefer court-level per §22).

## Phase 4 — Scoring Engine (pure logic, DB functions)

- [ ] **4.1 Rally recording** — `rallies` insert with idempotent client-generated IDs (§51),
      WINNER/DROP/SPLIT event types, attribution rules (§25–27).
- [ ] **4.2 Badminton score update** — Postgres function: rally event → game score increment
      (§28), game completion detection (21/decider rules — confirm exact badminton rules with
      user if not just "first to 21"), Bo1/Bo3 match completion (§29).
- [ ] **4.3 Undo** — reverse latest rally: delete/void rally row, recompute game score,
      recompute in-flight performance. Scoped to scorer's own recent rally only.
- [ ] **4.4 Individual performance calc** — Postgres function implementing §30–32 exactly
      (normalized performance, 80/20 blend with match result). Unit-testable via SQL fixtures.
- [ ] **4.5 Rating update function** — §33 (80/20 rolling), clamp 0–100, write
      `player_rating_history` row (§61) on every completed match — never overwrite without
      history.
- [ ] **4.6 Rating confidence + category** — §34 confidence buckets, §35 category lookup
      against editable `rating_categories` thresholds.
- [ ] **4.7 Match completion orchestration** — single Postgres function/RPC that on match
      complete runs steps 1–9 of §29 atomically (one transaction): lock match, compute
      performance, determine winner, award tournament points (win×2), update rating/category/
      history, update tournament_player_stats, preserve raw rallies untouched.

## Phase 5 — Scorer UI (highest priority UX)

- [ ] **5.1 Scorer login + assigned court view** — mobile-first, shows assigned court/match only
      (RLS-enforced, not just UI-filtered).
- [ ] **5.2 Live scoring screen** — player-select buttons → WINNER/DROP/SPLIT (§23, §55), score
      display, 1–2 tap flow, double-tap protection (§52), optimistic local update + server
      confirm.
- [ ] **5.3 Undo control** — always-visible, calls 4.3.
- [ ] **5.4 Game/match completion flow** — end game, start next game (Bo3), complete match,
      triggers 4.7, then locks the screen (read-only "match complete" state).
- [ ] **5.5 Connection resilience** — connection-state indicator, retry-safe rally submission
      (idempotency key from 4.1), in-memory match-state preservation across a dropped
      connection.

## Phase 6 — Group Standings, Qualification, Temporary Teams

- [ ] **6.1 Group standings view** — tournament_points DESC + tie-break chain (§14): H2H →
      match differential → normalized performance → admin override field.
- [ ] **6.2 Top-2 qualification** — computed + **persisted** (§15) qualification record per
      group, not recalculated-and-discarded on every render.
- [ ] **6.3 Temporary team creation** — admin UI "Create Qualified Team" (§44), writes `teams` +
      `match_participants` scoped to a specific match; explicitly no permanent team table/entity
      anywhere in the schema.
- [ ] **6.4 Cross-category match creation** — admin builds matches from qualified teams across
      groups (§17, §45): assign court/scorer, edit/replace player, cancel/reopen.

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
- [ ] **8.2 Automated tests** — §66 checklist as actual test suite (unit tests for scoring math,
      integration tests for RLS, e2e for the scorer flow). Framework choice: confirm
      Vitest/Playwright with user.
- [ ] **8.3 End-to-end acceptance run** — manually or via Playwright, walk the full §67 flow
      (admin setup → scorer live scoring → system calc → qualification → cross-category →
      historical access) and record results.

## Phase 9 — Deployment

- [ ] **9.1 Vercel deployment** — env vars, production Supabase project, preview deployments.
- [ ] **9.2 Final RLS/security pass** — re-verify §50 and §68 rules against the live schema
      before calling MVP done.

---

## Open questions to resolve before/during Phase 0–1 (flagged, not blocking scaffold)

1. Auth method for scorers/admins: magic link vs password vs invite-only? Spec doesn't say.
2. Exact badminton scoring rules to encode (win by 2, cap at 30, deuce at 20-20) — spec says
   "Best of 1 / Best of 3" and shows 21-point examples but doesn't state deuce/cap rules.
3. Tie-break §14 point 3 ("individual normalized performance") — normalized performance is
   per-match; need to define how it aggregates for a tie-break across a group's matches.
4. Testing framework preference (Vitest/Jest, Playwright/Cypress).
5. Single admin org, or later multi-tenant? (assume single-tenant for MVP per spec silence)

These don't block Phase 0 scaffolding but do block 3.6 (match/game format) and 8.2 — will ask
before those phases start.
