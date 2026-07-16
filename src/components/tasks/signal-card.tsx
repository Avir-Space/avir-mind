"use client";

import { ExternalLink, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CategoryTag } from "@/components/tasks/category-tag";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { TaskSourceBadge } from "@/components/tasks/task-source-badge";
import { ConfidenceBadge } from "@/components/avir/confidence-badge";
import { MonoText } from "@/components/avir/mono-text";
import { Button } from "@/components/ui/button";
import { SEVERITY_CONFIG } from "@/lib/design/state";
import { STATUS_CONFIG } from "@/lib/design/tasks";
import type { QueueItem } from "@/types/tasks";

/**
 * Signal card for the Aircraft Profile Signals tab. Heavier visual weight than
 * TaskCard: evidence rows, recommendation, and follow-up actions.
 */
export function SignalCard({ item, aircraftId }: { item: QueueItem; aircraftId: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const sev = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.low;
  const status = STATUS_CONFIG[item.status];
  const sourceUrl = item.sources?.find((s) => s.source_url)?.source_url;

  return (
    <div className="border border-border bg-card" style={{ borderTop: `2px solid ${sev.hex}` }}>
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-xs font-medium text-body"
          >
            <span className="severity-dot" style={{ backgroundColor: sev.hex }} />
            {sev.label}
          </span>
          <CategoryTag parentType={item.parent_type} subType={item.sub_type} />
          <span className="inline-flex items-center gap-1.5 font-mono text-eyebrow uppercase text-label">
            <span className="severity-dot" style={{ backgroundColor: status?.dotHex }} />
            {status?.label}
          </span>
          {item.aog && (
            <span className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-severity-critical">
              <TriangleAlert className="h-3 w-3" /> AOG
            </span>
          )}
          <ConfidenceBadge confidence="medium" className="ml-auto" />
        </div>

        <Link
          href={`/tasks/${item.task_id}`}
          className="mt-3 block font-serif text-xl leading-tight text-foreground hover:text-primary"
        >
          {item.title}
        </Link>
        {item.why_summary && <p className="mt-2 text-sm leading-relaxed text-subtext">{item.why_summary}</p>}

        {/* Evidence */}
        <div className="mt-4 border-t border-border pt-4">
          <p className="eyebrow mb-2">Evidence</p>
          <div className="space-y-1.5">
            {item.sources?.length ? (
              item.sources.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <TaskSourceBadge system={s.source_system} />
                  <MonoText muted className="text-[12px]">
                    {s.source_reference_id ?? "—"}
                  </MonoText>
                </div>
              ))
            ) : (
              <span className="text-xs text-hint">No source references</span>
            )}
          </div>
        </div>

        {/* Recommendation */}
        <div className="mt-4 border border-border bg-surface/40 p-3">
          <p className="eyebrow mb-1">Recommendation</p>
          <p className="text-sm text-body">
            {item.why_summary ?? "Review and disposition this signal."}
          </p>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Create Task
          </Button>
          {sourceUrl ? (
            <Button asChild size="sm" variant="outline">
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                Open Source Dashboard <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              Open Source Dashboard
            </Button>
          )}
        </div>
      </div>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        aircraftId={aircraftId}
        stationCode={item.station_code}
        linkedTaskId={item.task_id}
        defaultParentType={item.parent_type}
      />
    </div>
  );
}
