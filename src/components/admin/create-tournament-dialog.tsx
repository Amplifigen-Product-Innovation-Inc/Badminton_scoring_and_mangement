"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTournament } from "@/app/admin/tournaments/actions";

/** §10 "+ Create Tournament". Inline panel, not a modal — consistent with
 * AddPlayerDialog (§54: avoid unnecessary modals). */
export function CreateTournamentDialog() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const input = {
      name: formData.get("name"),
      date: formData.get("date"),
      location: formData.get("location"),
      format: formData.get("format"),
      num_courts: formData.get("num_courts"),
      description: formData.get("description"),
    };

    startTransition(async () => {
      const res = await createTournament(input);
      if (res.status === "ok") {
        formRef.current?.reset();
        setOpen(false);
        router.push(`/admin/tournaments/${res.id}`);
      } else {
        setError(res.message);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
      >
        + Create Tournament
      </button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Create tournament</h2>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-sm text-neutral-400 hover:text-neutral-600"
        >
          Cancel
        </button>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input
          name="name"
          required
          placeholder="Tournament name"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            name="date"
            type="date"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <input
            name="num_courts"
            type="number"
            min={1}
            placeholder="Number of courts"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
        <input
          name="location"
          placeholder="Location"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <input
          name="format"
          placeholder="Format (e.g. Singles, round-robin groups)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <textarea
          name="description"
          rows={3}
          placeholder="Description (optional)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create Tournament"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
