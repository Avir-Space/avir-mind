"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

export function useFlightOpsActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    for (const k of ["daily-ops", "flights-list", "flight-detail", "dispatch-queue", "recent-flight-events", "weather-board", "aircraft-signals"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  }, [qc]);

  const createRelease = useMutation({
    mutationFn: async (v: { flightId: string; attrs?: Record<string, unknown> }) => {
      const { error } = await supabase.rpc("create_dispatch_release", { p_flight_id: v.flightId, p_attrs: (v.attrs ?? {}) as never });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateReleaseStatus = useMutation({
    mutationFn: async (v: { releaseId: string; status: string; notes?: string }) => {
      const { error } = await supabase.rpc("update_dispatch_release_status", { p_release_id: v.releaseId, p_status: v.status, p_notes: v.notes ?? undefined });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const recordEvent = useMutation({
    mutationFn: async (v: { flightId: string; eventType: string; eventTime?: string }) => {
      const { error } = await supabase.rpc("record_flight_event", { p_flight_id: v.flightId, p_event_type: v.eventType, p_event_time: v.eventTime ?? new Date().toISOString(), p_attrs: {} as never });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const attributeDelay = useMutation({
    mutationFn: async (v: { flightId: string; code: string; category: string; minutes: number; reason?: string }) => {
      const { error } = await supabase.rpc("attribute_delay", { p_flight_id: v.flightId, p_delay_code: v.code, p_category: v.category, p_minutes: v.minutes, p_reason: v.reason ?? undefined, p_responsibility: undefined });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const fetchWeather = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("fetch-weather", { body: {} });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["weather-board"] });
    qc.invalidateQueries({ queryKey: ["weather-overlay"] });
    return data as { inserted: number };
  }, [supabase, qc]);

  return { createRelease, updateReleaseStatus, recordEvent, attributeDelay, fetchWeather };
}
