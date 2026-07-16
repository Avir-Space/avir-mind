"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Download,
  Link2,
  Loader2,
  Paperclip,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";

import { TaskDetailHeader } from "@/components/tasks/task-detail-header";
import { TaskEventComposer } from "@/components/tasks/task-event-composer";
import { TaskEventStream } from "@/components/tasks/task-event-stream";
import { TaskSourceBadge } from "@/components/tasks/task-source-badge";
import { MonoText } from "@/components/avir/mono-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { STATUS_CONFIG } from "@/lib/design/tasks";
import { useTaskDetail } from "@/lib/queries/use-task-detail";
import { useTaskActions } from "@/lib/mutations/use-task-actions";
import { useTaskRealtime } from "@/lib/realtime/use-task-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { formatTimestamp } from "@/lib/utils";
import type { TaskDetail } from "@/types/tasks";

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-eyebrow uppercase text-label">{label}</p>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

function DepList({ title, deps }: { title: string; deps: { task_id: string; title: string; status: string }[] }) {
  return (
    <div>
      <p className="eyebrow mb-2">{title}</p>
      {deps.length === 0 ? (
        <p className="text-sm text-hint">None</p>
      ) : (
        <ul className="space-y-1.5">
          {deps.map((d) => (
            <li key={d.task_id}>
              <Link href={`/tasks/${d.task_id}`} className="flex items-center gap-2 text-sm text-body hover:text-primary">
                <Link2 className="h-3.5 w-3.5 text-label" />
                <span className="flex-1 truncate">{d.title}</span>
                <span className="font-mono text-eyebrow uppercase text-label">
                  {STATUS_CONFIG[d.status as keyof typeof STATUS_CONFIG]?.label ?? d.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WorkLogPanel({ detail }: { detail: TaskDetail }) {
  const { logWork } = useTaskActions();
  const [minutes, setMinutes] = useState("");
  const [desc, setDesc] = useState("");

  async function add() {
    const m = parseInt(minutes, 10);
    if (!m || m <= 0) return;
    await logWork.mutateAsync({ taskId: detail.task.task_id, minutes: m, description: desc });
    setMinutes("");
    setDesc("");
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="border border-border bg-card p-4">
        <p className="eyebrow mb-3">Log work</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="wl-min">Minutes</Label>
            <Input id="wl-min" type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-28" placeholder="90" />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="wl-desc">Description</Label>
            <Input id="wl-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What was done" />
          </div>
          <Button onClick={add} disabled={logWork.isPending || !minutes}>
            {logWork.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Log
          </Button>
        </div>
      </div>

      {detail.work_logs.length === 0 ? (
        <p className="text-sm text-hint">No work logged yet.</p>
      ) : (
        <div className="divide-y divide-border border border-border">
          {detail.work_logs.map((w) => (
            <div key={w.id} className="flex items-center gap-3 p-3">
              <MonoText className="text-sm">{(w.time_spent_minutes / 60).toFixed(1)}h</MonoText>
              <span className="flex-1 text-sm text-body">{w.description ?? "—"}</span>
              <MonoText muted className="text-[11px]">{w.work_date}</MonoText>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentsPanel({ detail }: { detail: TaskDetail }) {
  const { orgId, user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !orgId || !user) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const path = `${orgId}/${detail.task.task_id}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("task-attachments").upload(path, file);
      if (up.error) throw up.error;
      await supabase.from("task_attachments").insert({
        org_id: orgId,
        task_id: detail.task.task_id,
        uploaded_by_user_id: user.id,
        filename: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || "application/octet-stream",
        storage_path: path,
      });
      await supabase.rpc("create_task_event", {
        p_task_id: detail.task.task_id,
        p_event_type: "attachment_added",
        p_event_payload: { filename: file.name },
      });
      qc.invalidateQueries({ queryKey: ["task-detail"] });
      toast({ title: "Attachment uploaded", description: file.name });
    } catch (err) {
      toast({ title: "Upload failed", description: String((err as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function download(storagePath: string) {
    const supabase = createClient();
    const { data } = await supabase.storage.from("task-attachments").createSignedUrl(storagePath, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <input ref={fileRef} type="file" className="hidden" onChange={onFile} />
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload file
        </Button>
      </div>
      {detail.attachments.length === 0 ? (
        <p className="text-sm text-hint">No attachments.</p>
      ) : (
        <div className="divide-y divide-border border border-border">
          {detail.attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3">
              <Paperclip className="h-4 w-4 text-label" />
              <span className="flex-1 truncate text-sm text-body">{a.filename}</span>
              <MonoText muted className="text-[11px]">{bytes(a.file_size_bytes)}</MonoText>
              <button onClick={() => download(a.storage_path)} className="text-label hover:text-foreground" aria-label="Download">
                <Download className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const { orgId } = useAuth();
  useTaskRealtime(orgId);
  const { data: detail, isLoading, isError } = useTaskDetail(params.taskId);

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-4 h-10 w-96" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }
  if (isError || !detail) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="font-serif text-2xl text-foreground">Task not found</h1>
        <p className="mt-2 text-sm text-subtext">This task doesn&apos;t exist or isn&apos;t in your organization.</p>
        <Link href="/signals" className="mt-4 text-sm text-primary hover:underline">Back to Signals</Link>
      </div>
    );
  }

  const comments = detail.events.filter((e) => e.event_type === "comment");

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4">
        <Link href="/signals" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label transition-colors hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Signals
        </Link>
      </div>
      <TaskDetailHeader detail={detail} />

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-6">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="comments">Comments</TabsTrigger>
            <TabsTrigger value="work">Work Logs</TabsTrigger>
            <TabsTrigger value="attachments">Attachments</TabsTrigger>
            <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto avir-scroll p-6">
          <TabsContent value="overview">
            <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
              <div className="space-y-5">
                <div>
                  <p className="eyebrow mb-2">Source references</p>
                  <div className="space-y-1.5">
                    {detail.sources.length ? (
                      detail.sources.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <TaskSourceBadge system={s.source_system} />
                          <MonoText muted className="text-[12px]">{s.source_reference_id ?? "—"}</MonoText>
                          {s.source_url && (
                            <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                              open
                            </a>
                          )}
                        </div>
                      ))
                    ) : (
                      <span className="text-sm text-hint">None</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Estimated duration">
                    {detail.task.estimated_duration_hours ? `${detail.task.estimated_duration_hours}h` : "—"}
                  </Field>
                  <Field label="Started">
                    <MonoText muted>{formatTimestamp(detail.task.started_at_utc)}</MonoText>
                  </Field>
                  <Field label="Reporter">
                    {detail.task.reporter_user_id ? <MonoText muted>{detail.task.reporter_user_id.slice(0, 8)}</MonoText> : "—"}
                  </Field>
                  <Field label="Acknowledgements">{detail.acknowledgements.length}</Field>
                </div>
              </div>
              <div className="space-y-5">
                <DepList title="Blocks" deps={detail.dependencies.blocks} />
                <DepList title="Blocked by" deps={detail.dependencies.blocked_by} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="events">
            <div className="max-w-2xl">
              <TaskEventStream events={detail.events} />
            </div>
          </TabsContent>

          <TabsContent value="comments">
            <div className="max-w-2xl space-y-4">
              <TaskEventComposer taskId={detail.task.task_id} />
              <TaskEventStream events={comments} emptyLabel="No comments yet." />
            </div>
          </TabsContent>

          <TabsContent value="work">
            <WorkLogPanel detail={detail} />
          </TabsContent>

          <TabsContent value="attachments">
            <AttachmentsPanel detail={detail} />
          </TabsContent>

          <TabsContent value="dependencies">
            <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
              <DepList title="Blocks" deps={detail.dependencies.blocks} />
              <DepList title="Blocked by" deps={detail.dependencies.blocked_by} />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
