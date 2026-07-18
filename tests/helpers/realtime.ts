import { expect, type Browser, type Page } from "@playwright/test";

import { fleetColumn } from "./dragDrop";
import { signInAs } from "./auth";
import { type PersonaKey } from "../fixtures/personas";

/** Open two isolated browser contexts signed in as the same persona (for realtime tests). */
export async function twoContexts(browser: Browser, persona: PersonaKey): Promise<{ a: Page; b: Page; close: () => Promise<void> }> {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await signInAs(a, persona);
  await signInAs(b, persona);
  return { a, b, close: async () => { await ctxA.close(); await ctxB.close(); } };
}

/** Poll a selector until it contains the expected text (for realtime propagation). */
export async function waitForRealtimeUpdate(page: Page, selector: string, expectedText: string, timeoutMs = 5000) {
  await expect(page.locator(selector).filter({ hasText: expectedText })).toBeVisible({ timeout: timeoutMs });
}

/**
 * On the Fleet board (page B), wait for an aircraft (by tail) to appear inside a
 * given column — used to assert a state change made in page A propagated over
 * realtime (fleet-board query invalidation → refetch).
 */
export async function expectAircraftStateChangeInOtherBrowser(
  pageB: Page,
  tail: string,
  columnLabel: string,
  timeoutMs = 5000,
) {
  await expect(
    fleetColumn(pageB, columnLabel).getByRole("link", { name: tail, exact: true }),
  ).toBeVisible({ timeout: timeoutMs });
}

/** On /signals (page B), wait for a task/signal title to appear in the queue. */
export async function expectSignalToAppearInOtherBrowser(
  pageB: Page,
  title: string,
  timeoutMs = 5000,
) {
  await expect(pageB.getByText(title, { exact: false }).first()).toBeVisible({ timeout: timeoutMs });
}
