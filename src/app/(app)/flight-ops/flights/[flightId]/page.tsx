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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { crewRole } from "@/lib/design/crew";
import { DELAY_CATEGORY, dispatchStatus, flightCategory, flightEventLabel, flightStatus } from "@/lib/design/flightops";
import { useFlightDetail } from "@/lib/queries/use-flightops";
import { useFlightOpsActions } from "@/lib/mutations/use-flightops-actions";
import { useFlightRealtime } from "@/lib/realtime/use-flight-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { cn } from "@/lib/utils";
import type { StationWx } from "@/types/flightops";

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const EVENTS = ["boarding_started", "pushback", "takeoff", "landing", "taxi_in", "doors_open", "delay_recorded", "diversion_executed", "cancellation", "fuel_uplift"];

function WxCard({ wx, label }: { wx: StationWx | null; label: string }) {
  if (!wx) return null;
  const cat = flightCategory(wx.metar?.flight_category);
  return (
    <div className="border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-foreground">{label}: {wx.station_code}</span>
        {wx.metar?.flight_category && <span className="border px-1.5 py-0.5 font-mono text-[10px] uppercase" style={{ borderColor: cat.hex, color: cat.hex }}>{cat.label}</span>}
      </div>
      {wx.metar ? <p className="mt-1.5 font-mono text-[11px] text-subtext">{wx.metar.raw_text}</p> : <p className="mt-1.5 text-[12px] text-hint">No METAR.</p>}
      {wx.taf && <p className="mt-1 font-mono text-[10px] text-hint">{wx.taf.raw_text}</p>}
    </div>
  );
}

export default function FlightDetailPage() {
  const params = useParams<{ flightId: string }>();
  const { orgId } = useAuth();
  useFlightRealtime(orgId);
  const { data, isLoading } = useFlightDetail(params.flightId);
  const { recordEvent, attributeDelay, createRelease, updateReleaseStatus } = useFlightOpsActions();
  const { toast } = useToast();
  const [evOpen, setEvOpen] = useState(false);
  const [evType, setEvType] = useState("pushback");
  const [dlyOpen, setDlyOpen] = useState(false);
  const [dCode, setDCode] = useState("81");
  const [dCat, setDCat] = useState("atc");
  const [dMin, setDMin] = useState("15");
  const [dReason, setDReason] = useState("");

  if (isLoading || !data?.flight) {
    return <div className="p-6"><Skeleton className="h-10 w-64" /><Skeleton className="mt-4 h-64 w-full" /></div>;
  }
  const f = data.flight;
  const st = flightStatus(f.status);
  const rel = data.dispatch_release;
  const perf = data.performance;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pb-4 pt-4">
        <Link href="/flight-ops" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Flight Ops</Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="font-mono text-2xl text-foreground">{f.flight_number}</h1>
              <span className="font-mono text-sm text-subtext">{f.origin_station} → {f.destination_station}</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase" style={{ color: st.hex }}><span className="h-2 w-2 rounded-full" style={{ background: st.hex }} /> {st.label}</span>
              {f.delay_minutes > 0 && <span className="font-mono text-[12px] text-severity-high">+{f.delay_minutes}m</span>}
            </div>
            <p className="mt-1 font-mono text-[11px] text-hint">{f.flight_date} · {data.aircraft?.tail_number ?? "—"} {data.aircraft?.aircraft_type ?? ""} · {f.source_system.toUpperCase()}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEvOpen(true)}><Plus className="h-3.5 w-3.5" /> Record Event</Button>
            <Button size="sm" variant="outline" onClick={() => setDlyOpen(true)}>Attribute Delay</Button>
            {!rel && <Button size="sm" variant="outline" onClick={() => createRelease.mutate({ flightId: f.id }, { onSuccess: () => toast({ title: "Dispatch release created" }) })}>Create Release</Button>}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
          {[["Sched Dep", dt(f.scheduled_departure_utc)], ["Actual Out", dt(f.actual_out_utc)], ["Sched Arr", dt(f.scheduled_arrival_utc)], ["Actual In", dt(f.actual_in_utc)]].map(([l, v]) => (
            <div key={l}><p className="font-mono text-eyebrow uppercase text-label">{l}</p><p className="mt-0.5 font-mono text-[12px] text-foreground">{v}</p></div>
          ))}
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
          {["overview", "dispatch", "crew", "weather", "events", "delays", "performance", "briefings"].map((t) => <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>)}
        </TabsList></div>
        <div className="flex-1 overflow-y-auto avir-scroll p-6">
          <TabsContent value="overview">
            <div className="grid max-w-3xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {[["Route", f.planned_route ?? "—"], ["Flight level", f.planned_flight_level ? `FL${f.planned_flight_level}` : "—"], ["Block (plan)", f.planned_block_time_minutes ? `${f.planned_block_time_minutes}m` : "—"], ["Fuel (plan)", f.planned_fuel_kg ? `${f.planned_fuel_kg}kg` : "—"], ["Pax", String(f.passenger_count ?? "—")], ["Cargo", f.cargo_kg ? `${f.cargo_kg}kg` : "—"], ["Alternates", (f.alternate_stations ?? []).join(", ") || "—"], ["Delay codes", (f.delay_codes ?? []).join(", ") || "—"]].map(([l, v]) => (
                <div key={l}><p className="font-mono text-eyebrow uppercase text-label">{l}</p><p className="mt-0.5 text-sm text-foreground">{v}</p></div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="dispatch">
            {!rel ? <p className="text-sm text-hint">No dispatch release. Use <span className="text-body">Create Release</span>.</p> : (
              <div className="max-w-3xl space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <MonoText className="text-foreground">{rel.release_number}</MonoText>
                  <span className="font-mono text-[11px] uppercase" style={{ color: dispatchStatus(rel.status).hex }}>{dispatchStatus(rel.status).label}</span>
                  <span className="font-mono text-[11px] text-hint">released {dt(rel.released_at_utc)}</span>
                  {rel.status === "pending_captain" && <Button size="sm" onClick={() => updateReleaseStatus.mutate({ releaseId: rel.id, status: "captain_accepted" }, { onSuccess: () => toast({ title: "Release accepted by captain" }) })}>Captain Accept</Button>}
                  {rel.captain_signature_utc && <span className="font-mono text-[11px] text-severity-low">signed {dt(rel.captain_signature_utc)}</span>}
                </div>
                {rel.fuel_plan && <Section title="Fuel plan" obj={rel.fuel_plan} suffix="kg" />}
                {rel.weight_and_balance && <Section title="Weight & balance" obj={rel.weight_and_balance} />}
                {rel.performance_data && <Section title="Performance" obj={rel.performance_data} />}
              </div>
            )}
          </TabsContent>

          <TabsContent value="crew">
            {data.crew.length === 0 ? <p className="text-sm text-hint">No crew assigned.</p> : (
              <div className="max-w-2xl space-y-2">
                {data.crew.map((c) => (
                  <Link key={c.assignment_id} href={`/crew/${c.crew_member_id}`} className="flex items-center gap-3 border border-border bg-card px-3 py-2 hover:border-border-strong">
                    <span className="font-mono text-[10px] uppercase text-primary">{c.role_on_flight}</span>
                    <span className="text-sm text-foreground">{c.first_name} {c.last_name}</span>
                    <span className="font-mono text-[10px] uppercase text-hint">{crewRole(c.crew_role).label}</span>
                    <span className="ml-auto font-mono text-[10px] uppercase text-subtext">{c.assignment_status}</span>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="weather">
            <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
              <WxCard wx={data.weather.origin} label="Origin" />
              <WxCard wx={data.weather.destination} label="Destination" />
              {data.weather.alternates.map((a, i) => <WxCard key={i} wx={a} label="Alternate" />)}
            </div>
            {data.weather.enroute_sigmets.length > 0 && (
              <div className="mt-4 max-w-3xl">
                <p className="eyebrow mb-2">Enroute SIGMET/AIRMET</p>
                {data.weather.enroute_sigmets.map((s, i) => <p key={i} className="border-l-2 border-severity-high pl-3 font-mono text-[12px] text-body">{s.raw_text}</p>)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="events">
            <div className="max-w-3xl border border-border">
              {data.events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
                  <span className="w-36 font-mono text-[12px] font-medium text-foreground">{flightEventLabel(e.event_type)}</span>
                  <span className="font-mono text-[11px] text-hint">{dt(e.event_time_utc)}</span>
                  <span className="ml-auto font-mono text-[10px] uppercase text-subtext">{e.source_system}</span>
                </div>
              ))}
              {data.events.length === 0 && <p className="px-3 py-4 text-sm text-hint">No events yet.</p>}
            </div>
          </TabsContent>

          <TabsContent value="delays">
            <div className="max-w-3xl">
              {data.delays.length === 0 ? <p className="text-sm text-hint">No delay attribution.</p> : (
                <div className="border border-border">
                  {data.delays.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                      <span className="font-mono text-[13px] font-medium text-foreground">Code {d.delay_code}</span>
                      <span className="font-mono text-[11px] uppercase text-label">{DELAY_CATEGORY[d.delay_code_category] ?? d.delay_code_category}</span>
                      <span className="text-[12px] text-subtext">{d.delay_reason}</span>
                      <span className="ml-auto font-mono text-[12px] text-severity-high">{d.delay_minutes}m</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 px-3 py-2"><span className="font-mono text-eyebrow uppercase text-label">Total</span><span className="ml-auto font-mono text-[13px] text-severity-high">{data.delays.reduce((s, d) => s + d.delay_minutes, 0)}m</span></div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="performance">
            <div className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {[["On time", perf.on_time == null ? "—" : perf.on_time ? "Yes" : "No"], ["Dep delay", perf.departure_delay_min != null ? `${perf.departure_delay_min}m` : "—"], ["Arr delay", perf.arrival_delay_min != null ? `${perf.arrival_delay_min}m` : "—"], ["Block variance", perf.block_time_variance_min != null ? `${perf.block_time_variance_min}m` : "—"], ["Fuel variance", perf.fuel_variance_kg != null ? `${perf.fuel_variance_kg}kg` : "—"], ["Attributed delay", perf.attributed_delay_min != null ? `${perf.attributed_delay_min}m` : "—"]].map(([l, v]) => (
                <div key={l}><p className="font-mono text-eyebrow uppercase text-label">{l}</p><p className={cn("mt-0.5 text-sm", (l === "On time" && v === "No") && "text-severity-high")}>{v}</p></div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="briefings">
            {data.briefings.length === 0 ? <p className="text-sm text-hint">No briefings generated.</p> : (
              <div className="max-w-2xl space-y-2">
                {data.briefings.map((b) => (
                  <div key={b.id} className="border border-border bg-card p-3">
                    <p className="font-mono text-[13px] font-medium text-foreground">{b.briefing_type.replace(/_/g, " ")}</p>
                    <p className="mt-1 font-mono text-[11px] text-hint">Generated {dt(b.generated_at_utc)}</p>
                    {b.content_json && <pre className="mt-2 max-h-40 overflow-auto avir-scroll border border-border bg-surface/40 p-2 font-mono text-[10px] text-body">{JSON.stringify(b.content_json, null, 2)}</pre>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      <Dialog open={evOpen} onOpenChange={setEvOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record flight event</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label>Event type</Label><Select value={evType} onValueChange={setEvType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENTS.map((e) => <SelectItem key={e} value={e}>{flightEventLabel(e)}</SelectItem>)}</SelectContent></Select></div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEvOpen(false)}>Cancel</Button>
            <Button onClick={() => recordEvent.mutate({ flightId: f.id, eventType: evType }, { onSuccess: () => { toast({ title: "Event recorded", description: "Flight status updated." }); setEvOpen(false); } })} disabled={recordEvent.isPending}>{recordEvent.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlyOpen} onOpenChange={setDlyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Attribute delay</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="dc">IATA code</Label><Input id="dc" value={dCode} onChange={(e) => setDCode(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Category</Label><Select value={dCat} onValueChange={setDCat}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DELAY_CATEGORY).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="dm">Minutes</Label><Input id="dm" type="number" value={dMin} onChange={(e) => setDMin(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="dr">Reason</Label><Input id="dr" value={dReason} onChange={(e) => setDReason(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlyOpen(false)}>Cancel</Button>
            <Button onClick={() => attributeDelay.mutate({ flightId: f.id, code: dCode, category: dCat, minutes: Number(dMin), reason: dReason }, { onSuccess: () => { toast({ title: "Delay attributed" }); setDlyOpen(false); } })} disabled={attributeDelay.isPending}>{attributeDelay.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Attribute</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, obj, suffix }: { title: string; obj: Record<string, number>; suffix?: string }) {
  return (
    <section>
      <p className="eyebrow mb-2">{title}</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
        {Object.entries(obj).map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between border-b border-border/50 pb-1"><span className="font-mono text-[11px] text-label">{k}</span><span className="font-mono text-[12px] text-foreground">{v}{suffix ?? ""}</span></div>
        ))}
      </div>
    </section>
  );
}
