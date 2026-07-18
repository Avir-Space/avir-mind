import { expect, type Locator, type Page } from "@playwright/test";

/** Read a numeric value from a /signals stats tile by its label. */
export async function readStatTile(page: Page, label: string): Promise<number> {
  const tile = page.locator("div").filter({ has: page.getByText(label, { exact: true }) }).last();
  const value = await tile.locator("p.font-mono").first().textContent();
  return parseInt((value ?? "").replace(/[^\d]/g, ""), 10) || 0;
}

export function getActiveSignalCount(page: Page): Promise<number> {
  return readStatTile(page, "Active Signals");
}

/** The open FilterDropdown panel (zero-radius menu that appears under a trigger). */
function openDropdownPanel(page: Page): Locator {
  return page.locator("div.absolute.z-50.w-60");
}

/** Open a FilterDropdown by its label, tick the given option labels, then close. */
async function applyDropdown(page: Page, triggerLabel: string, optionLabels: string[]) {
  await page.getByRole("button", { name: new RegExp(`^${triggerLabel}`, "i") }).first().click();
  const panel = openDropdownPanel(page);
  await expect(panel).toBeVisible();
  for (const opt of optionLabels) {
    await panel.getByRole("button", { name: opt, exact: true }).click();
  }
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
}

export function filterBySeverity(page: Page, severities: string[]) {
  return applyDropdown(page, "Severity", severities);
}

export function filterByCategory(page: Page, categories: string[]) {
  return applyDropdown(page, "Category", categories);
}

/** Clear every applied filter via the "Clear all" chip (only present when active). */
export async function clearAllFilters(page: Page) {
  const clear = page.getByRole("button", { name: "Clear all" });
  if (await clear.count()) await clear.first().click();
}

/** Toggle the ml-auto "Needs YOU" filter. */
export async function toggleNeedsYou(page: Page) {
  await page.getByRole("button", { name: "Needs YOU" }).first().click();
}

/** The /signals queue rows (rendered as TaskCards — the page shows the tasks queue). */
export function signalRows(page: Page): Locator {
  return page.locator("div.border.bg-card").filter({ has: page.getByRole("link") });
}
