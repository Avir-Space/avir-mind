"use client";

import { ChevronLeft, Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuditEvents } from "@/lib/queries/use-enterprise";

type J = Record<string, unknown>;
const dt = (x: unknown) => (x ? new Date(String(x)).toLocaleString() : "—");

const TYPES = ["", "login_success", "login_failure", "2fa_enabled", "api_key_created", "api_key_revoked", "sso_configured", "sso_updated", "session_terminated", "suspicious_activity", "data_export", "admin_action"];

function riskColor(n: number) { return n >= 70 ? "#DC2626" : n >= 40 ? "#EA580C" : n >= 15 ? "#CA8A04" : "#16A34A"; }

export default function AuditLogPage() {
  const [type, setType] = useState("");
  const { data: events, isLoading } = useAuditEvents(type || undefined);

  function exportCsv() {
    const rows = (events ?? []) as J[];
    const header = "created_at_utc,event_type,event_summary,risk_score,ip_address\n";
    const body = rows.map((e) => `${e.created_at_utc},${e.event_type},"${String(e.event_summary).replace(/"/g, "''")}",${e.risk_score ?? ""},${e.ip_address ?? ""}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `avir-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/settings" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Settings</Link></div>
      <PageHeader eyebrow="Security" title="Audit Log" subtitle="Security-relevant events across your organization."
        actions={
          <div className="flex items-center gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 border border-input bg-transparent px-2 text-sm text-foreground focus:border-primary focus:outline-none">
              {TYPES.map((t) => <option key={t} value={t}>{t ? t.replace(/_/g, " ") : "All events"}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> CSV</Button>
          </div>
        } />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
          <div className="border border-border">
            {(events ?? []).map((e: J) => (
              <div key={String(e.id)} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 last:border-b-0">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: riskColor(Number(e.risk_score ?? 0)) }} />
                <span className="w-40 font-mono text-[11px] uppercase text-label">{String(e.event_type)}</span>
                <span className="flex-1 truncate text-[13px] text-foreground">{String(e.event_summary)}</span>
                <MonoText muted className="text-[11px]">{String(e.ip_address ?? "")}</MonoText>
                <span className="font-mono text-[11px] text-hint">{dt(e.created_at_utc)}</span>
              </div>
            ))}
            {(events?.length ?? 0) === 0 && <p className="px-3 py-6 text-center text-sm text-hint">No events.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
