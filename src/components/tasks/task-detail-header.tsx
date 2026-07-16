"use client";

import { Pin, PinOff, TriangleAlert, UserPlus, UserMinus } from "lucide-react";
import Link from "next/link";

import { CategoryTag } from "@/components/tasks/category-tag";
import { TaskAcknowledgeButton } from "@/components/tasks/task-acknowledge-button";
import { MonoText } from "@/components/avir/mono-text";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEVERITY_CONFIG } from "@/lib/design/state";
import { STATUS_CONFIG, STATUS_KEYS } from "@/lib/design/tasks";
import { useTaskActions } from "@/lib/mutations/use-task-actions";
import { useAuth } from "@/lib/providers/auth-provider";
import { formatTimestamp } from "@/lib/utils";
import type { TaskDetail, TaskStatus } from "@/types/tasks";

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-eyebrow uppercase text-label">{label}</p>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

export function TaskDetailHeader({ detail }: { detail: TaskDetail }) {
  const t = detail.task;
  const { user } = useAuth();
  const { moveStatus, assign, setPinned } = useTaskActions();
  const sev = SEVERITY_CONFIG[t.severity] ?? SEVERITY_CONFIG.low;
  const status = STATUS_CONFIG[t.status];
  const assignedToMe = t.assignee_user_id && t.assignee_user_id === user?.id;

  return (
    <div className="border-b border-border px-6 py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-xs font-medium text-body">
          <span className="severity-dot" style={{ backgroundColor: sev.hex }} />
          {sev.label}
        </span>
        <CategoryTag parentType={t.parent_type} subType={t.sub_type} />
        <span className="inline-flex items-center gap-1.5 font-mono text-eyebrow uppercase text-label">
          <span className="severity-dot" style={{ backgroundColor: status?.dotHex }} />
          {status?.label}
        </span>
        {t.aog && (
          <span className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-severity-critical">
            <TriangleAlert className="h-3 w-3" /> AOG
          </span>
        )}
        {t.dispatch_blocking && (
          <span className="font-mono text-eyebrow uppercase text-severity-high">Blocking dispatch</span>
        )}
        {t.pinned && (
          <span className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-primary">
            <Pin className="h-3 w-3" /> Pinned
          </span>
        )}
      </div>

      <h1 className="mt-3 font-serif text-3xl leading-tight text-foreground">{t.title}</h1>
      {t.why_summary && <p className="mt-2 max-w-3xl text-sm text-subtext">{t.why_summary}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select value={t.status} onValueChange={(v) => moveStatus.mutate({ taskId: t.task_id, status: v as TaskStatus })}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_KEYS.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {assignedToMe ? (
          <Button size="sm" variant="outline" onClick={() => assign.mutate({ taskId: t.task_id, assigneeUserId: null })}>
            <UserMinus className="h-3.5 w-3.5" /> Unassign
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => assign.mutate({ taskId: t.task_id, assigneeUserId: user?.id ?? null })}>
            <UserPlus className="h-3.5 w-3.5" /> Assign to me
          </Button>
        )}

        <TaskAcknowledgeButton taskId={t.task_id} acknowledged={t.acknowledged_by_me} />

        <Button size="sm" variant="ghost" onClick={() => setPinned.mutate({ taskId: t.task_id, pinned: !t.pinned })}>
          {t.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          {t.pinned ? "Unpin" : "Pin"}
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-3 lg:grid-cols-6">
        <Meta label="Aircraft">
          <Link href={`/aircraft/${t.aircraft_id}`} className="hover:text-primary">
            <MonoText>{t.tail_number}</MonoText>
          </Link>
        </Meta>
        <Meta label="Assignee">
          {t.assignee_user_id ? (assignedToMe ? "You" : <MonoText muted>{t.assignee_user_id.slice(0, 8)}</MonoText>) : <span className="text-hint">Unassigned</span>}
        </Meta>
        <Meta label="Due">
          <MonoText muted>{formatTimestamp(t.due_at_utc)}</MonoText>
        </Meta>
        <Meta label="Station">
          <MonoText>{t.station_code ?? "—"}</MonoText>
        </Meta>
        <Meta label="Facility">{t.facility ?? "—"}</Meta>
        <Meta label="Created">
          <MonoText muted>{formatTimestamp(t.created_at_utc)}</MonoText>
        </Meta>
      </div>
    </div>
  );
}
