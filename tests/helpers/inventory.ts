import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnonClientAs } from "./supabase";

/** Stock holdings for a part (RLS-scoped as owner). */
export async function getStockHoldingsForPart(partId: string) {
  const c = await getAnonClientAs("owner");
  const { data } = await c
    .from("stock_holdings")
    .select("location_id, quantity_available, quantity_reserved, reorder_point")
    .eq("part_id", partId);
  return data ?? [];
}

/**
 * Supply-chain signals. The app has no `supply_chain` category; the closest
 * seeded engine category is `stock_transfer_opportunity` (rebalance
 * suggestions), with `inventory_shortage` as a fallback.
 */
export async function getSupplyChainSignals(client?: SupabaseClient) {
  const c = client ?? (await getAnonClientAs("owner"));
  const { data } = await c
    .from("signals")
    .select("id, title, category, aircraft_id, evidence_refs")
    .in("category", ["stock_transfer_opportunity", "inventory_shortage"])
    .limit(10);
  return data ?? [];
}
