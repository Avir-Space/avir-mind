"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { ProposeResult } from "@/types/crew";

export function useCrewActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    for (const k of ["crew-stats", "crew-directory", "crew-detail", "crew-roster", "expiring-quals",
      "fatigue-forecast", "crew-assignments", "upcoming-flights", "crew-overlay", "aircraft-signals"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  }, [qc]);

  const propose = useCallback(async (crewId: string, flightId: string, role: string): Promise<ProposeResult> => {
    const { data, error } = await supabase.rpc("propose_assignment", { p_crew_member_id: crewId, p_flight_schedule_id: flightId, p_role_on_flight: role });
    if (error) throw error;
    return data as unknown as ProposeResult;
  }, [supabase]);

  const commit = useMutation({
    mutationFn: async (v: { crewId: string; flightId: string; role: string; override?: boolean }) => {
      const { error } = await supabase.rpc("commit_assignment", {
        p_crew_member_id: v.crewId, p_flight_schedule_id: v.flightId, p_role_on_flight: v.role, p_override_warnings: v.override ?? false,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const logCurrency = useMutation({
    mutationFn: async (v: { qualId: string; validityDays?: number }) => {
      const today = new Date().toISOString().slice(0, 10);
      const expiry = new Date(Date.now() + (v.validityDays ?? 365) * 86400000).toISOString().slice(0, 10);
      const { error } = await supabase.from("crew_qualifications")
        .update({ last_currency_event_date: today, status: "valid", expiry_date: expiry, updated_at_utc: new Date().toISOString() } as never)
        .eq("id", v.qualId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateRuleConfig = useMutation({
    mutationFn: async (v: { id: string; ruleStack: Record<string, unknown> }) => {
      const { error } = await supabase.rpc("update_rule_configuration", { p_id: v.id, p_rule_stack: v.ruleStack as never });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rule-configs"] }),
  });

  const generateCrewSignals = useCallback(async () => {
    const { error } = await supabase.rpc("generate_crew_signals");
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["aircraft-signals"] });
  }, [supabase, qc]);

  return { propose, commit, logCurrency, updateRuleConfig, generateCrewSignals };
}
