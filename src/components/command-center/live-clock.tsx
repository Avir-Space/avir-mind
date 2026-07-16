"use client";

import { useEffect, useState } from "react";

/** Live wall clock in the operator's local timezone, with a UTC readout. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="h-8 w-24" />;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="text-right leading-tight">
      <div className="font-mono text-base tabular-nums text-foreground">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-hint">
        {(tz.split("/").pop() ?? tz).replace("_", " ")} ·{" "}
        {now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })}Z
      </div>
    </div>
  );
}
