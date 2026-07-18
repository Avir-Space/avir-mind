import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnonClientAs } from "./supabase";

/**
 * DS.AI decision-audit counts, RLS-scoped (org-visible) as the given persona.
 * Records are minted by DB triggers: one ai_decision_record per signal, one
 * human_oversight_event per signal_action.
 */
export async function getDecisionRecordCount(client?: SupabaseClient): Promise<number> {
  const c = client ?? (await getAnonClientAs("owner"));
  const { count } = await c.from("ai_decision_records").select("*", { count: "exact", head: true });
  return count ?? 0;
}

export async function getOversightEventCount(client?: SupabaseClient): Promise<number> {
  const c = client ?? (await getAnonClientAs("owner"));
  const { count } = await c.from("human_oversight_events").select("*", { count: "exact", head: true });
  return count ?? 0;
}

/**
 * Attempt to mutate an append-only DS.AI row as an authenticated user.
 * ai_decision_records / human_oversight_events / calibration_events all have
 * SELECT+INSERT RLS only (no UPDATE/DELETE policy) → both ops affect 0 rows and
 * do NOT raise. (service_role bypasses RLS — never use it for this assertion.)
 */
export async function attemptTamper(
  client: SupabaseClient,
  table: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<{ updated: number; deleted: number }> {
  const upd = await client.from(table).update(patch).eq("id", id).select();
  const del = await client.from(table).delete().eq("id", id).select();
  return { updated: (upd.data ?? []).length, deleted: (del.data ?? []).length };
}
