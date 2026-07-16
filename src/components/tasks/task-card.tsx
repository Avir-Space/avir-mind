"use client";

import { ChevronDown, Plane, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CategoryTag } from "@/components/tasks/category-tag";
import { TaskAcknowledgeButton } from "@/components/tasks/task-acknowledge-button";
import { TaskSourceBadge } from "@/components/tasks/task-source-badge";
import { MonoText } from "@/components/avir/mono-text";
import { Button } from "@/components/ui/button";
import { SEVERITY_CONFIG } from "@/lib/design/state";
import { STATUS_CONFIG } from "@/lib/design/tasks";
import { cn, timeAgo } from "@/lib/utils";
import type { QueueItem } from "@/types/tasks";

export function TaskCard({ item }: { item: QueueItem }) {
  const [open, setOpen] = useState(false);
  const sev = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.low;
  const status = STATUS_CONFIG[item.status];

  return (
    <div className="border border-border bg-card transition-colors duration-micro hover:border-border-strong">
      <div className="flex items-start gap-3 p-3" style={{ borderLeft: `3px solid ${sev.hex}` }}>
        <span className="severity-dot mt-1.5" style={{ backgroundColor: sev.hex }} aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CategoryTag parentType={item.parent_type} subType={item.sub_type} />
            <span className="inline-flex items-center gap-1.5 font-mono text-eyebrow uppercase text-label">
              <span className="severity-dot" style={{ backgroundColor: status?.dotHex }} />
              {status?.label}
            </span>
            {item.dispatch_blocking && (
              <span className="font-mono text-eyebrow uppercase text-severity-high">Blocking dispatch</span>
            )}
            {item.aog && (
              <span className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-severity-critical">
                <TriangleAlert className="h-3 w-3" /> AOG
              </span>
            )}
          </div>

          <Link
            href={`/tasks/${item.task_id}`}
            className="mt-1.5 block text-[15px] font-medium leading-snug text-foreground hover:text-primary"
          >
            {item.title}
          </Link>
          {item.why_summary && (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-subtext">{item.why_summary}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link href={`/aircraft/${item.aircraft_id}`} className="hover:text-primary">
              <MonoText className="text-[11px]">{item.tail_number}</MonoText>
            </Link>
            {item.station_code && (
              <MonoText muted className="text-[11px]">
                {item.station_code}
              </MonoText>
            )}
            {item.sources?.[0] && (
              <TaskSourceBadge
                system={item.sources[0].source_system}
                referenceId={item.sources[0].source_reference_id}
              />
            )}
            <span className="font-mono text-eyebrow text-hint">{timeAgo(item.updated_at_utc)}</span>
            {!item.acknowledged_by_me && (
              <span className="font-mono text-eyebrow uppercase text-primary">Needs decision</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <TaskAcknowledgeButton taskId={item.task_id} acknowledged={item.acknowledged_by_me} />
            <Button asChild size="sm" variant="ghost">
              <Link href={`/aircraft/${item.aircraft_id}`}>
                <Plane className="h-3.5 w-3.5" /> Aircraft
              </Link>
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label transition-colors hover:text-foreground"
          >
            Details <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div className="grid gap-4 border-t border-border bg-surface/30 p-3 sm:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {item.sources?.length ? (
                item.sources.map((s, i) => (
                  <TaskSourceBadge key={i} system={s.source_system} referenceId={s.source_reference_id} />
                ))
              ) : (
                <span className="text-xs text-hint">None</span>
              )}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-2">Recent activity</p>
            <ul className="space-y-1">
              {item.recent_events?.length ? (
                item.recent_events.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-subtext">
                    <span className="font-mono text-eyebrow uppercase text-label">
                      {e.event_type.replace(/_/g, " ")}
                    </span>
                    {e.body && <span className="truncate">{e.body}</span>}
                    <span className="ml-auto font-mono text-eyebrow text-hint">{timeAgo(e.created_at_utc)}</span>
                  </li>
                ))
              ) : (
                <li className="text-xs text-hint">No recent events</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
