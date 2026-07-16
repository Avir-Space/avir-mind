"use client";

import { ChevronLeft, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { assetStatus, assetType } from "@/lib/design/inventory";
import { useAssetDetail } from "@/lib/queries/use-inventory";
import { useInventoryActions } from "@/lib/mutations/use-inventory-actions";

const EVENT_TYPES = ["serviced", "calibrated", "moved", "damaged", "repaired", "incident", "deployed", "retired"];
const money = (n: number | null | undefined) => (n == null ? "—" : "$" + Math.round(Number(n)).toLocaleString());

export default function AssetDetailPage() {
  const params = useParams<{ assetId: string }>();
  const { data, isLoading } = useAssetDetail(params.assetId);
  const { recordAssetEvent } = useInventoryActions();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [evType, setEvType] = useState("serviced");
  const [evDate, setEvDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [performedBy, setPerformedBy] = useState("");
  const [cost, setCost] = useState("");

  if (isLoading || !data?.asset) {
    return <div className="p-6"><Skeleton className="h-10 w-64" /><Skeleton className="mt-4 h-64 w-full" /></div>;
  }
  const a = data.asset as Record<string, string | number | boolean | null>;
  const at = assetType(a.asset_type as string);
  const stt = assetStatus(a.current_status as string);

  async function submit() {
    try {
      await recordAssetEvent.mutateAsync({ assetId: params.assetId, eventType: evType, eventDate: evDate, attrs: { performed_by: performedBy || undefined, cost_usd: cost ? Number(cost) : undefined } });
      toast({ title: "Event recorded", description: "Asset status updated where applicable." });
      setOpen(false); setPerformedBy(""); setCost("");
    } catch (e) {
      toast({ title: "Failed", description: String((e as Error).message), variant: "destructive" });
    }
  }
  function quick(type: string) {
    recordAssetEvent.mutate({ assetId: params.assetId, eventType: type, eventDate: new Date().toISOString().slice(0, 10) });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pb-4 pt-4">
        <Link href="/assets" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Assets</Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="font-mono text-2xl text-foreground">{String(a.asset_tag)}</h1>
              <span className="inline-flex items-center gap-1.5 text-subtext"><at.icon className="h-4 w-4 text-label" /> {String(a.asset_name)}</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase" style={{ color: stt.hex }}><span className="h-2 w-2 rounded-full" style={{ background: stt.hex }} /> {stt.label}</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-hint">{String(a.manufacturer ?? "—")} {String(a.model ?? "")} · SN {String(a.serial_number ?? "—")} · {data.location?.location_code ?? "—"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Record Event</Button>
            <Button size="sm" variant="outline" onClick={() => quick("serviced")}>Service</Button>
            {a.current_status !== "retired" && <Button size="sm" variant="outline" onClick={() => quick("retired")}>Retire</Button>}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto avir-scroll p-6">
        <section className="grid max-w-3xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {[
            ["Type", at.label], ["Station", String(a.assigned_to_station ?? "—")],
            ["Purchased", String(a.purchased_date ?? "—")], ["Purchase cost", money(a.purchase_cost_usd as number)],
            ["Calibration required", a.calibration_required ? "Yes" : "No"], ["Calibration due", String(a.calibration_due_date ?? "—")],
            ["Next service due", String(a.next_service_due_date ?? "—")],
          ].map(([l, v]) => (<div key={l}><p className="font-mono text-eyebrow uppercase text-label">{l}</p><p className="mt-0.5 text-sm text-foreground">{v}</p></div>))}
        </section>

        <section>
          <p className="eyebrow mb-2">Event history</p>
          <div className="max-w-3xl border border-border">
            {(data.events ?? []).map((e) => {
              const ev = e as Record<string, string | number | null>;
              return (
                <div key={String(ev.id)} className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
                  <span className="w-24 font-mono text-[11px] text-hint">{String(ev.event_date)}</span>
                  <span className="w-28 font-mono text-[12px] font-medium text-foreground">{String(ev.event_type)}</span>
                  <span className="text-[12px] text-subtext">{String(ev.performed_by ?? "")}</span>
                  <span className="ml-auto font-mono text-[11px] text-hint">{ev.cost_usd != null ? money(ev.cost_usd as number) : ""}</span>
                </div>
              );
            })}
            {(!data.events || data.events.length === 0) && <p className="px-3 py-3 text-sm text-hint">No events recorded.</p>}
          </div>
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record asset event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Event type</Label>
              <Select value={evType} onValueChange={setEvType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="d">Date</Label><Input id="d" type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="c">Cost (USD)</Label><Input id="c" type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="pb">Performed by</Label><Input id="pb" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={recordAssetEvent.isPending}>{recordAssetEvent.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
