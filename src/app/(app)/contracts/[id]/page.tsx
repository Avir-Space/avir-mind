"use client";

import { ChevronLeft, Loader2, Ruler } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { contractStatus, CONTRACT_TYPE_LABEL, usd, wpStatus } from "@/lib/design/mro";
import { useMroActions } from "@/lib/mutations/use-mro-actions";
import { useContractDetail } from "@/lib/queries/use-mro";

const dd = (x: string | null) => (x ? new Date(x).toLocaleDateString() : "—");
type J = Record<string, unknown>;

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useContractDetail(id);
  const { computeSla } = useMroActions();
  const { toast } = useToast();

  if (isLoading || !data) return <div className="p-6"><Skeleton className="h-9 w-64" /><div className="mt-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div></div>;
  const k = data.contract as J; const cust = data.customer as J;
  const work = (data.active_work as J[]) ?? []; const sla = (data.sla_measurements as J[]) ?? [];
  const slaDef = (k.sla_definitions as J) ?? {};

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/contracts" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Contracts</Link></div>
      <PageHeader eyebrow={String(k.contract_number)} title={String(k.contract_name)}
        subtitle={`${CONTRACT_TYPE_LABEL[String(k.contract_type)] ?? String(k.contract_type)} · ${cust ? String(cust.name) : ""} · ${dd(k.effective_from as string)} → ${dd(k.effective_to as string | null)}`}
        actions={<Button size="sm" variant="outline" onClick={() => computeSla.mutate(id, { onSuccess: () => toast({ title: "SLA computed" }) })}>{computeSla.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ruler className="h-3.5 w-3.5" />} Compute SLA</Button>} />

      <div className="flex-1 overflow-y-auto avir-scroll p-6 space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="border border-border bg-card px-5 py-4"><p className="font-mono text-xl text-foreground">{usd(k.annual_value_usd as number)}</p><p className="mt-1.5 font-mono text-eyebrow uppercase text-label">Annual value</p></div>
          <div className="border border-border bg-card px-5 py-4"><p className="font-mono text-xl" style={{ color: contractStatus(String(k.contract_status)).hex }}>{contractStatus(String(k.contract_status)).label}</p><p className="mt-1.5 font-mono text-eyebrow uppercase text-label">Status</p></div>
          <div className="border border-border bg-card px-5 py-4"><p className="font-mono text-xl text-foreground">{(k.covered_aircraft_types as string[] ?? []).join(", ") || "—"}</p><p className="mt-1.5 font-mono text-eyebrow uppercase text-label">Covered types</p></div>
        </div>

        <section>
          <p className="eyebrow mb-2">SLA definitions</p>
          <div className="border border-border bg-card p-4">
            {Object.keys(slaDef).length === 0 ? <p className="text-sm text-hint">No SLA terms defined.</p> : (
              <div className="grid grid-cols-2 gap-3 font-mono text-[12px] sm:grid-cols-4">
                {Object.entries(slaDef).map(([kk, vv]) => <div key={kk}><p className="text-foreground text-lg">{String(vv)}</p><p className="text-hint">{kk.replace(/_/g, " ")}</p></div>)}
              </div>
            )}
          </div>
        </section>

        <section>
          <p className="eyebrow mb-2">Active work under contract ({work.length})</p>
          <div className="border border-border">
            {work.map((w) => (
              <Link key={String(w.id)} href={`/work-packages/${w.id}`} className="flex flex-wrap items-center gap-x-4 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-surface/40">
                <MonoText className="text-[12px] text-primary">{String(w.number)}</MonoText>
                <span className="text-[11px] text-hint">{String(w.tail_number)}</span>
                <span className="flex-1 truncate text-[12px] text-foreground">{String(w.title)}</span>
                <span className="font-mono text-[10px] uppercase" style={{ color: wpStatus(String(w.status)).hex }}>{wpStatus(String(w.status)).label}</span>
              </Link>
            ))}
            {work.length === 0 && <p className="px-3 py-3 text-sm text-hint">No active work.</p>}
          </div>
        </section>

        <section>
          <p className="eyebrow mb-2">SLA measurement timeline</p>
          <div className="border border-border">
            {sla.map((m) => (
              <div key={String(m.id)} className="flex flex-wrap items-center gap-x-4 border-b border-border/60 px-3 py-2 last:border-b-0">
                <span className="w-40 text-[12px] text-foreground">{String(m.sla_type).replace(/_/g, " ")}</span>
                <span className="font-mono text-[11px] text-hint">{dd(m.measurement_period_start as string)} → {dd(m.measurement_period_end as string)}</span>
                <span className="ml-auto font-mono text-[12px]" style={{ color: Number(m.performance_pct) >= 100 ? "#16A34A" : "#EA580C" }}>{String(m.performance_pct)}%</span>
                {Number(m.credits_owed_usd) > 0 && <span className="font-mono text-[11px] text-severity-high">{usd(m.credits_owed_usd as number)}</span>}
              </div>
            ))}
            {sla.length === 0 && <p className="px-3 py-3 text-sm text-hint">No measurements yet — Compute SLA to generate one.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
