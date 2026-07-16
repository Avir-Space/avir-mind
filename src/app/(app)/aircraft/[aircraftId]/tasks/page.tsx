"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, GripVertical } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { CategoryTag } from "@/components/tasks/category-tag";
import { TaskSourceBadge } from "@/components/tasks/task-source-badge";
import { MonoText } from "@/components/avir/mono-text";
import { StatusBadge } from "@/components/avir/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { SEVERITY_CONFIG } from "@/lib/design/state";
import { STATUS_CONFIG } from "@/lib/design/tasks";
import { useAircraftDetail } from "@/lib/queries/use-aircraft-detail";
import { useAircraftTasks } from "@/lib/queries/use-aircraft-tasks";
import { useTaskActions } from "@/lib/mutations/use-task-actions";
import { useTaskRealtime } from "@/lib/realtime/use-task-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { cn } from "@/lib/utils";
import type { QueueItem, TaskStatus } from "@/types/tasks";

const COLUMNS: { key: string; label: string; statuses: TaskStatus[]; target: TaskStatus }[] = [
  { key: "past", label: "Past", statuses: ["done"], target: "done" },
  { key: "present", label: "Present", statuses: ["in_progress", "blocked", "monitoring"], target: "in_progress" },
  { key: "future", label: "Future", statuses: ["queued"], target: "queued" },
];

function TaskChip({ item }: { item: QueueItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.task_id,
    data: { item },
  });
  const sev = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.low;
  const status = STATUS_CONFIG[item.status];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), borderLeft: `3px solid ${sev.hex}` }}
      className={cn(
        "border border-border bg-card p-3",
        isDragging ? "z-50 opacity-80 shadow-lg" : "hover:border-border-strong",
      )}
    >
      <div className="flex items-start gap-2">
        <button {...listeners} {...attributes} className="mt-0.5 cursor-grab text-hint hover:text-label active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <CategoryTag parentType={item.parent_type} />
            <span className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label">
              <span className="severity-dot" style={{ backgroundColor: status?.dotHex }} />
              {status?.label}
            </span>
          </div>
          <Link
            href={`/tasks/${item.task_id}`}
            onPointerDown={(e) => e.stopPropagation()}
            className="mt-1 block text-[13px] font-medium leading-snug text-foreground hover:text-primary"
          >
            {item.title}
          </Link>
          <div className="mt-1.5 flex items-center gap-2">
            {item.sources?.[0] && <TaskSourceBadge system={item.sources[0].source_system} />}
            {item.station_code && <MonoText muted className="text-[10px]">{item.station_code}</MonoText>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({ colKey, label, items }: { colKey: string; label: string; items: QueueItem[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: colKey });
  return (
    <div className="flex min-w-[280px] flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border-strong px-1 pb-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="font-mono text-eyebrow text-label">{items.length}</span>
      </div>
      <div ref={setNodeRef} className={cn("flex flex-1 flex-col gap-2 p-1.5 pt-2", isOver && "bg-primary/5")}>
        {items.map((t) => <TaskChip key={t.task_id} item={t} />)}
        {items.length === 0 && (
          <div className="flex h-20 items-center justify-center border border-dashed border-border text-xs text-hint">
            None
          </div>
        )}
      </div>
    </div>
  );
}

export default function TailTaskBoardPage() {
  const params = useParams<{ aircraftId: string }>();
  const { orgId } = useAuth();
  useTaskRealtime(orgId);
  const { toast } = useToast();
  const { moveStatus } = useTaskActions();
  const { data: detail } = useAircraftDetail(params.aircraftId);
  const { data: tasks, isLoading } = useAircraftTasks(params.aircraftId);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const grouped = (colKey: string) => {
    const col = COLUMNS.find((c) => c.key === colKey)!;
    return (tasks ?? []).filter((t) => col.statuses.includes(t.status));
  };

  async function onDragEnd(e: DragEndEvent) {
    const item = e.active.data.current?.item as QueueItem | undefined;
    const to = e.over?.id as string | undefined;
    if (!item || !to) return;
    const col = COLUMNS.find((c) => c.key === to);
    if (!col || col.statuses.includes(item.status)) return;
    try {
      await moveStatus.mutateAsync({ taskId: item.task_id, status: col.target });
      toast({ title: `Moved to ${col.label}`, description: item.title });
    } catch (err) {
      toast({ title: "Move failed", description: String((err as Error).message), variant: "destructive" });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4">
        <Link
          href={`/aircraft/${params.aircraftId}`}
          className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Aircraft profile
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-serif text-3xl leading-none text-foreground">{detail?.tail_number ?? "—"}</h1>
          <span className="text-lg text-subtext">{detail?.aircraft_type}</span>
          <StatusBadge state={detail?.aircraft_state?.state} />
          <span className="font-mono text-eyebrow uppercase text-label">Task board</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto avir-scroll p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-96" />)}
          </div>
        ) : (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="flex gap-4">
              {COLUMNS.map((c) => (
                <Column key={c.key} colKey={c.key} label={c.label} items={grouped(c.key)} />
              ))}
            </div>
          </DndContext>
        )}
      </div>
    </div>
  );
}
