import { expect, request as apiRequest, test, type APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { signInAs } from "../helpers/auth";
import { apiBase, createApiKey, expectRateLimit, fetchApi } from "../helpers/api";
import { getSlaMeasurements, notifyCustomerFromWorkPackage } from "../helpers/mro";
import { attemptTamperIndex, countActivatableComputations, getIndexDefinitions } from "../helpers/index";
import { getAnonClientAs } from "../helpers/supabase";

/**
 * Module 8 — MRO, Public API/SDK & AVIR Index.
 *
 * Notable spec↔app deltas (see handback + tests/README.md):
 * - Tenant switcher renders only when a user belongs to >1 org. The seeded
 *   single-org personas never see it → 8.1.1 / 8.1.2 fixme; MRO nav is proven via
 *   mro_owner (8.1.3).
 * - Org names: "Laman Operations" (operator) / "AVIR MRO Demo" (mro).
 * - /customers list has no WIP/SLA columns (those live on the detail page).
 * - API keys are `avir_live_<hex>` (NOT sk_…); scopes are read:/write:<resource>.
 *   The public API is a Supabase edge function (`.../functions/v1/api-v1/v1/*`),
 *   not a Next.js /v1 route.
 * - notify_customer sets work_package_findings.customer_notified + inserts a draft
 *   customer_reports row; it does NOT emit notification_events.
 * - SLA credit = $250 per point below the 90% target (compute_sla_performance),
 *   not the spec's min(annual*0.02, breach_days*rate).
 * - Index: 8 definitions, all below-threshold with demo data → nothing publishable
 *   / publicly visible. Immutability = absent RLS write policy (0 rows, no error).
 *   Public /avir-index 404s by default; /embed/index/<code> returns 200.
 */

let owner: SupabaseClient;
let mro: SupabaseClient;
let apiUp = false;
let apiCtx: APIRequestContext;

test.beforeAll(async () => {
  owner = await getAnonClientAs("owner");
  mro = await getAnonClientAs("mro_owner");
  // Probe the public API gateway (edge function) once; gate live-endpoint tests.
  apiCtx = await apiRequest.newContext();
  try {
    const { base, anon } = apiBase();
    const res = await apiCtx.get(`${base}/signals`, { headers: { apikey: anon } });
    apiUp = [200, 401, 403].includes(res.status()); // reachable gateway (401 = no key)
  } catch {
    apiUp = false;
  }
});

test.afterAll(async () => {
  await apiCtx?.dispose();
});

// ── 8.1 Tenant switching operator ↔ MRO ──────────────────────────────────────
test.describe("8.1 Tenant + MRO nav", () => {
  test.fixme("8.1.1 owner sees a tenant switcher", async () => {
    // The switcher only renders when orgs.length > 1. Seeded owner@ belongs to a
    // single org, so it's hidden. Multi-org test personas would be needed.
  });

  test.fixme("8.1.2 switch to MRO tenant changes the nav", async () => {
    // Depends on the (hidden) switcher above. set_active_org + reload is the
    // mechanism; MRO nav is asserted directly via mro_owner in 8.1.3 instead.
  });

  test("8.1.3 mro_owner lands MRO-scoped with MRO nav", async ({ page }) => {
    await signInAs(page, "mro_owner"); // MRO persona still lands on /command-center
    for (const item of ["Customers", "Contracts", "Shop Floor", "Work Packages"]) {
      await expect(page.getByRole("link", { name: item, exact: true }).first()).toBeVisible({ timeout: 20_000 });
    }
    // Operator-only surfaces are hidden for the MRO business model.
    await expect(page.getByRole("link", { name: "Fleet", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Crew", exact: true })).toHaveCount(0);
  });
});

// ── 8.2 Customer / contract / work package lifecycle ─────────────────────────
test.describe("8.2 MRO lifecycle", () => {
  test("8.2.1 /customers renders customer accounts", async ({ page }) => {
    await signInAs(page, "mro_owner");
    await page.goto("/customers");
    await expect(page.getByRole("heading", { name: "Customers", level: 1 })).toBeVisible({ timeout: 20_000 });
    for (const h of ["Customer", "Code", "Type", "Status", "Contracts"]) {
      await expect(page.getByRole("columnheader", { name: h, exact: true }).first()).toBeVisible();
    }
    await expect.poll(async () => page.locator("tbody tr").count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  });

  test("8.2.2 customer detail shows contracts + work packages tabs", async ({ page }) => {
    const { data } = await mro.from("customer_accounts").select("id").limit(1);
    test.skip(!data || data.length === 0, "no MRO customer seeded");
    await signInAs(page, "mro_owner");
    await page.goto(`/customers/${data![0]!.id}`);
    for (const t of ["Contracts", "Aircraft", "Work Packages", "SLA", "Reports"]) {
      await expect(page.getByRole("tab", { name: t })).toBeVisible({ timeout: 20_000 });
    }
  });

  test("8.2.3 work package findings render", async ({ page }) => {
    const { data } = await mro
      .from("work_package_findings")
      .select("work_package_id, severity")
      .limit(1);
    test.skip(!data || data.length === 0, "no work package findings seeded");
    await signInAs(page, "mro_owner");
    await page.goto(`/work-packages/${data![0]!.work_package_id}`);
    await page.getByRole("tab", { name: /^Findings/ }).click();
    // Seed findings carry a severity (minor|moderate|major|critical).
    await expect(page.getByText(/minor|moderate|major|critical/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("8.2.4 findings → notify customer", async ({ page }) => {
    const { data } = await mro
      .from("work_package_findings")
      .select("id, work_package_id, customer_notified")
      .eq("customer_notified", false)
      .limit(1);
    test.skip(!data || data.length === 0, "no un-notified finding to notify");
    const findingId = data![0]!.id as string;
    const wpId = data![0]!.work_package_id as string;
    const reportsBefore = (await mro.from("customer_reports").select("*", { count: "exact", head: true })).count ?? 0;
    await signInAs(page, "mro_owner");
    await notifyCustomerFromWorkPackage(page, wpId);
    // DEVIATION: sets customer_notified + inserts a draft customer_reports row
    // (NOT a notification_events row).
    await expect
      .poll(async () => (await mro.from("work_package_findings").select("customer_notified").eq("id", findingId)).data?.[0]?.customer_notified, { timeout: 15_000 })
      .toBe(true);
    expect((await mro.from("customer_reports").select("*", { count: "exact", head: true })).count ?? 0).toBeGreaterThan(reportsBefore);
  });

  test("8.2.5 work package status transition updates the record", async ({ page }) => {
    const { data } = await mro.from("work_packages").select("id, status").limit(1);
    test.skip(!data || data.length === 0, "no MRO work package seeded");
    const wp = data![0]!;
    const original = String(wp.status);
    const target = original === "held" ? "planned" : "held"; // avoid in_progress/complete side-effect timestamps
    const targetLabel = target === "held" ? "Held" : "Planned";
    await signInAs(page, "mro_owner");
    await page.goto(`/work-packages/${wp.id}`);
    await expect(page.getByRole("combobox").first()).toBeVisible({ timeout: 20_000 });
    try {
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: targetLabel, exact: true }).click();
      await expect(page.getByText("Status updated").first()).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => {
          const { data: d2 } = await mro.from("work_packages").select("status").eq("id", wp.id).single();
          return d2?.status;
        }, { timeout: 10_000 })
        .toBe(target);
    } finally {
      await mro.rpc("transition_work_package_status", { p_id: wp.id, p_status: original });
    }
  });

  test("8.2.6 record a finding on a work package", async ({ page }) => {
    const { data } = await mro.from("work_packages").select("id").limit(1);
    test.skip(!data || data.length === 0, "no MRO work package seeded");
    const wpId = data![0]!.id as string;
    const before = (await mro.from("work_package_findings").select("*", { count: "exact", head: true }).eq("work_package_id", wpId)).count ?? 0;
    await signInAs(page, "mro_owner");
    await page.goto(`/work-packages/${wpId}`);
    await page.getByRole("button", { name: "Finding" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Record finding")).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "damage found" }).click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "major", exact: true }).click();
    const desc = `E2E finding ${Date.now()}`;
    await dialog.getByPlaceholder("What was found").fill(desc);
    await dialog.getByRole("button", { name: "Record" }).click();
    await expect(page.getByText("Finding recorded").first()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await mro.from("work_package_findings").select("*", { count: "exact", head: true }).eq("work_package_id", wpId)).count ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(before);
  });
});

// ── 8.3 SLA measurements ─────────────────────────────────────────────────────
test.describe("8.3 SLA", () => {
  test("8.3.1 SLA section renders on a customer detail", async ({ page }) => {
    const { data } = await mro.from("sla_measurements").select("customer_account_id").limit(1);
    test.skip(!data || data.length === 0, "no SLA measurements seeded");
    const customerId = data![0]!.customer_account_id as string;
    await signInAs(page, "mro_owner");
    await page.goto(`/customers/${customerId}`);
    await page.getByRole("tab", { name: "SLA" }).click();
    expect((await getSlaMeasurements(customerId, mro)).length).toBeGreaterThanOrEqual(1);
  });

  test("8.3.2 SLA credit is computed against the 90% target", async () => {
    const { data: any1 } = await mro.from("sla_measurements").select("customer_account_id").limit(1);
    test.skip(!any1 || any1.length === 0, "no SLA measurements seeded");
    const rows = await getSlaMeasurements(any1![0]!.customer_account_id as string, mro);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // DEVIATION from spec formula: credits_owed_usd = $250 per point below 90%.
    for (const r of rows) {
      const perf = r.performance_pct == null ? null : Number(r.performance_pct);
      const credit = Number(r.credits_owed_usd ?? 0);
      expect(credit).toBeGreaterThanOrEqual(0);
      if (perf != null && perf < 90) expect(credit).toBeGreaterThan(0);
    }
  });

  test("8.3.3 Compute SLA on a contract creates a new SLA measurement", async ({ page }) => {
    const { data } = await mro.from("service_contracts").select("id").limit(1);
    test.skip(!data || data.length === 0, "no MRO contract seeded");
    const contractId = data![0]!.id as string;
    const before = (await mro.from("sla_measurements").select("*", { count: "exact", head: true }).eq("service_contract_id", contractId)).count ?? 0;
    await signInAs(page, "mro_owner");
    await page.goto(`/contracts/${contractId}`);
    await page.getByRole("button", { name: "Compute SLA" }).click();
    await expect(page.getByText("SLA computed").first()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await mro.from("sla_measurements").select("*", { count: "exact", head: true }).eq("service_contract_id", contractId)).count ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(before);
  });
});

// ── 8.4 Public API v1 ────────────────────────────────────────────────────────
test.describe("8.4 Public API", () => {
  test("8.4.1 create an API key (shown once)", async ({ page }) => {
    const name = `E2E Key ${Date.now()}`;
    await signInAs(page, "owner");
    await page.goto("/settings/api-keys");
    await page.getByRole("button", { name: "New key" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("e.g. Production integration").fill(name);
    await dialog.getByRole("button", { name: "Create key" }).click();
    await expect(dialog.getByText("Copy your API key now")).toBeVisible({ timeout: 15_000 });
    // DEVIATION: key format is avir_live_<hex>, not sk_….
    await expect(dialog.getByText(/avir_live_[0-9a-f]+/)).toBeVisible();
    const { data } = await owner.from("api_keys").select("id, key_prefix, key_name").eq("key_name", name);
    expect((data ?? []).length).toBe(1);
    expect(String(data![0]!.key_prefix)).toMatch(/^avir_live_/);
  });

  test("8.4.2 GET /v1/signals with a valid key returns 200 + rate-limit headers", async ({ request }) => {
    test.skip(!apiUp, "public API gateway (api-v1 edge function) not reachable");
    const key = await createApiKey(owner, `e2e-read-${Date.now()}`, ["read:signals"], 60);
    const res = await fetchApi(request, "/signals", key.api_key);
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h["x-ratelimit-limit"]).toBeTruthy();
    expect(h["x-request-id"]).toBeTruthy();
    const body = await res.json();
    expect(body).toBeTruthy(); // signals payload
  });

  test("8.4.3 an invalid key returns 401", async ({ request }) => {
    test.skip(!apiUp, "public API gateway not reachable");
    const res = await fetchApi(request, "/signals", "avir_live_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    expect(res.status()).toBe(401);
  });

  test("8.4.4 a missing scope returns 403 insufficient_scope", async ({ request }) => {
    test.skip(!apiUp, "public API gateway not reachable");
    const key = await createApiKey(owner, `e2e-noscope-${Date.now()}`, ["read:signals"], 60);
    const res = await fetchApi(request, "/tasks", key.api_key, {
      method: "POST",
      body: { aircraft_id: "x", title: "x", parent_type: "powerplant", sub_type: "engine_borescope" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("insufficient_scope");
  });

  test("8.4.5 exceeding the rate limit returns 429 + Retry-After", async ({ request }) => {
    test.skip(!apiUp, "public API gateway not reachable");
    const key = await createApiKey(owner, `e2e-rate-${Date.now()}`, ["read:signals"], 3);
    const limited = await expectRateLimit(request, "/signals", key.api_key, 10);
    expect(limited).not.toBeNull();
    expect(limited!.status()).toBe(429);
    expect(limited!.headers()["retry-after"]).toBeTruthy();
  });

  test("8.4.6 GET /v1/aircraft and /v1/tasks return 200 with matching read scopes", async ({ request }) => {
    test.skip(!apiUp, "public API gateway not reachable");
    const key = await createApiKey(owner, `e2e-multiscope-${Date.now()}`, ["read:aircraft", "read:tasks"], 60);
    const aircraftRes = await fetchApi(request, "/aircraft", key.api_key);
    expect(aircraftRes.status()).toBe(200);
    expect(Array.isArray((await aircraftRes.json()).data)).toBe(true);
    const tasksRes = await fetchApi(request, "/tasks", key.api_key);
    expect(tasksRes.status()).toBe(200);
    expect(Array.isArray((await tasksRes.json()).data)).toBe(true);
  });
});

// ── 8.5 AVIR Index ───────────────────────────────────────────────────────────
test.describe("8.5 AVIR Index", () => {
  test("8.5.1 /admin/index renders the founder preview (8 definitions)", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/admin/index");
    await expect(page.getByRole("heading", { name: /AVIR Index/, level: 1 })).toBeVisible({ timeout: 20_000 });
    expect((await getIndexDefinitions(owner)).length).toBe(8);
  });

  test("8.5.2 below-threshold indices are gated (nothing activatable)", async ({ page }) => {
    // Demo data: only 2 consenting tenants vs a 5-tenant minimum → all 8 gated.
    expect(await countActivatableComputations(owner)).toBe(0);
    await signInAs(page, "owner");
    await page.goto("/admin/index");
    await expect(page.getByRole("heading", { name: /AVIR Index/, level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /Activate/ })).toHaveCount(0); // no publishable index
  });

  test("8.5.3 correction-chain publications are immutable to authenticated writes", async () => {
    const { data } = await owner.from("index_publications").select("id").limit(1);
    test.skip(!data || data.length === 0, "no published index in the test env");
    const { updated, deleted } = await attemptTamperIndex(owner, data![0]!.id as string);
    expect(updated).toBe(0); // absent UPDATE/DELETE policy → 0 rows, no error
    expect(deleted).toBe(0);
  });

  test("8.5.4 public /avir-index returns 404 by default", async ({ request }) => {
    const res = await request.get("/avir-index");
    expect(res.status()).toBe(404); // nothing publicly visible + published yet
  });

  test("8.5.5 embed widget renders 'not yet published' + Powered by AVIR", async ({ request }) => {
    const res = await request.get("/embed/index/AVIR_RELIABILITY");
    expect(res.status()).toBe(200); // embed always 200
    const body = await res.text();
    expect(body).toContain("not yet published");
    expect(body).toContain("Powered by AVIR");
  });

  test("8.5.6 publish page shows a below-threshold banner for a gated computation", async ({ page }) => {
    const { data } = await owner.from("index_computations").select("id").eq("meets_minimum_threshold", false).limit(1);
    test.skip(!data || data.length === 0, "no gated index computation seeded");
    await signInAs(page, "owner");
    await page.goto(`/admin/index/publish/${data![0]!.id}`);
    await expect(page.getByText(/below the minimum participating-tenant threshold/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Confirm & publish" })).toHaveCount(0);
  });
});

// ── 8.6 Shop Floor ────────────────────────────────────────────────────────────
test.describe("8.6 Shop Floor", () => {
  test("8.6.1 /shop-floor renders the board for mro_owner", async ({ page }) => {
    await signInAs(page, "mro_owner");
    await page.goto("/shop-floor");
    await expect(page.getByRole("heading", { name: "Shop Floor", level: 1 })).toBeVisible({ timeout: 20_000 });
    const empty = page.getByText("No aircraft in service. Assign a customer aircraft to get started.");
    if ((await empty.count()) > 0) {
      await expect(empty).toBeVisible();
    } else {
      for (const label of ["Arrived", "In Service", "Awaiting Parts", "Awaiting Customer", "Ready for Release"]) {
        await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      }
    }
  });
});

// ── 8.x deferred (enterprise-tier) ───────────────────────────────────────────
test.describe("8.x deferred (enterprise-tier)", () => {
  test.fixme("cross-tenant genealogy / SSO SAML with real IdP / Index publish with real participation / anonymous embed CSP", async () => {
    // Cross-tenant genealogy verification, full SAML SSO round-trip with a real IdP,
    // publishing an AVIR Index with real cross-tenant participation, and anonymous
    // public embed CSP verification are all enterprise/procurement-stage. Deferred.
  });
});
