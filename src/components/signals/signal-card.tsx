"use client";

import { ChevronDown, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CategoryTag } from "@/components/tasks/category-tag";
import { InventorySignalExtra } from "@/components/inventory/inventory-signal-extra";
import { INVENTORY_SIGNAL_CATEGORIES } from "@/lib/design/inventory";
import { EvidenceList } from "@/components/signals/evidence-list";
import { SignalActionBar } from "@/components/signals/signal-action-bar";
import { SignalConfidenceBadge } from "@/components/signals/signal-confidence-badge";
import { SuggestedActionPills } from "@/components/signals/suggested-action-pills";
import { LastUpdated } from "@/components/avir/last-updated";
import { SIGNAL_SEVERITY } from "@/lib/design/signals";
import { useSignalActions } from "@/lib/mutations/use-signal-actions";
import { cn } from "@/lib/utils";
import type { Signal } from "@/types/signals";

/**
 * AI signal card — a recommendation, distinct from a TaskCard (a commitment).
 * Heavier weight: evidence, recommendation, confidence reasoning, what-ifs.
 */
export function SignalCard({ signal }: { signal: Signal }) {
  const { act } = useSignalActions();
  const [showWhy, setShowWhy] = useState(false);
  const sev = SIGNAL_SEVERITY[signal.severity] ?? SIGNAL_SEVERITY.info;
  const insufficient = signal.severity === "insufficient_data";

  return (
    <div
      className={cn("border border-border bg-card", !signal.is_active && "opacity-60")}
      style={{ borderTop: `2px solid ${sev.hex}` }}
    >
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-xs font-medium text-body">
            <span className="severity-dot" style={{ backgroundColor: sev.hex }} />
            {sev.label}
          </span>
          <CategoryTag parentType={signal.category} />
          {insufficient && (
            <span className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label">
              <TriangleAlert className="h-3 w-3" /> Grounded refusal
            </span>
          )}
          <SignalConfidenceBadge
            confidence={signal.confidence}
            reasoning={signal.confidence_reasoning}
            className="ml-auto"
          />
        </div>

        <Link
          href={`/signals/${signal.id}`}
          className="mt-3 block font-serif text-xl leading-tight text-foreground hover:text-primary"
        >
          {signal.title}
        </Link>
        <p className="mt-2 text-sm leading-relaxed text-subtext">{signal.narrative}</p>

        {/* Evidence */}
        <div className="mt-4 border-t border-border pt-3">
          <p className="eyebrow mb-1">Evidence</p>
          <EvidenceList evidence={signal.evidence_refs} aircraftId={signal.aircraft_id} />
        </div>

        {/* Recommendation */}
        {signal.recommendation && (
          <div className="mt-4 border border-primary/30 bg-primary/5 p-3">
            <p className="eyebrow mb-1 text-primary">Recommendation</p>
            <p className="text-sm text-foreground">{signal.recommendation}</p>
          </div>
        )}

        {/* Inventory-aware footer */}
        {INVENTORY_SIGNAL_CATEGORIES.has(signal.category) && <InventorySignalExtra signal={signal} />}

        {/* Suggested what-ifs */}
        {signal.suggested_actions?.length > 0 && (
          <div className="mt-4">
            <p className="eyebrow mb-2 inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> What if
            </p>
            <SuggestedActionPills
              actions={signal.suggested_actions}
              onExplore={() => act.mutate({ signalId: signal.id, actionType: "what_if_explored" })}
            />
          </div>
        )}

        {/* Confidence reasoning (collapsible) */}
        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          className="mt-4 inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label transition-colors hover:text-foreground"
        >
          Why this confidence
          <ChevronDown className={cn("h-3 w-3 transition-transform", showWhy && "rotate-180")} />
        </button>
        {showWhy && (
          <p className="mt-1.5 border-l-2 border-border pl-3 text-[13px] leading-snug text-subtext">
            {signal.confidence_reasoning}
          </p>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          <SignalActionBar signal={signal} />
          <LastUpdated at={signal.generated_at_utc} label="Generated" className="shrink-0" />
        </div>
      </div>
    </div>
  );
}
