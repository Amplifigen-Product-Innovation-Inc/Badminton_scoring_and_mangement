"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTournament, cancelTournament } from "@/app/admin/tournaments/actions";
import { tournamentStatusValues } from "@/lib/validation/tournament";

type Tournament = {
  id: string;
  name: string;
  date: string | null;
  location: string | null;
  format: string | null;
  num_courts: number | null;
  description: string | null;
  status: (typeof tournamentStatusValues)[number];
};

/** §10 edit + cancel. Admin has full override on status (no state-machine
 * guard here — see the comment on updateTournament). */
export function TournamentEditForm({ tournament }: { tournament: Tournament }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCancelling, startCancelTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(e.currentTarget);
    const input = {
      name: formData.get("name"),
      date: formData.get("date"),
      location: formData.get("location"),
      format: formData.get("format"),
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
        setError(res.message);
      }
    });
  }

  function handleCancel() {
    if (!confirm(`Cancel "${tournament.name}"? This sets its status to CANCELLED.`)) return;
    startCancelTransition(async () => {
      const res = await cancelTournament(tournament.id);
      if (res.status === "error") setError(res.message);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Name</label>
        <input
          name="name"
          required
          defaultValue={tournament.name}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Date</label>
          <input
            name="date"
            type="date"
            defaultValue={tournament.date ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
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
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Location</label>
        <input
          name="location"
          defaultValue={tournament.location ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Format</label>
        <input
          name="format"
          defaultValue={tournament.format ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={tournament.description ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Status</label>
        <select
          name="status"
          defaultValue={tournament.status}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        >
          {tournamentStatusValues.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isCancelling || tournament.status === "CANCELLED"}
          className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
        >
          {isCancelling ? "Cancelling…" : "Cancel tournament"}
        </button>

        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
