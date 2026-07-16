"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Dismiss requires a reason — it's calibration data, not just a hide. */
export function DismissSignalDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: string) => void;
  pending?: boolean;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dismiss signal</DialogTitle>
          <DialogDescription>
            Tell us why — this feeds the calibration record that measures signal accuracy.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="dismiss-reason">Reason</Label>
          <Input
            id="dismiss-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Already handled during last check"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (reason.trim()) onConfirm(reason.trim());
            }}
            disabled={pending || !reason.trim()}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Dismiss signal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
