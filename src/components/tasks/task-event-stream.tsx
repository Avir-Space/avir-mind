"use client";

import {
  Check,
  CircleDot,
  Clock,
  FileUp,
  type LucideIcon,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  UserMinus,
  UserPlus,
} from "lucide-react";

import { cn, timeAgo } from "@/lib/utils";
import type { TaskEventRow } from "@/types/tasks";

const EVENT_ICON: Record<string, LucideIcon> = {
  task_created: Plus,
  status_change: CircleDot,
  comment: MessageSquare,
  acknowledged: Check,
  assigned: UserPlus,
  unassigned: UserMinus,
  pinned: Pin,
  unpinned: PinOff,
  work_logged: Clock,
  attachment_added: FileUp,
};

function describe(e: TaskEventRow): string {
  const p = (e.event_payload ?? {}) as Record<string, unknown>;
  switch (e.event_type) {
    case "status_change":
      return `Status ${String(p.from ?? "?")} → ${String(p.to ?? "?")}`;
    case "task_created":
      return "Task created";
    case "acknowledged":
      return "Acknowledged";
    case "assigned":
      return "Assigned";
    case "unassigned":
      return "Unassigned";
    case "pinned":
      return "Pinned";
    case "unpinned":
      return "Unpinned";
    case "work_logged":
      return `Logged ${String(p.minutes ?? "?")} min`;
    case "comment":
      return "Comment";
    default:
      return e.event_type.replace(/_/g, " ");
  }
}

export function TaskEventStream({
  events,
  filterTypes,
  emptyLabel = "No activity yet.",
}: {
  events: TaskEventRow[];
  filterTypes?: string[];
  emptyLabel?: string;
}) {
  const rows = filterTypes ? events.filter((e) => filterTypes.includes(e.event_type)) : events;

  if (rows.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-hint">{emptyLabel}</p>;
  }

  return (
    <ol className="relative space-y-0">
      {rows.map((e, i) => {
        const Icon = EVENT_ICON[e.event_type] ?? CircleDot;
        const last = i === rows.length - 1;
        return (
          <li key={e.id ?? i} className="relative flex gap-3 pb-4">
            {!last && <span className="absolute left-[11px] top-6 h-full w-px bg-border" aria-hidden />}
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-border bg-surface text-label">
              <Icon className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{describe(e)}</span>
                <span className={cn("ml-auto font-mono text-eyebrow text-hint")}>{timeAgo(e.created_at_utc)}</span>
              </div>
              {e.body && <p className="mt-0.5 text-sm text-subtext">{e.body}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
