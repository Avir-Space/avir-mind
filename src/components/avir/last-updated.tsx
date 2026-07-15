"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";

/**
 * "Last updated X ago" indicator. Re-renders every 15s so the relative time
 * stays honest without a data refetch.
 */
export function LastUpdated({
  at,
  className,
  label = "Updated",
}: {
  at: string | number | Date | null | undefined;
  className?: string;
  label?: string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-mono text-eyebrow text-label", className)}
    >
      <Clock className="h-3 w-3" aria-hidden />
      {label} {timeAgo(at)}
    </span>
  );
}
