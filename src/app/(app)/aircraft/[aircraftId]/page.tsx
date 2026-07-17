"use client";

import {
  Activity,
  ChevronLeft,
  Clock,
  Cpu,
  DollarSign,
  Gauge,
  ListChecks,
  type LucideIcon,
  Package,
  Plane,
  ShieldCheck,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { AircraftComplianceTab } from "@/components/compliance/aircraft-compliance-tab";
import { AircraftComponentsTab } from "@/components/components/aircraft-components-tab";
import { AircraftPartsTab } from "@/components/inventory/aircraft-parts-tab";
import { AircraftSignalsTab } from "@/components/signals/aircraft-signals-tab";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/avir/confidence-badge";
import { LastUpdated } from "@/components/avir/last-updated";
import { MonoText } from "@/components/avir/mono-text";
import { SourceBadge } from "@/components/avir/source-badge";
import { StatusBadge } from "@/components/avir/status-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAircraftDetail } from "@/lib/queries/use-aircraft-detail";
import { formatTimestamp } from "@/lib/utils";

type TabDef = { value: string; label: string; icon: LucideIcon; headline: string; text: string };

// Tab order is locked per the Phase 0 spec.
const TABS: TabDef[] = [
  {
    value: "signals",
    label: "Signals",
    icon: Activity,
    headline: "Signals",
    text: "Live telemetry, anomalies, and AI-detected signals for this aircraft will surface here — each with its source and confidence. Arrives in Phase 3.",
  },
  {
    value: "components",
    label: "Components",
    icon: Cpu,
    headline: "Components",
    text: "",
  },
  {
    value: "ops-profile",
    label: "Ops Profile",
    icon: Gauge,
    headline: "Operational profile",
    text: "Utilization, cycles, route patterns, and dispatch reliability for this tail — the operational fingerprint that context everything else.",
  },
  {
    value: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    headline: "Maintenance",
    text: "Work orders, checks, and unscheduled events for this aircraft, with status and the parts involved. Arrives with the maintenance module.",
  },
  {
    value: "airworthiness",
    label: "Compliance",
    icon: ShieldCheck,
    headline: "Compliance",
    text: "AD/SB applicability, recurring requirements, and compliance status for this tail — with the evidence trail behind every sign-off.",
  },
  {
    value: "inventory",
    label: "Parts",
    icon: Package,
    headline: "Parts",
    text: "",
  },
  {
    value: "crew",
    label: "Crew",
    icon: Users,
    headline: "Crew",
    text: "Crew qualified and current on this type, and who is available to operate this tail. Arrives in Phase 6.",
  },
  {
    value: "financial",
    label: "Financial",
    icon: DollarSign,
    headline: "Financial",
    text: "Ownership economics, maintenance cost, and value exposure for this aircraft — the money view behind the metal.",
  },
  {
    value: "impact",
    label: "Impact",
    icon: TrendingUp,
    headline: "Impact",
    text: "The measurable value AVIR has created for this specific aircraft — avoided downtime, recovered availability, and the dollars behind them. Arrives in Phase 9.",
  },
  {
    value: "timeline",
    label: "Timeline",
    icon: Clock,
    headline: "Timeline",
    text: "A unified chronological record of every state transition, event, and decision for this aircraft, drawn from its state history.",
  },
];

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-eyebrow uppercase text-label">{label}</p>
      <div className="mt-1 truncate text-sm text-foreground">{children}</div>
    </div>
  );
}

export default function AircraftProfilePage() {
  const params = useParams<{ aircraftId: string }>();
  const { data, isLoading, isError } = useAircraftDetail(params.aircraftId);

  return (
    <div className="flex h-full flex-col">
      {/* Back link */}
      <div className="border-b border-border px-6 pt-4">
        <Link
          href="/fleet?view=list"
          className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Fleet
        </Link>

        {/* Header */}
        {isLoading ? (
          <div className="py-5">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="mt-4 h-6 w-full max-w-2xl" />
          </div>
        ) : isError || !data ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Plane className="h-8 w-8 text-label" strokeWidth={1.5} />
            <h1 className="mt-4 font-serif text-2xl text-foreground">Aircraft not found</h1>
            <p className="mt-2 text-sm text-subtext">
              This tail doesn&apos;t exist or isn&apos;t in your organization.
            </p>
            <Link href="/fleet?view=list" className="mt-4 text-sm text-primary hover:underline">
              Back to Fleet
            </Link>
          </div>
        ) : (
          <div className="py-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 className="font-serif text-4xl leading-none text-foreground">
                {data.tail_number}
              </h1>
              <span className="text-lg text-subtext">{data.aircraft_type}</span>
              {data.ownership_type && (
                <Badge variant="muted" className="uppercase">
                  {data.ownership_type}
                </Badge>
              )}
              <Button asChild size="sm" variant="outline" className="ml-auto">
                <Link href={`/aircraft/${data.id}/tasks`}>
                  <ListChecks className="h-3.5 w-3.5" /> Task Board
                </Link>
              </Button>
            </div>

            {/* Data-trust strip */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge state={data.aircraft_state?.state} />
              <SourceBadge source={data.aircraft_state?.state_source} />
              <ConfidenceBadge confidence={data.aircraft_state?.state_confidence} />
              <LastUpdated at={data.aircraft_state?.updated_at} className="ml-1" />
            </div>

            {/* Detail grid */}
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-3 lg:grid-cols-6">
              <DetailField label="Serial">
                <MonoText>{data.serial_number ?? "—"}</MonoText>
              </DetailField>
              <DetailField label="Base">
                <MonoText>{data.base_station ?? "—"}</MonoText>
              </DetailField>
              <DetailField label="Current Station">
                <MonoText>{data.aircraft_state?.current_station ?? "—"}</MonoText>
              </DetailField>
              <DetailField label="Delivered">
                <MonoText muted>{data.delivery_date ?? "—"}</MonoText>
              </DetailField>
              <DetailField label="Next Event">
                <span className="text-foreground">{data.aircraft_state?.next_event_type ?? "—"}</span>
              </DetailField>
              <DetailField label="Next Event At">
                <MonoText muted>{formatTimestamp(data.aircraft_state?.next_event_at)}</MonoText>
              </DetailField>
            </div>

            {data.fleets.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="font-mono text-eyebrow uppercase text-label">Fleets</span>
                {data.fleets.map((f) => (
                  <Badge key={f.id} variant="outline">
                    {f.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      {data && (
        <Tabs defaultValue="signals" className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border px-6">
            <TabsList className="w-full justify-start">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="flex-1 overflow-y-auto avir-scroll">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <TabsContent key={t.value} value={t.value}>
                  {t.value === "signals" ? (
                    <AircraftSignalsTab aircraftId={data.id} />
                  ) : t.value === "components" ? (
                    <AircraftComponentsTab aircraftId={data.id} />
                  ) : t.value === "inventory" ? (
                    <AircraftPartsTab aircraftId={data.id} />
                  ) : t.value === "airworthiness" ? (
                    <AircraftComplianceTab aircraftId={data.id} />
                  ) : (
                    <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 py-16 text-center">
                      <div className="mb-5 flex h-14 w-14 items-center justify-center border border-border bg-surface/40">
                        <Icon className="h-6 w-6 text-label" strokeWidth={1.5} />
                      </div>
                      <h2 className="font-serif text-xl text-foreground">{t.headline}</h2>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-subtext">{t.text}</p>
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </div>
        </Tabs>
      )}
    </div>
  );
}
