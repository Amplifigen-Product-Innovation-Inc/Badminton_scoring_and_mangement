"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addNewPlayerAndAddToTournament,
  addPlayersToTournament,
  removePlayerFromTournament,
  searchAvailablePlayers,
} from "@/app/admin/tournaments/player-actions";

type RosterPlayer = { id: string; name: string; email: string; status: string };
type SearchResult = { id: string; name: string; email: string };

/** §58 Adding Players to Tournament: search-and-select existing players +
 * inline "Add New Player". */
export function TournamentPlayersManager({
  tournamentId,
  roster,
}: {
  tournamentId: string;
  roster: RosterPlayer[];
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
    searchAvailablePlayers(tournamentId, q)
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
      const res = await addPlayersToTournament(tournamentId, ids);
      if (res.status === "error") {
        setError(true);
        return;
      }
      setSelected(new Set());
      setResults((prev) => prev.filter((p) => !ids.includes(p.id)));
      router.refresh();
    });
  }

  function handleRemove(playerId: string) {
    setError(false);
    startTransition(async () => {
      const res = await removePlayerFromTournament(tournamentId, playerId);
      if (res.status === "error") setError(true);
      else router.refresh();
    });
  }

  function handleAddNewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(false);
    const formData = new FormData(e.currentTarget);
    const input = {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
    };

    startTransition(async () => {
      const res = await addNewPlayerAndAddToTournament(tournamentId, input);
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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">
          Players <span className="font-normal text-neutral-400">({roster.length})</span>
        </h2>
        <button
          onClick={() => setShowAddNew((v) => !v)}
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          {showAddNew ? "Cancel" : "+ Add New Player"}
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
            placeholder="Name"
            className="min-w-[140px] flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="min-w-[180px] flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            name="phone"
            placeholder="Phone (optional)"
            className="min-w-[140px] rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:bg-neutral-300"
          >
            {isPending ? "Adding…" : "Add & Join Tournament"}
          </button>
        </form>
      )}

      <div className="mt-4 divide-y divide-neutral-100">
        {roster.length === 0 && (
          <p className="py-2 text-sm text-neutral-400">No players added yet.</p>
        )}
        {roster.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-neutral-900">{p.name}</p>
              <p className="text-xs text-neutral-500">{p.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                {p.status}
              </span>
              <button
                onClick={() => handleRemove(p.id)}
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
          Search existing players
        </label>
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />

        {(searching || results.length > 0) && (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-neutral-100">
            {searching && <p className="px-3 py-2 text-sm text-neutral-400">Searching…</p>}
            {!searching &&
              results.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2 last:border-0 hover:bg-neutral-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelected(p.id)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-neutral-900">{p.name}</span>
                  <span className="text-xs text-neutral-500">{p.email}</span>
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
