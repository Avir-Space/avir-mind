"use client";

import { Bell, Check, ChevronUp, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { channel, deliveryStatus, eventTypeLabel, severityHex } from "@/lib/design/notifications";
import { useNotificationActions } from "@/lib/mutations/use-notification-actions";
import { useNotificationHistory, useUserPreferences } from "@/lib/queries/use-notifications";
import { useNotificationRealtime } from "@/lib/realtime/use-notification-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import type { NotificationEvent } from "@/types/notifications";

const dt = (x: string | null) => (x ? new Date(x).toLocaleString() : "—");
/** Only strings are safe to render as React children — guard jsonb fields that
 * could be null/objects on legacy rows (root cause of the click error). */
const asText = (v: unknown): string => (typeof v === "string" ? v : "");

function Row({ n, onOpen }: { n: NotificationEvent; onOpen: () => void }) {
  const st = deliveryStatus(n.delivery_status); const ch = channel(n.channel_type);
  return (
    <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 hover:bg-surface/40"
      style={{ borderLeft: `3px solid ${severityHex(n.severity)}` }}>
      <span className="w-4">{!n.acknowledged_at_utc && <span className="inline-block h-2 w-2 rounded-full bg-primary" />}</span>
      <span className="flex-1 truncate text-[13px] text-foreground">{asText(n.notification_content?.subject) || eventTypeLabel(asText(n.notification_content?.event_type))}</span>
      {n.escalation_of_notification_id && <span className="font-mono text-[10px] uppercase text-severity-critical">escalation</span>}
      {n.notification_content?.deferred && <span className="font-mono text-[10px] uppercase text-severity-medium">deferred</span>}
      <span className="font-mono text-[11px]" style={{ color: ch.hex }}>{ch.label}</span>
      <span className="font-mono text-[11px] text-hint">{dt(n.created_at_utc)}</span>
      <span className="font-mono text-[10px] uppercase" style={{ color: st.hex }}>{st.label}</span>
    </button>
  );
}

export default function NotificationsPage() {
  const { orgId } = useAuth();
  useNotificationRealtime(orgId);
  const { data: recent, isLoading } = useNotificationHistory({ days: 7 });
  const { data: prefs } = useUserPreferences();
  const { acknowledge, escalate } = useNotificationActions();
  const { toast } = useToast();
  const [open, setOpen] = useState<NotificationEvent | null>(null);

  const active = (recent ?? []).filter((n) => !n.acknowledged_at_utc && ["queued", "sending", "delivered", "retried"].includes(n.delivery_status));

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Communications" title="Notifications" subtitle="Everything that reached out to you."
        actions={<Button asChild size="sm" variant="outline"><Link href="/settings/notifications"><Settings className="h-3.5 w-3.5" /> Preferences</Link></Button>} />

      <div className="flex-1 overflow-y-auto avir-scroll">
        <Tabs defaultValue="active">
          <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
            <TabsTrigger value="active">Active{active.length ? ` (${active.length})` : ""}</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="digests">Digests</TabsTrigger>
          </TabsList></div>

          <TabsContent value="active">
            {isLoading ? <div className="space-y-2 p-6">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : active.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center"><Bell className="h-8 w-8 text-label" strokeWidth={1.5} /><p className="mt-3 text-sm text-subtext">Nothing needs your attention.</p></div>
            ) : <div className="border-b border-border">{active.map((n) => <Row key={n.id} n={n} onOpen={() => setOpen(n)} />)}</div>}
          </TabsContent>

          <TabsContent value="recent">
            {isLoading ? <div className="space-y-2 p-6">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
              <div className="border-b border-border">{(recent ?? []).map((n) => <Row key={n.id} n={n} onOpen={() => setOpen(n)} />)}
                {(recent?.length ?? 0) === 0 && <p className="px-6 py-6 text-center text-sm text-hint">No notifications in the last 7 days.</p>}</div>
            )}
          </TabsContent>

          <TabsContent value="digests">
            <div className="p-6 space-y-2">
              {(prefs?.digests ?? []).map((d, i) => (
                <div key={i} className="flex items-center gap-3 border border-border bg-card px-3 py-2.5">
                  <span className="text-[13px] text-foreground">{d.digest_type.replace(/_/g, " ")}</span>
                  <span className="ml-auto font-mono text-[11px] text-hint">{dt(d.sent_at_utc)}</span>
                </div>
              ))}
              {(prefs?.digests?.length ?? 0) === 0 && <p className="text-sm text-hint">No digests yet.</p>}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto avir-scroll sm:max-w-md">
          <SheetHeader><SheetTitle className="pr-6">{asText(open?.notification_content?.subject) || "Notification"}</SheetTitle></SheetHeader>
          {open && (() => {
            // Related notifications from the same source (signal/task) — a lightweight
            // digest so the panel groups everything that reached out about one thing.
            const related = (recent ?? []).filter((n) => n.id !== open.id && n.trigger_source_id && n.trigger_source_id === open.trigger_source_id);
            return (
            <div className="mt-4 space-y-4 px-6 pb-8">
              <p className="text-sm leading-relaxed text-subtext">{asText(open.notification_content?.body) || "No additional detail."}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-3 font-mono text-[12px]">
                <div><span className="text-hint">Channel</span><p className="text-foreground">{channel(open.channel_type).label}</p></div>
                <div><span className="text-hint">Severity</span><p style={{ color: severityHex(open.severity) }}>{open.severity ?? "—"}</p></div>
                <div><span className="text-hint">Status</span><p style={{ color: deliveryStatus(open.delivery_status).hex }}>{deliveryStatus(open.delivery_status).label}</p></div>
                <div><span className="text-hint">Role</span><p className="text-foreground">{open.role_name ?? "Direct"}</p></div>
                <div><span className="text-hint">Sent</span><p className="text-foreground">{open.sent_at_utc ? dt(open.sent_at_utc) : "Not sent yet"}</p></div>
                <div><span className="text-hint">Acknowledged</span><p className="text-foreground">{open.acknowledged_at_utc ? dt(open.acknowledged_at_utc) : "Not acknowledged"}</p></div>
              </div>

              {related.length > 0 && (
                <div>
                  <p className="eyebrow mb-1.5">Related ({related.length})</p>
                  <div className="border border-border">
                    {related.map((r) => (
                      <button key={r.id} type="button" onClick={() => setOpen(r)}
                        className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-surface/40">
                        <span className="flex-1 truncate text-[12px] text-foreground">{asText(r.notification_content?.subject) || eventTypeLabel(asText(r.notification_content?.event_type))}</span>
                        <span className="font-mono text-[10px] uppercase" style={{ color: deliveryStatus(r.delivery_status).hex }}>{deliveryStatus(r.delivery_status).label}</span>
                        <span className="font-mono text-[10px] text-hint">{dt(r.created_at_utc)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!open.acknowledged_at_utc && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => acknowledge.mutate(open.id, { onSuccess: () => { toast({ title: "Acknowledged" }); setOpen(null); } })}><Check className="h-3.5 w-3.5" /> Acknowledge</Button>
                  <Button size="sm" variant="outline" onClick={() => escalate.mutate(open.id, { onSuccess: (_d) => toast({ title: "Escalation check run" }) })}><ChevronUp className="h-3.5 w-3.5" /> Escalate</Button>
                </div>
              )}
            </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
