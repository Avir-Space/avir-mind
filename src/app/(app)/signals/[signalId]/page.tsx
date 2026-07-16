"use client";

import { ChevronLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { EvidenceList } from "@/components/signals/evidence-list";
import { SignalActionBar } from "@/components/signals/signal-action-bar";
import { SignalConfidenceBadge } from "@/components/signals/signal-confidence-badge";
import { CategoryTag } from "@/components/tasks/category-tag";
import { MonoText } from "@/components/avir/mono-text";
import { Skeleton } from "@/components/ui/skeleton";
import { ACTION_LABELS, SIGNAL_SEVERITY } from "@/lib/design/signals";
import { useSignalDetail } from "@/lib/queries/use-signal-detail";
import { useSignalRealtime } from "@/lib/realtime/use-signal-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { formatTimestamp, timeAgo } from "@/lib/utils";
import type { Signal } from "@/types/signals";

export default function SignalDetailPage() {
  const params = useParams<{ signalId: string }>();
  const { orgId } = useAuth();
  useSignalRealtime(orgId);
  const { data, isLoading, isError } = useSignalDetail(params.signalId);

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-4 h-10 w-96" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }
  if (isError || !data?.signal) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="font-serif text-2xl text-foreground">Signal not found</h1>
        <p className="mt-2 text-sm text-subtext">This signal doesn&apos;t exist or isn&apos;t in your organization.</p>
        <Link href="/command-center" className="mt-4 text-sm text-primary hover:underline">Back to Command Center</Link>
      </div>
    );
  }

  const s = data.signal;
  const sev = SIGNAL_SEVERITY[s.severity] ?? SIGNAL_SEVERITY.info;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pb-5 pt-4" style={{ boxShadow: `inset 0 3px 0 ${sev.hex}` }}>
        <Link
          href={s.aircraft_id ? `/aircraft/${s.aircraft_id}` : "/command-center"}
          className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> {s.aircraft?.tail_number ?? "Back"}
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-xs font-medium text-body">
            <span className="severity-dot" style={{ backgroundColor: sev.hex }} />
            {sev.label}
          </span>
          <CategoryTag parentType={s.category} />
          <SignalConfidenceBadge confidence={s.confidence} reasoning={s.confidence_reasoning} />
          <span className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-primary">
            <Sparkles className="h-3 w-3" /> AI signal
          </span>
          {!s.is_active && <span className="font-mono text-eyebrow uppercase text-label">Resolved</span>}
        </div>

        <h1 className="mt-3 font-serif text-3xl leading-tight text-foreground">{s.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-subtext">
          {s.aircraft && (
            <Link href={`/aircraft/${s.aircraft_id}`} className="hover:text-primary">
              <MonoText>{s.aircraft.tail_number}</MonoText> · {s.aircraft.aircraft_type}
            </Link>
          )}
          <span className="font-mono text-eyebrow uppercase text-hint">
            {s.generated_by_model} · {timeAgo(s.generated_at_utc)}
          </span>
        </div>

        <div className="mt-4">
          <SignalActionBar signal={s} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        <div className="grid max-w-5xl gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section>
              <p className="eyebrow mb-2">Narrative</p>
              <p className="text-sm leading-relaxed text-body">{s.narrative}</p>
            </section>

            {s.recommendation && (
              <section className="border border-primary/30 bg-primary/5 p-4">
                <p className="eyebrow mb-1 text-primary">Recommendation</p>
                <p className="text-sm text-foreground">{s.recommendation}</p>
              </section>
            )}

            <section>
              <p className="eyebrow mb-2">Evidence</p>
              <div className="border border-border">
                <div className="px-3">
                  <EvidenceList evidence={s.evidence_refs} aircraftId={s.aircraft_id} />
                </div>
              </div>
            </section>

            <section>
              <p className="eyebrow mb-2">Why this confidence</p>
              <p className="border-l-2 border-border pl-3 text-sm leading-relaxed text-subtext">
                {s.confidence_reasoning}
              </p>
            </section>

            {s.suggested_actions?.length > 0 && (
              <section>
                <p className="eyebrow mb-2">Suggested actions</p>
                <div className="space-y-2">
                  {s.suggested_actions.map((a, i) => (
                    <div key={i} className="border border-border p-3">
                      <p className="text-sm font-medium text-foreground">{a.label}</p>
                      <p className="mt-0.5 text-[13px] text-subtext">{a.description}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 font-mono text-eyebrow uppercase text-hint">What-if compute arrives in Phase 10</p>
              </section>
            )}
          </div>

          {/* Sidebar: action history + related */}
          <div className="space-y-6">
            <section>
              <p className="eyebrow mb-2">Action history</p>
              {data.actions.length === 0 ? (
                <p className="text-sm text-hint">No actions yet.</p>
              ) : (
                <ol className="space-y-2">
                  {data.actions.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-eyebrow uppercase text-label">
                        {ACTION_LABELS[a.action_type] ?? a.action_type}
                      </span>
                      {a.dismissal_reason && <span className="truncate text-subtext">{a.dismissal_reason}</span>}
                      <span className="ml-auto font-mono text-eyebrow text-hint">{timeAgo(a.created_at_utc)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section>
              <p className="eyebrow mb-2">Related signals</p>
              {data.related.length === 0 ? (
                <p className="text-sm text-hint">None on this aircraft.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.related.map((r: Signal) => {
                    const rsev = SIGNAL_SEVERITY[r.severity] ?? SIGNAL_SEVERITY.info;
                    return (
                      <li key={r.id}>
                        <Link href={`/signals/${r.id}`} className="flex items-start gap-2 text-sm hover:text-primary">
                          <span className="severity-dot mt-1.5" style={{ backgroundColor: rsev.hex }} />
                          <span className="flex-1 leading-snug text-body">{r.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <p className="eyebrow mb-2">Generated</p>
              <MonoText muted className="text-[12px]">{formatTimestamp(s.generated_at_utc)}</MonoText>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
