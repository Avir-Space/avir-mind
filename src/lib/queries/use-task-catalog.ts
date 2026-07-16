"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

export type CatalogEntry = { parent_type: string; sub_type: string; display_name: string };

/** Global task taxonomy, grouped by parent_type. */
export function useTaskCatalog() {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["task-catalog"],
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_type_catalog")
        .select("parent_type, sub_type, display_name")
        .eq("active", true)
        .order("parent_type")
        .order("sort_rank");
      if (error) throw error;
      const grouped: Record<string, CatalogEntry[]> = {};
      for (const row of data ?? []) {
        (grouped[row.parent_type] ??= []).push(row as CatalogEntry);
      }
      return grouped;
    },
  });
}
