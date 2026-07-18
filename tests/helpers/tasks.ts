import { expect, type Page } from "@playwright/test";

/** On a task detail page: add a comment via the Comments tab composer. */
export async function addComment(page: Page, text: string) {
  await page.getByRole("tab", { name: "Comments" }).click();
  await page.getByPlaceholder("Add a comment…").fill(text);
  await page.getByRole("button", { name: "Comment" }).click();
}

/** On a task detail page: log work via the Work Logs tab (minutes + description). */
export async function logWork(page: Page, minutes: number, description: string) {
  await page.getByRole("tab", { name: "Work Logs" }).click();
  await page.locator("#wl-min").fill(String(minutes));
  await page.locator("#wl-desc").fill(description);
  await page.getByRole("button", { name: "Log", exact: true }).click();
}

/**
 * With a signal's Create Task dialog reachable (signal detail page / aircraft
 * Signals tab), open it, apply overrides, and submit. Returns the title used so
 * the caller can assert the created task by name.
 */
export async function createTaskFromSignal(
  page: Page,
  overrides: { title?: string } = {},
): Promise<string> {
  const openBtn = page.getByRole("button", { name: "Create Task" }).first();
  await expect(openBtn).toBeVisible({ timeout: 30_000 }); // signal detail can render cold
  await openBtn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const titleInput = dialog.locator("#t-title");
  if (overrides.title !== undefined) await titleInput.fill(overrides.title);
  const title = await titleInput.inputValue();
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  return title;
}
