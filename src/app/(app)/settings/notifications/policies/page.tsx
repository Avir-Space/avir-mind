"use client";

import { ChevronLeft, FlaskConical, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { channel, eventTypeLabel, EVENT_TYPE_LABEL, QUIET_BEHAVIOR_LABEL } from "@/lib/design/notifications";
import { useNotificationActions } from "@/lib/mutations/use-notification-actions";
import { useNotificationPolicies, useOrgRoles } from "@/lib/queries/use-notifications";
import type { NotificationPolicy, PolicyTestResult } from "@/types/notifications";

export default function PoliciesPage() {
  const { data: policies, isLoading } = useNotificationPolicies();
  const { data: roles } = useOrgRoles();
  const { createPolicy, updatePolicy, testPolicy } = useNotificationActions();
  const { toast } = useToast();
  const [testResult, setTestResult] = useState<{ policy: NotificationPolicy; result: PolicyTestResult } | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [evt, setEvt] = useState("signal_created");
  const [roleId, setRoleId] = useState("");

  const roleName = (id: string) => roles?.find((r) => r.id === id)?.role_display_name ?? "role";

  async function runTest(p: NotificationPolicy) {
    try { const result = await testPolicy(p.id, { severity: "critical" }); setTestResult({ policy: p, result }); }
    catch (e) { toast({ title: "Test failed", description: String((e as Error).message).slice(0, 80) }); }
  }

  async function submitCreate() {
    try {
      await createPolicy.mutateAsync({
        policy_name: name, event_type: evt, target_role_ids: roleId ? [roleId] : [],
        channel_preferences: { critical: ["sms", "email", "in_app"], high: ["email", "in_app"], default: ["in_app"] },
        escalation_ladder: [], quiet_hours_behavior: "respect",
      });
      toast({ title: "Policy created" }); setCreating(false); setName("");
    } catch (e) { toast({ title: "Create failed", description: String((e as Error).message).slice(0, 100) }); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/notifications" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Notifications</Link></div>
      <PageHeader eyebrow="Communications · Admin" title="Notification Policies" subtitle="Who gets notified, when, and by which channel."
        actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> New policy</Button>} />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div> : (
          <div className="space-y-3">
            {(policies ?? []).map((p) => (
              <div key={p.id} className="border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[14px] font-medium text-foreground">{p.policy_name}</span>
                  <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-body">{eventTypeLabel(p.event_type)}</span>
                  <span className="font-mono text-[10px] uppercase" style={{ color: p.is_active ? "#16A34A" : "#94A3B8" }}>{p.is_active ? "active" : "inactive"}</span>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => runTest(p)}><FlaskConical className="h-3.5 w-3.5" /> Test (dry-run)</Button>
                    <Button size="sm" variant="ghost" onClick={() => updatePolicy.mutate({ id: p.id, patch: { is_active: !p.is_active } }, { onSuccess: () => toast({ title: p.is_active ? "Deactivated" : "Activated" }) })}>{p.is_active ? "Deactivate" : "Activate"}</Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-hint">
                  <span>Roles: {p.target_role_ids.length ? p.target_role_ids.map(roleName).join(", ") : "—"}</span>
                  <span>Channels: {Object.entries(p.channel_preferences).map(([sev, chs]) => `${sev}→${(chs as string[]).map((c) => channel(c).label).join("/")}`).join("  ")}</span>
                  <span>Quiet: {QUIET_BEHAVIOR_LABEL[p.quiet_hours_behavior] ?? p.quiet_hours_behavior}</span>
                  {p.escalation_ladder.length > 0 && <span>Escalation: {p.escalation_ladder.length} rung(s)</span>}
                </div>
              </div>
            ))}
            {(policies?.length ?? 0) === 0 && <p className="text-sm text-hint">No policies.</p>}
          </div>
        )}
      </div>

      {/* Dry-run result */}
      <Dialog open={Boolean(testResult)} onOpenChange={(o) => !o && setTestResult(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dry-run — {testResult?.policy.policy_name}</DialogTitle></DialogHeader>
          <p className="text-[12px] text-subtext">Simulated at <span className="font-mono">critical</span> severity. No notifications were sent.</p>
          <div className="mt-2 border border-border">
            <div className="flex items-center gap-x-4 border-b border-border bg-surface/40 px-3 py-1.5 font-mono text-eyebrow uppercase text-label"><span className="flex-1">Recipient / channel</span><span>Deferred</span></div>
            {(testResult?.result.targets ?? []).map((t, i) => (
              <div key={i} className="flex items-center gap-x-4 border-b border-border/60 px-3 py-2 last:border-b-0 text-[12px]">
                <span className="flex-1"><span className="font-mono" style={{ color: channel(t.channel_type).hex }}>{channel(t.channel_type).label}</span> · <span className="font-mono text-hint">{t.channel_address}</span></span>
                <span className="font-mono text-[11px]" style={{ color: t.deferred ? "#CA8A04" : "#16A34A" }}>{t.deferred ? "deferred" : "immediate"}</span>
              </div>
            ))}
            {(testResult?.result.targets.length ?? 0) === 0 && <p className="px-3 py-3 text-sm text-hint">No recipients would be notified (check role assignments + channels).</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>New notification policy</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><p className="eyebrow mb-1">Policy name</p><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weather significant — dispatchers" /></div>
            <div><p className="eyebrow mb-1">Event type</p>
              <Select value={evt} onValueChange={setEvt}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(EVENT_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><p className="eyebrow mb-1">Target role</p>
              <Select value={roleId} onValueChange={setRoleId}><SelectTrigger className="w-full"><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>{(roles ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.role_display_name}</SelectItem>)}</SelectContent></Select>
            </div>
            <p className="text-[11px] text-hint">Default channels: critical → SMS + email + in-app; high → email + in-app; else in-app.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button disabled={!name || createPolicy.isPending} onClick={submitCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
