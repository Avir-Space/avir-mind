import { expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnonClientAs } from "./supabase";

/**
 * The seeded AD row + its per-aircraft statuses, via an RLS-scoped owner read.
 * NOTE: the DB has no scalar days_remaining / due_date / compliance_status — the
 * deadline is `compliance_deadline_date` and per-aircraft state lives in
 * `aircraft_ad_status`.
 */
export async function getADStatus(adNumber: string, client?: SupabaseClient) {
  const c = client ?? (await getAnonClientAs("owner"));
  const { data: ad } = await c
    .from("airworthiness_directives")
    .select("id, ad_number, issuing_authority, ad_title, effective_date, compliance_deadline_date, criticality")
    .eq("ad_number", adNumber)
    .maybeSingle();
  if (!ad) return { ad: null as null, statuses: [] as { aircraft_id: string; status: string }[] };
  const { data: statuses } = await c
    .from("aircraft_ad_status")
    .select("aircraft_id, status")
    .eq("ad_id", ad.id);
  return { ad, statuses: (statuses ?? []) as { aircraft_id: string; status: string }[] };
}

/** Count fleet MEL items in a given status, RLS-scoped as owner. */
export async function countMelItems(status: string, client?: SupabaseClient): Promise<number> {
  const c = client ?? (await getAnonClientAs("owner"));
  const { count } = await c
    .from("aircraft_mel_items")
    .select("*", { count: "exact", head: true })
    .eq("status", status);
  return count ?? 0;
}

/**
 * Rectify the first active MEL row on /compliance/mel. The Rectify control is a
 * direct action button (no dialog) that calls rectify_mel_item and toasts
 * "Rectified".
 */
export async function rectifyFirstMel(page: Page) {
  await page.goto("/compliance/mel");
  const btn = page.getByRole("button", { name: "Rectify" }).first();
  await expect(btn).toBeVisible({ timeout: 20_000 });
  await btn.click();
  await expect(page.getByText("Rectified").first()).toBeVisible({ timeout: 15_000 });
}

/**
 * DEVIATION: there is no "Defer New MEL" UI on /compliance/mel — the
 * `defer_mel_item` RPC and `deferMel` mutation exist but are unwired to any
 * button. This data helper drives the RPC directly (for setup); the UI defer
 * flow is test.fixme in the spec.
 */
export async function deferMelViaRpc(
  client: SupabaseClient,
  aircraftId: string,
  melCatalogId: string,
  reason = "E2E deferral",
) {
  return client.rpc("defer_mel_item", {
    p_aircraft_id: aircraftId,
    p_mel_catalog_id: melCatalogId,
    p_reason: reason,
    p_create_task: false,
  });
}
