"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { llpCriticality, llpToneHex } from "@/lib/design/compliance";
import { useFleetLlps } from "@/lib/queries/use-compliance";

const LIMIT_LABEL: Record<string, string> = { cycles: "cycles", flight_hours: "hours", calendar_time: "months" };

export default function LlpPage() {
  const { data: llps, isLoading } = useFleetLlps();

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/compliance" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Compliance</Link></div>
      <PageHeader eyebrow="Airworthiness" title="Life-Limited Parts" subtitle="Hard-life parts across the fleet by % used and remaining life." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div> : (
          <div className="space-y-2">
            {(llps ?? []).map((l) => {
              const tone = llpToneHex(l.percentage_used); const cr = llpCriticality(l.criticality);
              const unit = LIMIT_LABEL[l.life_limit_type] ?? l.life_limit_type;
              return (
                <div key={l.id} className="border border-border bg-card p-3" style={{ borderLeft: `3px solid ${tone}` }}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <MonoText className="text-[13px] text-foreground">{l.part_number}</MonoText>
                    <span className="font-mono text-[11px] text-hint">S/N {l.serial_number}</span>
                    <span className="text-[12px] text-subtext">{l.component_type}</span>
                    {l.tail_number && <Link href={`/aircraft/${l.aircraft_id}`} className="font-mono text-[11px] text-primary hover:underline">{l.tail_number}</Link>}
                    <span className="ml-auto font-mono text-[11px]" style={{ color: cr.hex }}>{cr.label}</span>
                    <span className="font-mono text-lg leading-none" style={{ color: tone }}>{l.percentage_used}%</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden bg-surface"><div className="h-full" style={{ width: `${Math.min(100, l.percentage_used)}%`, background: tone }} /></div>
                    <span className="shrink-0 font-mono text-[11px] text-hint">{Math.round(l.current_value)} / {Math.round(l.life_limit_value)} {unit} · {Math.round(l.remaining)} left</span>
                  </div>
                  {l.source_document && <p className="mt-1.5 font-mono text-[10px] text-hint">Source: {l.source_document}</p>}
                </div>
              );
            })}
            {(llps?.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-hint">No life-limited parts tracked.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
