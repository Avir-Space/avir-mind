"use client";

import { ChevronLeft, FileText } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { dispatchStatus } from "@/lib/design/flightops";
import { useDispatchQueue } from "@/lib/queries/use-flightops";
import { useFlightOpsActions } from "@/lib/mutations/use-flightops-actions";

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function DispatchPage() {
  const { data: queue, isLoading } = useDispatchQueue();
  const { updateReleaseStatus } = useFlightOpsActions();
  const { toast } = useToast();

  const groups = useMemo(() => ({
    draft: (queue ?? []).filter((d) => d.status === "draft"),
    pending_captain: (queue ?? []).filter((d) => d.status === "pending_captain"),
    captain_accepted: (queue ?? []).filter((d) => d.status === "captain_accepted"),
  }), [queue]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/flight-ops" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Flight Ops</Link></div>
      <PageHeader eyebrow="Operations" title="Dispatch Queue" subtitle="Releases needing attention, pending acceptance, and recently signed." />
      <div className="flex-1 space-y-6 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
          ([["pending_captain", "Pending captain acceptance"], ["draft", "Drafts"], ["captain_accepted", "Recently accepted"]] as const).map(([key, title]) => (
            <section key={key}>
              <p className="eyebrow mb-2">{title} ({groups[key].length})</p>
              {groups[key].length === 0 ? <p className="text-sm text-hint">None.</p> : (
                <div className="border border-border">
                  {groups[key].map((d) => {
                    const st = dispatchStatus(d.status);
                    return (
                      <div key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                        <FileText className="h-3.5 w-3.5 text-label" />
                        <Link href={`/flight-ops/flights/${d.flight_id}`} className="font-mono text-[12px] text-primary hover:underline">{d.release_number}</Link>
                        <span className="font-mono text-[12px] text-foreground">{d.flight_number}</span>
                        <span className="font-mono text-[11px] text-hint">{d.origin_station} → {d.destination_station}</span>
                        <MonoText muted className="text-[11px]">{d.tail_number ?? "—"}</MonoText>
                        <span className="font-mono text-[11px] uppercase" style={{ color: st.hex }}>{st.label}</span>
                        <span className="ml-auto font-mono text-[11px] text-hint">{dt(d.scheduled_departure_utc)}</span>
                        {d.status === "pending_captain" && <Button size="sm" variant="outline" onClick={() => updateReleaseStatus.mutate({ releaseId: d.id, status: "captain_accepted" }, { onSuccess: () => toast({ title: "Accepted" }) })}>Accept</Button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
