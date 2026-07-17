"use client";

import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { flightCategory } from "@/lib/design/flightops";
import { useWeatherBoard } from "@/lib/queries/use-flightops";
import { useFlightOpsActions } from "@/lib/mutations/use-flightops-actions";
import { cn } from "@/lib/utils";

export default function WeatherPage() {
  const { data: board, isLoading } = useWeatherBoard();
  const { fetchWeather } = useFlightOpsActions();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [routeA, setRouteA] = useState("");
  const [routeB, setRouteB] = useState("");

  const byStation = useMemo(() => new Map((board ?? []).map((w) => [w.station_code, w])), [board]);
  const selWx = sel ? byStation.get(sel) : null;
  const rA = routeA ? byStation.get(routeA) : null;
  const rB = routeB ? byStation.get(routeB) : null;

  async function refresh() {
    setBusy(true);
    try { const r = await fetchWeather(); toast({ title: "Weather refreshed", description: `${r.inserted} observations pulled.` }); }
    catch (e) { toast({ title: "Live fetch unavailable", description: "Showing seeded observations. " + String((e as Error).message).slice(0, 80) }); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/flight-ops" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Flight Ops</Link></div>
      <PageHeader eyebrow="Operations" title="Weather Board" subtitle="Latest METAR by station, flight category, and route weather."
        actions={<Button size="sm" variant="outline" onClick={refresh} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh</Button>} />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {(board ?? []).map((w) => {
              const cat = flightCategory(w.flight_category);
              return (
                <button key={w.station_code} type="button" onClick={() => setSel(sel === w.station_code ? null : w.station_code)}
                  className={cn("flex flex-col border bg-card p-3 text-left transition-colors", sel === w.station_code ? "border-primary" : "border-border hover:border-border-strong")}
                  style={{ borderTop: `3px solid ${cat.hex}` }}>
                  <span className="font-mono text-lg text-foreground">{w.station_code}</span>
                  <span className="font-mono text-[11px] uppercase" style={{ color: cat.hex }}>{cat.label}</span>
                  <span className="mt-1 font-mono text-[10px] text-hint">{String((w.parsed_data?.ceiling_ft as number) ?? "—")}ft · {String((w.parsed_data?.visibility_m as number) ?? "—")}m</span>
                </button>
              );
            })}
          </div>
        )}

        {selWx && (
          <div className="mt-4 max-w-3xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-lg text-foreground">{selWx.station_code}</span>
              <span className="border px-1.5 py-0.5 font-mono text-[10px] uppercase" style={{ borderColor: flightCategory(selWx.flight_category).hex, color: flightCategory(selWx.flight_category).hex }}>{flightCategory(selWx.flight_category).label}</span>
            </div>
            <p className="mt-2 font-mono text-[12px] text-body">{selWx.raw_text}</p>
            <p className="mt-1 font-mono text-[10px] text-hint">Observed {new Date(selWx.observation_time_utc).toLocaleString()}</p>
          </div>
        )}

        <div className="mt-6 max-w-3xl">
          <p className="eyebrow mb-2">Route weather</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={routeA} onChange={(e) => setRouteA(e.target.value)} className="h-8 border border-input bg-transparent px-2 text-sm text-foreground focus:border-primary focus:outline-none">
              <option value="">Origin…</option>{(board ?? []).map((w) => <option key={w.station_code} value={w.station_code}>{w.station_code}</option>)}
            </select>
            <span className="text-hint">→</span>
            <select value={routeB} onChange={(e) => setRouteB(e.target.value)} className="h-8 border border-input bg-transparent px-2 text-sm text-foreground focus:border-primary focus:outline-none">
              <option value="">Destination…</option>{(board ?? []).map((w) => <option key={w.station_code} value={w.station_code}>{w.station_code}</option>)}
            </select>
          </div>
          {(rA || rB) && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[rA, rB].filter(Boolean).map((w) => (
                <div key={w!.station_code} className="border border-border p-3" style={{ borderLeft: `3px solid ${flightCategory(w!.flight_category).hex}` }}>
                  <MonoText className="text-sm text-foreground">{w!.station_code}</MonoText>
                  <span className="ml-2 font-mono text-[10px] uppercase" style={{ color: flightCategory(w!.flight_category).hex }}>{flightCategory(w!.flight_category).label}</span>
                  <p className="mt-1.5 font-mono text-[11px] text-subtext">{w!.raw_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
