"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTournament } from "@/app/admin/tournaments/actions";
import { tournamentFormatValues } from "@/lib/validation/tournament";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

const FORMAT_LABELS: Record<(typeof tournamentFormatValues)[number], string> = {
  SINGLES: "Singles",
  DOUBLES: "Doubles",
  MIXED_DOUBLES: "Mixed Doubles",
};

/** §10 "+ Create Tournament". Inline panel, not a modal — consistent with
 * AddPlayerDialog (§54: avoid unnecessary modals).
 *
 * Not the full 7-step guided wizard from §20 — that's a separately-scoped
 * follow-up (see the design-uplift plan's Stage 3 note). This pass upgrades
 * the existing single-panel flow to the design system and fixes the same
 * raw-error leak as the other admin forms (§33).
 */
export function CreateTournamentDialog() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFailed(false);
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
        setFailed(true);
      }
    });
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Create Tournament</Button>;
  }

  return (
    <Card className="w-full max-w-md" padding="lg">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Create tournament</h2>
        <button
          onClick={() => {
            setOpen(false);
            setFailed(false);
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
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            name="date"
            type="date"
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            name="num_courts"
            type="number"
            min={1}
            placeholder="Number of courts"
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <input
          name="location"
          placeholder="Location"
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <select
          name="format"
          defaultValue=""
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">Format (optional)</option>
          {tournamentFormatValues.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
        <textarea
          name="description"
          rows={3}
          placeholder="Description (optional)"
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Creating…" : "Create Tournament"}
        </Button>
      </form>

      {failed && (
        <div className="mt-3">
          <ErrorState message="We couldn't create the tournament. Try again." />
        </div>
      )}
    </Card>
  );
}
