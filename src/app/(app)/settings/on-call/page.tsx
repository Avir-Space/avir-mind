"use client";

import { ChevronLeft, RotateCw, UserCheck } from "lucide-react";
import Link from "next/link";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/providers/auth-provider";
import { useNotificationActions } from "@/lib/mutations/use-notification-actions";
import { useOnCallSchedules, useOrgRoles } from "@/lib/queries/use-notifications";

const dt = (x: string) => new Date(x).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function OnCallPage() {
  const { user } = useAuth();
  const { data: schedules, isLoading } = useOnCallSchedules();
  const { data: roles } = useOrgRoles();
  const { rotateOnCall } = useNotificationActions();
  const { toast } = useToast();

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/notifications" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Notifications</Link></div>
      <PageHeader eyebrow="Communications · Admin" title="On-Call Scheduler" subtitle="Who is on call for each role, and when." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div> : (
          <div className="space-y-4">
            {(schedules ?? []).map((s) => {
              const isMe = s.current_user_id && s.current_user_id === user?.id;
              return (
                <div key={s.id} className="border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[14px] font-medium text-foreground">{s.schedule_name}</span>
                    <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-body">{s.role_display_name}</span>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px]" style={{ color: s.current_user_id ? "#16A34A" : "#94A3B8" }}>
                      <UserCheck className="h-3.5 w-3.5" /> {s.current_user_id ? (isMe ? "You are on call" : "On call now") : "No one on call"}
                    </span>
                    <Button size="sm" variant="outline" className="ml-auto" onClick={() => rotateOnCall.mutate(s.id, { onSuccess: () => toast({ title: "Rotated", description: "Next shift added." }) })}><RotateCw className="h-3.5 w-3.5" /> Rotate</Button>
                  </div>
                  <div className="mt-3 border border-border">
                    <div className="flex items-center gap-x-4 border-b border-border bg-surface/40 px-3 py-1.5 font-mono text-eyebrow uppercase text-label"><span className="w-24">Type</span><span className="flex-1">Window</span></div>
                    {s.shifts.map((sh, i) => {
                      const active = new Date(sh.shift_start_utc) <= new Date() && new Date(sh.shift_end_utc) > new Date();
                      return (
                        <div key={i} className="flex items-center gap-x-4 border-b border-border/60 px-3 py-2 last:border-b-0" style={active ? { borderLeft: "3px solid #16A34A" } : undefined}>
                          <span className="w-24 font-mono text-[11px] uppercase text-hint">{sh.shift_type}</span>
                          <MonoText muted className="flex-1 text-[11px]">{dt(sh.shift_start_utc)} → {dt(sh.shift_end_utc)}</MonoText>
                          {active && <span className="font-mono text-[10px] uppercase text-severity-low">current</span>}
                        </div>
                      );
                    })}
                    {s.shifts.length === 0 && <p className="px-3 py-3 text-sm text-hint">No shifts scheduled.</p>}
                  </div>
                </div>
              );
            })}
            {(schedules?.length ?? 0) === 0 && <p className="text-sm text-hint">No on-call schedules. {roles?.length ?? 0} roles configured.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
