import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Fleet Kanban column container located by its header label. The column outer is
 * `div.flex.min-w-[280px].flex-1.flex-col`; we climb from the header text.
 */
export function fleetColumn(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"min-w-[280px]")][1]');
}

/** A Fleet Kanban aircraft card located by its tail number. */
export function fleetCard(page: Page, tail: string): Locator {
  return page.locator("div.select-none.bg-card").filter({ hasText: tail }).first();
}

/**
 * Drag a Fleet Kanban aircraft card (by tail) onto the target column.
 * @dnd-kit's PointerSensor has an 8px activation distance, so we press, nudge
 * >8px to arm the drag, move over the destination droppable in steps, then drop.
 */
export async function dragKanbanCard(page: Page, cardTail: string, toColumnLabel: string) {
  const card = fleetCard(page, cardTail);
  await card.scrollIntoViewIfNeeded(); // bring the source on-screen (columns are tall)
  const handle = card.getByRole("button", { name: "Drag aircraft" });
  const hb = await handle.boundingBox();
  if (!hb) throw new Error(`drag handle not found for card ${cardTail}`);
  const col = fleetColumn(page, toColumnLabel);
  const cb = await col.boundingBox();
  if (!cb) throw new Error(`fleet column not found: ${toColumnLabel}`);

  const cx = hb.x + hb.width / 2;
  const cy = hb.y + hb.height / 2;
  // Drop at the SAME (on-screen) vertical level as the source, shifted into the
  // destination column horizontally. Columns are full-height and side-by-side,
  // so this point is always inside the target droppable AND within the viewport
  // — avoiding the off-screen drops that a height-based offset produces.
  const tx = cb.x + cb.width / 2;
  const ty = cy;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 14, cy, { steps: 6 }); // exceed 8px → arm the drag
  await page.mouse.move(tx, ty, { steps: 20 });
  await page.mouse.move(tx, ty + 3, { steps: 4 }); // wiggle so dnd-kit computes `over`
  await page.waitForTimeout(250); // let collision detection settle
  await page.mouse.up();
}

/** Click a dialog's confirm button and wait for the dialog to close. */
export async function confirmModalAndWait(page: Page, buttonText = "Confirm") {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: buttonText }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}
