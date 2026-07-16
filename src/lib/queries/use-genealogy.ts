"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { GenealogyDirectoryItem, GenealogyView } from "@/types/genealogy";

/** Full genealogy for a component's serial via get_component_genealogy RPC. */
export function useComponentGenealogy(componentId: string, enabled = true) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["component-genealogy", componentId],
    enabled: enabled && Boolean(componentId),
    queryFn: async (): Promise<GenealogyView | null> => {
      const { data, error } = await supabase.rpc("get_component_genealogy", { p_component_id: componentId });
      if (error) throw error;
      return data as unknown as GenealogyView | null;
    },
  });
}

/** Full genealogy by serial_genealogy id (historical / directory detail). */
export function useSerialGenealogy(serialId: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["serial-genealogy", serialId],
    enabled: Boolean(serialId),
    queryFn: async (): Promise<GenealogyView | null> => {
      const { data, error } = await supabase.rpc("get_serial_genealogy_by_id", { p_sid: serialId });
      if (error) throw error;
      return data as unknown as GenealogyView | null;
    },
  });
}

/** Genealogy Vault directory: every serial owned or previously owned. */
export function useGenealogyDirectory() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["genealogy-directory"],
    queryFn: async (): Promise<GenealogyDirectoryItem[]> => {
      const { data, error } = await supabase.rpc("get_genealogy_directory");
      if (error) throw error;
      return (data as unknown as GenealogyDirectoryItem[]) ?? [];
    },
  });
}
