"use client";

import { Check, ChevronLeft, Minus, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { accuracyHex, prettyCategory } from "@/lib/design/calibration";
import { useCalibrationCategory } from "@/lib/queries/use-calibration";
import type { SampleSignal } from "@/types/calibration";

const dd = (iso: string) => new Date(iso).toLocaleDateString();

function MiniHistory({ points }: { points: { snapshot_date: string; accuracy_pct: number | null }[] }) {
  const [hover, setHover] = useState<{ x: number; y: number; date: string; acc: number } | null>(null);
  if (points.length < 2) return <p className="text-sm text-hint">Not enough history for a trend.</p>;
  const W = 560, H = 140, pad = 24;
  const xs = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const ys = (v: number) => H - pad - (v / 100) * (H - pad * 2);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(p.accuracy_pct ?? 0).toFixed(1)}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-[460px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Accuracy history">
          {[0, 50, 100].map((g) => <line key={g} x1={pad} y1={ys(g)} x2={W - pad} y2={ys(g)} stroke="currentColor" strokeOpacity={0.1} />)}
          <path d={d} fill="none" stroke="#1019EC" strokeWidth={2} />
          {points.map((p, i) => (
            <circle key={i} cx={xs(i)} cy={ys(p.accuracy_pct ?? 0)} r={hover?.date === p.snapshot_date ? 4 : 2.5} fill="#1019EC"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover({ x: xs(i), y: ys(p.accuracy_pct ?? 0), date: p.snapshot_date, acc: p.accuracy_pct ?? 0 })}
              onMouseLeave={() => setHover(null)} />
          ))}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-foreground shadow"
            style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}>
            {dd(hover.date)} · {hover.acc}%
          </div>
        )}
      </div>
    </div>
  );
}

function SampleList({ title, items, icon: Icon, hex }: { title: string; items: SampleSignal[]; icon: typeof Check; hex: string }) {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Icon className="h-3.5 w-3.5" style={{ color: hex }} />
        <span className="font-mono text-eyebrow uppercase text-label">{title} ({items.length})</span>
      </div>
      <div className="max-h-72 overflow-y-auto avir-scroll">
        {items.length === 0 ? <p className="px-3 py-3 text-[12px] text-hint">None.</p> : items.map((s) => (
          <Link key={s.id} href={`/signals/${s.id}`} className="block border-b border-border/50 px-3 py-1.5 last:border-b-0 hover:bg-surface/40">
            <p className="truncate text-[12px] text-foreground">{s.title}</p>
            <p className="font-mono text-[10px] text-hint">{s.confidence} · {dd(s.generated_at_utc)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function CalibrationCategoryPage() {
  const params = useParams<{ category: string }>();
  const category = decodeURIComponent(params.category);
  const { data, isLoading } = useCalibrationCategory(category, 180);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/calibration/overview" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Calibration Grid</Link></div>
      <PageHeader eyebrow="Category" title={prettyCategory(category)} subtitle="Historical accuracy, model comparison, and sample predictions with outcomes." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div> : !data ? <p className="text-sm text-hint">No data.</p> : (
          <div className="space-y-6">
            <section>
              <p className="eyebrow mb-2">Accuracy history (rolling 30d)</p>
              <MiniHistory points={data.history ?? []} />
            </section>

            <section>
              <p className="eyebrow mb-2">Model comparison (180d)</p>
              <div className="space-y-2">
                {(data.by_model ?? []).map((m) => (
                  <div key={m.model_identifier} className="flex items-center gap-3 border border-border bg-card px-3 py-2">
                    <MonoText className="w-56 truncate text-[12px] text-foreground">{m.model_identifier}</MonoText>
                    <div className="h-2 w-full max-w-[200px] overflow-hidden bg-surface"><div className="h-full" style={{ width: `${m.accuracy_pct ?? 0}%`, background: accuracyHex(m.accuracy_pct) }} /></div>
                    <span className="font-mono text-[12px]" style={{ color: accuracyHex(m.accuracy_pct) }}>{m.accuracy_pct ?? "—"}%</span>
                    <span className="ml-auto font-mono text-[11px] text-hint">{m.measured} measured</span>
                  </div>
                ))}
                {(data.by_model?.length ?? 0) === 0 && <p className="text-sm text-hint">No model data.</p>}
              </div>
            </section>

            <section>
              <p className="eyebrow mb-2">Sample predictions with outcomes</p>
              <div className="grid gap-3 lg:grid-cols-3">
                <SampleList title="Correct" items={data.samples?.correct ?? []} icon={Check} hex="#16A34A" />
                <SampleList title="Partial" items={data.samples?.partial ?? []} icon={Minus} hex="#CA8A04" />
                <SampleList title="Incorrect" items={data.samples?.incorrect ?? []} icon={X} hex="#DC2626" />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
