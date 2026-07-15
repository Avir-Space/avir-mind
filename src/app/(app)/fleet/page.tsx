"use client";

import { Boxes, Plane } from "lucide-react";

import { EmptyState } from "@/components/avir/empty-state";
import { LastUpdated } from "@/components/avir/last-updated";
import { PageHeader } from "@/components/avir/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFleets } from "@/lib/queries/use-fleets";

export default function FleetPage() {
  const { data: fleets, isLoading, dataUpdatedAt, isError } = useFleets();

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Fleet"
        title="Fleet"
        subtitle="Logical groupings of your aircraft by type and mission profile."
        meta={
          !isLoading && fleets ? (
            <>
              <span className="font-mono text-eyebrow uppercase text-label">
                {fleets.length} fleets
              </span>
              <LastUpdated at={dataUpdatedAt} />
            </>
          ) : null
        }
      />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState icon={Boxes} headline="Couldn't load fleets">
            <p>Something went wrong fetching your fleets.</p>
            <p>Refresh the page to try again.</p>
          </EmptyState>
        ) : !fleets || fleets.length === 0 ? (
          <EmptyState icon={Boxes} headline="No fleets yet">
            <p>Fleets group your aircraft by type and mission so you can reason about them together.</p>
            <p>Your demo org normally seeds three — sign out and back in if you expected them here.</p>
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {fleets.map((fleet) => (
              <Card
                key={fleet.id}
                className="group flex flex-col justify-between p-5 transition-colors duration-micro hover:border-border-strong"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-serif text-xl leading-tight text-foreground">
                      {fleet.name}
                    </h2>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-surface/40 text-label">
                      <Plane className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                  </div>
                  {fleet.aircraft_type_focus && (
                    <p className="mt-2 font-mono text-xs uppercase tracking-wide text-subtext">
                      {fleet.aircraft_type_focus}
                    </p>
                  )}
                </div>
                <div className="mt-6 flex items-end justify-between border-t border-border pt-4">
                  <div>
                    <p className="font-mono text-3xl leading-none text-foreground">
                      {fleet.aircraft_count}
                    </p>
                    <p className="mt-1 font-mono text-eyebrow uppercase text-label">Aircraft</p>
                  </div>
                  <LastUpdated at={fleet.updated_at} label="Updated" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
