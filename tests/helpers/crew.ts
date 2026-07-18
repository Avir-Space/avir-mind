import type { SupabaseClient } from "@supabase/supabase-js";

export type ProposeResult = {
  duty_evaluation?: {
    overall_result?: string;
    rule_evaluations?: { rule_name: string; result: string }[];
    violations?: string[];
    fatigue_score?: number;
  };
  currency?: { assignable?: boolean };
  assignable?: boolean;
};

/** Call propose_assignment for a crew member + flight (flight_schedules id). */
export async function proposeAssignment(
  client: SupabaseClient,
  crewMemberId: string,
  flightScheduleId: string,
  roleOnFlight = "pic",
): Promise<{ data: ProposeResult | null; error: unknown }> {
  const { data, error } = await client.rpc("propose_assignment", {
    p_crew_member_id: crewMemberId,
    p_flight_schedule_id: flightScheduleId,
    p_role_on_flight: roleOnFlight,
  });
  return { data: data as ProposeResult | null, error };
}

/** True when a propose result represents an FTL (duty-rule) violation. */
export function isFtlViolation(r: ProposeResult | null): boolean {
  return r?.duty_evaluation?.overall_result === "violation";
}
