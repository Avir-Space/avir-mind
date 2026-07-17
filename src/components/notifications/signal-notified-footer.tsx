"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { channel, deliveryStatus } from "@/lib/design/notifications";
import { useSignalNotifications } from "@/lib/queries/use-notifications";

const hm = (x: string) => new Date(x).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** "Notified N people at HH:MM" footer for a signal card. */
export function SignalNotifiedFooter({ signalId }: { signalId: string }) {
  const [open, setOpen] = useState(false);
  const { data: list = [] } = useSignalNotifications(signalId);
  if (list.length === 0) return null;

  const first = list[0]!;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 font-mono text-eyebrow uppercase text-label transition-colors hover:text-primary">
        <Send className="h-3 w-3" /> Notified {list.length} {list.length === 1 ? "person" : "people"} at {hm(first.created_at_utc)} UTC
      </button>
      {open && (
        <div className="mt-2 w-full max-w-xs border border-border bg-card p-3">
          <p className="eyebrow mb-2">Delivery</p>
          <div className="space-y-1.5">
            {list.map((n, i) => {
              const ch = channel(n.channel_type); const st = deliveryStatus(n.delivery_status);
              return (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className="font-mono" style={{ color: ch.hex }}>{ch.label}</span>
                  <span className="text-hint">{n.role_name ?? "member"}</span>
                  <span className="ml-auto font-mono text-[10px] uppercase" style={{ color: st.hex }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
