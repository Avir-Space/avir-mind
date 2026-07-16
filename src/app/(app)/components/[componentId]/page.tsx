"use client";

import { ChevronLeft, Loader2, MapPin, PackageMinus, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { AccuracyChart } from "@/components/components/accuracy-chart";
import { HealthBar } from "@/components/components/health-bar";
import { HealthTrendChart } from "@/components/components/health-trend-chart";
import { PredictionCard } from "@/components/components/prediction-card";
import { MonoText } from "@/components/avir/mono-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { COMPONENT_STATUS_CONFIG, componentType, FINDING_SEVERITY_HEX, healthBand } from "@/lib/design/components";
import { useComponentDetail } from "@/lib/queries/use-component-detail";
import { useComponentActions } from "@/lib/mutations/use-component-actions";
import { useSignalRealtime } from "@/lib/realtime/use-signal-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import type { PredictiveSignal } from "@/types/components";

const EVENT_TYPES = [
  "cycle_recorded", "hours_recorded", "finding_recorded", "borescope", "overhaul", "repair",
  "functional_test", "oil_analysis", "vibration_survey", "incident_recorded", "installed", "removed",
];

function LifeBar({ label, used, limit, unit }: { label: string; used: number | null; limit: number | null; unit: string }) {
  if (limit == null) return null;
  const pct = Math.min(100, Math.round(((used ?? 0) / limit) * 100));
  const hex = pct >= 90 ? "#DC2626" : pct >= 75 ? "#EA580C" : "#16A34A";
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-eyebrow uppercase text-label">{label}</span>
        <span className="font-mono text-[11px] text-subtext">
          {(used ?? 0).toLocaleString()} / {limit.toLocaleString()} {unit} · {pct}%
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-border">
        <div className="h-full" style={{ width: `${pct}%`, background: hex }} />
      </div>
    </div>
  );
}

export default function ComponentDetailPage() {
  const params = useParams<{ componentId: string }>();
  const { orgId } = useAuth();
  useSignalRealtime(orgId);
  const { data, isLoading } = useComponentDetail(params.componentId);
  const { recordEvent, moveOffWing, changePosition, generatePredictions } = useComponentActions();
  const { toast } = useToast();

  const [refreshing, setRefreshing] = useState(false);
  const [evOpen, setEvOpen] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [evType, setEvType] = useState("cycle_recorded");
  const [evDate, setEvDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [evFinding, setEvFinding] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evCost, setEvCost] = useState("");
  const [newPos, setNewPos] = useState("");

  if (isLoading || !data?.component) {
    if (!isLoading && !data?.component) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <h1 className="font-serif text-2xl text-foreground">Component not found</h1>
          <Link href="/components" className="mt-4 text-sm text-primary hover:underline">Back to Components</Link>
        </div>
      );
    }
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-4 h-10 w-96" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }

  const c = data.component;
  const meta = componentType(c.component_type);
  const band = healthBand(c.health_score);
  const status = COMPONENT_STATUS_CONFIG[c.status] ?? COMPONENT_STATUS_CONFIG.on_wing!;
  const activePreds = data.predictions.filter((p) => p.is_active);
  const byConf: Record<string, PredictiveSignal[]> = { high: [], medium: [], low: [] };
  for (const p of activePreds) (byConf[p.confidence] ??= []).push(p);
  const genealogy = data.events.filter((e) => e.event_type === "installed" || e.event_type === "removed");

  async function refresh() {
    setRefreshing(true);
    try {
      const r = await generatePredictions({ componentId: c.id }, { force: true, runType: "manual" });
      toast({ title: r.cached ? "Predictions up to date" : `Generated ${r.predictions_generated ?? 0} prediction(s)` });
    } catch (e) {
      toast({ title: "Prediction failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }
  async function submitEvent() {
    try {
      await recordEvent.mutateAsync({
        componentId: c.id, eventType: evType, eventDate: evDate,
        attrs: {
          finding_severity: evFinding || undefined, finding_description: evDesc || undefined,
          cost_usd: evCost ? Number(evCost) : undefined, source_system: "manual",
          cycles_at_event: c.current_cycles, flight_hours_at_event: c.current_flight_hours,
        },
      });
      toast({ title: "Event recorded", description: "Health recomputed; any matching prediction was calibrated." });
      setEvOpen(false); setEvFinding(""); setEvDesc(""); setEvCost("");
    } catch (e) {
      toast({ title: "Failed", description: String((e as Error).message), variant: "destructive" });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pb-4 pt-4">
        <Link href="/components" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label transition-colors hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Components
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="font-serif text-3xl leading-none text-foreground">{c.serial_number}</h1>
              <span className="inline-flex items-center gap-1.5 text-subtext">
                <meta.icon className="h-4 w-4" strokeWidth={1.75} /> {meta.label}
              </span>
              <MonoText muted className="text-sm">{c.part_number}</MonoText>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {c.aircraft_id && data.aircraft ? (
                <Link href={`/aircraft/${c.aircraft_id}`} className="font-mono text-[13px] text-primary hover:underline">
                  {data.aircraft.tail_number}{c.position_code ? ` · ${c.position_code}` : ""}
                </Link>
              ) : (
                <span className={`font-mono text-eyebrow uppercase ${status.className}`}>{status.label}</span>
              )}
              <div className="flex items-center gap-2">
                <HealthBar score={c.health_score} />
                <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: band.hex }}>{band.label}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh Predictions
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEvOpen(true)}><Plus className="h-3.5 w-3.5" /> Record Event</Button>
            {c.status === "on_wing" && (
              <Button size="sm" variant="outline" onClick={() => moveOffWing.mutate({ componentId: c.id, eventDate: new Date().toISOString().slice(0, 10) })}>
                <PackageMinus className="h-3.5 w-3.5" /> Move Off-wing
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { setNewPos(c.position_code ?? ""); setPosOpen(true); }}>
              <MapPin className="h-3.5 w-3.5" /> Change Position
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-6">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="predictions">Predictions{activePreds.length ? ` (${activePreds.length})` : ""}</TabsTrigger>
            <TabsTrigger value="health">Health Trend</TabsTrigger>
            <TabsTrigger value="genealogy">Genealogy</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto avir-scroll p-6">
          {/* Overview */}
          <TabsContent value="overview">
            <div className="grid max-w-3xl gap-6">
              <section className="space-y-3">
                <p className="eyebrow">Life &amp; limits</p>
                <LifeBar label="Cycles (life limit)" used={c.current_cycles} limit={c.limit_cycles} unit="cyc" />
                <LifeBar label="Flight hours (life limit)" used={c.current_flight_hours} limit={c.limit_flight_hours} unit="hrs" />
                <LifeBar label="Cycles since overhaul" used={c.cycles_since_overhaul} limit={c.overhaul_interval_cycles} unit="cyc" />
                {c.limit_cycles == null && c.overhaul_interval_cycles == null && (
                  <p className="text-sm text-hint">No hard cycle limits on this component type (condition-monitored).</p>
                )}
              </section>
              <section className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
                {[
                  ["Current cycles", (c.current_cycles ?? 0).toLocaleString()],
                  ["Current hours", Math.round(c.current_flight_hours ?? 0).toLocaleString()],
                  ["Next event", c.next_scheduled_event_type ?? "—"],
                  ["Next event due", c.next_scheduled_event_due_date ?? "—"],
                  ["Installed", c.installed_at_utc ? new Date(c.installed_at_utc).toLocaleDateString() : "—"],
                  ["Removed", c.removed_at_utc ? new Date(c.removed_at_utc).toLocaleDateString() : "—"],
                  ["Manufacturer", c.manufacturer ?? "—"],
                  ["Position", c.position_code ?? "—"],
                  ["Status", status.label],
                ].map(([l, v]) => (
                  <div key={l as string}>
                    <p className="font-mono text-eyebrow uppercase text-label">{l}</p>
                    <p className="mt-1 text-sm text-foreground">{v}</p>
                  </div>
                ))}
              </section>
            </div>
          </TabsContent>

          {/* Events */}
          <TabsContent value="events">
            {data.events.length === 0 ? (
              <p className="text-sm text-hint">No events recorded.</p>
            ) : (
              <ol className="max-w-3xl space-y-2">
                {data.events.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 border border-border bg-card p-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: e.finding_severity ? (FINDING_SEVERITY_HEX[e.finding_severity] ?? "#6B7280") : "#1019EC" }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] font-medium text-foreground">{e.event_type.replace(/_/g, " ")}</span>
                        <span className="font-mono text-[11px] text-hint">{e.event_date_utc}</span>
                        {e.finding_severity && e.finding_severity !== "nil" && (
                          <span className="font-mono text-[10px] uppercase" style={{ color: FINDING_SEVERITY_HEX[e.finding_severity] }}>{e.finding_severity}</span>
                        )}
                        <span className="ml-auto font-mono text-[10px] uppercase text-label">{e.source_system}</span>
                      </div>
                      {e.finding_description && <p className="mt-1 text-[13px] text-subtext">{e.finding_description}</p>}
                      <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[10px] text-hint">
                        {e.facility && <span>{e.facility}</span>}
                        {e.cycles_at_event != null && <span>{e.cycles_at_event.toLocaleString()} cyc</span>}
                        {e.cost_usd != null && e.cost_usd > 0 && <span>${e.cost_usd.toLocaleString()}</span>}
                        {e.linked_task_id && <Link href={`/tasks/${e.linked_task_id}`} className="text-primary hover:underline">task</Link>}
                        {e.linked_signal_id && <Link href={`/signals/${e.linked_signal_id}`} className="text-primary hover:underline">signal</Link>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>

          {/* Predictions */}
          <TabsContent value="predictions">
            <div className="max-w-3xl space-y-6">
              <section>
                <p className="eyebrow mb-2">Prediction accuracy</p>
                <AccuracyChart predictions={data.predictions} />
              </section>
              {activePreds.length === 0 ? (
                <p className="text-sm text-hint">No active predictions. Use <span className="text-body">Refresh Predictions</span> to analyze this component.</p>
              ) : (
                (["high", "medium", "low"] as const).map((conf) =>
                  byConf[conf]?.length ? (
                    <section key={conf}>
                      <p className="eyebrow mb-2 uppercase">{conf} confidence</p>
                      <div className="space-y-3">
                        {byConf[conf]!.map((p) => <PredictionCard key={p.id} signal={p} />)}
                      </div>
                    </section>
                  ) : null,
                )
              )}
            </div>
          </TabsContent>

          {/* Health trend */}
          <TabsContent value="health">
            <div className="max-w-3xl">
              <p className="eyebrow mb-3">Health score over time</p>
              <HealthTrendChart history={data.health_history} events={data.events} />
              <p className="mt-2 font-mono text-[11px] text-hint">Vertical ticks are component events (blue = routine, colored = finding severity).</p>
            </div>
          </TabsContent>

          {/* Genealogy */}
          <TabsContent value="genealogy">
            <div className="max-w-3xl">
              <p className="text-sm text-subtext">Install / removal history within your organization. The cross-operator Genealogy Vault arrives in Phase 4.</p>
              {genealogy.length === 0 ? (
                <p className="mt-3 text-sm text-hint">No install/removal events recorded yet.</p>
              ) : (
                <ol className="mt-4 space-y-2">
                  {genealogy.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 border-l-2 border-border pl-3">
                      <span className="font-mono text-[13px] font-medium text-foreground">{e.event_type}</span>
                      <span className="font-mono text-[11px] text-hint">{e.event_date_utc}</span>
                      {e.station && <span className="font-mono text-[11px] text-subtext">{e.station}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Record event dialog */}
      <Dialog open={evOpen} onOpenChange={setEvOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record component event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Event type</Label>
              <Select value={evType} onValueChange={setEvType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="evdate">Date</Label>
                <Input id="evdate" type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Finding severity</Label>
                <Select value={evFinding || "none"} onValueChange={(v) => setEvFinding(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["none", "nil", "minor", "moderate", "major", "critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evdesc">Finding / note</Label>
              <Input id="evdesc" value={evDesc} onChange={(e) => setEvDesc(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evcost">Cost (USD)</Label>
              <Input id="evcost" type="number" value={evCost} onChange={(e) => setEvCost(e.target.value)} placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEvOpen(false)}>Cancel</Button>
            <Button onClick={submitEvent} disabled={recordEvent.isPending}>
              {recordEvent.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change position dialog */}
      <Dialog open={posOpen} onOpenChange={setPosOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change position</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pos">Position code</Label>
            <Input id="pos" value={newPos} onChange={(e) => setNewPos(e.target.value)} placeholder="e.g. LH, RH, NOSE" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPosOpen(false)}>Cancel</Button>
            <Button onClick={() => { changePosition.mutate({ componentId: c.id, positionCode: newPos }); setPosOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
