"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  adCriticality, complianceStatus, llpCriticality, llpToneHex, melCategory, melStatus, sbClass,
} from "@/lib/design/compliance";
import { useAircraftCompliance } from "@/lib/queries/use-compliance";

const d = (x: string | null) => (x ? new Date(x).toLocaleDateString() : "—");

export function AircraftComplianceTab({ aircraftId }: { aircraftId: string }) {
  const { data, isLoading } = useAircraftCompliance(aircraftId);

  if (isLoading) return <div className="space-y-2 p-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data) return <p className="p-6 text-sm text-hint">No compliance data.</p>;

  return (
    <div className="space-y-6 p-6">
      {/* ADs */}
      <section>
        <p className="eyebrow mb-2">Airworthiness Directives ({data.ads.length})</p>
        <div className="border border-border">
          {data.ads.length === 0 ? <p className="px-3 py-3 text-sm text-hint">None applicable.</p> : data.ads.map((a) => {
            const st = complianceStatus(a.status); const cr = adCriticality(a.criticality);
            return (
              <div key={a.ad_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                <span className="font-mono text-[12px] text-foreground">{a.ad_number}</span>
                <span className="font-mono text-[10px] uppercase" style={{ color: cr.hex }}>{cr.label}</span>
                <span className="truncate text-[12px] text-subtext">{a.ad_title}</span>
                <span className="ml-auto font-mono text-[11px] text-hint">{a.issuing_authority.toUpperCase()}</span>
                <span className="font-mono text-[11px] text-hint">due {d(a.compliance_deadline_date)}</span>
                <span className="font-mono text-[11px] uppercase" style={{ color: st.hex }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* SBs */}
      <section>
        <p className="eyebrow mb-2">Service Bulletins ({data.sbs.length})</p>
        <div className="border border-border">
          {data.sbs.length === 0 ? <p className="px-3 py-3 text-sm text-hint">None applicable.</p> : data.sbs.map((b) => {
            const st = complianceStatus(b.status); const cl = sbClass(b.classification);
            return (
              <div key={b.sb_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                <span className="font-mono text-[12px] text-foreground">{b.sb_number}</span>
                <span className="font-mono text-[10px] uppercase" style={{ color: cl.hex }}>{cl.label}</span>
                <span className="truncate text-[12px] text-subtext">{b.sb_title}</span>
                <span className="ml-auto font-mono text-[11px] text-hint">{b.manufacturer}</span>
                <span className="font-mono text-[11px] uppercase" style={{ color: st.hex }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* MEL */}
      <section>
        <p className="eyebrow mb-2">Active MEL items ({data.mel.length})</p>
        <div className="border border-border">
          {data.mel.length === 0 ? <p className="px-3 py-3 text-sm text-hint">No open MEL items.</p> : data.mel.map((m) => {
            const st = melStatus(m.status); const cat = melCategory(m.category);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                <span className="font-mono text-[12px] text-foreground">{m.mel_item_number}</span>
                <span className="border px-1 font-mono text-[10px]" style={{ borderColor: cat.hex, color: cat.hex }}>CAT {cat.label}</span>
                <span className="truncate text-[12px] text-subtext">{m.system_name} — {m.item_description}</span>
                <span className="ml-auto font-mono text-[11px] text-hint">repair by {d(m.repair_by_date)}</span>
                {m.placard_installed && <span className="font-mono text-[10px] text-hint">placarded</span>}
                <span className="font-mono text-[11px] uppercase" style={{ color: st.hex }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* LLPs */}
      <section>
        <p className="eyebrow mb-2">Life-Limited Parts ({data.llps.length})</p>
        <div className="border border-border">
          {data.llps.length === 0 ? <p className="px-3 py-3 text-sm text-hint">No LLPs tracked.</p> : data.llps.map((l) => {
            const tone = llpToneHex(l.percentage_used); const cr = llpCriticality(l.criticality);
            return (
              <div key={l.id} className="border-b border-border/60 px-3 py-2 last:border-b-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-[12px] text-foreground">{l.part_number}</span>
                  <span className="font-mono text-[11px] text-hint">S/N {l.serial_number}</span>
                  <span className="text-[11px] text-subtext">{l.component_type}</span>
                  <span className="ml-auto font-mono text-[11px]" style={{ color: cr.hex }}>{cr.label}</span>
                  <span className="font-mono text-[12px]" style={{ color: tone }}>{l.percentage_used}%</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden bg-surface"><div style={{ width: `${Math.min(100, l.percentage_used)}%`, background: tone }} className="h-full" /></div>
                  <span className="font-mono text-[10px] text-hint">{Math.round(l.remaining)} {l.life_limit_type} left</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
