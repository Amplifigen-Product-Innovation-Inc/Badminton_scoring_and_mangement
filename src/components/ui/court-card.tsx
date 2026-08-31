import Link from "next/link";
import { Card } from "@/components/ui/card";
import { LiveBadge, Badge } from "@/components/ui/badge";

/**
 * §19 — live court monitor tile. `href` opens the match when one is live;
 * an idle court renders as a plain card with no link.
 */
export function CourtCard({
  courtName,
  status,
  score,
  teamLabels,
  href,
}: {
  courtName: string;
  status: "LIVE" | "IDLE" | "SCHEDULED";
  score?: [number, number];
  teamLabels?: [string, string];
  href?: string;
}) {
  const body = (
    <Card
      className={status === "LIVE" ? "border-brand-200" : undefined}
      padding="sm"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-900">{courtName}</p>
        {status === "LIVE" ? (
          <LiveBadge />
        ) : status === "SCHEDULED" ? (
          <Badge tone="neutral">Scheduled</Badge>
        ) : (
          <Badge tone="neutral">Idle</Badge>
        )}
      </div>
      {status === "LIVE" && score && teamLabels && (
        <>
          <p className="font-score mt-2 text-2xl text-neutral-900">
            {score[0]} <span className="text-neutral-300">–</span> {score[1]}
          </p>
          <p className="mt-1 truncate text-xs text-neutral-500">
            {teamLabels[0]} vs {teamLabels[1]}
          </p>
        </>
      )}
      {status !== "LIVE" && <p className="mt-2 text-xs text-neutral-400">No match in progress</p>}
    </Card>
  );

  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-offset-4">
      {body}
    </Link>
  ) : (
    body
  );
}
