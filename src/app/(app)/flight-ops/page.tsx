"use client";

import { CloudSun, FileText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { FilterDropdown } from "@/components/signals/filter-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DELAY_CATEGORY, dispatchStatus, FLIGHT_STATUS, flightStatus } from "@/lib/design/flightops";
import { useDailyOps, useDispatchQueue, useFlightsList } from "@/lib/queries/use-flightops";
import { useTaskRealtime } from "@/lib/realtime/use-task-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { cn } from "@/lib/utils";
import type { FlightListItem } from "@/types/flightops";

const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return <div className="border border-border bg-card px-5 py-4"><p className={cn("font-mono text-2xl leading-none", tone ?? "text-foreground")}>{value}</p><p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p></div>;
}

function FlightsTable({ flights, statuses }: { flights: FlightListItem[] | undefined; statuses: string[] }) {
  const rows = (flights ?? []).filter((f) => !statuses.length || statuses.includes(f.status));
  if (!flights) return <div className="space-y-2 p-6">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  return (
    <Table>
      <TableHeader><TableRow className="hover:bg-transparent">
        <TableHead>Flight</TableHead><TableHead>Route</TableHead><TableHead>Tail</TableHead><TableHead>Sched Dep</TableHead>
        <TableHead>Arr</TableHead><TableHead>Status</TableHead><TableHead>Delay</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map((f) => {
          const st = flightStatus(f.status);
          return (
            <TableRow key={f.id} className="cursor-pointer">
              <TableCell className="py-0"><Link href={`/flight-ops/flights/${f.id}`} className="flex items-center py-3.5 text-primary hover:underline"><MonoText className="text-primary">{f.flight_number}</MonoText></Link></TableCell>
              <TableCell className="font-mono text-[12px] text-subtext">{f.origin_station} → {f.destination_station}</TableCell>
              <TableCell><MonoText muted>{f.tail_number ?? "—"}</MonoText></TableCell>
              <TableCell className="font-mono text-[12px] text-hint">{hm(f.scheduled_departure_utc)}</TableCell>
              <TableCell className="font-mono text-[12px] text-hint">{hm(f.scheduled_arrival_utc)}</TableCell>
              <TableCell><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: st.hex }} /><span className="text-[13px]" style={{ color: st.hex }}>{st.label}</span></span></TableCell>
              <TableCell>{f.delay_minutes > 0 ? <span className="font-mono text-[12px] text-severity-high">+{f.delay_minutes}m</span> : <span className="font-mono text-[12px] text-hint">—</span>}</TableCell>
            </TableRow>
          );
        })}
        {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-hint">No flights.</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

export default function FlightOpsPage() {
  const { orgId } = useAuth();
  useTaskRealtime(orgId);
  const today = new Date().toISOString().slice(0, 10);
  const in5 = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const back2 = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const { data: ops } = useDailyOps();
  const { data: todayFlights } = useFlightsList(today, today);
  const { data: schedule } = useFlightsList(back2, in5);
  const { data: dispatch } = useDispatchQueue();
  const [statuses, setStatuses] = useState<string[]>([]);

  const delayFlights = useMemo(() => (schedule ?? []).filter((f) => f.delay_minutes > 0), [schedule]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Operations" title="Flight Ops" subtitle="Live operations, dispatch, and performance."
        actions={<Button asChild size="sm" variant="outline"><Link href="/flight-ops/weather"><CloudSun className="h-3.5 w-3.5" /> Weather</Link></Button>} />

      <div className="flex-1 overflow-y-auto avir-scroll">
        <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-4">
          {!ops ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px]" />) : (
            <>
              <StatTile label="Flights Today" value={ops.total_flights} />
              <StatTile label="On-Time %" value={ops.on_time_pct != null ? `${ops.on_time_pct}%` : "—"} tone={ops.on_time_pct != null && ops.on_time_pct < 80 ? "text-severity-high" : "text-severity-low"} />
              <StatTile label="Delays > 15m" value={ops.delays_gt15} tone="text-severity-high" />
              <StatTile label="Cancellations" value={ops.cancellations} tone="text-severity-critical" />
            </>
          )}
        </div>
        <div className="px-6 py-4">
          <p className="eyebrow mb-1">Delays by category (7d)</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ops?.delays_by_category ?? {}).map(([cat, mins]) => (
              <span key={cat} className="inline-flex items-center gap-1.5 border border-border bg-card px-2.5 py-1 text-xs text-body">{DELAY_CATEGORY[cat] ?? cat} · <span className="font-mono text-severity-high">{mins}m</span></span>
            ))}
            {ops?.ifr_stations ? <span className="inline-flex items-center gap-1.5 border border-severity-medium/40 bg-card px-2.5 py-1 text-xs text-severity-medium"><CloudSun className="h-3.5 w-3.5" /> {ops.ifr_stations} station(s) IFR/LIFR</span> : null}
          </div>
        </div>

        <Tabs defaultValue="today">
          <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
            <TabsTrigger value="today">Today</TabsTrigger><TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="dispatch">Dispatch{dispatch?.length ? ` (${dispatch.length})` : ""}</TabsTrigger>
            <TabsTrigger value="delays">Delays</TabsTrigger><TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList></div>

          <TabsContent value="today"><FlightsTable flights={todayFlights} statuses={statuses} /></TabsContent>

          <TabsContent value="schedule">
            <div className="flex h-12 items-center gap-3 border-b border-border px-6"><FilterDropdown label="Status" options={Object.entries(FLIGHT_STATUS).map(([v, x]) => ({ value: v, label: x.label }))} selected={statuses} onChange={setStatuses} /></div>
            <FlightsTable flights={schedule} statuses={statuses} />
          </TabsContent>

          <TabsContent value="dispatch">
            <div className="p-6"><div className="border border-border">
              {(dispatch ?? []).map((d) => {
                const st = dispatchStatus(d.status);
                return (
                  <Link key={d.id} href={`/flight-ops/flights/${d.flight_id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-surface/40">
                    <FileText className="h-3.5 w-3.5 text-label" />
                    <MonoText className="text-[12px] text-primary">{d.release_number}</MonoText>
                    <span className="font-mono text-[12px] text-foreground">{d.flight_number}</span>
                    <span className="font-mono text-[11px] text-hint">{d.origin_station} → {d.destination_station}</span>
                    <span className="ml-auto font-mono text-[11px] uppercase" style={{ color: st.hex }}>{st.label}</span>
                    <span className="font-mono text-[11px] text-hint">{new Date(d.scheduled_departure_utc).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </Link>
                );
              })}
              {(!dispatch || dispatch.length === 0) && <p className="px-3 py-4 text-sm text-hint">No dispatch releases.</p>}
            </div></div>
          </TabsContent>

          <TabsContent value="delays">
            <div className="p-6"><div className="border border-border">
              {delayFlights.map((f) => (
                <Link key={f.id} href={`/flight-ops/flights/${f.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-surface/40">
                  <MonoText className="text-[12px] text-primary">{f.flight_number}</MonoText>
                  <span className="font-mono text-[11px] text-hint">{f.origin_station} → {f.destination_station}</span>
                  <span className="font-mono text-[11px] text-hint">{new Date(f.flight_date).toLocaleDateString()}</span>
                  <span className="ml-auto font-mono text-[12px] text-severity-high">+{f.delay_minutes}m</span>
                </Link>
              ))}
              {delayFlights.length === 0 && <p className="px-3 py-4 text-sm text-hint">No delayed flights in range.</p>}
            </div></div>
          </TabsContent>

          <TabsContent value="performance">
            <div className="p-6">
              <p className="eyebrow mb-3">On-time performance</p>
              <div className="flex items-end gap-6">
                <div><p className="font-mono text-4xl" style={{ color: (ops?.on_time_pct ?? 100) < 80 ? "#EA580C" : "#16A34A" }}>{ops?.on_time_pct ?? "—"}<span className="text-lg text-hint">%</span></p><p className="font-mono text-eyebrow uppercase text-label">last 48h arrivals ≤ 15m</p></div>
                <div className="flex-1">
                  <div className="flex h-4 w-full overflow-hidden border border-border">
                    <div style={{ width: `${ops?.on_time_pct ?? 0}%`, background: "#16A34A" }} title="on time" />
                    <div style={{ width: `${100 - (ops?.on_time_pct ?? 0)}%`, background: "#EA580C" }} title="delayed" />
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-hint">Green = on time · Orange = delayed</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
