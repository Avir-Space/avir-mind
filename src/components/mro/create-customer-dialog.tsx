"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { CUSTOMER_TYPE_LABEL } from "@/lib/design/mro";
import { toastMutationError } from "@/lib/mutations/mutation-error";
import { useMroActions } from "@/lib/mutations/use-mro-actions";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "AED"];

/** Auto-derive a customer code from the name (editable). */
function deriveCode(name: string) {
  return name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase();
}

export function CreateCustomerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const { createCustomer } = useMroActions();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState("operator_charter");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const effectiveCode = code.trim() || deriveCode(name);

  async function submit() {
    if (!name.trim() || !effectiveCode) return;
    setSubmitting(true);
    try {
      const newId = (await createCustomer.mutateAsync({
        customer_name: name.trim(),
        customer_code: effectiveCode,
        customer_type: type,
        primary_contact_email: email.trim() || null,
        default_currency: currency,
        notes: notes.trim() || null,
      })) as unknown as string | null;
      toast({ title: "Customer created", description: name.trim() });
      onOpenChange(false);
      setName(""); setCode(""); setEmail(""); setNotes("");
      if (typeof newId === "string" && /^[0-9a-f-]{36}$/.test(newId)) router.push(`/customers/${newId}`);
    } catch (e) {
      toastMutationError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add customer</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cust-name">Name</Label>
              <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northstar Air" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-code">Code</Label>
              <Input id="cust-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={deriveCode(name) || "NRTH"} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Industry / type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CUSTOMER_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cust-email">Primary contact email</Label>
              <Input id="cust-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ops@customer.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-notes">Notes</Label>
            <Input id="cust-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !name.trim() || !effectiveCode}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
