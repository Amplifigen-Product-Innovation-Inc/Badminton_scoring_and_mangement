"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCourtsToTournament,
  addNewCourtAndAddToTournament,
  removeCourtFromTournament,
  searchAvailableCourts,
  updateTournamentCourtStatus,
} from "@/app/admin/tournaments/court-actions";
import { tournamentCourtStatusValues } from "@/lib/validation/court";

type RosterCourt = { id: string; name: string; status: (typeof tournamentCourtStatusValues)[number] };
type SearchResult = { id: string; name: string };

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: "bg-neutral-100 text-neutral-600",
  ASSIGNED: "bg-brand-50 text-brand-700",
  LIVE: "bg-success-50 text-success-700",
  COMPLETED: "bg-neutral-100 text-neutral-500",
};

/** §48 tournament courts: search-and-select from the global registry +
 * inline "Add New Court", plus a per-court status control. Same shape as
 * TournamentPlayersManager (3.3). */
export function TournamentCourtsManager({
  tournamentId,
  courts,
}: {
  tournamentId: string;
  courts: RosterCourt[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showAddNew, setShowAddNew] = useState(false);
  const addNewFormRef = useRef<HTMLFormElement>(null);

  function runSearch(q: string) {
    setSearching(true);
    searchAvailableCourts(tournamentId, q)
      .then((r) => setResults(r))
      .finally(() => setSearching(false));
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(value), 250);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddSelected() {
    setError(false);
    const ids = Array.from(selected);
    startTransition(async () => {
      const res = await addCourtsToTournament(tournamentId, ids);
      if (res.status === "error") {
        setError(true);
        return;
      }
      setSelected(new Set());
      setResults((prev) => prev.filter((c) => !ids.includes(c.id)));
      router.refresh();
    });
  }

  function handleRemove(courtId: string) {
    setError(false);
    startTransition(async () => {
      const res = await removeCourtFromTournament(tournamentId, courtId);
      if (res.status === "error") setError(true);
      else router.refresh();
    });
  }

  function handleStatusChange(courtId: string, status: string) {
    startTransition(async () => {
      const res = await updateTournamentCourtStatus(tournamentId, courtId, status);
      if (res.status === "error") setError(true);
      else router.refresh();
    });
  }

  function handleAddNewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(false);
    const formData = new FormData(e.currentTarget);
    const input = { name: formData.get("name") };

    startTransition(async () => {
      const res = await addNewCourtAndAddToTournament(tournamentId, input);
      if (res.status === "ok") {
        addNewFormRef.current?.reset();
        setShowAddNew(false);
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">
          Courts <span className="font-normal text-neutral-400">({courts.length})</span>
        </h2>
        <button
          onClick={() => setShowAddNew((v) => !v)}
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          {showAddNew ? "Cancel" : "+ Add New Court"}
        </button>
      </div>

      {showAddNew && (
        <form
          ref={addNewFormRef}
          onSubmit={handleAddNewSubmit}
          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-surface-border p-3"
        >
          <input
            name="name"
            required
            placeholder="Court name (e.g. Court 3)"
            className="min-w-[140px] flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:bg-neutral-300"
          >
            {isPending ? "Adding…" : "Add & Attach"}
          </button>
        </form>
      )}

      <div className="mt-4 divide-y divide-neutral-100">
        {courts.length === 0 && (
          <p className="py-2 text-sm text-neutral-400">No courts attached yet.</p>
        )}
        {courts.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-sm font-medium text-neutral-900">{c.name}</span>
            <div className="flex items-center gap-2">
              <select
                value={c.status}
                disabled={isPending}
                onChange={(e) => handleStatusChange(c.id, e.target.value)}
                className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none ${STATUS_STYLES[c.status]}`}
              >
                {tournamentCourtStatusValues.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleRemove(c.id)}
                className="text-sm text-error-500 hover:text-error-700"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-neutral-100 pt-4">
        <label className="mb-1 block text-xs font-medium text-neutral-500">
          Search existing courts
        </label>
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />

        {(searching || results.length > 0) && (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-neutral-100">
            {searching && <p className="px-3 py-2 text-sm text-neutral-400">Searching…</p>}
            {!searching &&
              results.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2 last:border-0 hover:bg-neutral-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSelected(c.id)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-neutral-900">{c.name}</span>
                </label>
              ))}
          </div>
        )}

        {selected.size > 0 && (
          <button
            onClick={handleAddSelected}
            disabled={isPending}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:bg-neutral-300"
          >
            {isPending ? "Adding…" : `Add Selected (${selected.size})`}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-error-500">Something went wrong saving that change. Try again.</p>}
    </div>
  );
}
