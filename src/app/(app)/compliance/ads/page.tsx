"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { adCriticality, complianceStatus } from "@/lib/design/compliance";
import { useComplianceActions } from "@/lib/mutations/use-compliance-actions";
import { useAdDetail, useComplianceDashboard } from "@/lib/queries/use-compliance";

const d = (x: string | null) => (x ? new Date(x).toLocaleDateString() : "—");

function AdTracker() {
  const params = useSearchParams();
  const { data: dash, isLoading } = useComplianceDashboard();
  const [selected, setSelected] = useState<string | null>(params.get("ad"));
  const { data: detail } = useAdDetail(selected);
  const { updateAdStatus } = useComplianceActions();
  const { toast } = useToast();

  function setStatus(aircraftId: string, adId: string, status: string) {
    updateAdStatus.mutate({ aircraftId, adId, status, attrs: status === "complied" ? { compliance_method: "Inspection per AD MoC", performed_by: "Line Maintenance" } : status === "deferred" ? { deferral_authority: "CAMO deferral board" } : {} },
      { onSuccess: () => toast({ title: `Marked ${status}` }) });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/compliance" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Compliance</Link></div>
      <PageHeader eyebrow="Airworthiness" title="AD Tracker" subtitle="Every AD applicable to the fleet, with a per-aircraft compliance matrix." />

      <div className="flex min-h-0 flex-1">
        {/* AD list */}
        <div className="w-80 shrink-0 overflow-y-auto avir-scroll border-r border-border">
          {isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> : (dash?.ads ?? []).map((a) => {
            const cr = adCriticality(a.criticality);
            return (
              <button key={a.id} type="button" onClick={() => setSelected(a.id)}
                className={`block w-full border-b border-border/60 px-4 py-2.5 text-left transition-colors hover:bg-surface/40 ${selected === a.id ? "bg-surface/60" : ""}`}
                style={selected === a.id ? { boxShadow: "inset 2px 0 0 var(--primary)" } : undefined}>
                <div className="flex items-center justify-between gap-2">
                  <MonoText className="text-[12px] text-foreground">{a.ad_number}</MonoText>
                  <span className="font-mono text-[10px] uppercase" style={{ color: cr.hex }}>{cr.label}</span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-subtext">{a.ad_title}</p>
                <p className="mt-0.5 font-mono text-[10px] text-hint">{a.issuing_authority.toUpperCase()} · due {d(a.compliance_deadline_date)} · {a.open_count} open</p>
              </button>
            );
          })}
        </div>

        {/* Matrix */}
        <div className="flex-1 overflow-y-auto avir-scroll p-6">
          {!selected ? <p className="text-sm text-hint">Select an AD to see its per-aircraft status matrix.</p> : !detail ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <>
              <div className="mb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-serif text-xl text-foreground">{String(detail.ad.ad_number)}</h2>
                  <span className="font-mono text-[11px] uppercase" style={{ color: adCriticality(String(detail.ad.criticality)).hex }}>{adCriticality(String(detail.ad.criticality)).label}</span>
                  <span className="font-mono text-[11px] uppercase text-hint">{String(detail.ad.issuing_authority)}</span>
                </div>
                <p className="mt-1 text-sm text-subtext">{String(detail.ad.ad_title)}</p>
                {detail.ad.ad_summary ? <p className="mt-1 text-[12px] text-hint">{String(detail.ad.ad_summary)}</p> : null}
                <p className="mt-2 font-mono text-[11px] text-hint">Effective {d(String(detail.ad.effective_date))} · Deadline {d(detail.ad.compliance_deadline_date as string | null)}</p>
              </div>

              <div className="border border-border">
                <div className="flex items-center gap-x-4 border-b border-border bg-surface/40 px-3 py-1.5 font-mono text-eyebrow uppercase text-label">
                  <span className="w-24">Tail</span><span className="w-28">Status</span><span className="flex-1">Detail</span><span>Actions</span>
                </div>
                {detail.matrix.map((m) => {
                  const st = complianceStatus(m.status);
                  return (
                    <div key={m.aircraft_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                      <Link href={`/aircraft/${m.aircraft_id}`} className="w-24"><MonoText className="text-primary">{m.tail_number}</MonoText></Link>
                      <span className="w-28 font-mono text-[11px] uppercase" style={{ color: st.hex }}>{st.label}</span>
                      <span className="flex-1 truncate font-mono text-[11px] text-hint">{m.compliance_method ?? m.notes ?? (m.deferral_authority ? `Deferred: ${m.deferral_authority}` : "—")}{m.complied_at_date ? ` · ${d(m.complied_at_date)}` : ""}</span>
                      <div className="flex gap-1.5">
                        {m.status !== "complied" && <Button size="sm" variant="outline" onClick={() => setStatus(m.aircraft_id, String(detail.ad.id), "complied")}>Complied</Button>}
                        {m.status !== "deferred" && m.status !== "complied" && <Button size="sm" variant="outline" onClick={() => setStatus(m.aircraft_id, String(detail.ad.id), "deferred")}>Defer</Button>}
                      </div>
                    </div>
                  );
                })}
                {detail.matrix.length === 0 && <p className="px-3 py-4 text-sm text-hint">No applicable aircraft.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdTrackerPage() {
  return <Suspense fallback={null}><AdTracker /></Suspense>;
}
