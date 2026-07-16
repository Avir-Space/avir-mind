"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { MonoText } from "@/components/avir/mono-text";
import { Skeleton } from "@/components/ui/skeleton";
import { APPROVED_STATUS, criticality, SUPPLIER_TYPE, supplierScoreHex } from "@/lib/design/inventory";
import { useSupplierDetail } from "@/lib/queries/use-inventory";

const money = (n: number | null | undefined) => "$" + Math.round(Number(n ?? 0)).toLocaleString();

export default function SupplierDetailPage() {
  const params = useParams<{ supplierId: string }>();
  const { data, isLoading } = useSupplierDetail(params.supplierId);

  if (isLoading || !data?.supplier) {
    return <div className="p-6"><Skeleton className="h-10 w-64" /><Skeleton className="mt-4 h-64 w-full" /></div>;
  }
  const s = data.supplier;
  const st = APPROVED_STATUS[s.approved_status ?? "approved"] ?? APPROVED_STATUS.approved!;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pb-4 pt-4">
        <Link href="/inventory/suppliers" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Suppliers</Link>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-serif text-3xl text-foreground">{s.supplier_name}</h1>
          <span className="text-sm text-subtext">{SUPPLIER_TYPE[s.supplier_type ?? "other"] ?? s.supplier_type}</span>
          <span className="font-mono text-[11px] uppercase" style={{ color: st.hex }}>{st.label}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-6">
          <div>
            <p className="font-mono text-eyebrow uppercase text-label">Performance</p>
            <p className="mt-1 font-mono text-2xl" style={{ color: supplierScoreHex(s.performance_score) }}>{s.performance_score ?? "—"}<span className="text-sm text-hint">/100</span></p>
          </div>
          {[["Parts supplied", String(data.part_count)], ["Lead time", `${s.typical_lead_time_days ?? "—"} d`], ["Contact", s.primary_contact_name ?? "—"], ["Email", s.primary_contact_email ?? "—"]].map(([l, v]) => (
            <div key={l}><p className="font-mono text-eyebrow uppercase text-label">{l}</p><p className="mt-1 text-sm text-foreground">{v}</p></div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        <p className="eyebrow mb-2">Parts supplied ({data.part_count})</p>
        <div className="overflow-x-auto avir-scroll border border-border">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left">{["Part #", "Description", "Criticality", "Ref", "Price", "Lead", "Preferred"].map((h) => <th key={h} className="px-3 py-2 font-mono text-eyebrow uppercase text-label">{h}</th>)}</tr></thead>
            <tbody>
              {data.parts.map((pt) => (
                <tr key={pt.part_id} className="border-b border-border/60">
                  <td className="px-3 py-2"><Link href={`/inventory/parts/${pt.part_id}`} className="font-mono text-[12px] text-primary hover:underline">{pt.part_number}</Link></td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-subtext">{pt.description}</td>
                  <td className="px-3 py-2"><span className="font-mono text-[11px] uppercase" style={{ color: criticality(pt.criticality).hex }}>{criticality(pt.criticality).label}</span></td>
                  <td className="px-3 py-2"><MonoText muted className="text-[11px]">{pt.supplier_part_reference ?? "—"}</MonoText></td>
                  <td className="px-3 py-2 font-mono">{money(pt.typical_unit_price_usd)}</td>
                  <td className="px-3 py-2 font-mono text-hint">{pt.typical_lead_time_days ?? "—"}d</td>
                  <td className="px-3 py-2">{pt.is_preferred ? <span className="text-severity-low">✓</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
