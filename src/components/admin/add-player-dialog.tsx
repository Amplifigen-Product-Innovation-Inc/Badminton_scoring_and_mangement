"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlayer } from "@/app/admin/players/actions";

/**
 * §9 Add Player. A plain inline panel rather than a modal (§54: "avoid
 * unnecessary modals") — toggled open/closed in place.
 */
export function AddPlayerDialog() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { status: "duplicate"; player: { id: string; name: string; email: string } }
    | { status: "error"; message: string }
    | null
  >(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const formData = new FormData(e.currentTarget);
    const input = {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
    };

    startTransition(async () => {
      const res = await addPlayer(input);
      if (res.status === "created") {
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      } else if (res.status === "duplicate") {
        setResult(res);
      } else {
        setResult(res);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
      >
        + Add Player
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Add player</h2>
        <button
          onClick={() => {
            setOpen(false);
            setResult(null);
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
          placeholder="Name"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <input
          name="phone"
          placeholder="Phone (optional)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add Player"}
        </button>
      </form>

      {result?.status === "duplicate" && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Player already exists.</p>
          <p className="mt-1">
            {result.player.name} — {result.player.email}
          </p>
        </div>
      )}
      {result?.status === "error" && (
        <p className="mt-3 text-sm text-red-600">{result.message}</p>
      )}
    </div>
  );
}
