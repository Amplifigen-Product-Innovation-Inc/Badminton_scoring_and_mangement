"use client";

import { useMemo, useState } from "react";
import { CourtCard } from "@/components/ui/court-card";

export type MonitorMatch = {
  id: string;
  matchNumber: number;
  status: "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED";
  courtId: string | null;
  stageName: string | null;
  team1Label: string;
  team2Label: string;
  score?: [number, number];
};

const STATUS_FILTERS = ["ALL", "LIVE", "SCHEDULED", "COMPLETED"] as const;

/** §19 — filter by stage, filter by status, search, open match. */
export function LiveCourtMonitor({
  courts,
  matches,
  stageNames,
}: {
  courts: { id: string; name: string }[];
  matches: MonitorMatch[];
  stageNames: string[];
}) {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [stage, setStage] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const filteredMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return matches.filter((m) => {
      if (status !== "ALL" && m.status !== status) return false;
      if (stage !== "ALL" && m.stageName !== stage) return false;
      if (
        q &&
        !`${m.team1Label} ${m.team2Label} ${m.matchNumber}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [matches, status, stage, search]);

  const matchByCourt = new Map(
    filteredMatches.filter((m) => m.status === "LIVE" && m.courtId).map((m) => [m.courtId, m])
  );
  const filteredCourtIds = new Set(
    filteredMatches.map((m) => m.courtId).filter((id): id is string => id != null)
  );
  const hasActiveFilter = status !== "ALL" || stage !== "ALL" || search.trim() !== "";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by player or match number"
          aria-label="Search matches"
          className="h-11 min-w-[220px] flex-1 rounded-lg border border-surface-border bg-surface px-3 text-sm text-neutral-900 placeholder:text-neutral-400"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof STATUS_FILTERS)[number])}
          aria-label="Filter by status"
          className="h-11 rounded-lg border border-surface-border bg-surface px-3 text-sm text-neutral-900"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "ALL" ? "All statuses" : s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        {stageNames.length > 0 && (
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            aria-label="Filter by stage"
            className="h-11 rounded-lg border border-surface-border bg-surface px-3 text-sm text-neutral-900"
          >
            <option value="ALL">All stages</option>
            {stageNames.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {courts
          .filter((c) => !hasActiveFilter || filteredCourtIds.has(c.id))
          .map((court) => {
            const match = matchByCourt.get(court.id);
            return (
              <CourtCard
                key={court.id}
                courtName={court.name}
                status={match ? "LIVE" : "IDLE"}
                score={match?.score}
                teamLabels={match ? [match.team1Label, match.team2Label] : undefined}
                href={match ? `/scorer/matches/${match.id}` : undefined}
              />
            );
          })}
      </div>
    </div>
  );
}
