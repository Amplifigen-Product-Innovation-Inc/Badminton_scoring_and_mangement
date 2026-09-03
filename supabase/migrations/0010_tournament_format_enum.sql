-- ============================================================================
-- 0010_tournament_format_enum.sql
-- tournaments.format was free text ("Singles, round-robin groups", or just
-- "Doubles"/"Double" typed by hand). The admin UI now offers it as a fixed
-- dropdown (Singles / Doubles / Mixed Doubles) instead, so normalize the
-- handful of existing rows to the new canonical values. The column stays
-- `text` (not a real enum) — application-level validation
-- (src/lib/validation/tournament.ts, tournamentFormatValues) is what
-- actually constrains new writes, consistent with how `format` was already
-- being handled (never a DB-level enum, see 0001_init_schema.sql's note on
-- why match_type/best_of were split out instead).
-- ============================================================================

update tournaments
set format = case
  when format ilike 'mixed%' then 'MIXED_DOUBLES'
  when format ilike 'double%' then 'DOUBLES'
  when format ilike 'single%' then 'SINGLES'
  else format
end
where format is not null
  and format not in ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES');
