import { expect, type Browser, type Page } from "@playwright/test";

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
