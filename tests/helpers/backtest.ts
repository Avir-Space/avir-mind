import { expect, type Page } from "@playwright/test";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnonClientAs } from "./supabase";

export const SAMPLE_CSV = join(process.cwd(), "tests/fixtures/sample-backtest.csv");

/** A seeded backtest project by name (RLS-scoped as owner). */
export async function getBacktestProjectByName(name: string, client?: SupabaseClient) {
  const c = client ?? (await getAnonClientAs("owner"));
  const { data } = await c
    .from("backtest_projects")
    .select("id, project_name, status, customer_organization_name")
    .ilike("project_name", `%${name}%`)
    .limit(1);
  return data?.[0] ?? null;
}

/** Create a project via the RPC (fast setup path). Returns the new project id. */
export async function createBacktestProjectViaRpc(
  client: SupabaseClient,
  attrs: {
    project_name: string;
    customer_organization_name?: string | null;
    purpose?: string;
    data_period_start?: string | null;
    data_period_end?: string | null;
  },
): Promise<string> {
  const { data, error } = await client.rpc("create_backtest_project", { p: attrs });
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Create a project through the /backtest/new form. Returns the id from the redirect URL. */
export async function createBacktestProjectViaUI(
  page: Page,
  opts: { name: string; customer?: string; start?: string; end?: string },
): Promise<string> {
  await page.goto("/backtest/new");
  await page.getByPlaceholder("e.g. Northstar Air — 90-Day Evaluation").fill(opts.name);
  if (opts.customer) await page.getByPlaceholder("Prospect name").fill(opts.customer);
  const dates = page.locator('input[type="date"]');
  if (opts.start) await dates.nth(0).fill(opts.start);
  if (opts.end) await dates.nth(1).fill(opts.end);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/backtest\/[0-9a-f-]{36}/, { timeout: 20_000 });
  return page.url().split("/backtest/")[1].split(/[/?#]/)[0];
}

/**
 * Upload the sample CSV on a project's Data Sources tab. The default source type
 * is `csv_component_events`, which matches the fixture. Setting the hidden file
 * input fires the ingest edge function directly.
 */
export async function ingestSampleCSV(page: Page, projectId: string) {
  await page.goto(`/backtest/${projectId}`);
  await page.getByRole("tab", { name: "Data Sources" }).click();
  await page.locator('input[type="file"]').setInputFiles(SAMPLE_CSV);
  await expect(page.getByText("Ingested").first()).toBeVisible({ timeout: 30_000 });
}

/** Execute a backtest via the Run tab and wait for synchronous completion. */
export async function runBacktest(page: Page, projectId: string) {
  await page.goto(`/backtest/${projectId}`);
  await page.getByRole("tab", { name: "Run", exact: true }).click();
  const btn = page.getByRole("button", { name: "Execute backtest" });
  await expect(btn).toBeVisible({ timeout: 20_000 });
  await btn.click();
  await expect(page.getByText("Backtest complete").first()).toBeVisible({ timeout: 60_000 });
}
