import { expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnonClientAs } from "./supabase";

/** Count notifications not yet acknowledged for the persona (RLS-scoped). */
export async function countUnacknowledged(client?: SupabaseClient): Promise<number> {
  const c = client ?? (await getAnonClientAs("owner"));
  const { count } = await c
    .from("notification_events")
    .select("*", { count: "exact", head: true })
    .is("acknowledged_at_utc", null);
  return count ?? 0;
}

/** Count notifications in a given delivery_status for the persona (RLS-scoped). */
export async function countByDeliveryStatus(status: string, client?: SupabaseClient): Promise<number> {
  const c = client ?? (await getAnonClientAs("owner"));
  const { count } = await c
    .from("notification_events")
    .select("*", { count: "exact", head: true })
    .eq("delivery_status", status);
  return count ?? 0;
}

/**
 * Open the first Active notification and Acknowledge it via the detail Sheet.
 * (Rows are <button>s; the Sheet exposes the "Acknowledge" action when unacked.)
 */
export async function acknowledgeFirstActive(page: Page) {
  await page.goto("/notifications");
  await page.getByRole("tab", { name: /^Active/ }).click();
  const firstRow = page.getByRole("tabpanel").getByRole("button").first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  await firstRow.click();
  const ack = page.getByRole("button", { name: "Acknowledge" });
  await expect(ack).toBeVisible({ timeout: 10_000 });
  await ack.click();
  await expect(page.getByText("Acknowledged").first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Run a policy dry-run from /settings/notifications/policies and return the
 * resolved-recipients dialog locator. Clicks the first "Test (dry-run)".
 */
export async function dryRunFirstPolicy(page: Page) {
  await page.goto("/settings/notifications/policies");
  const btn = page.getByRole("button", { name: /Test \(dry-run\)/ }).first();
  await expect(btn).toBeVisible({ timeout: 20_000 });
  await btn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/^Dry-run —/)).toBeVisible({ timeout: 15_000 });
  return dialog;
}
