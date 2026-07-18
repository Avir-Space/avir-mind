import { expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnonClientAs } from "./supabase";

/** Service contracts for a customer account (RLS-scoped as mro_owner). */
export async function getCustomerContracts(customerId: string, client?: SupabaseClient) {
  const c = client ?? (await getAnonClientAs("mro_owner"));
  const { data } = await c
    .from("service_contracts")
    .select("id, contract_number, contract_status, annual_value_usd, customer_account_id")
    .eq("customer_account_id", customerId);
  return data ?? [];
}

/** SLA measurements for a customer account (RLS-scoped as mro_owner). */
export async function getSlaMeasurements(customerId: string, client?: SupabaseClient) {
  const c = client ?? (await getAnonClientAs("mro_owner"));
  const { data } = await c
    .from("sla_measurements")
    .select("id, sla_type, target_value, actual_value, performance_pct, credits_owed_usd, customer_account_id")
    .eq("customer_account_id", customerId);
  return data ?? [];
}

/**
 * On a work package's Findings tab, notify the customer of the first un-notified
 * finding. DEVIATION: this sets work_package_findings.customer_notified and
 * inserts a draft customer_reports row — it does NOT emit a notification_events row.
 */
export async function notifyCustomerFromWorkPackage(page: Page, wpId: string) {
  await page.goto(`/work-packages/${wpId}`);
  await page.getByRole("tab", { name: /^Findings/ }).click();
  const btn = page.getByRole("button", { name: "Notify customer" }).first();
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.click();
  await expect(page.getByText("Customer notified").first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Switch active tenant via the sidebar switcher. DEVIATION: the switcher only
 * renders when a user belongs to >1 org (`orgs.length > 1`); the seeded single-org
 * personas (owner@, mro_owner@) never see it, so the operator↔MRO switch flow is
 * test.fixme. Retained for a future multi-org persona. `set_active_org` + a full
 * reload to /command-center is the mechanism.
 */
export async function switchTenant(page: Page, targetOrgName: string) {
  const switcher = page.locator("aside button", { hasText: /tenant$/ }).first();
  await switcher.click();
  await page.getByRole("button", { name: new RegExp(targetOrgName, "i") }).first().click();
  await page.waitForURL(/\/command-center/, { timeout: 20_000 });
}
