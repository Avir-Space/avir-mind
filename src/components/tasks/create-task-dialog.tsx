"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { CATEGORY_CONFIG, categoryMeta } from "@/lib/design/tasks";
import { useTaskCatalog } from "@/lib/queries/use-task-catalog";
import { useTaskActions } from "@/lib/mutations/use-task-actions";
import { toastMutationError } from "@/lib/mutations/mutation-error";
import { useAuth } from "@/lib/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";

/**
 * Create a task. When `linkedTaskId` is provided, the new task is linked to it
 * via a task_dependencies edge (the "Create follow-up" flow from SignalCard).
 */
export function CreateTaskDialog({
  open,
  onOpenChange,
  aircraftId,
  stationCode,
  linkedTaskId,
  defaultParentType,
  defaultTitle,
  defaultWhy,
  defaultRisk,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  aircraftId: string;
  stationCode?: string | null;
  linkedTaskId?: string;
  defaultParentType?: string;
  defaultTitle?: string;
  defaultWhy?: string;
  defaultRisk?: string;
  onCreated?: (taskId: string) => void;
}) {
  const { orgId } = useAuth();
  const { createTask } = useTaskActions();
  const { data: catalog } = useTaskCatalog();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [parentType, setParentType] = useState(defaultParentType ?? "powerplant");
  const [subType, setSubType] = useState("");
  const [risk, setRisk] = useState("medium");
  const [submitting, setSubmitting] = useState(false);

  // Seed fields from defaults each time the dialog opens (e.g. from a signal).
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle ?? "");
      setWhy(defaultWhy ?? "");
      setParentType(defaultParentType ?? "powerplant");
      setSubType("");
      setRisk(defaultRisk ?? "medium");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const subs = catalog?.[parentType] ?? [];

  async function submit() {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const chosenSub = subType || subs[0]?.sub_type || "";
      const newId = (await createTask.mutateAsync({
        aircraftId,
        title: title.trim(),
        whySummary: why.trim() || undefined,
        parentType,
        subType: chosenSub,
        riskBand: risk,
        stationCode: stationCode ?? null,
      })) as unknown as string;

      if (linkedTaskId && orgId && newId) {
        const supabase = createClient();
        await supabase.from("task_dependencies").insert({
          org_id: orgId,
          from_task_id: linkedTaskId,
          to_task_id: newId,
          dependency_type: "blocks",
        });
      }
      if (onCreated && newId) onCreated(newId);
      toast({ title: "Task created", description: title.trim() });
      onOpenChange(false);
      setTitle("");
      setWhy("");
    } catch (e) {
      toastMutationError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{linkedTaskId ? "Create follow-up task" : "Create task"}</DialogTitle>
          <DialogDescription>
            {linkedTaskId
              ? "This task will be linked to the signal as a dependency."
              : "Add a task for this aircraft."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Title</Label>
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Borescope engine #2" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-why">Why (one-sentence context)</Label>
            <Input id="t-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="The reason this needs attention" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={parentType} onValueChange={(v) => { setParentType(v); setSubType(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(CATEGORY_CONFIG).map((k) => (
                    <SelectItem key={k} value={k}>{categoryMeta(k).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={subType || subs[0]?.sub_type || ""} onValueChange={setSubType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {subs.map((s) => (
                    <SelectItem key={s.sub_type} value={s.sub_type}>{s.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Risk band</Label>
            <Select value={risk} onValueChange={setRisk}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !title.trim()}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
