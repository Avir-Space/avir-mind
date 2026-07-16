"use client";

import { Loader2, Upload } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { TRANSFER_TYPES } from "@/lib/design/genealogy";
import { useGenealogyActions } from "@/lib/mutations/use-genealogy-actions";
import { createClient } from "@/lib/supabase/client";
import type { GenealogyView } from "@/types/genealogy";

export function TransferModal({ open, onOpenChange, view }: { open: boolean; onOpenChange: (v: boolean) => void; view: GenealogyView }) {
  const { transfer } = useGenealogyActions();
  const { toast } = useToast();
  const [type, setType] = useState("sale");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [docs, setDocs] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function execute() {
    if (!confirmed) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: toOrg, error: orgErr } = await supabase.rpc("get_or_create_demo_counterparty");
      if (orgErr) throw orgErr;
      await transfer.mutateAsync({
        serialGenealogyId: view.serial.id,
        toOrgId: toOrg as unknown as string,
        transferType: type,
        transferDate: date,
        reference,
        docs: docs.map((d) => ({ filename: d })),
      });
      toast({ title: "Ownership transferred", description: "Recorded to the ledger. You now hold the historical view." });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Transfer failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Transfer ownership — {view.serial.serial_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="border border-border bg-surface/40 px-3 py-2 text-[12px] text-subtext">
            Recipient: <span className="font-mono text-foreground">AVIR Lease Pool (Demo)</span> — external transfer. The recipient
            will need to manually onboard this genealogy.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Transfer type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRANSFER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tdate">Transfer date</Label>
              <Input id="tdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tref">Reference</Label>
            <Input id="tref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Contract or invoice number" />
          </div>
          <div className="space-y-1.5">
            <Label>Documentation</Label>
            <label className="flex cursor-pointer items-center gap-2 border border-dashed border-border px-3 py-2 text-[12px] text-hint hover:border-border-strong">
              <Upload className="h-3.5 w-3.5" />
              {docs.length ? `${docs.length} file(s) attached` : "Attach contracts / emails (filenames recorded)"}
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => setDocs(Array.from(e.target.files ?? []).map((f) => f.name))}
              />
            </label>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[13px] text-body">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[#1019EC]" />
            I confirm this transfer represents a real ownership change and the recipient has been notified. This action is irreversible.
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={execute} disabled={!confirmed || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Execute transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
