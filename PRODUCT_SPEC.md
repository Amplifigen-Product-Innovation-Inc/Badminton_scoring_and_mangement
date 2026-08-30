# FULL-STACK DEVELOPMENT PROMPT — BADMINTON SCORING, TOURNAMENT & PLAYER RATING MVP

> This is the master build prompt (verbatim, as provided). `TASKS.md` breaks this into scoped
> implementation tasks. Treat this file as the source of truth for product rules; treat
> `TASKS.md` as the source of truth for sequencing.

## Role

Act as a senior full-stack product engineer, UX designer, database architect, and QA engineer.

Build a production-quality MVP web application for a badminton scoring and tournament
management platform.

The application must be:

- Fast
- Mobile responsive
- Extremely easy for scorers to use during live badminton games
- Clean and modern
- Database-driven
- Designed for future matchmaking and player profiles
- Simple enough to launch as an MVP
- Structured so historical data is never lost

Do not over-engineer.

---

## 1. PRODUCT PURPOSE

The platform manages badminton tournaments and playing sessions.

The core product loop is:

```
ADMIN
↓
Create Tournament
↓
Add Players
↓
Create Groups
↓
Assign Players
↓
Create Matches
↓
Assign Courts + Scorers
↓
SCORER RECORDS RALLIES
↓
Winner / Drop / Split
↓
Calculate Individual Performance
↓
Calculate Player Rating
↓
Categorize Players
↓
Calculate Tournament Match-Win Points
↓
Rank Players Within Groups
↓
Top 2 Players Qualify
↓
Create Temporary Teams
↓
Cross-Category Competition
↓
Final Tournament Results
↓
Preserve All Historical Data
```

The application must support players having a different partner in every match.

A team is therefore temporary and belongs to a specific match/stage/tournament.

Do NOT create permanent teams.

---

## 2. TECHNOLOGY STACK

**Frontend:** Next.js, React, TypeScript, Tailwind CSS, responsive/mobile-first UI.

**Backend:** Supabase, PostgreSQL, Supabase Auth, Supabase Row Level Security.

**Deployment:** Vercel.

**Optional libraries (use only where useful):** React Hook Form, Zod, TanStack Query,
Lucide React, Recharts. Do not add unnecessary libraries.

---

## 3. USER ROLES

### ADMIN

Full control: create/edit/cancel tournaments; add/edit/remove players; add existing players to
tournaments; create groups; assign players to groups; create courts; create matches; create
temporary teams; assign players to teams; assign scorers; start/end matches; edit matches;
correct rally events; recalculate statistics; view historical tournaments and player stats;
view leaderboards/ratings/categories; change category thresholds; reopen completed matches;
correct incorrect scores; override tournament advancement where necessary.

### SCORER

Can: login; view assigned court/match; see assigned teams and players; record rally outcomes;
undo the latest rally; see live score; end game; complete match.

Cannot: modify players; modify tournaments; modify categories; modify historical data; change
player ratings; create tournament structure; modify another scorer's matches.

---

## 4. IMPORTANT PRODUCT PRINCIPLE

Three separate concepts — do not combine them:

- **A. Individual Match Performance** — how the player performed during the actual rallies.
- **B. Long-Term Player Rating** — overall ability across matches/tournaments; powers future
  matchmaking.
- **C. Tournament Points** — performance in the current tournament; determines group standings
  and advancement. Must NOT directly change the player's skill rating.

---

## 5. PLAYER DATA — MVP

Do NOT build full player profiles yet. Players only need: Name, Email, optional Phone.

```
players
  id
  name
  email
  phone
  created_at
  updated_at
```

Email must be unique. Normalize before storing: `trim()` + `lowercase()`. `AMAN@EMAIL.COM`,
`Aman@email.com`, `aman@email.com` must all resolve to the same player.

---

## 6. FUTURE PLAYER PROFILES

Architecture must support creating profiles later. A player may initially exist only as
name+email. Later, that person creates an account using the same email — the system should
associate the auth account with the existing player record. All historical tournaments,
matches, ratings, statistics must remain attached. Do not create duplicate players.

---

## 7. PLAYER MANAGEMENT

Admin dashboard "Players" list displays: Name, Email, Tournaments Played, Matches Played,
Matches Won, Match Win %, Current Rating, Current Category, First Joined, Last Played.

Filters: All / New / Returning. Search: Name, Email.

---

## 8. NEW VS RETURNING PLAYERS

- **New** — never participated in a completed tournament.
- **Returning** — participated in at least one previous tournament.

Do not store "new" as a permanent boolean if it can be derived from historical participation.
Prefer deriving it from tournament participation.

---

## 9. ADD PLAYER

Prominent "+ Add Player" button. Form: Name, Email.

On submit: validate email → normalize → check duplicate → insert → show success → refresh list.

If player already exists, show the existing player (name, email) with a "View Player" action
instead of creating a duplicate.

---

## 10. TOURNAMENT CREATION

"+ Create Tournament". Fields: Tournament Name, Date, Location, Format, Number of Courts,
Description.

Status: `DRAFT`, `OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.

---

## 11. TOURNAMENT STRUCTURE

A tournament consists of multiple stages, e.g. Group Stage → Qualification → Cross-Category
Stage → Final. Do not hard-code a single tournament format — use a flexible stage model.

```
tournament_stages
  id
  tournament_id
  name
  stage_type
  stage_order
  status
```

Stage types: `GROUP`, `CROSS_CATEGORY`, `FINAL`.

---

## 12. GROUP STAGE

Players compete individually within categories/groups. Each player accumulates: Matches
Played, Matches Won, Tournament Points, Individual Performance, Rating impact.

---

## 13. TOURNAMENT POINTS

Extremely simple: Match Won = 2 points, Loss = 0 points. `Tournament Points = Matches Won × 2`.

Do NOT award points for merely participating. Do NOT add a separate participation bonus.

---

## 14. GROUP STANDINGS

Leaderboard columns: Rank, Player, Played, Won, Lost, Points.

Primary ranking: Tournament Points DESC. Ties broken in order by:

1. Head-to-head result if available
2. Match differential
3. Individual normalized performance
4. Admin tie-break override

Do not randomly break ties.

---

## 15. TOP 2 QUALIFICATION

At the end of the group stage, the top 2 players qualify. Qualification must be **stored**, not
just calculated visually and discarded.

---

## 16. TEMPORARY TEAMS

The top 2 players from a group become a temporary team, sourced from that group. This team
exists only for this tournament/stage and must NOT change the player's permanent identity.

---

## 17. CROSS-CATEGORY COMPETITION

Teams from different categories/groups compete against each other. Team composition is stored
against the match. A player can have a different partner in a different match — this must be
supported naturally by the database.

---

## 18. NEVER CREATE PERMANENT TEAMS

Critical rule. Do NOT create permanent team records like "Aman + Sarah = permanent team".
Instead, team membership is contextual to the match:

```
match_participants
  match_id
  player_id
  team_id
```

This supports rotating partners, matchmaking, tournaments, random/new partners, social play,
future leagues.

---

## 19. MATCH MODEL

```
match_id
tournament_id
stage_id
group_id            NULL
court_id
match_number
format
status
scorer_id
winner_team_id
started_at
completed_at
```

Status: `SCHEDULED`, `LIVE`, `COMPLETED`, `CANCELLED`.

---

## 20. TEAM MODEL

Teams belong to a match.

```
teams
  id
  match_id
  team_number
  source_group_id     NULL
  source_category      NULL

match_participants
  id
  match_id
  team_id
  player_id
```

Doubles: two players per team. Singles: one player per team.

---

## 21. COURTS

Admin creates/manages courts (e.g. Court 1–6). Court status: `AVAILABLE`, `ASSIGNED`, `LIVE`,
`COMPLETED`. Admin assigns matches to courts.

---

## 22. SCORER ASSIGNMENT

Admin assigns a scorer to a Court OR a Match. For MVP, prefer assigning a scorer to a court.
When a scorer logs in, they see their assigned court/matches.

---

## 23. SCORER SCREEN

Highest-priority UX. Must work beautifully on mobile and tablet. The scorer should not need to
type while scoring.

Example layout: Court header, Game number, Team A players + score, Team B players + score, then
"Who caused the rally?" with one large button per player, then WINNING SHOT / DROP / SPLIT.

Optimize so a rally can be recorded in approximately 1–2 taps.

---

## 24. RALLY EVENT LOGIC

Each rally is stored as an individual database record.

```
rallies
  id
  game_id
  player_id     NULL
  event_type
  created_at
  created_by
```

Event types: `WINNER`, `DROP`, `SPLIT`.

---

## 25. WINNER

`player_id` = scorer, `event_type` = `WINNER`. Performance contribution: +1. The rally also
gives the appropriate team one badminton point.

---

## 26. DROP

`player_id` = the player who made the identifiable dropped/unforced error, `event_type` =
`DROP`. Performance contribution: -1. The opposing team gets the badminton rally point.

---

## 27. SPLIT

When the scorer cannot confidently attribute the outcome to one player: `event_type` = `SPLIT`,
`player_id` = NULL. Performance contribution: 0. The rally still counts toward the actual
badminton score but does NOT count toward either player's individual performance denominator —
this avoids artificially rewarding or penalizing players.

---

## 28. BADMINTON SCORE

The rally event also updates the actual game score: winning team +1. Event attribution and
badminton score are related but separate concepts. E.g. "Aman WINNER" → Team A +1 badminton
point, Aman +1 performance. "Mike DROP" → Team A +1 badminton point (opponent), Mike -1
performance.

---

## 29. GAME COMPLETION

Support Best of 1 and Best of 3. On match completion:

1. Lock normal scorer editing.
2. Calculate player performance.
3. Determine winning team.
4. Add one match win to each player on the winning team.
5. Calculate tournament points.
6. Update rating.
7. Update category.
8. Update tournament standings.
9. Preserve all raw rally data.

---

## 30. INDIVIDUAL PERFORMANCE FORMULA

```
Winning Shots = count(WINNER events)
Drops         = count(DROP events)

Raw Score = Winning Shots - Drops

Normalized Performance = (Winners - Drops) / (Winners + Drops)
```

SPLIT events are excluded from this calculation. Example: Winners=24, Drops=10, Splits=4 →
Raw=14, Normalized = 14/34 = 0.412.

---

## 31. PERFORMANCE SCORE 0–100

```
Performance Score = (Normalized Performance + 1) × 50
```

So -1.00→0, 0.00→50, +1.00→100. Example: 0.412 → 70.6, displayed as "Match Performance: 71/100".
Round to one decimal internally, display appropriately.

---

## 32. MATCH RESULT COMPONENT

Individual performance matters more than the match result.

```
Match Performance = 80% × Individual Performance + 20% × Match Result
```

Where Win = 100, Loss = 0. Example: Individual Performance=71, Win → 71×.80 + 100×.20 = 76.8 →
displayed as 77.

---

## 33. PLAYER RATING

New players start at 50. After each completed match:

```
New Rating = 80% × Previous Rating + 20% × Match Performance
```

Example: Previous=50, Match Performance=77 → 50×.80 + 77×.20 = 55.4. Clamp rating to 0–100.
This is an MVP heuristic — do not implement ELO/Glicko yet.

---

## 34. RATING CONFIDENCE

- 0–2 completed matches → `PROVISIONAL`
- 3–5 completed matches → `EMERGING`
- 6+ completed matches → `ESTABLISHED`

Store `matches_count` and `rating_confidence`. Prevents new players from being treated as
highly reliable based on one game.

---

## 35. PLAYER CATEGORY

Initial categories (editable thresholds):

| Range | Category |
|---|---|
| 0–29 | Beginner |
| 30–44 | Developing |
| 45–59 | Intermediate |
| 60–74 | Advanced |
| 75–89 | Competitive |
| 90–100 | Elite |

```
rating_categories
  id
  name
  min_rating
  max_rating
  display_order
```

Do not hard-code category names into the UI — admin must be able to edit thresholds.

---

## 36. TOURNAMENT POINTS VS RATING

Keep completely separate. Tournament points (`Matches Won × 2`) are not used directly to
calculate the player's rating.

---

## 37. TOURNAMENT PLAYER STATISTICS

Per tournament/player combination: Matches Played, Matches Won, Matches Lost, Tournament
Points, Winning Shots, Drops, Splits, Average Match Performance, Tournament Rating, Tournament
Category. Can be stored or calculated via views/functions — prefer derived values where
practical.

---

## 38. CAREER PLAYER STATISTICS

Even without a player profile, the system should display aggregate career stats: tournaments,
matches, wins, losses, win rate, winning shots, drops, splits, current rating, category.
Historical tournament data should remain permanently accessible.

---

## 39. TOURNAMENT HISTORY

Admin can open "Tournaments" and see past tournaments (e.g. "Completed"). Opening one shows:
tournament details, players, groups, courts, matches, results, leaderboard, rally statistics,
qualified players, temporary teams, cross-category results.

---

## 40. ADMIN DASHBOARD

Top KPIs: Total Players, New Players, Returning Players, Active Tournaments, Completed
Tournaments, Matches Today, Matches Completed, Live Courts.

---

## 41. LIVE COURT MONITOR

Per-court card: status (LIVE/COMPLETED), score, team rosters. Clicking a court opens match
details.

---

## 42. ADMIN PLAYER DASHBOARD

Player table columns: Player, Tournaments, Matches, Wins, Win %, Rating, Category. Includes
search, filters, sorting, pagination.

---

## 43. TOURNAMENT DASHBOARD

Header stats (players/courts/matches/completed/live/upcoming) + stage progress indicator (✓
Group Stage / ● Cross Category / ○ Final). Tabs: Overview, Players, Groups, Courts, Matches,
Scorers, Leaderboard, Statistics.

---

## 44. GROUP DASHBOARD

Standings list with points, "QUALIFIED" checkmarks for top 2. Admin can manually override
qualification. Includes "[ Create Qualified Team ]" action.

---

## 45. CROSS-CATEGORY DASHBOARD

Shows Team A vs Team B (with source category), court, live status/score. Admin can: change
court, change scorer, edit players, replace team member, cancel match, reopen match.

---

## 46. ADMIN FULL EDITING POWER

For any match, "Edit Match" allows: change players, change teams, change court, change scorer,
edit game scores, edit rally events, delete incorrect rally, add missing rally, reopen match,
change winner, recalculate statistics. After modification, "RECALCULATE" must regenerate
derived statistics.

---

## 47. SOURCE OF TRUTH

Raw match/rally data is the source of truth. Do NOT make manually stored totals the primary
source of truth.

```
Hierarchy:   Player → Tournament Participation → Match → Game → Rally
Derived:     Rallies → Match Performance → Tournament Statistics → Career Statistics →
             Rating → Category
```

---

## 48. DATABASE SCHEMA

```sql
players
  id UUID PRIMARY KEY
  name TEXT NOT NULL
  email TEXT UNIQUE NOT NULL
  phone TEXT NULL
  created_at TIMESTAMP
  updated_at TIMESTAMP

profiles                    -- future auth association
  id UUID PRIMARY KEY
  player_id UUID
  auth_user_id UUID
  role TEXT                 -- ADMIN | SCORER
  created_at TIMESTAMP

tournaments
  id UUID PRIMARY KEY
  name TEXT NOT NULL
  date DATE
  location TEXT
  format TEXT
  description TEXT
  status TEXT
  created_by UUID
  created_at TIMESTAMP
  updated_at TIMESTAMP

tournament_players
  id UUID PRIMARY KEY
  tournament_id UUID
  player_id UUID
  status TEXT
  joined_at TIMESTAMP
  -- UNIQUE (tournament_id, player_id)

tournament_stages
  id UUID PRIMARY KEY
  tournament_id UUID
  name TEXT
  stage_type TEXT
  stage_order INTEGER
  status TEXT

tournament_groups
  id UUID PRIMARY KEY
  stage_id UUID
  name TEXT
  category TEXT NULL

group_players
  id UUID PRIMARY KEY
  group_id UUID
  player_id UUID

courts
  id UUID PRIMARY KEY
  name TEXT
  created_at TIMESTAMP

tournament_courts
  id UUID PRIMARY KEY
  tournament_id UUID
  court_id UUID
  status TEXT

matches
  id UUID PRIMARY KEY
  tournament_id UUID
  stage_id UUID
  group_id UUID NULL
  court_id UUID
  match_number INTEGER
  format TEXT
  status TEXT
  scorer_id UUID NULL
  winner_team_id UUID NULL
  started_at TIMESTAMP NULL
  completed_at TIMESTAMP NULL

teams
  id UUID PRIMARY KEY
  match_id UUID
  team_number INTEGER
  source_group_id UUID NULL
  source_category TEXT NULL

match_participants
  id UUID PRIMARY KEY
  match_id UUID
  team_id UUID
  player_id UUID

games
  id UUID PRIMARY KEY
  match_id UUID
  game_number INTEGER
  team_1_score INTEGER
  team_2_score INTEGER
  winner_team_id UUID NULL
  status TEXT

rallies
  id UUID PRIMARY KEY
  game_id UUID
  player_id UUID NULL
  event_type TEXT
  created_at TIMESTAMP
  created_by UUID

player_ratings
  id UUID PRIMARY KEY
  player_id UUID
  rating DECIMAL
  category_id UUID
  matches_count INTEGER
  confidence_status TEXT
  updated_at TIMESTAMP

tournament_player_stats
  id UUID PRIMARY KEY
  tournament_id UUID
  player_id UUID
  matches_played INTEGER
  matches_won INTEGER
  matches_lost INTEGER
  tournament_points INTEGER
  winning_shots INTEGER
  drops INTEGER
  splits INTEGER
  average_performance DECIMAL
  tournament_rating DECIMAL

rating_categories
  id UUID PRIMARY KEY
  name TEXT
  min_rating DECIMAL
  max_rating DECIMAL
  display_order INTEGER
```

---

## 49. DATABASE FUNCTIONS

Where appropriate, use Supabase/PostgreSQL functions for: recalculating match statistics,
recalculating tournament player statistics, recalculating career statistics, calculating player
rating, calculating category, updating tournament standings. Avoid putting all business logic
only in React.

---

## 50. RLS

Use Supabase Row Level Security.

**Admin:** full CRUD.

**Scorer:** can only access their assigned matches, the relevant tournament, relevant court,
players participating in their assigned match, and rally data for their assigned match.

Scorer can: `INSERT` rally, `UNDO` own recent rally, `UPDATE` allowed active match state.

Scorer cannot: `DELETE` players, edit tournaments, change ratings, change categories, edit
historical tournaments.

Never rely solely on frontend role checks.

---

## 51. SCORER OFFLINE/NETWORK RESILIENCE

Because scoring happens live, network interruptions must be handled gracefully. Implement
where practical: prevent duplicate rally submissions, disable buttons momentarily after tap,
use idempotent rally/event IDs, show connection state, preserve current match state in memory,
retry failed requests safely. Do NOT allow a network retry to create duplicate rallies.

---

## 52. DOUBLE-TAP PROTECTION

After submitting a rally: briefly disable the relevant controls, confirm server success, update
local state immediately where safe. The UI must feel instant.

---

## 53. UNDO

Scorer must have "Undo Last" which removes/reverses the latest rally and updates badminton
score, winning shots, drops, performance, rally count. Admin can later correct any rally.

---

## 54. UI DESIGN

Modern sports SaaS look: clean typography, large touch targets, subtle borders, rounded cards,
clear hierarchy, minimal visual clutter, responsive tables, mobile-first scorer screen,
desktop-first admin dashboard. Avoid: excessive gradients, excessive animation, tiny controls,
dense forms, unnecessary modals.

---

## 55. SCORER UX PRIORITY

The scorer screen is the most important screen in the app. Flow: Select player → Select outcome
→ Next rally, without navigating away. Large buttons per player, then WINNING SHOT / DROP /
SPLIT. Show current score prominently. Always show UNDO.

---

## 56. ADMIN NAVIGATION

Desktop: Dashboard, Tournaments, Players, Courts, Matches, Scorers, Categories, Settings.
Mobile: responsive menu.

---

## 57. TOURNAMENT CREATOR WORKFLOW

Create Tournament → enter info → select format → select courts → add existing players → add new
players if needed → create group stage → assign players to groups → create matches → assign
courts → assign scorers → start tournament.

---

## 58. ADDING PLAYERS TO TOURNAMENT

Search-and-select existing players (checkboxes) + "Add Selected", plus "+ Add New Player" which
inserts into the global player table and adds to the current tournament.

---

## 59. TOURNAMENT LEADERBOARD

Columns: Rank, Player, Matches, Wins, Losses, Points, Performance, Rating, Category. Ranking is
based primarily on Tournament Points (`Wins × 2`).

---

## 60. HISTORICAL DATA

Historical tournament data must never be lost — it will eventually power player profiles. Every
completed tournament retains: metadata, player participation, group membership, matches,
temporary teams, courts, scorers, games, rally events, match results, tournament points,
performance, rating history. A completed tournament is treated as historical/immutable except
for explicit admin corrections.

---

## 61. PLAYER RATING HISTORY

Do not overwrite historical rating information without retaining history.

```
player_rating_history
  id
  player_id
  tournament_id
  match_id
  previous_rating
  match_performance
  new_rating
  created_at
```

Enables future profile pages to show a rating-history chart.

---

## 62. FUTURE MATCHMAKING FOUNDATION

Do not build automatic matchmaking in this MVP, but the database must support it later. A
future matchmaking engine will use: current rating, category, match history, tournament
history, previous partners, availability, format. Because every match stores
`match_id`/`player_id`/`team_id`, we can later determine partner-pairing frequency and power a
future "Find New Partner" feature.

---

## 63. PLAYER PROFILE FOUNDATION

Future flow: Authentication account → email match → existing player record → historical
tournaments → historical matches → historical performance → current rating. Do not require
historical data migration.

---

## 64. ANALYTICS

Simple admin analytics only: player growth (new vs returning), tournament participation
(players per tournament), rating distribution (players by category), match activity (matches
per tournament), performance leaders (by wins, tournament points, average performance, rating).
Do not build advanced analytics for MVP.

---

## 65. DEVELOPMENT SEED DATA

At least: 30 players, 3 tournaments, 6 courts, multiple groups, multiple matches, rotating
partners, completed matches, live matches, winner/drop/split events, historical player
participation. Demonstrate that one player can have different partners across matches.

---

## 66. TESTING REQUIREMENTS

**Player:** duplicate email, new player, returning player, same player across tournaments.

**Tournament:** create, edit, cancel, complete, historical access.

**Match:** singles, doubles, different partners, court assignment, scorer assignment.

**Scoring:** winner, drop, split, undo, game completion, match completion.

**Rating:** first match, multiple matches, winning player, losing player, rating boundaries.

**Tournament logic:** group standings, 2-point win calculation, tie-breaking, top-2
qualification, temporary team creation, cross-category match.

**Security:** scorer cannot access unauthorized match, scorer cannot edit player, scorer cannot
change rating, admin has full access.

---

## 67. ACCEPTANCE TEST — FULL END-TO-END

**Admin:** Login → create tournament → add 20 players → select 16 players → create 4 groups →
assign players → create courts → create matches → assign temporary teams → assign scorers.

**Scorer:** Login → see assigned court → see players → start game → record rally (winner) →
record rally (drop) → record rally (split) → undo one rally → continue → complete match.

**System:** Calculate score → calculate winners/drops → calculate normalized performance →
calculate match performance → update player rating → update category → award 2 tournament
points per match win → update tournament standings.

**Tournament:** Group standings → top 2 players identified → temporary teams created →
cross-category matches created → scorers assigned → matches played → final results recorded.

**Historical:** Open previous tournament → see all players → see all matches → see all rally
data → see tournament standings → open player history → see previous tournaments → see career
statistics.

---

## 68. IMPORTANT ARCHITECTURE RULES

1. Do not create permanent teams.
2. Do not delete historical tournaments.
3. Do not overwrite raw rally data when calculating statistics.
4. Do not use tournament points as player skill rating.
5. Do not use player self-selected categories.
6. Do not create full player profiles in MVP.
7. Use email as the initial player identity.
8. Preserve historical player data for future profiles.
9. Use match participation to determine new vs returning players.
10. Make scorer UX faster than admin UX.
11. Admin has full correction capability.
12. Derived statistics must be recalculable from raw data.
13. Protect all backend access using Supabase RLS.
14. Design database relationships for rotating partners.
15. Do not build automatic matchmaking yet, but preserve the data required for it.

---

## 69. FINAL PRODUCT PRINCIPLE

The application is fundamentally a:

```
Rally Data → Player Performance → Player Rating → Player Category → Tournament Competition →
Historical Player Intelligence
```

platform. The MVP should prove that we can accurately collect rally-level data, determine
individual performance, categorize players, run tournament group stages, qualify the top two
players, create temporary teams, run cross-category matches, award tournament points, and
preserve the complete history. Everything else should be built on top of this foundation later.
