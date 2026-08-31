"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { date: string; rating: number };

/**
 * §25 — rating shown as a trend, not a spreadsheet. A plain line, no grid
 * noise, current point implied by the last dot; the header above this
 * still carries the actual number so the chart only needs to show shape.
 */
export function RatingHistoryChart({ points }: { points: Point[] }) {
  if (points.length < 2) return null;

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis domain={["dataMin - 4", "dataMax + 4"]} hide />
          <Tooltip
            formatter={(value) => [String(value), "Rating"]}
            labelFormatter={(label) => (label ? new Date(String(label)).toLocaleDateString() : "")}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--surface-border)",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="rating"
            stroke="var(--color-brand-500)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
