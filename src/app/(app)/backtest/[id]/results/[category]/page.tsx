"use client";

import { CheckCircle2, ChevronLeft, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { matchConfidence, prettyCategory, prettyEventType } from "@/lib/design/backtest";
import { useBacktestCategory } from "@/lib/queries/use-backtest";

const dt = (x: string) => new Date(x).toLocaleString();

export default function BacktestCategoryPage() {
  const { id, category } = useParams<{ id: string; category: string }>();
  const cat = decodeURIComponent(category);
  const { data, isLoading } = useBacktestCategory(id, cat);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href={`/backtest/${id}`} className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Project</Link></div>
      <PageHeader eyebrow="Category" title={prettyCategory(cat)} subtitle="Simulated signals, caught events, and honest misses for this category." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div> : !data ? <p className="text-sm text-hint">No data.</p> : (
          <div className="space-y-6">
            {/* caught vs missed */}
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="border border-severity-low/30 bg-severity-low/5">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2"><CheckCircle2 className="h-3.5 w-3.5 text-severity-low" /><span className="font-mono text-eyebrow uppercase text-label">Would-have-caught ({data.caught_events.length})</span></div>
                {data.caught_events.length === 0 ? <p className="px-3 py-3 text-[12px] text-hint">None in this category.</p> : data.caught_events.map((e) => (
                  <div key={e.id} className="border-b border-border/50 px-3 py-2 last:border-b-0">
                    <p className="text-[12px] text-foreground">{prettyEventType(e.type)} · <MonoText muted className="text-[11px]">{e.entity}</MonoText></p>
                    <p className="font-mono text-[10px] text-hint">{dt(e.time)}{e.description ? ` · ${e.description}` : ""}</p>
                  </div>
                ))}
              </div>
              <div className="border border-severity-high/30 bg-severity-high/5">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2"><XCircle className="h-3.5 w-3.5 text-severity-high" /><span className="font-mono text-eyebrow uppercase text-label">Missed ({data.missed_events.length})</span></div>
                {data.missed_events.length === 0 ? <p className="px-3 py-3 text-[12px] text-hint">No misses.</p> : data.missed_events.map((e) => (
                  <div key={e.id} className="border-b border-border/50 px-3 py-2 last:border-b-0">
                    <p className="text-[12px] text-foreground">{prettyEventType(e.type)} · <MonoText muted className="text-[11px]">{e.entity}</MonoText></p>
                    <p className="font-mono text-[10px] text-hint">{dt(e.time)}{e.description ? ` · ${e.description}` : ""}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* signals */}
            <div>
              <p className="eyebrow mb-2">Simulated signals ({data.signals.length})</p>
              <div className="border border-border">
                {data.signals.map((s) => {
                  const mc = matchConfidence(s.match_confidence);
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                      <MonoText muted className="w-28 truncate text-[11px]">{s.entity_external_id}</MonoText>
                      <span className="flex-1 truncate text-[12px] text-subtext">{s.title}</span>
                      <span className="font-mono text-[11px] text-hint">{new Date(s.would_have_fired_at_utc).toLocaleDateString()}</span>
                      {s.matched_actual_event_id && s.match_lead_time_days != null && <span className="font-mono text-[11px] text-primary">{s.match_lead_time_days}d lead</span>}
                      <span className="font-mono text-[10px] uppercase" style={{ color: mc.hex }}>{mc.label}</span>
                    </div>
                  );
                })}
                {data.signals.length === 0 && <p className="px-3 py-4 text-sm text-hint">No signals in this category.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
