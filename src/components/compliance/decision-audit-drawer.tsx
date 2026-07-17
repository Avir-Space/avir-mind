"use client";

import { Bot, Database, FileCode2, ShieldCheck, UserCheck } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { confidence, decisionTypeLabel, oversightType } from "@/lib/design/compliance";
import { useAuditTrail } from "@/lib/queries/use-compliance";

const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "—");

function Section({ icon: Icon, label, children }: { icon: typeof Bot; label: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-card p-3">
      <p className="eyebrow mb-2 inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {label}</p>
      {children}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-[12px]">
      <span className="shrink-0 text-hint">{k}</span>
      <span className={mono ? "text-right font-mono text-foreground break-all" : "text-right text-foreground"}>{v}</span>
    </div>
  );
}

/**
 * The DS.AI provenance drawer — the decision record → model → prompt → data
 * lineage → human oversight chain behind a single signal.
 */
export function DecisionAuditDrawer({ signalId, open, onOpenChange }: {
  signalId: string | null; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const { data: trail, isLoading } = useAuditTrail(open ? signalId : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto avir-scroll sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> DS.AI decision audit
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : !trail ? (
          <p className="mt-6 text-sm text-hint">No AI decision record is linked to this signal.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <Section icon={Bot} label="Decision">
              <Row k="Type" v={decisionTypeLabel(String(trail.decision.decision_type))} />
              <Row k="Producer" v={String((trail.decision.decision_context as string) ?? trail.decision.model_identifier)} />
              <Row k="Confidence" v={<span style={{ color: confidence(trail.decision.output_confidence).hex }}>{confidence(trail.decision.output_confidence).label}</span>} />
              <Row k="Input hash" v={String(trail.decision.input_context_hash).slice(0, 20) + "…"} mono />
              <Row k="Decided" v={dt(String(trail.decision.decision_at_utc))} />
            </Section>

            <Section icon={FileCode2} label="Model version">
              {trail.model ? (
                <>
                  <Row k="Model" v={String(trail.model.model_identifier)} mono />
                  <Row k="Provider" v={String(trail.model.provider)} />
                  <Row k="Version" v={String(trail.model.version_number ?? "—")} />
                  <Row k="Deployed" v={dt(String(trail.model.deployed_from_utc))} />
                </>
              ) : <p className="text-[12px] text-hint">Model not in registry.</p>}
            </Section>

            {trail.prompt && (
              <Section icon={FileCode2} label="Prompt version">
                <Row k="Template" v={String(trail.prompt.prompt_template_identifier)} mono />
                <Row k="Version" v={"v" + String(trail.prompt.version_number)} />
                <Row k="Hash" v={String(trail.prompt.prompt_template_hash).slice(0, 20) + "…"} mono />
              </Section>
            )}

            <Section icon={Database} label={`Data lineage (${trail.lineage.length})`}>
              {trail.lineage.length === 0 ? <p className="text-[12px] text-hint">No lineage rows.</p> : trail.lineage.map((l) => (
                <div key={l.id} className="border-b border-border/50 py-1.5 last:border-b-0">
                  <p className="font-mono text-[11px] text-foreground">{l.source_table} · {String(l.source_row_id).slice(0, 8)}…</p>
                  <p className="font-mono text-[10px] text-hint">via {l.source_data_generated_by ?? "—"}</p>
                  {l.source_data_snapshot && (
                    <pre className="mt-1 overflow-x-auto border border-border/60 bg-surface/40 p-1.5 font-mono text-[10px] text-subtext">
                      {JSON.stringify(l.source_data_snapshot, null, 1)}
                    </pre>
                  )}
                </div>
              ))}
            </Section>

            <Section icon={UserCheck} label={`Human oversight (${trail.oversight.length})`}>
              {trail.oversight.length === 0 ? (
                <p className="text-[12px] text-severity-high">No human has reviewed this decision — a DS.AI oversight gap.</p>
              ) : trail.oversight.map((o) => {
                const ot = oversightType(o.oversight_type);
                return (
                  <div key={o.id} className="flex items-center justify-between gap-2 py-1">
                    <span className="font-mono text-[11px] uppercase" style={{ color: ot.hex }}>{ot.label}</span>
                    <span className="font-mono text-[10px] text-hint">{o.reviewer_role ?? "—"} · {dt(o.created_at_utc)}</span>
                  </div>
                );
              })}
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
