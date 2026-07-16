"use client";

import { Loader2, Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useTaskActions } from "@/lib/mutations/use-task-actions";

/** Add a comment to a task (creates a comment task_event). */
export function TaskEventComposer({ taskId }: { taskId: string }) {
  const { addComment } = useTaskActions();
  const [body, setBody] = useState("");

  async function submit() {
    const text = body.trim();
    if (!text) return;
    await addComment.mutateAsync({ taskId, body: text });
    setBody("");
  }

  return (
    <div className="border border-border bg-card">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Add a comment…"
        className="w-full resize-none bg-transparent p-3 text-sm text-foreground placeholder:text-hint focus:outline-none"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
      />
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="font-mono text-eyebrow text-hint">⌘↵ to send</span>
        <Button size="sm" onClick={submit} disabled={addComment.isPending || !body.trim()}>
          {addComment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Comment
        </Button>
      </div>
    </div>
  );
}
