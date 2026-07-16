"use client";

import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTaskActions } from "@/lib/mutations/use-task-actions";
import { cn } from "@/lib/utils";

/** Acknowledge action / acknowledged indicator for a task. */
export function TaskAcknowledgeButton({
  taskId,
  acknowledged,
  className,
}: {
  taskId: string;
  acknowledged: boolean;
  className?: string;
}) {
  const { acknowledge } = useTaskActions();

  if (acknowledged) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-severity-low",
          className,
        )}
      >
        <Check className="h-3.5 w-3.5" /> Acknowledged
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className={className}
      disabled={acknowledge.isPending}
      onClick={() => acknowledge.mutate(taskId)}
    >
      {acknowledge.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      Acknowledge
    </Button>
  );
}
