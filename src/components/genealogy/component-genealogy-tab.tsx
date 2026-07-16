"use client";

import { GenealogyView } from "@/components/genealogy/genealogy-view";
import { Skeleton } from "@/components/ui/skeleton";
import { useComponentGenealogy } from "@/lib/queries/use-genealogy";

/** Genealogy tab body on /components/[id] — the real hash-chained ledger. */
export function ComponentGenealogyTab({ componentId }: { componentId: string }) {
  const { data, isLoading } = useComponentGenealogy(componentId);

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6">
        <p className="text-sm text-hint">No genealogy records yet. Record a component event to begin the ledger.</p>
      </div>
    );
  }
  return <GenealogyView view={data} componentId={componentId} />;
}
