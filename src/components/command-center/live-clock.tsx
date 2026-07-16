"use client";

import { useEffect, useState } from "react";

/** Live clock — local wall time + Zulu, HH:MM:SS mono with timezone labels. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="h-9 w-40" />;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzLabel = (tz.split("/").pop() ?? tz).replace(/_/g, " ");
  const local = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const zulu = now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="flex items-stretch gap-3">
      <div className="text-right leading-none">
        <div className="font-mono text-lg tabular-nums text-foreground">{local}</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-hint">{tzLabel}</div>
      </div>
      <div className="w-px bg-border" aria-hidden />
      <div className="text-right leading-none">
        <div className="font-mono text-lg tabular-nums text-subtext">{zulu}</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-hint">Zulu · UTC</div>
      </div>
    </div>
  );
}
