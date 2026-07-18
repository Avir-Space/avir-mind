import { expect, type Page } from "@playwright/test";

import { getAnonClientAs } from "./supabase";

/**
 * On a component detail page, record an event via the "Record Event" dialog.
 * The UI event Select renders values with underscores→spaces (e.g.
 * "cycle recorded"). There are no separate cycles/hours inputs — the RPC
 * auto-fills them from the component's current counters.
 */
export async function recordComponentEvent(
  page: Page,
  eventType: string,
  fields: { severity?: string; description?: string; cost?: string } = {},
) {
  await page.getByRole("button", { name: "Record Event" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // event-type Select (Radix): open, pick the underscore→space label.
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: eventType.replace(/_/g, " "), exact: true }).click();
  if (fields.severity) {
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: fields.severity, exact: true }).click();
  }
  if (fields.description) await dialog.locator("#evdesc").fill(fields.description);
  if (fields.cost) await dialog.locator("#evcost").fill(fields.cost);
  await dialog.getByRole("button", { name: "Record", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

/** Read a component's health_score (RLS-scoped as owner). */
export async function getComponentHealth(componentId: string): Promise<number | null> {
  const c = await getAnonClientAs("owner");
  const { data } = await c.from("components").select("health_score").eq("id", componentId).single();
  return (data?.health_score as number | null) ?? null;
}

/** Health band bounds actually used by the app (src/lib/design/components.ts). */
export function healthBand(score: number): "healthy" | "watch" | "degraded" | "critical" {
  if (score >= 75) return "healthy";
  if (score >= 50) return "watch";
  if (score >= 25) return "degraded";
  return "critical";
}

/**
 * Trigger a genealogy export from the Genealogy tab and capture the downloaded
 * file. `format` is the tile label ("JSON" / "Portable Bundle"). PDF is
 * print-to-PDF (no download) and is not supported here.
 */
export async function exportGenealogy(page: Page, format: "JSON" | "Portable Bundle") {
  await page.getByRole("button", { name: "Export Genealogy" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByText(format, { exact: true }).click();
  const dl = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Generate" }).click();
  return dl;
}

/** Verify a genealogy record array is a well-formed hash chain. */
export function verifyHashChain(records: { record_seq: number; content_hash: string; previous_record_hash: string | null }[]): boolean {
  const sorted = [...records].sort((a, b) => a.record_seq - b.record_seq);
  if (sorted.length === 0) return false;
  if (sorted[0]!.previous_record_hash != null) return false; // genesis links to nothing
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.previous_record_hash !== sorted[i - 1]!.content_hash) return false;
  }
  return true;
}
