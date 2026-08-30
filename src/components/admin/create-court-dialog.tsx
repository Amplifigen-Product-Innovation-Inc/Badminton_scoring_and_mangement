"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCourt } from "@/app/admin/courts/actions";

/** Same inline-panel pattern as AddPlayerDialog/CreateTournamentDialog. */
export function CreateCourtDialog() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const input = { name: formData.get("name") };

    startTransition(async () => {
      const res = await createCourt(input);
      if (res.status === "ok") {
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
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
        + Add Court
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Add court</h2>
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
          placeholder="Court name (e.g. Court 3)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add Court"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
