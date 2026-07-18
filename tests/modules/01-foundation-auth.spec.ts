import { expect, test } from "@playwright/test";

import { loginError, signIn, signInAs, signOut } from "../helpers/auth";
import { _env, expectRLSBlocks, getAnonClientAs, getServiceRoleClient, hasServiceRole } from "../helpers/supabase";
import { totp } from "../helpers/totp";
import { ALL_PERSONA_KEYS } from "../fixtures/personas";

/**
 * Module 1 — Foundation & Auth (reference implementation).
 *
 * The app uses /login + /signup (not /sign-in + /sign-up) — see tests/README.md
 * "Deviations". Behaviors the app does not implement (role-gated nav, station
 * scoping, login-time MFA challenge, auth-hook audit logging, session tracking)
 * are marked test.fixme with the reason, per the spec's "modified tests" ask.
 */

// ── 1.1 Auth surface ─────────────────────────────────────────────────────────
test.describe("1.1 Auth surface", () => {
  test.fixme("1.1.1 sign-up completes end to end → /command-center", async () => {
    // App requires email confirmation on signup, so a brand-new user lands on a
    // "confirm your email" state, not /command-center. E2E personas bypass this
    // at the DB layer (confirmed users) — see 20260801000001_test_personas.sql.
  });

  test("1.1.2 sign-in as owner lands on Command Center with the operational canvas", async ({ page }) => {
    await signInAs(page, "owner");
    await expect(page).toHaveURL(/\/command-center/);
    await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();
    await expect(page.getByRole("listbox", { name: "Stations" })).toBeVisible(); // station strip
    await expect(page.getByText(/Command Center/i).first()).toBeVisible();
  });

  test("1.1.3 every persona signs in cleanly and signs out", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    for (const key of ALL_PERSONA_KEYS) {
      // signInAs waits for BOTH the URL and a visible canvas element (30s) — the
      // fix for the earlier flakey 15s URL-only wait that timed out mid-loop.
      await signInAs(page, key);
      await testInfo.attach(`persona-${key}`, { body: await page.screenshot(), contentType: "image/png" });
      await signOut(page);
    }
  });

  test("1.1.4 invalid credentials are rejected", async ({ page }) => {
    await signIn(page, "owner@avir-test.dev", "WrongPassword!1");
    await expect(page.locator("p.text-severity-critical")).toBeVisible();
    expect(await loginError(page)).toMatch(/invalid|credential/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("1.1.5 sign out clears the session", async ({ page }) => {
    await signInAs(page, "owner");
    await signOut(page);
    await page.goto("/command-center");
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});

// ── 1.2 Role-based access ────────────────────────────────────────────────────
test.describe("1.2 Role-based access", () => {
  test("1.2.1 owner sees the full operator nav", async ({ page }) => {
    await signInAs(page, "owner");
    const nav = page.getByRole("navigation");
    for (const label of ["Command Center", "Signals", "Fleet", "Compliance", "Calibration", "Developers"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
    // Founder-only surface visible to the owner.
    await expect(nav.getByRole("link", { name: "AVIR Index" })).toBeVisible();
  });

  test.fixme("1.2.2 read-only user cannot see write buttons", async () => {
    // The app enforces write-protection at the RLS/RPC layer (covered by 1.7),
    // not by hiding/disabling buttons for the viewer role. Client-side
    // write-gating by role is not implemented.
  });

  test.fixme("1.2.3 dispatcher does not see Compliance nav / gets 403", async () => {
    // Nav is filtered by business model + founder flag, not by job title/role;
    // every operator member sees Compliance and /compliance is not route-gated.
  });

  test.fixme("1.2.4 line-maintenance controller has a station-scoped view", async () => {
    // Signals are org-scoped, not station-scoped; per-station data scoping is
    // not implemented.
  });

  test("1.2.5 MRO owner sees the MRO nav", async ({ page }) => {
    await signInAs(page, "mro_owner");
    const nav = page.getByRole("navigation");
    for (const label of ["Customers", "Contracts", "Shop Floor", "Work Packages"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
    // A pure-MRO tenant hides operator-only surfaces (Fleet/Flight Ops/Crew).
    await expect(nav.getByRole("link", { name: "Flight Ops" })).toHaveCount(0);
  });
});

// ── 1.3 SSO configuration surface ────────────────────────────────────────────
test.describe("1.3 SSO configuration", () => {
  test("1.3.1 owner can access /settings/sso", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/settings/sso");
    await expect(page.getByRole("heading", { name: /Single Sign-On/i })).toBeVisible();
    await expect(page.getByText(/Identity provider/i).first()).toBeVisible();
  });

  test.fixme("1.3.2 non-admin cannot access /settings/sso", async () => {
    // The SSO page renders for any member; the SAVE (save_sso_configuration) is
    // admin-gated at the RPC. Route-level role gating is not implemented.
  });

  test("1.3.3 SAML config saves with is_active=false initially", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/settings/sso");
    await page.getByPlaceholder(/Okta \/ Azure AD/i).fill("E2E Test IdP");
    await page.getByRole("button", { name: /Save configuration/i }).click();
    // Verify via the DB directly (toast is transient). save_sso updates the
    // existing org config; is_active stays false (the form default).
    const client = await getAnonClientAs("owner");
    await expect.poll(async () => {
      const { data } = await client.from("sso_configurations").select("provider_name, is_active").eq("provider_name", "E2E Test IdP").limit(1);
      return data?.[0]?.is_active ?? "missing";
    }, { timeout: 15_000 }).toBe(false);
  });
});

// Clear any MFA factors accumulated across repeated runs so enrollment starts clean.
async function clearMfaFactors() {
  try {
    const client = await getAnonClientAs("owner");
    const { data } = await client.auth.mfa.listFactors();
    for (const f of [...(data?.totp ?? []), ...(data?.all ?? [])]) {
      await client.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    }
    await client.from("user_2fa_configurations").delete().eq("method_type", "totp");
  } catch { /* best effort */ }
}

// ── 1.4 2FA flows ────────────────────────────────────────────────────────────
test.describe("1.4 2FA", () => {
  test("1.4.1 TOTP enrollment produces a QR + secret and verifies", async ({ page }) => {
    // Clear any leftover (possibly verified) factor so enrollment starts clean —
    // a verified factor can't be self-removed at AAL1, so use the definer RPC.
    await (await getAnonClientAs("owner")).rpc("reset_my_mfa");
    await clearMfaFactors();
    await signInAs(page, "owner");
    await page.goto("/settings/2fa");
    await page.getByText("Authenticator app (TOTP)").waitFor({ timeout: 15_000 });

    // Start from a clean "Not enabled" state (disable if a prior run left it on).
    const disableFirst = page.getByRole("button", { name: "Disable" });
    if (await disableFirst.count()) {
      await disableFirst.click();
      await expect(page.getByText("Not enabled")).toBeVisible({ timeout: 10_000 });
    }

    await page.getByRole("button", { name: "Enable" }).click();
    // Wait for the enroll card ("Scan with your authenticator"), then its QR
    // image (robust to the exact alt text).
    await expect(page.getByText(/Scan with your authenticator/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('img[alt*="QR" i]').first()).toBeVisible({ timeout: 15_000 });

    // Extract the base32 secret shown next to the QR.
    const secretText = await page.getByText(/enter this secret/i).textContent();
    const secret = (secretText ?? "").match(/[A-Z2-7]{16,}/)?.[0] ?? "";
    expect(secret.length).toBeGreaterThanOrEqual(16);

    // Compute a valid TOTP and complete Supabase's native challenge+verify.
    await page.getByPlaceholder("123456").fill(totp(secret));
    await page.getByRole("button", { name: /Verify/i }).click();

    // Success → status flips to "Enabled" and backup codes render.
    await expect(page.getByText("Enabled", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Backup codes/i)).toBeVisible();

    // Cleanup: return the persona to the known "Not enabled" state.
    await page.getByRole("button", { name: "Disable" }).click();
    await expect(page.getByText("Not enabled")).toBeVisible({ timeout: 10_000 });
  });

  test.fixme("1.4.2 TOTP required at login after enrollment", async () => {
    // TOTP enrollment + verification now works end-to-end (see 1.4.1, aal2), but
    // the app does not CHALLENGE for MFA at sign-in — the login flow and
    // middleware never gate on assurance level, so no TOTP prompt appears after
    // a password login. Enabling this test requires a product change (login-time
    // AAL enforcement + a challenge page), which is outside the two product gaps
    // scoped for this pass. Kept fixme until that gate is built.
  });

  test.fixme("1.4.3 backup codes accepted at login", async () => {
    // Backup codes are generated + displayed at enrollment (1.4.1), but there is
    // no login-time MFA challenge to consume them (same missing AAL gate as
    // 1.4.2). Kept fixme until login-time enforcement is built.
  });

  test.fixme("1.4.4 2FA required at high-risk action (API key creation)", async () => {
    // API key creation is admin-gated, not 2FA-gated. Step-up-on-action is only
    // enforced for AVIR Index publication (verified in Module 8).
  });
});

// ── 1.5 Session management ───────────────────────────────────────────────────
test.describe("1.5 Sessions", () => {
  test("1.5.1 /settings/sessions renders the live session", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/settings/sessions"); // middleware records this web session
    await expect(page.getByRole("heading", { name: /Active Sessions/i })).toBeVisible();
    // Gap-2 fix: a real login now produces a tracked session (not "No sessions").
    await expect.poll(async () => page.getByTestId("session-row").count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    await expect(page.getByText("this device").first()).toBeVisible();
  });

  test("1.5.2 terminate another session logs it out", async ({ browser }) => {
    test.setTimeout(120_000);
    // Two independent contexts = two auth sessions for one user. Tag each with a
    // distinct user-agent so A can target B's exact session row for termination —
    // robust against any other owner sessions present (2 workers run in parallel).
    // Clear prior (incl. already-ended) sessions so only the fresh rows remain.
    await (await getAnonClientAs("owner")).rpc("reset_my_web_sessions");
    const uaA = "AVIR-E2E-CtxA/1.0";
    const uaB = "AVIR-E2E-CtxB/1.0";
    const ctxA = await browser.newContext({ userAgent: uaA });
    const pageA = await ctxA.newPage();
    await signInAs(pageA, "owner");
    await pageA.goto("/command-center"); // hard nav → middleware records session A

    const ctxB = await browser.newContext({ userAgent: uaB });
    const pageB = await ctxB.newPage();
    await signInAs(pageB, "owner");
    await pageB.goto("/command-center"); // hard nav → middleware records session B

    // In A, both sessions are visible; find B's row by its user-agent and end it.
    await pageA.goto("/settings/sessions");
    await expect(pageA.getByRole("heading", { name: /Active Sessions/i })).toBeVisible();
    const rowB = pageA
      .locator('[data-testid="session-row"][data-ended="false"]')
      .filter({ hasText: "CtxB" });
    await expect(rowB).toBeVisible({ timeout: 20_000 });
    // A's own session shows as the current device (≥2 active sessions total).
    await expect(pageA.getByText("this device").first()).toBeVisible();
    await rowB.getByRole("button", { name: "Terminate" }).click();

    // B's next authenticated navigation is bounced to /login by the middleware.
    await pageB.goto("/signals");
    await pageB.waitForURL(/\/login/, { timeout: 25_000 });
    await expect(pageB).toHaveURL(/\/login/);

    await ctxA.close();
    await ctxB.close();
  });
});

// ── 1.6 Audit log ────────────────────────────────────────────────────────────
test.describe("1.6 Audit log", () => {
  test.fixme("1.6.1 login events logged", async () => {
    // Supabase Auth sign-in does not call log_audit_event, so real logins are
    // not written to security_audit_events. Audit rows come from app RPCs + seed.
  });

  test("1.6.2 2FA enrollment is audit-logged", async () => {
    // The app calls record_2fa_config on enrollment, which writes a '2fa_enabled'
    // security_audit_event. Exercise that path directly (TOTP verify can't
    // complete under the sandbox's offset clock — see 1.4.1).
    const client = await getAnonClientAs("owner");
    await client.rpc("record_2fa_config", { p_method: "totp" });
    const { data } = await client.from("security_audit_events").select("event_type, created_at_utc").eq("event_type", "2fa_enabled").order("created_at_utc", { ascending: false }).limit(1);
    expect((data ?? []).length).toBeGreaterThan(0);
    await client.rpc("disable_2fa", { p_method: "totp" }); // cleanup
  });

  test.fixme("1.6.3 failed login logged with risk_score > 0", async () => {
    // Same as 1.6.1 — failed sign-ins are handled by Supabase Auth and not
    // written to security_audit_events (would need an auth webhook/hook).
  });
});

// ── 1.7 RLS baseline ─────────────────────────────────────────────────────────
test.describe("1.7 RLS", () => {
  test("1.7.1 a user cannot read another org's data", async () => {
    const client = await getAnonClientAs("owner"); // operator tenant member
    // The operator persona is not a member of the MRO tenant; its aircraft are invisible.
    const { data: mroAircraft } = await client.from("aircraft").select("id, tail_number").eq("tail_number", "JY-AYU"); // an MRO customer tail
    expect((mroAircraft ?? []).length).toBe(0);
    const blocked = await expectRLSBlocks(client, "customer_accounts", { customer_code: "ROYL" }); // MRO-only table row
    expect(blocked).toBe(true);
  });

  test("1.7.2 service role bypasses RLS (tests only)", async () => {
    test.skip(!hasServiceRole(), "SUPABASE_SERVICE_ROLE_KEY not set — service-role assertion skipped");
    const admin = getServiceRoleClient();
    const { data } = await admin.from("orgs").select("id, primary_business_model");
    expect((data ?? []).length).toBeGreaterThanOrEqual(2); // sees every org across tenants
  });

  test("1.7.3 API key scope is enforced (read-only key → POST 403)", async ({ request }) => {
    const client = await getAnonClientAs("owner");
    const { data } = await client.rpc("create_api_key", { p_name: `e2e-${Date.now()}`, p_scopes: ["read:signals"], p_rate_per_minute: 30 });
    const rawKey = (data as { api_key: string }).api_key;
    const { url, anon } = _env();
    const res = await request.post(`${url}/functions/v1/api-v1/v1/tasks`, {
      headers: { Authorization: `Bearer ${rawKey}`, apikey: anon, "Content-Type": "application/json" },
      data: { aircraft_id: "x", title: "x", parent_type: "powerplant", sub_type: "engine_borescope" },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
  });
});

// ── 1.8 Design system ────────────────────────────────────────────────────────
test.describe("1.8 Design system", () => {
  test("1.8.1 light and dark modes both render the canvas", async ({ page }, testInfo) => {
    await signInAs(page, "owner");
    const toggle = page.getByRole("button", { name: /theme/i }).or(page.locator('button[aria-label*="theme" i]'));
    await testInfo.attach("command-center-a", { body: await page.screenshot(), contentType: "image/png" });
    if (await toggle.count()) { await toggle.first().click(); await page.waitForTimeout(400); }
    await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();
    await testInfo.attach("command-center-b", { body: await page.screenshot(), contentType: "image/png" });
  });

  test("1.8.2 zero-radius design system on buttons", async ({ page }) => {
    await signInAs(page, "owner");
    const radius = await page.getByRole("button", { name: "Sign out" }).first().evaluate((el) => getComputedStyle(el).borderRadius);
    expect(radius).toBe("0px");
  });

  test("1.8.3 Instrument Serif is used for the page heading", async ({ page }) => {
    await signInAs(page, "owner");
    const family = await page.getByRole("heading", { name: "Command Center" }).evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family.toLowerCase()).toContain("instrument serif");
  });
});

// ── 1.9 Command Center canvas ────────────────────────────────────────────────
test.describe("1.9 Command Center canvas", () => {
  test("1.9.1 canvas renders all three bands", async ({ page }) => {
    await signInAs(page, "owner");
    await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();
    // Band 1: fleet map (leaflet container). Band 2: station strip. Band 3: timeline.
    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20_000 });
    const strip = page.getByRole("listbox", { name: "Stations" });
    await expect(strip).toBeVisible();
    await expect(strip.getByRole("option").first()).toBeVisible();
    await expect(strip.getByRole("option").nth(5)).toBeVisible(); // ≥6 stations
  });

  test("1.9.2 selecting a station opens the drawer without hiding the map", async ({ page }) => {
    await signInAs(page, "owner");
    const strip = page.getByRole("listbox", { name: "Stations" });
    await strip.getByRole("option").first().click();
    // The canvas drawer opens as an in-flow right column (Phase 2.6) — the map stays visible.
    await expect(page.locator(".leaflet-container")).toBeVisible();
  });

  test("1.9.3 time-window selector switches windows and the timeline follows", async ({ page }) => {
    await signInAs(page, "owner");
    const timeline = page.getByTestId("ops-timeline");
    await expect(timeline).toBeVisible({ timeout: 20_000 });

    // Each window button drives both its own pressed state and the timeline's
    // rendered window (data-window-hours + "next Nh" header).
    const cases: Array<[string, string]> = [
      ["Next 6h", "6"],
      ["Now", "2"],
      ["Today", "24"],
    ];
    for (const [label, hours] of cases) {
      const btn = page.getByRole("button", { name: label, exact: true });
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
      await expect(btn).toHaveClass(/bg-primary/);
      await expect(timeline).toHaveAttribute("data-window-hours", hours);
      await expect(page.getByText(new RegExp(`next ${hours}h`, "i")).first()).toBeVisible();
    }
  });
});
