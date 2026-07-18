"use client";

import { ChevronDown, ChevronUp, Cpu, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { HealthBar } from "@/components/components/health-bar";
import { EmptyState } from "@/components/avir/empty-state";
import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { FilterDropdown } from "@/components/signals/filter-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPONENT_STATUS_CONFIG, componentType, HEALTH_BANDS } from "@/lib/design/components";
import { useComponents } from "@/lib/queries/use-components";
import { useComponentActions } from "@/lib/mutations/use-component-actions";
import { useAuth } from "@/lib/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { ComponentListItem } from "@/types/components";

const OFFWING = "__offwing";
type SortKey = "serial_number" | "component_type" | "health_score" | "current_cycles";

export default function ComponentsPage() {
  const { orgId } = useAuth();
  const { generatePredictions } = useComponentActions();
  const { data: components, isLoading } = useComponents();

  const [types, setTypes] = useState<string[]>([]);
  const [tails, setTails] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [bands, setBands] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("health_score");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const typeOptions = useMemo(() => {
    const s = new Set((components ?? []).map((c) => c.component_type));
    return [...s].sort().map((t) => ({ value: t, label: componentType(t).label }));
  }, [components]);
  const tailOptions = useMemo(() => {
    const s = new Set((components ?? []).map((c) => c.tail_number).filter(Boolean) as string[]);
    return [{ value: OFFWING, label: "Off-wing" }, ...[...s].sort().map((t) => ({ value: t, label: t }))];
  }, [components]);
  const statusOptions = Object.entries(COMPONENT_STATUS_CONFIG).map(([value, v]) => ({ value, label: v.label }));
  const bandOptions = HEALTH_BANDS.map((b) => ({ value: b.value, label: b.label }));

  // First-login: generate predictions for ~4 aircraft when the org has none.
  const seeded = useRef(false);
  useEffect(() => {
    if (!orgId || seeded.current) return;
    const key = `avir_pred_seed_${orgId}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    seeded.current = true;
    (async () => {
      const supabase = createClient();
      const { count } = await supabase
        .from("signals")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("signal_class", "prediction");
      if ((count ?? 0) > 0) return;
      if (typeof window !== "undefined") sessionStorage.setItem(key, "1");
      const { data: acs } = await supabase.from("aircraft").select("id").eq("org_id", orgId).limit(4);
      await Promise.all(
        (acs ?? []).map((a) => generatePredictions({ aircraftId: a.id as string }, { runType: "scheduled" }).catch(() => {})),
      );
    })();
  }, [orgId, generatePredictions]);

  const rows = useMemo(() => {
    let list = components ?? [];
    if (types.length) list = list.filter((c) => types.includes(c.component_type));
    if (statuses.length) list = list.filter((c) => statuses.includes(c.status));
    if (tails.length) {
      list = list.filter((c) =>
        (tails.includes(OFFWING) && !c.aircraft_id) || (c.tail_number != null && tails.includes(c.tail_number)),
      );
    }
    if (bands.length) {
      const ranges = HEALTH_BANDS.filter((b) => bands.includes(b.value));
      list = list.filter((c) => c.health_score != null && ranges.some((r) => c.health_score! >= r.min && c.health_score! <= r.max));
    }
    const val = (c: ComponentListItem) => {
      switch (sort) {
        case "component_type": return c.component_type;
        case "health_score": return c.health_score ?? -1;
        case "current_cycles": return c.current_cycles ?? -1;
        default: return c.serial_number;
      }
    };
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
  }, [components, types, statuses, tails, bands, sort, dir]);

  function toggleSort(k: SortKey) {
    if (sort === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(k); setDir("asc"); }
  }
  function SortHead({ label, k }: { label: string; k: SortKey }) {
    return (
      <TableHead>
        <button type="button" onClick={() => toggleSort(k)} className={cn("inline-flex items-center gap-1", sort === k ? "text-foreground" : "hover:text-foreground")}>
          {label}
          {sort === k && (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
        </button>
      </TableHead>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Assets"
        title="Components"
        subtitle="Every serialized component across your operation."
        meta={components ? (
          <span className="font-mono text-eyebrow uppercase text-label">
            {rows.length === components.length ? `${components.length} components` : `${rows.length} of ${components.length} components`}
          </span>
        ) : null}
      />

      <div className="flex h-12 items-center gap-3 border-b border-border px-6">
        <FilterDropdown label="Type" options={typeOptions} selected={types} onChange={setTypes} />
        <FilterDropdown label="Aircraft" options={tailOptions} selected={tails} onChange={setTails} />
        <FilterDropdown label="Status" options={statusOptions} selected={statuses} onChange={setStatuses} />
        <FilterDropdown label="Health" options={bandOptions} selected={bands} onChange={setBands} />
      </div>

      <div className="flex-1 overflow-y-auto avir-scroll">
        {isLoading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Cpu} headline="No components match">
            <p>No serialized components match the current filters.</p>
            <p>Widen the filters, or sign out and back in if your demo fleet hasn&apos;t seeded.</p>
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead label="Serial" k="serial_number" />
                <SortHead label="Type" k="component_type" />
                <TableHead>Part #</TableHead>
                <TableHead>Aircraft / Pos</TableHead>
                <SortHead label="Cycles / Hrs" k="current_cycles" />
                <SortHead label="Health" k="health_score" />
                <TableHead>Next Event</TableHead>
                <TableHead>Pred.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const meta = componentType(c.component_type);
                const Icon = meta.icon;
                return (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell className="py-0">
                      <Link href={`/components/${c.id}`} className="flex items-center py-3.5 text-primary hover:underline">
                        <MonoText className="text-primary">{c.serial_number}</MonoText>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <Icon className="h-3.5 w-3.5 text-label" strokeWidth={1.75} /> {meta.label}
                      </span>
                    </TableCell>
                    <TableCell><MonoText muted>{c.part_number}</MonoText></TableCell>
                    <TableCell>
                      {c.aircraft_id && c.tail_number ? (
                        <Link href={`/aircraft/${c.aircraft_id}`} className="font-mono text-[13px] text-body hover:text-primary">
                          {c.tail_number}{c.position_code ? ` · ${c.position_code}` : ""}
                        </Link>
                      ) : (
                        <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-hint">Off-wing</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <MonoText muted className="text-[12px]">
                        {(c.current_cycles ?? 0).toLocaleString()}c · {Math.round(c.current_flight_hours ?? 0).toLocaleString()}h
                      </MonoText>
                    </TableCell>
                    <TableCell><HealthBar score={c.health_score} /></TableCell>
                    <TableCell>
                      <span className="text-[13px] text-body">{c.next_scheduled_event_type ?? "—"}</span>
                      {c.next_scheduled_event_due_date && (
                        <span className="ml-1 font-mono text-[10px] text-hint">
                          {new Date(c.next_scheduled_event_due_date).toLocaleDateString([], { month: "short", year: "2-digit" })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.active_predictions > 0 ? (
                        <span className="inline-flex items-center gap-1 border border-primary/40 bg-primary/5 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                          <TrendingUp className="h-3 w-3" /> {c.active_predictions}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-hint">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
