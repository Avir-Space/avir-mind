"use client";

import { BellOff, Check, ChevronLeft, Loader2, Plus, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { channel } from "@/lib/design/notifications";
import { useNotificationActions } from "@/lib/mutations/use-notification-actions";
import { useUserPreferences } from "@/lib/queries/use-notifications";

export default function NotificationSettingsPage() {
  const { data: prefs, isLoading } = useUserPreferences();
  const { updateChannel, verifyChannel, muteTemporarily } = useNotificationActions();
  const { toast } = useToast();
  const [newType, setNewType] = useState("email");
  const [newAddr, setNewAddr] = useState("");
  const [qStart, setQStart] = useState("");
  const [qEnd, setQEnd] = useState("");

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/notifications" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Notifications</Link></div>
      <PageHeader eyebrow="Communications" title="Notification Preferences" subtitle="Channels, quiet hours, and digests." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        <div className="max-w-2xl space-y-6">
          {/* Channels */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="eyebrow">Channels</p>
              <Button size="sm" variant="outline" onClick={() => muteTemporarily.mutate(60, { onSuccess: () => toast({ title: "Muted for 60 min", description: "Non-critical alerts paused." }) })}><BellOff className="h-3.5 w-3.5" /> Mute 60 min</Button>
            </div>
            {isLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
              <div className="border border-border">
                {(prefs?.channels ?? []).map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 last:border-b-0">
                    <span className="w-20 font-mono text-[12px]" style={{ color: channel(c.channel_type).hex }}>{channel(c.channel_type).label}</span>
                    <MonoText muted className="flex-1 truncate text-[12px]">{c.channel_address}</MonoText>
                    {c.quiet_hours_start && <span className="font-mono text-[10px] text-hint">quiet {String(c.quiet_hours_start).slice(0,5)}–{String(c.quiet_hours_end).slice(0,5)}</span>}
                    {c.emergency_override && <span className="inline-flex items-center gap-1 font-mono text-[10px] text-severity-high"><ShieldAlert className="h-3 w-3" /> override</span>}
                    <span className="font-mono text-[10px] uppercase" style={{ color: c.verification_status === "verified" ? "#16A34A" : "#CA8A04" }}>{c.verification_status}</span>
                    {c.verification_status !== "verified" && <Button size="sm" variant="ghost" onClick={() => verifyChannel.mutate(c.id, { onSuccess: () => toast({ title: "Channel verified" }) })}><Check className="h-3.5 w-3.5" /> Verify</Button>}
                  </div>
                ))}
                {(prefs?.channels?.length ?? 0) === 0 && <p className="px-3 py-3 text-sm text-hint">No channels configured.</p>}
              </div>
            )}
          </section>

          {/* Add channel */}
          <section className="border border-dashed border-border bg-surface/30 p-4">
            <p className="eyebrow mb-2 inline-flex items-center gap-1.5"><Plus className="h-3 w-3" /> Add / update channel</p>
            <div className="flex flex-wrap items-end gap-2">
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{["email", "slack", "sms", "in_app", "webhook"].map((t) => <SelectItem key={t} value={t}>{channel(t).label}</SelectItem>)}</SelectContent>
              </Select>
              <Input value={newAddr} onChange={(e) => setNewAddr(e.target.value)} placeholder="address / member id / phone / URL" className="w-64" />
              <div><p className="mb-1 font-mono text-[10px] uppercase text-label">Quiet start</p><Input type="time" value={qStart} onChange={(e) => setQStart(e.target.value)} className="w-28" /></div>
              <div><p className="mb-1 font-mono text-[10px] uppercase text-label">Quiet end</p><Input type="time" value={qEnd} onChange={(e) => setQEnd(e.target.value)} className="w-28" /></div>
              <Button size="sm" disabled={!newAddr || updateChannel.isPending} onClick={() => updateChannel.mutate(
                { channelType: newType, address: newAddr, attrs: { quiet_hours_start: qStart || null, quiet_hours_end: qEnd || null, quiet_hours_timezone: "UTC" } },
                { onSuccess: () => { toast({ title: "Channel saved" }); setNewAddr(""); } })}>
                {updateChannel.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
              </Button>
            </div>
          </section>

          {/* Digests */}
          <section>
            <p className="eyebrow mb-2">Digest subscriptions</p>
            <div className="border border-border">
              {(prefs?.digests ?? []).length === 0 ? <p className="px-3 py-3 text-sm text-hint">Daily briefing is enabled by default.</p> : (prefs?.digests ?? []).map((d, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
                  <span className="text-[13px] text-foreground">{d.digest_type.replace(/_/g, " ")}</span>
                  <span className="ml-auto font-mono text-[11px] text-hint">last sent {d.sent_at_utc ? new Date(d.sent_at_utc).toLocaleDateString() : "—"}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
