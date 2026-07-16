"use client";

import { ChevronDown, ChevronUp, Plane } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ConfidenceBadge } from "@/components/avir/confidence-badge";
import { EmptyState } from "@/components/avir/empty-state";
import { MonoText } from "@/components/avir/mono-text";
import { SourceBadge } from "@/components/avir/source-badge";
import { StatusBadge } from "@/components/avir/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAircraft } from "@/lib/queries/use-aircraft";
import { cn } from "@/lib/utils";

type SortKey = "tail_number" | "aircraft_type" | "base_station" | "state";

/**
 * Fleet "List" view — the former standalone Aircraft table. Shares the Fleet
 * filter bar (station/type/search apply here; risk/category are board-only).
 */
export function AircraftListView({
  stations,
  types,
  search,
}: {
  stations: string[];
  types: string[];
  search: string;
}) {
  const { data: aircraft, isLoading, isError } = useAircraft();
  const [sort, setSort] = useState<SortKey>("tail_number");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const rows = useMemo(() => {
    let list = aircraft ?? [];
    if (stations.length) {
      list = list.filter(
        (a) =>
          (a.base_station && stations.includes(a.base_station)) ||
          (a.aircraft_state?.current_station && stations.includes(a.aircraft_state.current_station)),
      );
    }
    if (types.length) list = list.filter((a) => types.includes(a.aircraft_type));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) => a.tail_number.toLowerCase().includes(q) || a.aircraft_type.toLowerCase().includes(q),
      );
    }
    const val = (a: (typeof list)[number]) => {
      switch (sort) {
        case "aircraft_type":
          return a.aircraft_type;
        case "base_station":
          return a.base_station ?? "";
        case "state":
          return a.aircraft_state?.state ?? "";
        default:
          return a.tail_number;
      }
    };
    return [...list].sort((a, b) => {
      const cmp = val(a).localeCompare(val(b));
      return dir === "asc" ? cmp : -cmp;
    });
  }, [aircraft, stations, types, search, sort, dir]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("asc");
    }
  }

  function SortHead({ label, k }: { label: string; k: SortKey }) {
    return (
      <TableHead>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={cn("inline-flex items-center gap-1", sort === k ? "text-foreground" : "hover:text-foreground")}
        >
          {label}
          {sort === k && (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
        </button>
      </TableHead>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState icon={Plane} headline="Couldn't load aircraft">
        <p>Something went wrong fetching your fleet.</p>
        <p>Refresh the page to try again.</p>
      </EmptyState>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState icon={Plane} headline="No aircraft match">
        <p>No tails match the current filters.</p>
        <p>Try widening the station or type filters.</p>
      </EmptyState>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <SortHead label="Tail" k="tail_number" />
          <SortHead label="Type" k="aircraft_type" />
          <SortHead label="Base" k="base_station" />
          <SortHead label="State" k="state" />
          <TableHead>Source</TableHead>
          <TableHead>Confidence</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((a) => (
          <TableRow key={a.id} className="cursor-pointer">
            <TableCell className="py-0">
              <Link href={`/aircraft/${a.id}`} className="flex items-center py-3.5 text-primary hover:underline">
                <MonoText className="text-primary">{a.tail_number}</MonoText>
              </Link>
            </TableCell>
            <TableCell className="text-foreground">{a.aircraft_type}</TableCell>
            <TableCell>
              <MonoText muted>{a.base_station ?? "—"}</MonoText>
            </TableCell>
            <TableCell>
              <StatusBadge state={a.aircraft_state?.state} />
            </TableCell>
            <TableCell>
              <SourceBadge source={a.aircraft_state?.state_source} />
            </TableCell>
            <TableCell>
              <ConfidenceBadge confidence={a.aircraft_state?.state_confidence} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
