"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { ComponentDetail } from "@/types/components";

/** Full component view via get_component_detail RPC. */
export function useComponentDetail(componentId: string) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["component-detail", componentId],
    enabled: Boolean(componentId),
    queryFn: async (): Promise<ComponentDetail> => {
      const { data, error } = await supabase.rpc("get_component_detail", { p_component_id: componentId });
      if (error) throw error;
      return data as unknown as ComponentDetail;
    },
  });
}
