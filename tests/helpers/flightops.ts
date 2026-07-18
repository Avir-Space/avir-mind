import { expect, type Page } from "@playwright/test";

import { getAnonClientAs } from "./supabase";

/**
 * Record a flight event via the "Record Event" dialog on a flight detail page.
 * OOOI maps to: pushback (Out), takeoff (Off), landing (On), taxi_in (In).
 * There is no actual-time picker — the RPC defaults the time to now().
 */
export async function recordFlightEvent(page: Page, eventType: string) {
  await page.getByRole("button", { name: "Record Event" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").first().click();
  // Options are labeled via flightEventLabel (e.g. "Pushback", "Takeoff").
  const label = eventType.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  await page.getByRole("option", { name: label, exact: true }).click();
  await dialog.getByRole("button", { name: "Record", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

/** Latest non-superseded dispatch release for a flight (RLS-scoped as owner). */
export async function getDispatchRelease(flightId: string) {
  const c = await getAnonClientAs("owner");
  const { data } = await c
    .from("dispatch_releases")
    .select("id, status, fuel_plan, weight_and_balance, performance_data")
    .eq("flight_id", flightId)
    .neq("status", "superseded")
    .order("released_at_utc", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}
