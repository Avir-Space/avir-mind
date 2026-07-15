"use client";

import { Plane } from "lucide-react";
import Link from "next/link";

import { ConfidenceBadge } from "@/components/avir/confidence-badge";
import { EmptyState } from "@/components/avir/empty-state";
import { LastUpdated } from "@/components/avir/last-updated";
import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
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
import { STATE_CONFIG } from "@/lib/design/state";
import { useAircraft } from "@/lib/queries/use-aircraft";
import type { AircraftStateValue } from "@/types/domain";

export default function AircraftPage() {
  const { data: aircraft, isLoading, isError, dataUpdatedAt } = useAircraft();

  const readyCount =
    aircraft?.filter((a) => {
      const s = (a.aircraft_state?.state ?? "unknown") as AircraftStateValue;
      return STATE_CONFIG[s]?.dispatchReady;
    }).length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Assets"
        title="Aircraft"
        subtitle="Every tail in your operation, with live state, provenance, and confidence."
        meta={
          !isLoading && aircraft ? (
            <>
              <span className="font-mono text-eyebrow uppercase tracking-wider text-label">
                {aircraft.length} aircraft
              </span>
              <span className="text-hint" aria-hidden>
                •
              </span>
              <span className="font-mono text-eyebrow uppercase tracking-wider text-severity-low">
                {readyCount} dispatch-ready
              </span>
              <span className="text-hint" aria-hidden>
                •
              </span>
              <LastUpdated at={dataUpdatedAt} />
            </>
          ) : null
        }
      />

      <div className="flex-1 overflow-y-auto avir-scroll">
        {isLoading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState icon={Plane} headline="Couldn't load aircraft">
            <p>Something went wrong fetching your fleet.</p>
            <p>Refresh the page to try again.</p>
          </EmptyState>
        ) : !aircraft || aircraft.length === 0 ? (
          <EmptyState icon={Plane} headline="No aircraft yet">
            <p>This is where every tail in your operation lives, with its live operational state.</p>
            <p>Your demo org normally seeds 24 — sign out and back in if you expected them here.</p>
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tail</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aircraft.map((a) => (
                <TableRow key={a.id} className="cursor-pointer">
                  <TableCell className="py-0">
                    <Link
                      href={`/aircraft/${a.id}`}
                      className="flex items-center py-3.5 text-primary hover:underline"
                    >
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
        )}
      </div>
    </div>
  );
}
