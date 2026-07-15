"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Live Supabase Realtime connection indicator. Green when the socket is
 * subscribed, gray otherwise. Present from Day 1 as a data-trust signal.
 */
export function RealtimeIndicator({ className }: { className?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const channel = supabase.channel("avir:presence", {
      config: { broadcast: { self: false } },
    });

    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-mono text-eyebrow text-label", className)}
      title={connected ? "Realtime connected" : "Realtime disconnected"}
    >
      <span
        className={cn(
          "severity-dot transition-colors duration-micro",
          connected ? "bg-severity-low" : "bg-hint",
        )}
        aria-hidden
      />
      <span className="hidden sm:inline">{connected ? "Live" : "Offline"}</span>
    </span>
  );
}
