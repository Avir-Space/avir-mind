"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useSignalActions } from "@/lib/mutations/use-signal-actions";

/** Aircraft-scoped "Refresh AI Signals". Respects the 6-hour cache unless forced. */
export function SignalRefreshButton({
  aircraftId,
  force = true,
  className,
}: {
  aircraftId: string;
  force?: boolean;
  className?: string;
}) {
  const { generate } = useSignalActions();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await generate(aircraftId, { force, runType: "manual" });
      if (r.cached) {
        toast({ title: "Signals up to date", description: "Cached result — no new generation needed." });
      } else if (r.error) {
        toast({ title: "Generation issue", description: r.error, variant: "destructive" });
      } else {
        toast({
          title: "Signals refreshed",
          description: `${r.signals_generated ?? 0} signal${r.signals_generated === 1 ? "" : "s"} generated.`,
        });
      }
    } catch (e) {
      toast({ title: "Couldn't refresh", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy} className={className}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      Refresh AI Signals
    </Button>
  );
}
