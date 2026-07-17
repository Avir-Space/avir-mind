"use client";

import { ChevronLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { PURPOSE_LABEL } from "@/lib/design/backtest";
import { useBacktestActions } from "@/lib/mutations/use-backtest-actions";

export default function NewBacktestPage() {
  const router = useRouter();
  const { createProject } = useBacktestActions();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [purpose, setPurpose] = useState("sales_demo");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");

  async function submit() {
    try {
      const res = await createProject.mutateAsync({
        project_name: name, customer_organization_name: customer || null, purpose,
        data_period_start: start || null, data_period_end: end || null, notes: notes || null,
      });
      toast({ title: "Project created" });
      router.push(`/backtest/${res.id}`);
    } catch (e) { toast({ title: "Could not create project", description: String((e as Error).message).slice(0, 90) }); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/backtest" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Backtest</Link></div>
      <PageHeader eyebrow="Sales" title="New Backtest Project" subtitle="Set up a replay of a prospect's historical operations." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        <div className="max-w-xl space-y-4">
          <div><p className="eyebrow mb-1">Project name</p><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northstar Air — 90-Day Evaluation" /></div>
          <div><p className="eyebrow mb-1">Customer organization</p><Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Prospect name" /></div>
          <div><p className="eyebrow mb-1">Purpose</p>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PURPOSE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="eyebrow mb-1">Data period start</p><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><p className="eyebrow mb-1">Data period end</p><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div><p className="eyebrow mb-1">Notes</p><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
          <div className="flex gap-2 pt-2">
            <Button onClick={submit} disabled={!name || createProject.isPending}>{createProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create project</Button>
            <Button variant="outline" asChild><Link href="/backtest">Cancel</Link></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
