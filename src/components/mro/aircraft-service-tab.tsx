"use client";

import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { assignmentStatus, findingSeverity, usd, wpStatus } from "@/lib/design/mro";
import { useAircraftServiceContext } from "@/lib/queries/use-mro";
import { useAuth } from "@/lib/providers/auth-provider";

const dt = (x: string | null) => (x ? new Date(x).toLocaleString() : "—");
type J = Record<string, unknown>;

/** MRO Service Context tab — which customer/contract this in-service aircraft is under. */
export function AircraftServiceTab({ aircraftId }: { aircraftId: string }) {
  const { businessModel } = useAuth();
  const isMro = businessModel === "mro" || businessModel === "hybrid";
  const { data, isLoading } = useAircraftServiceContext(aircraftId, isMro);

  if (!isMro) return <p className="p-6 text-sm text-hint">Service context is available for MRO tenants.</p>;
  if (isLoading) return <div className="space-y-2 p-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data) return <p className="p-6 text-sm text-hint">This aircraft is not currently in service.</p>;

  const asa = data.assignment as J; const cust = data.customer as J; const contract = data.contract as J;
  const wps = (data.work_packages as J[]) ?? []; const findings = (data.findings as J[]) ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Customer" value={cust ? String(cust.name) : "—"} link={cust ? `/customers/${cust.id}` : undefined} />
        <Tile label="Contract" value={contract ? String(contract.number) : "—"} link={contract ? `/contracts/${contract.id}` : undefined} />
        <Tile label="Status" value={assignmentStatus(String(asa.assignment_status)).label} />
        <Tile label="Planned release" value={dt(asa.planned_release_utc as string | null)} />
      </div>
      <p className="text-[13px] text-subtext">Purpose: {String(asa.primary_service_purpose ?? "—")} · {String(asa.assigned_hangar ?? "")} {String(asa.assigned_bay ?? "")} · ref {String(asa.customer_reference ?? "—")}</p>

      <section>
        <p className="eyebrow mb-2">Work packages ({wps.length})</p>
        <div className="border border-border">
          {wps.map((w) => (
            <Link key={String(w.id)} href={`/work-packages/${w.id}`} className="flex items-center gap-x-4 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-surface/40">
              <span className="font-mono text-[12px] text-primary">{String(w.number)}</span>
              <span className="flex-1 truncate text-[12px] text-foreground">{String(w.title)}</span>
              <span className="font-mono text-[10px] uppercase" style={{ color: wpStatus(String(w.status)).hex }}>{wpStatus(String(w.status)).label}</span>
            </Link>
          ))}
          {wps.length === 0 && <p className="px-3 py-3 text-sm text-hint">None.</p>}
        </div>
      </section>

      <section>
        <p className="eyebrow mb-2">Findings ({findings.length})</p>
        <div className="border border-border">
          {findings.map((f, i) => {
            const sev = findingSeverity(String(f.severity));
            return (
              <div key={i} className="flex items-center gap-x-3 border-b border-border/60 px-3 py-2 last:border-b-0">
                <span className="font-mono text-[10px] uppercase" style={{ color: sev.hex }}>{sev.label}</span>
                <span className="flex-1 truncate text-[12px] text-foreground">{String(f.description)}</span>
                <span className="font-mono text-[10px] text-hint">{String(f.status ?? "")}</span>
              </div>
            );
          })}
          {findings.length === 0 && <p className="px-3 py-3 text-sm text-hint">None.</p>}
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, link }: { label: string; value: string; link?: string }) {
  const body = <p className={`font-mono text-sm ${link ? "text-primary" : "text-foreground"}`}>{value}</p>;
  return <div className="border border-border bg-card px-4 py-3">{link ? <Link href={link}>{body}</Link> : body}<p className="mt-1 font-mono text-eyebrow uppercase text-label">{label}</p></div>;
}
