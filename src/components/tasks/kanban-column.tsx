"use client";

import { useDroppable } from "@dnd-kit/core";

import { KanbanCard } from "@/components/tasks/kanban-card";
import { cn } from "@/lib/utils";
import type { BoardCard } from "@/types/tasks";

export function KanbanColumn({
  columnKey,
  label,
  cards,
}: {
  columnKey: string;
  label: string;
  cards: BoardCard[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey });

  const high = cards.reduce((s, c) => s + (c.severity_summary?.high ?? 0), 0);
  const medium = cards.reduce((s, c) => s + (c.severity_summary?.medium ?? 0), 0);
  const low = cards.reduce((s, c) => s + (c.severity_summary?.low ?? 0), 0);

  return (
    <div className="flex min-w-[280px] flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border-strong px-1 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="font-mono text-eyebrow text-label">{cards.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {high > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-severity-high">
              <span className="severity-dot bg-severity-high" />
              {high}
            </span>
          )}
          {medium > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-severity-medium">
              <span className="severity-dot bg-severity-medium" />
              {medium}
            </span>
          )}
          {low > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-severity-low">
              <span className="severity-dot bg-severity-low" />
              {low}
            </span>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 p-1.5 pt-2 transition-colors",
          isOver ? "bg-primary/5" : "bg-transparent",
        )}
      >
        {cards.map((card) => (
          <KanbanCard key={card.aircraft_id} card={card} columnKey={columnKey} />
        ))}
        {cards.length === 0 && (
          <div className="flex h-24 items-center justify-center border border-dashed border-border text-xs text-hint">
            No aircraft
          </div>
        )}
      </div>
    </div>
  );
}
