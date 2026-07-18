import { expect, type Page } from "@playwright/test";

import { getPersona, type PersonaKey } from "../fixtures/personas";

/** Complete the password sign-in flow and land in the app. */
export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Sign in as a persona and wait for the Command Center to render. */
export async function signInAs(page: Page, key: PersonaKey) {
  const p = getPersona(key);
  await signIn(page, p.email, p.password);
  await page.waitForURL("**/command-center", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible({ timeout: 20_000 });
}

/** Sign out via the sidebar and return to /login. */
export async function signOut(page: Page) {
  const btn = page.getByRole("button", { name: "Sign out" });
  await btn.first().click();
  await page.waitForURL("**/login", { timeout: 20_000 });
}

/** Returns whether the login error banner is showing (invalid credentials, etc.). */
export async function loginError(page: Page): Promise<string | null> {
  const el = page.locator("p.text-severity-critical");
  if (await el.count() === 0) return null;
  return (await el.first().textContent())?.trim() ?? null;
}
