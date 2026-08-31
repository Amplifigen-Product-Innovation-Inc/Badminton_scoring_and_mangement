"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startMatch } from "@/app/scorer/actions";

export function StartMatchButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await startMatch(matchId);
      if (res.status === "ok") {
        router.push(`/scorer/matches/${matchId}`);
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="mt-3 w-full rounded-lg bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Starting…" : "Start Match"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );
}
