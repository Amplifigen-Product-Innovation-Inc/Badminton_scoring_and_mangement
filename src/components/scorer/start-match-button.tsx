"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startMatch } from "@/app/scorer/actions";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export function StartMatchButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // §33 — don't surface the raw Supabase/Postgres error to the scorer.
  const [failed, setFailed] = useState(false);

  function handleClick() {
    setFailed(false);
    startTransition(async () => {
      const res = await startMatch(matchId);
      if (res.status === "ok") {
        router.push(`/scorer/matches/${matchId}`);
      } else {
        setFailed(true);
      }
    });
  }

  return (
    <>
      <Button onClick={handleClick} disabled={isPending} size="lg" className="w-full">
        {isPending ? "Starting…" : "Start match"}
      </Button>
      {failed && (
        <div className="mt-2">
          <ErrorState message="We couldn't start the match. Try again." onRetry={handleClick} />
        </div>
      )}
    </>
  );
}
