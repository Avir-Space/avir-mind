"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { CategoryTag } from "@/components/tasks/category-tag";
import { TaskSourceBadge } from "@/components/tasks/task-source-badge";
import { MonoText } from "@/components/avir/mono-text";
import { SEVERITY_CONFIG } from "@/lib/design/state";
import { cn } from "@/lib/utils";
import type { BoardCard } from "@/types/tasks";

export function KanbanCard({ card, columnKey }: { card: BoardCard; columnKey: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.aircraft_id,
    data: { card, from: columnKey },
  });

  const sev = card.primary_task
    ? (SEVERITY_CONFIG[card.primary_task.severity] ?? SEVERITY_CONFIG.low)
    : SEVERITY_CONFIG.low;
  const extra = card.task_count > 1 ? card.task_count - 1 : 0;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), borderLeft: `3px solid ${sev.hex}` }}
      className={cn(
        "select-none border border-border bg-card transition-shadow",
        isDragging ? "z-50 opacity-80 shadow-lg" : "hover:border-border-strong",
      )}
    >
      <div className="flex items-start gap-2 p-3">
        <button
          {...listeners}
          {...attributes}
          className="mt-0.5 cursor-grab text-hint hover:text-label active:cursor-grabbing"
          aria-label="Drag aircraft"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/aircraft/${card.aircraft_id}/tasks`}
              onPointerDown={(e) => e.stopPropagation()}
              className="hover:text-primary"
            >
              <MonoText className="text-sm font-medium">{card.tail_number}</MonoText>
            </Link>
            <span className="font-mono text-eyebrow uppercase text-hint">{card.aircraft_type}</span>
          </div>

          {card.primary_task ? (
            <>
              <div className="mt-1.5">
                <CategoryTag parentType={card.primary_task.parent_type} />
              </div>
              <p className="mt-1 line-clamp-1 text-[13px] font-medium text-foreground">
                {card.primary_task.title}
              </p>
              {card.primary_task.why_summary && (
                <p className="line-clamp-1 text-[12px] text-subtext">{card.primary_task.why_summary}</p>
              )}
            </>
          ) : (
            <p className="mt-1.5 text-[12px] text-hint">No active tasks</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {card.station_code && (
              <MonoText muted className="text-[10px]">
                {card.station_code}
              </MonoText>
            )}
            {card.primary_task?.facility && (
              <span className="font-mono text-[10px] text-hint">{card.primary_task.facility}</span>
            )}
            {card.primary_task?.sources?.[0] && (
              <TaskSourceBadge system={card.primary_task.sources[0].source_system} />
            )}
            {extra > 0 && <span className="font-mono text-[10px] text-label">+{extra} more</span>}
          </div>

          {(card.dispatch_blocking || card.aog) && (
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
              {card.aog && (
                <span className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-severity-critical">
                  <TriangleAlert className="h-3 w-3" /> AOG
                </span>
              )}
              {card.dispatch_blocking && (
                <span className="font-mono text-eyebrow uppercase text-severity-high">Blocking dispatch</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
