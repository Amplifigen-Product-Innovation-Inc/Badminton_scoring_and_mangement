"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTournament, cancelTournament } from "@/app/admin/tournaments/actions";
import {
  tournamentStatusValues,
  tournamentFormatValues,
  gamePointsValues,
  gamePointsFromTargetScore,
} from "@/lib/validation/tournament";

const FORMAT_LABELS: Record<(typeof tournamentFormatValues)[number], string> = {
  SINGLES: "Singles",
  DOUBLES: "Doubles",
  MIXED_DOUBLES: "Mixed Doubles",
};

const GAME_POINTS_LABELS: Record<(typeof gamePointsValues)[number], string> = {
  "11": "11 points",
  "21": "21 points (standard)",
};

type Tournament = {
  id: string;
  name: string;
  date: string | null;
  location: string | null;
  format: string | null;
  num_courts: number | null;
  description: string | null;
  status: (typeof tournamentStatusValues)[number];
  target_score: number;
};

/** §10 edit + cancel. Admin has full override on status (no state-machine
 * guard here — see the comment on updateTournament). */
export function TournamentEditForm({ tournament }: { tournament: Tournament }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCancelling, startCancelTransition] = useTransition();
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(false);
    setSaved(false);
    const formData = new FormData(e.currentTarget);
    const input = {
      name: formData.get("name"),
      date: formData.get("date"),
      location: formData.get("location"),
      format: formData.get("format"),
      game_points: formData.get("game_points"),
      num_courts: formData.get("num_courts"),
      description: formData.get("description"),
      status: formData.get("status"),
    };

    startTransition(async () => {
      const res = await updateTournament(tournament.id, input);
      if (res.status === "ok") {
        setSaved(true);
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  function handleCancel() {
    if (!confirm(`Cancel "${tournament.name}"? This sets its status to CANCELLED.`)) return;
    startCancelTransition(async () => {
      const res = await cancelTournament(tournament.id);
      if (res.status === "error") setError(true);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-surface-border bg-surface p-6">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Name</label>
        <input
          name="name"
          required
          defaultValue={tournament.name}
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Date</label>
          <input
            name="date"
            type="date"
            defaultValue={tournament.date ?? ""}
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">
            Number of courts
          </label>
          <input
            name="num_courts"
            type="number"
            min={1}
            defaultValue={tournament.num_courts ?? ""}
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Location</label>
        <input
          name="location"
          defaultValue={tournament.location ?? ""}
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Format</label>
        <select
          name="format"
          defaultValue={tournament.format ?? ""}
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">Format (optional)</option>
          {tournamentFormatValues.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Game points</label>
        <select
          name="game_points"
          defaultValue={gamePointsFromTargetScore(tournament.target_score)}
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          {gamePointsValues.map((g) => (
            <option key={g} value={g}>
              {GAME_POINTS_LABELS[g]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-400">
          Applies to every game scored in this tournament going forward.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={tournament.description ?? ""}
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Status</label>
        <select
          name="status"
          defaultValue={tournament.status}
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          {tournamentStatusValues.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isCancelling || tournament.status === "CANCELLED"}
          className="text-sm font-medium text-error-500 hover:text-error-700 disabled:opacity-40"
        >
          {isCancelling ? "Cancelling…" : "Cancel tournament"}
        </button>

        <div className="flex flex-wrap items-center gap-3">
          {saved && <span className="text-sm text-success-500">Saved.</span>}
          {error && <span className="text-sm text-error-500">Couldn’t save changes. Try again.</span>}
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:bg-neutral-300"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
