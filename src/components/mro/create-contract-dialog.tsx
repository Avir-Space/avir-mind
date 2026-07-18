"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { CONTRACT_TYPE_LABEL } from "@/lib/design/mro";
import { toastMutationError } from "@/lib/mutations/mutation-error";
import { useMroActions } from "@/lib/mutations/use-mro-actions";

/** New service contract for a given customer account. */
export function CreateContractDialog({
  open,
  onOpenChange,
  customerAccountId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerAccountId: string;
}) {
  const { createContract } = useMroActions();
  const { toast } = useToast();

  const [number, setNumber] = useState("");
  const [contractName, setContractName] = useState("");
  const [type, setType] = useState("time_and_materials");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [annual, setAnnual] = useState("");
  const [autoRenew, setAutoRenew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const valid = number.trim() && contractName.trim() && from;

  async function submit() {
    if (!valid) return;
    setSubmitting(true);
    try {
      await createContract.mutateAsync({
        customer_account_id: customerAccountId,
        contract_number: number.trim(),
        contract_name: contractName.trim(),
        contract_type: type,
        effective_from: from,
        effective_to: to || null,
        annual_value_usd: annual ? Number(annual) : null,
        auto_renew: autoRenew,
        contract_status: "active",
      });
      toast({ title: "Contract created", description: contractName.trim() });
      onOpenChange(false);
      setNumber(""); setContractName(""); setFrom(""); setTo(""); setAnnual(""); setAutoRenew(false);
    } catch (e) {
      toastMutationError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New contract</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ct-num">Contract number</Label>
              <Input id="ct-num" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. MRO-NRTH-01" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct-name">Contract name</Label>
              <Input id="ct-name" value={contractName} onChange={(e) => setContractName(e.target.value)} placeholder="e.g. Line + base support" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Service type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CONTRACT_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ct-from">Effective from</Label>
              <Input id="ct-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct-to">Effective to</Label>
              <Input id="ct-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ct-annual">Annual value (USD)</Label>
              <Input id="ct-annual" type="number" value={annual} onChange={(e) => setAnnual(e.target.value)} placeholder="e.g. 250000" />
            </div>
            <label className="inline-flex items-center gap-2 pb-2 font-mono text-[12px] text-body">
              <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} /> Auto-renew
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !valid}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create contract
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
