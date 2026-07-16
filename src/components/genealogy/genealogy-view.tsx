"use client";

import { BadgeCheck, ChevronRight, Download, Link2, Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ExportModal } from "@/components/genealogy/export-modal";
import { TransferModal } from "@/components/genealogy/transfer-modal";
import { MonoText } from "@/components/avir/mono-text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONFIDENCE_CONFIG, recordType, VERIFICATION_STATE_CONFIG } from "@/lib/design/genealogy";
import { deriveInstallations } from "@/lib/genealogy/export-sheet";
import { useGenealogyActions } from "@/lib/mutations/use-genealogy-actions";
import { useAuth } from "@/lib/providers/auth-provider";
import type { GenealogyView as View } from "@/types/genealogy";

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-eyebrow uppercase tracking-wider text-label">{title}</p>
        {right}
      </div>
      {children}
    </section>
  );
}

export function GenealogyView({ view, componentId }: { view: View; componentId?: string }) {
  const { orgId } = useAuth();
  const { verify, resync } = useGenealogyActions();
  const s = view.serial;
  const canManage = !!orgId && s.current_owner_org_id === orgId;
  const historical = !canManage;
  const vstate = VERIFICATION_STATE_CONFIG[s.verification_state] ?? VERIFICATION_STATE_CONFIG.unverified!;

  const [exportOpen, setExportOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const installs = useMemo(() => deriveInstallations(view.records), [view.records]);
  const recordTypesPresent = useMemo(() => [...new Set(view.records.map((r) => r.record_type))], [view.records]);

  const ledger = useMemo(() => {
    let rs = view.records;
    if (typeFilter.length) rs = rs.filter((r) => typeFilter.includes(r.record_type));
    const query = q.trim().toLowerCase();
    if (query) {
      rs = rs.filter(
        (r) => r.record_type.includes(query) || (r.source_org_name ?? "").toLowerCase().includes(query) || JSON.stringify(r.record_payload).toLowerCase().includes(query),
      );
    }
    return rs;
  }, [view.records, typeFilter, q]);

  return (
    <div className="p-6">
      {/* Header banner */}
      <div className="border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-2xl leading-none text-foreground">{s.serial_number}</h2>
              <span className="inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider" style={{ borderColor: vstate.hex, color: vstate.hex }}>
                <vstate.icon className="h-3 w-3" /> {vstate.label}
              </span>
            </div>
            <p className="mt-1 font-mono text-[12px] text-subtext">
              {s.manufacturer} · P/N {s.part_number} · {s.component_type}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}><Download className="h-3.5 w-3.5" /> Export Genealogy</Button>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}><Link2 className="h-3.5 w-3.5" /> Transfer Ownership</Button>
            )}
            {canManage && componentId && (
              <Button size="sm" variant="ghost" onClick={() => resync.mutate(componentId)} disabled={resync.isPending}>
                {resync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh from Source Events
              </Button>
            )}
          </div>
        </div>

        {historical && (
          <div className="mt-3 border-l-2 border-primary bg-primary/5 px-3 py-2 text-[13px] text-body">
            Historical view — you previously owned this component. Current owner:{" "}
            <span className="font-medium text-foreground">{s.current_owner_name ?? "external"}</span>. Read-only.
          </div>
        )}

        {/* Sub-header stats */}
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Birth", s.birth_certificate_date ?? "—"],
            ["Birth facility", s.birth_manufacturer_facility ?? "—"],
            ["Lifetime cycles", (s.lifetime_cycles ?? 0).toLocaleString()],
            ["Lifetime hours", Math.round(s.lifetime_flight_hours ?? 0).toLocaleString()],
            ["Installations", String(s.total_installations ?? 0)],
            ["Owners", String((view.ownership_history?.length ?? 0) + 1)],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="font-mono text-eyebrow uppercase text-label">{k}</p>
              <p className="mt-0.5 truncate text-sm text-foreground">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ownership timeline */}
      <Section title="Ownership timeline">
        <div className="flex flex-col gap-2">
          {(view.ownership_history ?? []).length === 0 ? (
            <div className="flex items-center gap-3 border border-border bg-card px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-sm text-foreground">{s.current_owner_name ?? "Current owner"}</span>
              <span className="font-mono text-[11px] text-hint">since manufacture · current</span>
            </div>
          ) : (
            [...view.ownership_history].map((o, i) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 border border-border bg-card px-3 py-2">
                <span className={cn("h-2 w-2 rounded-full", i === view.ownership_history.length - 1 ? "bg-primary" : "bg-border-strong")} />
                <span className="text-sm text-foreground">{o.from_org_name ?? "— external —"}</span>
                <ChevronRight className="h-3.5 w-3.5 text-hint" />
                <span className="text-sm text-foreground">{o.to_org_name ?? "—"}</span>
                <span className="font-mono text-[11px] uppercase text-label">{o.transfer_type}</span>
                <span className="ml-auto font-mono text-[11px] text-hint">{o.transfer_date_utc}</span>
              </div>
            ))
          )}
        </div>
      </Section>

      {/* Installation history */}
      <Section title="Installation history">
        {installs.length === 0 ? (
          <p className="text-sm text-hint">No installation records.</p>
        ) : (
          <div className="overflow-x-auto avir-scroll border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Aircraft", "Installed", "Removed", "Cycles", "Findings"].map((h) => (
                    <th key={h} className="px-3 py-2 font-mono text-eyebrow uppercase text-label">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {installs.map((it, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="px-3 py-2"><MonoText>{it.tail}</MonoText></td>
                    <td className="px-3 py-2 text-subtext">{it.installedDate ?? "—"}</td>
                    <td className="px-3 py-2 text-subtext">{it.removedDate ?? <span className="text-severity-low">on-wing</span>}</td>
                    <td className="px-3 py-2 font-mono">{it.cycles != null ? it.cycles.toLocaleString() : "—"}</td>
                    <td className="px-3 py-2 font-mono">{it.findings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Ledger */}
      <Section
        title={`Record ledger · ${view.records.length}`}
        right={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-hint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search records…" className="h-8 w-48 border border-input bg-transparent pl-8 pr-2 text-xs text-foreground placeholder:text-hint focus:border-primary focus:outline-none" />
          </div>
        }
      >
        <div className="mb-2 flex flex-wrap gap-1">
          {recordTypesPresent.map((t) => {
            const active = typeFilter.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter((f) => (active ? f.filter((x) => x !== t) : [...f, t]))}
                className={cn("border px-2 py-0.5 text-[11px] transition-colors", active ? "border-primary bg-primary/10 text-primary" : "border-border text-subtext hover:text-foreground")}
              >
                {recordType(t).label}
              </button>
            );
          })}
        </div>
        <div className="border border-border">
          {ledger.map((r) => {
            const meta = recordType(r.record_type);
            const conf = CONFIDENCE_CONFIG[r.confidence] ?? CONFIDENCE_CONFIG.self_reported!;
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} className="border-b border-border/60 last:border-b-0">
                <button type="button" onClick={() => setExpanded(isOpen ? null : r.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface/40">
                  <span className="w-6 shrink-0 font-mono text-[11px] text-hint">{r.record_seq}</span>
                  <meta.icon className="h-3.5 w-3.5 shrink-0 text-label" strokeWidth={1.75} />
                  <span className="w-32 shrink-0 text-[13px] font-medium text-foreground">{meta.label}</span>
                  <span className="w-24 shrink-0 font-mono text-[11px] text-hint">{r.record_date_utc}</span>
                  <span className="hidden flex-1 truncate font-mono text-[11px] text-subtext sm:block">{r.source_org_name ?? "—"}{r.aircraft_tail ? ` · ${r.aircraft_tail}` : ""}</span>
                  <span className="shrink-0 font-mono text-[9px] uppercase" style={{ color: conf.hex }}>{conf.label}</span>
                  <span className="hidden shrink-0 font-mono text-[10px] text-primary md:inline">{r.content_hash.slice(0, 10)}</span>
                  <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-hint transition-transform", isOpen && "rotate-90")} />
                </button>
                {isOpen && (
                  <div className="border-t border-border/60 bg-surface/30 px-3 py-3">
                    <div className="grid gap-2 font-mono text-[11px] sm:grid-cols-2">
                      <div><span className="text-label">content_hash</span><div className="break-all text-primary">{r.content_hash}</div></div>
                      <div><span className="text-label">previous_record_hash</span><div className="break-all text-subtext">{r.previous_record_hash ?? "— genesis —"}</div></div>
                    </div>
                    <pre className="mt-2 max-h-48 overflow-auto avir-scroll border border-border bg-page p-2 text-[11px] text-body">{JSON.stringify(r.record_payload, null, 2)}</pre>
                    {canManage && r.confidence !== "verified" && (
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => verify.mutate({ recordId: r.id, source: "Tenant self-verification" })} disabled={verify.isPending}>
                        <ShieldCheck className="h-3.5 w-3.5" /> Verify record
                      </Button>
                    )}
                    {r.verification_source && <p className="mt-1.5 font-mono text-[10px] text-severity-low">Verified · {r.verification_source}</p>}
                  </div>
                )}
              </div>
            );
          })}
          {ledger.length === 0 && <p className="px-3 py-4 text-sm text-hint">No records match.</p>}
        </div>
      </Section>

      {/* Verification & integrity */}
      <Section title="Verification & integrity">
        <div className={cn("flex flex-wrap items-center gap-3 border px-3 py-2.5", view.stats?.chain_ok ? "border-severity-low/40 bg-severity-low/5" : "border-severity-critical/40 bg-severity-critical/5")}>
          <BadgeCheck className={cn("h-4 w-4", view.stats?.chain_ok ? "text-severity-low" : "text-severity-critical")} />
          <span className="text-sm text-foreground">
            {view.stats?.chain_ok ? "Hash chain verified — every record chains to its predecessor." : "Hash chain BROKEN — tamper evidence detected."}
          </span>
          <span className="ml-auto font-mono text-[11px] text-label">{view.stats?.verified_count ?? 0} / {view.stats?.records_count ?? 0} records verified</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="cursor-not-allowed border border-border px-2.5 py-1 text-[12px] text-hint">Request cross-tenant verification (Phase 9)</span>
          <span className="font-mono text-[11px] text-hint">{view.export_count} export{view.export_count === 1 ? "" : "s"} on record</span>
        </div>
      </Section>

      <ExportModal open={exportOpen} onOpenChange={setExportOpen} view={view} />
      {canManage && <TransferModal open={transferOpen} onOpenChange={setTransferOpen} view={view} />}
    </div>
  );
}
