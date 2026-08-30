# Badminton Scoring, Tournament & Player Rating — MVP

- **Product spec:** [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) — the master build prompt, verbatim.
  Source of truth for product rules.
- **Implementation plan:** [`TASKS.md`](./TASKS.md) — the spec broken into scoped, sequenced
  tasks. Source of truth for what's done and what's next.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres + Auth + RLS) · Vercel.

## Status

Phase 0 (foundation) is scaffolded:

- Next.js app with the Tailwind/TypeScript/App Router setup, `src/` layout.
- Supabase client factories: [`src/lib/supabase/client.ts`](./src/lib/supabase/client.ts)
  (browser), [`server.ts`](./src/lib/supabase/server.ts) (server components/route handlers),
  [`service-role.ts`](./src/lib/supabase/service-role.ts) (privileged server-only — never
  bundled to the browser, guarded by the `server-only` package).
- Auth scaffold: magic-link login (`/login`), callback route (`/auth/callback`), role-based
  redirect (`/admin` vs `/scorer`), session-refresh proxy (`src/proxy.ts` — Next 16 renamed
  "middleware" to "proxy").
- Full base schema: [`supabase/migrations/0001_init_schema.sql`](./supabase/migrations/0001_init_schema.sql).
  RLS policies and business-logic functions (rating, standings, recalculation) are **not**
  written yet — see TASKS.md Phase 1 and Phase 4.

Everything from Phase 1 onward (RLS policies, player/tournament CRUD, the scoring engine, the
scorer UI, dashboards, seed data, tests) is still to be built — work through `TASKS.md` in
order; don't skip ahead, since later phases assume earlier ones are merged.

## Local setup

1. Create a Supabase project (or use the local dev stack via the Supabase CLI).
2. `cp .env.local.example .env.local` and fill in your project's URL/keys.
3. Apply the schema:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   npx supabase gen types typescript --linked > src/lib/types/database.types.ts
   ```
   (`src/lib/types/database.types.ts` currently ships as an `any` placeholder — regenerate it
   once the schema is live, and don't hand-edit it after that.)
4. `npm install`
5. `npm run dev` → http://localhost:3000

## Open questions

See the "Open questions" section at the bottom of `TASKS.md` — a few product decisions
(auth method, exact badminton deuce/cap rules, tie-break aggregation, test framework) are
flagged there as needing an answer before the phases that depend on them start.
