"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { useSignalActions } from "@/lib/mutations/use-signal-actions";

/**
 * Fleet-wide "Refresh AI Signals" for the Command Center. Generates for the
 * aircraft with the stalest (or missing) signals first, sequentially, showing
 * live progress. Cost caps + cache are enforced server-side per aircraft.
 */
export function FleetSignalRefresh({ orgId }: { orgId: string | null | undefined }) {
  const supabase = useMemo(() => createClient(), []);
  const { generate } = useSignalActions();
  const { toast } = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function run() {
    if (!orgId) return;
    // Stalest first: aircraft with no active signal, then oldest generated.
    const { data: aircraft } = await supabase
      .from("aircraft")
      .select("id, signals(id, generated_at_utc, is_active)")
      .eq("org_id", orgId);

    const ranked = (aircraft ?? [])
      .map((a) => {
        const sigs = (a.signals as unknown as { generated_at_utc: string; is_active: boolean }[]) ?? [];
        const active = sigs.filter((s) => s.is_active);
        const latest = active.map((s) => s.generated_at_utc).sort().at(-1) ?? "";
        return { id: a.id as string, hasActive: active.length > 0, latest };
      })
      .sort((x, y) => Number(x.hasActive) - Number(y.hasActive) || x.latest.localeCompare(y.latest))
      .slice(0, 6);

    if (!ranked.length) return;
    setProgress({ done: 0, total: ranked.length });
    let generated = 0;
    for (let i = 0; i < ranked.length; i++) {
      const item = ranked[i];
      if (!item) continue;
      try {
        const r = await generate(item.id, { force: false, runType: "manual" });
        if (!r.cached) generated += r.signals_generated ?? 0;
      } catch {
        // keep going; per-aircraft failures are recorded server-side
      }
      setProgress({ done: i + 1, total: ranked.length });
    }
    setProgress(null);
    toast({ title: "Fleet signals refreshed", description: `${generated} new signals across ${ranked.length} aircraft.` });
  }

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={!!progress}>
      {progress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {progress ? `Generating… ${progress.done} of ${progress.total}` : "Refresh AI Signals"}
    </Button>
  );
}
