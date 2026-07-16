"use client";

import { FileJson, FileText, Loader2, Package } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useGenealogyActions } from "@/lib/mutations/use-genealogy-actions";
import { cn } from "@/lib/utils";
import type { GenealogyView } from "@/types/genealogy";

const FORMATS = [
  { value: "pdf", label: "PDF", icon: FileText, hint: "Human-readable certificate (print / save as PDF)" },
  { value: "json", label: "JSON", icon: FileJson, hint: "Machine-readable record for a buyer's technical review" },
  { value: "portable_bundle", label: "Portable Bundle", icon: Package, hint: "JSON + PDF + attachments, zipped — for sales & lease returns" },
] as const;

const PURPOSES = ["sale", "lease_return", "insurance", "regulatory", "other"];

export function ExportModal({ open, onOpenChange, view }: { open: boolean; onOpenChange: (v: boolean) => void; view: GenealogyView }) {
  const { exportBundle } = useGenealogyActions();
  const { toast } = useToast();
  const [format, setFormat] = useState<"pdf" | "json" | "portable_bundle">("pdf");
  const [purpose, setPurpose] = useState("sale");
  const [recipient, setRecipient] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [incPred, setIncPred] = useState(true);
  const [incCost, setIncCost] = useState(false);
  const [incOps, setIncOps] = useState(true);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const res = await exportBundle(view.serial.id, format, {
        purpose, recipient, coverNote, includePredictive: incPred, includeCost: incCost, includeOps: incOps,
      });
      if (res.blocked) {
        toast({ title: "Pop-up blocked", description: "Allow pop-ups to open the printable certificate.", variant: "destructive" });
      } else {
        toast({ title: "Genealogy exported", description: `Snapshot ${res.snapshot_hash.slice(0, 12)}… logged to the export trail.` });
        onOpenChange(false);
      }
    } catch (e) {
      toast({ title: "Export failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Export genealogy — {view.serial.serial_number}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Format</Label>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFormat(f.value)}
                  className={cn("flex flex-col items-center gap-1 border px-2 py-2.5 text-center transition-colors", format === f.value ? "border-primary bg-primary/5" : "border-border hover:border-border-strong")}
                >
                  <f.icon className={cn("h-4 w-4", format === f.value ? "text-primary" : "text-label")} />
                  <span className="text-xs font-medium text-foreground">{f.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-hint">{FORMATS.find((f) => f.value === format)?.hint}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Purpose</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PURPOSES.map((p) => <SelectItem key={p} value={p}>{p.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rcpt">Recipient</Label>
              <Input id="rcpt" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Buyer / insurer name" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cover">Cover note</Label>
            <Input id="cover" value={coverNote} onChange={(e) => setCoverNote(e.target.value)} placeholder="Optional" />
          </div>

          <div className="space-y-1.5">
            <Label className="block">Include</Label>
            {[
              { on: incPred, set: setIncPred, label: "Predictive signals history" },
              { on: incCost, set: setIncCost, label: "Cost data (sensitive)" },
              { on: incOps, set: setIncOps, label: "Operational context (base stations, etc.)" },
            ].map((o) => (
              <label key={o.label} className="flex cursor-pointer items-center gap-2 text-sm text-body">
                <input type="checkbox" checked={o.on} onChange={(e) => o.set(e.target.checked)} className="h-3.5 w-3.5 accent-[#1019EC]" />
                {o.label}
              </label>
            ))}
          </div>

          <div className="border border-border bg-surface/40 px-3 py-2 font-mono text-[11px] text-hint">
            Preview: {view.records.length} records · {view.ownership_history.length} ownership events · chain{" "}
            {view.stats?.chain_ok ? "✓ verified" : "✗ broken"}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={generate} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
