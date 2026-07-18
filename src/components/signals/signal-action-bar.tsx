"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, Link2, Plus, Sparkles, ThumbsDown, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { DismissSignalDialog } from "@/components/signals/dismiss-signal-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { CATEGORY_KEYS } from "@/lib/design/tasks";
import { severityToRiskBand } from "@/lib/design/signals";
import { useSignalActions } from "@/lib/mutations/use-signal-actions";
import { useTaskForSignal } from "@/lib/queries/use-task-for-signal";
import type { Signal } from "@/types/signals";

/** Actions row: Create Task, Dismiss, Mark Correct/Incorrect, Explore, Copy Link. */
export function SignalActionBar({ signal }: { signal: Signal }) {
  const { act } = useSignalActions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: existingTaskId } = useTaskForSignal(signal.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);

  const resolved = !signal.is_active;
  const lastAction = signal.my_last_action;
  const parentType = CATEGORY_KEYS.includes(signal.category) ? signal.category : "powerplant";

  function copyLink() {
    const url = `${window.location.origin}/signals/${signal.id}`;
    navigator.clipboard?.writeText(url);
    toast({ title: "Link copied", description: url });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {signal.severity !== "insufficient_data" &&
        (existingTaskId ? (
          // A task already exists for this signal/prediction — link to it
          // instead of creating a duplicate.
          <Button asChild size="sm" variant="outline">
            <Link href={`/tasks/${existingTaskId}`}>
              <ArrowUpRight className="h-3.5 w-3.5" /> View task
            </Link>
          </Button>
        ) : (
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={resolved}>
            <Plus className="h-3.5 w-3.5" /> Create Task
          </Button>
        ))}

      <Button size="sm" variant="outline" onClick={() => setDismissOpen(true)} disabled={resolved}>
        <X className="h-3.5 w-3.5" /> Dismiss
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => act.mutate({ signalId: signal.id, actionType: "marked_correct" })}
        className={lastAction === "marked_correct" ? "text-severity-low" : undefined}
      >
        <Check className="h-3.5 w-3.5" /> Correct
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => act.mutate({ signalId: signal.id, actionType: "marked_incorrect" })}
      >
        <ThumbsDown className="h-3.5 w-3.5" /> Incorrect
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => act.mutate({ signalId: signal.id, actionType: "what_if_explored" })}
      >
        <Sparkles className="h-3.5 w-3.5" /> Explore
      </Button>

      <Button size="sm" variant="ghost" onClick={copyLink}>
        <Link2 className="h-3.5 w-3.5" /> Copy Link
      </Button>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        aircraftId={signal.aircraft_id ?? ""}
        sourceSignalId={signal.id}
        defaultParentType={parentType}
        defaultTitle={signal.recommendation ?? signal.title}
        defaultWhy={signal.narrative}
        defaultRisk={severityToRiskBand(signal.severity)}
        onCreated={(taskId) => {
          act.mutate({ signalId: signal.id, actionType: "create_task", outcomeTaskId: taskId });
          qc.invalidateQueries({ queryKey: ["task-for-signal", signal.id] }); // flip to "View task"
        }}
      />

      <DismissSignalDialog
        open={dismissOpen}
        onOpenChange={setDismissOpen}
        pending={act.isPending}
        onConfirm={(reason) => {
          act.mutate(
            { signalId: signal.id, actionType: "dismissed", dismissalReason: reason },
            { onSuccess: () => setDismissOpen(false) },
          );
        }}
      />
    </div>
  );
}
