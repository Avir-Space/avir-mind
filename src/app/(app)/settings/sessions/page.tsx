"use client";

import { ChevronLeft, Monitor, Smartphone, Terminal } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useEnterpriseActions } from "@/lib/mutations/use-enterprise-actions";
import { useSessions } from "@/lib/queries/use-enterprise";

type J = Record<string, unknown>;
const dt = (x: unknown) => (x ? new Date(String(x)).toLocaleString() : "—");
const ICON = { web: Monitor, mobile: Smartphone, api: Terminal } as const;

export default function SessionsPage() {
  const { data: sessions, isLoading } = useSessions();
  const { terminateSession } = useEnterpriseActions();
  const { toast } = useToast();
  const active = (sessions ?? []).filter((s: J) => !s.ended_at_utc);
  const current = active[0]; // most recent activity

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/settings" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Settings</Link></div>
      <PageHeader eyebrow="Security" title="Active Sessions" subtitle="Where your account is signed in, across web, mobile, and API."
        actions={current ? <Button size="sm" variant="outline" onClick={() => terminateSession(String(current.id), true).then((r) => toast({ title: "Other sessions ended", description: `${(r as J).terminated ?? 0} session(s).` }))}>Sign out others</Button> : undefined} />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div> : (
          <div className="space-y-2">
            {(sessions ?? []).map((s: J, i: number) => {
              const Icon = ICON[String(s.session_type) as keyof typeof ICON] ?? Monitor;
              const ended = Boolean(s.ended_at_utc); const isCurrent = i === 0 && !ended;
              return (
                <div key={String(s.id)} className="flex items-start gap-3 border border-border bg-card p-4" style={{ opacity: ended ? 0.5 : 1 }}>
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-label" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium capitalize text-foreground">{String(s.session_type)}</span>
                      {isCurrent && <span className="font-mono text-[10px] uppercase text-severity-low">this device</span>}
                      {ended && <span className="font-mono text-[10px] uppercase text-hint">ended</span>}
                    </div>
                    <p className="truncate text-[12px] text-subtext">{String(s.user_agent ?? "—")}</p>
                    <p className="font-mono text-[11px] text-hint">{String(s.geo_city ?? "")} {String(s.geo_country_code ?? "")} · {String(s.ip_address ?? "")} · active {dt(s.last_activity_at_utc)}</p>
                    <div className="mt-0.5 flex flex-wrap gap-1">{(s.authentication_factors_used as string[] ?? []).map((f) => <span key={f} className="border border-border px-1 font-mono text-[9px] text-hint">{f}</span>)}</div>
                  </div>
                  {!ended && !isCurrent && <Button size="sm" variant="ghost" onClick={() => terminateSession(String(s.id)).then(() => toast({ title: "Session terminated" }))}>Terminate</Button>}
                </div>
              );
            })}
            {(sessions?.length ?? 0) === 0 && <p className="text-sm text-hint">No sessions recorded.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
