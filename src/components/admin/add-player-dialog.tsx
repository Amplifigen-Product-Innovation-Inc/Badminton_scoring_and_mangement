"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlayer } from "@/app/admin/players/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

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
    | { status: "error" }
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
        // §33 — the server's error.message may be a raw Postgres message;
        // never render it verbatim.
        setResult({ status: "error" });
      }
    });
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Add Player</Button>;
  }

  return (
    <Card className="w-full max-w-sm" padding="lg">
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
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <input
          name="phone"
          placeholder="Phone (optional)"
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Adding…" : "Add Player"}
        </Button>
      </form>

      {result?.status === "duplicate" && (
        <div className="mt-4 rounded-lg bg-warning-50 p-3 text-sm text-warning-700">
          <p className="font-medium">Player already exists.</p>
          <p className="mt-1">
            {result.player.name} — {result.player.email}
          </p>
        </div>
      )}
      {result?.status === "error" && (
        <div className="mt-3">
          <ErrorState message="We couldn't add that player. Try again." />
        </div>
      )}
    </Card>
  );
}
