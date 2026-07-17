"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { melCategory, melStatus } from "@/lib/design/compliance";
import { useComplianceActions } from "@/lib/mutations/use-compliance-actions";
import { useFleetMel } from "@/lib/queries/use-compliance";
import type { MelItem } from "@/types/compliance";

const d = (x: string | null) => (x ? new Date(x).toLocaleDateString() : "—");

function urgencyHex(days: number): string {
  if (days <= 1) return "#DC2626";
  if (days <= 5) return "#EA580C";
  if (days <= 14) return "#CA8A04";
  return "#16A34A";
}

export default function MelPage() {
  const { data: items, isLoading } = useFleetMel();
  const { rectifyMel, extendMel } = useComplianceActions();
  const { toast } = useToast();
  const [detail, setDetail] = useState<MelItem | null>(null);
  const [extend, setExtend] = useState<MelItem | null>(null);
  const [authority, setAuthority] = useState("");
  const [newDue, setNewDue] = useState("");

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/compliance" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Compliance</Link></div>
      <PageHeader eyebrow="Airworthiness" title="MEL Management" subtitle="Deferred items across the fleet, sorted by repair-by urgency." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div> : (
          <div className="border border-border">
            {(items ?? []).map((m) => {
              const cat = melCategory(m.category); const st = melStatus(m.status);
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 last:border-b-0" style={{ borderLeft: `3px solid ${urgencyHex(m.days_remaining)}` }}>
                  <MonoText className="text-[12px] text-foreground">{m.mel_item_number}</MonoText>
                  <span className="border px-1 font-mono text-[10px]" style={{ borderColor: cat.hex, color: cat.hex }}>CAT {cat.label}</span>
                  <Link href={`/aircraft/${m.aircraft_id}`} className="font-mono text-[12px] text-primary hover:underline">{m.tail_number}</Link>
                  <span className="max-w-sm truncate text-[12px] text-subtext">{m.system_name} — {m.item_description}</span>
                  <span className="ml-auto font-mono text-[11px]" style={{ color: urgencyHex(m.days_remaining) }}>{m.days_remaining >= 0 ? `${m.days_remaining}d left` : `${-m.days_remaining}d overdue`}</span>
                  <span className="font-mono text-[11px] text-hint">by {d(m.repair_by_date)}</span>
                  <span className="font-mono text-[11px] uppercase" style={{ color: st.hex }}>{st.label}</span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(m)}>View</Button>
                    <Button size="sm" variant="outline" onClick={() => { setExtend(m); setAuthority(""); setNewDue(""); }}>Extend</Button>
                    <Button size="sm" onClick={() => rectifyMel.mutate({ itemId: m.id }, { onSuccess: () => toast({ title: "Rectified", description: "Linked task closed." }) })}>Rectify</Button>
                  </div>
                </div>
              );
            })}
            {(items?.length ?? 0) === 0 && <p className="px-3 py-6 text-center text-sm text-hint">No active MEL items.</p>}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{detail?.mel_item_number} — {detail?.system_name}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <p className="text-subtext">{detail.item_description}</p>
              <div className="grid grid-cols-2 gap-3 font-mono text-[12px]">
                <div><span className="text-hint">Category</span><p className="text-foreground">{melCategory(detail.category).label} · {melCategory(detail.category).days}</p></div>
                <div><span className="text-hint">ATA</span><p className="text-foreground">{detail.ata_chapter ?? "—"}</p></div>
                <div><span className="text-hint">Deferred</span><p className="text-foreground">{new Date(detail.deferred_at_utc).toLocaleDateString()}</p></div>
                <div><span className="text-hint">Repair by</span><p className="text-foreground">{d(detail.repair_by_date)}</p></div>
              </div>
              {detail.operational_procedure && <div><p className="eyebrow mb-1">Operational procedure (O)</p><p className="text-[12px] text-subtext">{detail.operational_procedure}</p></div>}
              {detail.maintenance_procedure && <div><p className="eyebrow mb-1">Maintenance procedure (M)</p><p className="text-[12px] text-subtext">{detail.maintenance_procedure}</p></div>}
              {detail.reason && <div><p className="eyebrow mb-1">Deferral reason</p><p className="text-[12px] text-subtext">{detail.reason}</p></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Extend dialog */}
      <Dialog open={Boolean(extend)} onOpenChange={(o) => !o && setExtend(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Extend deferral — {extend?.mel_item_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><p className="eyebrow mb-1">Extension authority</p><Input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="e.g. CAMO / Regulator approval ref" /></div>
            <div><p className="eyebrow mb-1">New due date</p><Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtend(null)}>Cancel</Button>
            <Button disabled={!authority || !newDue} onClick={() => {
              if (!extend) return;
              extendMel.mutate({ itemId: extend.id, authority, newDueDate: newDue }, { onSuccess: () => { toast({ title: "Deferral extended" }); setExtend(null); } });
            }}>Extend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
