"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * §13 — score changes animate the number itself (<250ms, non-blocking),
 * never the surrounding interface. Re-triggers the CSS keyframe whenever
 * `value` changes; the scorer can keep tapping immediately, nothing here
 * gates input.
 */
export function ScoreDisplay({
  value,
  size = "lg",
  className,
}: {
  value: number;
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  const [bump, setBump] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      setBump(true);
      const t = setTimeout(() => setBump(false), 220);
      return () => clearTimeout(t);
    }
  }, [value]);

  const sizeClass = size === "xl" ? "text-7xl" : size === "md" ? "text-4xl" : "text-6xl";

  return (
    <span
      className={cn("font-score inline-block", sizeClass, bump && "animate-score-bump", className)}
    >
      {value}
    </span>
  );
}
