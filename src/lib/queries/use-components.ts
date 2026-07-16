"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { ComponentListItem } from "@/types/components";

/** All components for the org (RLS-scoped) + active-prediction counts. */
export function useComponents() {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["components"],
    queryFn: async (): Promise<ComponentListItem[]> => {
      const [{ data: comps, error }, { data: preds }] = await Promise.all([
        supabase.from("components").select("*, aircraft(tail_number)").order("component_type"),
        supabase
          .from("signals")
          .select("component_id")
          .eq("signal_class", "prediction")
          .eq("is_active", true)
          .not("component_id", "is", null),
      ]);
      if (error) throw error;

      const counts = new Map<string, number>();
      for (const p of preds ?? []) {
        const id = (p as { component_id: string | null }).component_id;
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }

      return (comps ?? []).map((c) => {
        const ac = (c as { aircraft: { tail_number: string } | null }).aircraft;
        const { aircraft: _drop, ...rest } = c as Record<string, unknown> & { aircraft: unknown };
        return {
          ...(rest as unknown as ComponentListItem),
          tail_number: ac?.tail_number ?? null,
          active_predictions: counts.get((c as { id: string }).id) ?? 0,
        };
      });
    },
  });
}
