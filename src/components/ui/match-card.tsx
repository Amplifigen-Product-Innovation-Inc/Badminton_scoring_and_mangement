import Link from "next/link";
import { Card } from "@/components/ui/card";
import { LiveBadge, Badge } from "@/components/ui/badge";

export function MatchCard({
  matchNumber,
  courtName,
  status,
  team1Label,
  team2Label,
  score,
  href,
}: {
  matchNumber: number;
  courtName: string | null;
  status: "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED";
  team1Label: string;
  team2Label: string;
  score?: [number, number];
  href: string;
}) {
  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-offset-4">
      <Card padding="sm" className="hover:border-brand-200">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-500">
            Match #{matchNumber} · {courtName ?? "No court"}
          </p>
          {status === "LIVE" && <LiveBadge />}
          {status === "SCHEDULED" && <Badge tone="neutral">Scheduled</Badge>}
          {status === "COMPLETED" && <Badge tone="success">Completed</Badge>}
          {status === "CANCELLED" && <Badge tone="error">Cancelled</Badge>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-neutral-900">
            {team1Label} <span className="text-neutral-300">vs</span> {team2Label}
          </p>
          {score && (
            <p className="font-score shrink-0 text-lg text-neutral-900">
              {score[0]}–{score[1]}
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}
