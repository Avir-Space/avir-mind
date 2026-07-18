import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { signInAs } from "../helpers/auth";
import { getADStatus, countMelItems, rectifyFirstMel } from "../helpers/compliance";
import { getDecisionRecordCount, attemptTamper } from "../helpers/dsai";
import { getAnonClientAs } from "../helpers/supabase";

/**
 * Module 6 — Compliance, DS.AI & Calibration.
 *
 * Notable spec↔app deltas (see handback + tests/README.md):
 * - Compliance is `/compliance` with tabs ADs / Service Bulletins / MEL /
 *   Life-Limited Parts / Regulatory / DS.AI Audit. AD register columns are
 *   AD / Authority / Title / Deadline / Compliance (no days_remaining scalar).
 * - AD "detail" is a query-param master-detail (`/compliance/ads?ad=<id>`), not a
 *   path segment — there is no `/compliance/ads/[id]`.
 * - No "Defer New MEL" UI (defer_mel_item RPC exists but unwired) → 6.2.2 fixme.
 * - DS.AI is `/compliance/dsai` (no `/ds-ai` or `/dsai`).
 * - Immutability (ai_decision_records / human_oversight_events / calibration_events)
 *   is enforced by ABSENCE of an UPDATE/DELETE RLS policy: an authenticated write
 *   affects 0 rows and does NOT raise; service_role would bypass. So 6.3.4 / 6.4.4
 *   assert 0-rows via the RLS-scoped persona client, NOT service_role.
 * - Calibration honesty language lives on the "By Confidence" tab / published
 *   scoreboards (not the category drill-down page).
 * - Signal calibration footer + decision-audit drawer render on the aircraft
 *   profile Signals tab (aircraft-signals-tab), not on the /signals queue.
 */

let owner: SupabaseClient;
let uid: string;
let melOpen = 0;
let calHasData = false;

test.beforeAll(async () => {
  owner = await getAnonClientAs("owner");
  uid = (await owner.auth.getUser()).data.user!.id;
  melOpen = await countMelItems("open", owner);
  const { data: dash } = await owner.rpc("get_tenant_calibration_dashboard", { p_window_days: 180 });
  calHasData = Boolean((dash as { has_data?: boolean } | null)?.has_data);
});

// ── 6.1 Compliance dashboard + AD matrix ─────────────────────────────────────
test.describe("6.1 Compliance + AD", () => {
  test("6.1.1 /compliance renders its sections", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/compliance");
    await expect(page.getByRole("heading", { name: "Compliance", level: 1 })).toBeVisible({ timeout: 20_000 });
    for (const t of ["ADs", "Service Bulletins", "MEL", "Life-Limited Parts", "Regulatory", "DS.AI Audit"]) {
      await expect(page.getByRole("tab", { name: t })).toBeVisible();
    }
  });

  test("6.1.2 AD register shows compliance status columns", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/compliance");
    await page.getByRole("tab", { name: "ADs" }).click();
    // DEVIATION: real columns are AD / Authority / Title / Deadline / Compliance.
    for (const h of ["AD", "Authority", "Title", "Deadline", "Compliance"]) {
      await expect(page.getByRole("columnheader", { name: h, exact: true }).first()).toBeVisible({ timeout: 20_000 });
    }
  });

  test("6.1.3 seeded AD 2024-30-URGENT exists + opens in the matrix", async ({ page }) => {
    const { ad, statuses } = await getADStatus("2024-30-URGENT", owner);
    expect(ad).not.toBeNull();
    expect(ad!.criticality).toBe("emergency");
    expect(ad!.compliance_deadline_date).toBeTruthy();
    expect(statuses.length).toBeGreaterThanOrEqual(1); // applies to matching-type aircraft

    await signInAs(page, "owner");
    // AD detail = query-param master-detail on the AD Tracker page.
    await page.goto(`/compliance/ads?ad=${ad!.id}`);
    await expect(page.getByText("2024-30-URGENT").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Tail").first()).toBeVisible(); // per-aircraft matrix header
  });
});

// ── 6.2 MEL defer / rectify ──────────────────────────────────────────────────
test.describe("6.2 MEL", () => {
  test("6.2.1 MEL list renders active deferred items", async ({ page }) => {
    test.skip(melOpen === 0, "no open MEL items seeded");
    await signInAs(page, "owner");
    await page.goto("/compliance/mel");
    await expect(page.getByRole("heading", { name: "MEL Management", level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/CAT [ABCD]/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Rectify" }).first()).toBeVisible();
  });

  test.fixme("6.2.2 Defer New MEL from the UI", async () => {
    // PRODUCT GAP: /compliance/mel has View / Extend / Rectify but no "Defer New
    // MEL" control. The defer_mel_item RPC and the deferMel mutation exist but are
    // unwired to any button, so there is no UI flow to exercise. Deferred.
  });

  test("6.2.3 Rectify MEL closes the item", async ({ page }) => {
    test.skip(melOpen === 0, "no open MEL item to rectify");
    const before = await countMelItems("open", owner);
    const rectifiedBefore = await countMelItems("rectified", owner);
    await signInAs(page, "owner");
    await rectifyFirstMel(page);
    await expect
      .poll(async () => countMelItems("open", owner), { timeout: 15_000 })
      .toBeLessThan(before);
    // A rectified row now exists with rectified_at_utc populated.
    expect(await countMelItems("rectified", owner)).toBeGreaterThan(rectifiedBefore);
    const { data } = await owner
      .from("aircraft_mel_items")
      .select("id, rectified_at_utc")
      .eq("status", "rectified")
      .not("rectified_at_utc", "is", null)
      .limit(1);
    expect((data ?? []).length).toBe(1);
  });
});

// ── 6.3 DS.AI decision audit trail ───────────────────────────────────────────
test.describe("6.3 DS.AI", () => {
  test("6.3.1 /compliance/dsai renders the decision audit", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/compliance/dsai");
    await expect(page.getByRole("heading", { name: "DS.AI Audit Trail", level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("tab", { name: "Decisions" })).toBeVisible();
    // Rows carry a per-decision "Audit" button (seed backfills decision records).
    await expect(page.getByRole("button", { name: "Audit" }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("6.3.2 ai_decision_records populated (>= 5)", async () => {
    expect(await getDecisionRecordCount(owner)).toBeGreaterThanOrEqual(5);
  });

  test("6.3.3 a signal action writes a human oversight event", async () => {
    const { data: sig } = await owner
      .from("signals")
      .select("id, org_id")
      .eq("is_active", true)
      .limit(1);
    test.skip(!sig || sig.length === 0, "no active signal to action");
    const signal = sig![0]!;
    const { count: before } = await owner
      .from("human_oversight_events")
      .select("*", { count: "exact", head: true });
    // Acknowledge the signal — the signal_actions AFTER INSERT trigger mints an
    // oversight event (acknowledged → oversight_type 'reviewed').
    const { error } = await owner.from("signal_actions").insert({
      org_id: signal.org_id,
      signal_id: signal.id,
      action_type: "acknowledged",
      actor_user_id: uid,
    });
    expect(error).toBeNull();
    await expect
      .poll(
        async () =>
          (await owner.from("human_oversight_events").select("*", { count: "exact", head: true })).count ?? 0,
        { timeout: 10_000 },
      )
      .toBeGreaterThan(before ?? 0);
  });

  test("6.3.4 ai_decision_records are immutable to authenticated writes", async () => {
    const { data } = await owner.from("ai_decision_records").select("id").limit(1);
    test.skip(!data || data.length === 0, "no decision record to test");
    const id = data![0]!.id as string;
    // DEVIATION: enforced by missing UPDATE/DELETE RLS policy → 0 rows, no error.
    const { updated, deleted } = await attemptTamper(owner, "ai_decision_records", id, {
      decision_context: "tampered",
    });
    expect(updated).toBe(0);
    expect(deleted).toBe(0);
    const { data: still } = await owner.from("ai_decision_records").select("id").eq("id", id);
    expect((still ?? []).length).toBe(1); // row survives
  });
});

// ── 6.4 Calibration scoreboard ───────────────────────────────────────────────
test.describe("6.4 Calibration", () => {
  test("6.4.1 /calibration renders the scoreboard", async ({ page }) => {
    test.skip(!calHasData, "no calibration snapshots for the 180d window");
    await signInAs(page, "owner");
    await page.goto("/calibration");
    await expect(page.getByRole("heading", { name: "Calibration", level: 1 })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("tab", { name: "By Category" }).click();
    for (const h of ["Category", "Accuracy", "Sample"]) {
      await expect(page.getByText(h, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test("6.4.2 scoreboard shows honest calibration (well-cal / overconfident / thin sample)", async () => {
    const { data } = await owner.rpc("get_tenant_calibration_dashboard", { p_window_days: 180 });
    const dash = data as { has_data?: boolean; by_category?: { signal_category: string; accuracy_pct: number; measured: number; sample_size_status: string }[] } | null;
    test.skip(!dash?.has_data, "no calibration data in window");
    const rows = dash!.by_category ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    // Well-calibrated: at least one category ≥ 75% (seed: weather_impact 80, llp 82).
    expect(rows.some((r) => r.accuracy_pct >= 75)).toBe(true);
    // Overconfident: at least one measured category < 65% (seed: avionics_fault ~52).
    expect(rows.some((r) => r.measured > 0 && r.accuracy_pct < 65)).toBe(true);
    // Thin sample: at least one category flagged not-"sufficient" (seed: hydraulic_leak n=8).
    expect(rows.some((r) => r.sample_size_status && r.sample_size_status !== "sufficient")).toBe(true);
  });

  test("6.4.3 category drill-down + honesty language", async ({ page }) => {
    test.skip(!calHasData, "no calibration data to drill into");
    await signInAs(page, "owner");
    await page.goto("/calibration");
    await page.getByRole("tab", { name: "By Category" }).click();
    const firstCat = page.locator('a[href^="/calibration/category/"]').first();
    await expect(firstCat).toBeVisible({ timeout: 15_000 });
    await firstCat.click();
    await page.waitForURL(/\/calibration\/category\//, { timeout: 15_000 });
    await expect(page.getByText(/Sample predictions with outcomes/i).first()).toBeVisible({ timeout: 15_000 });
    // DEVIATION: intellectual-honesty framing lives on the By Confidence tab.
    await page.goto("/calibration");
    await page.getByRole("tab", { name: "By Confidence" }).click();
    await expect(page.getByText(/overconfiden/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("6.4.4 calibration_events are immutable to authenticated writes", async () => {
    const { data } = await owner.from("calibration_events").select("id").limit(1);
    test.skip(!data || data.length === 0, "no calibration_events row to test");
    const id = data![0]!.id as string;
    const { updated, deleted } = await attemptTamper(owner, "calibration_events", id, { notes: "tampered" });
    expect(updated).toBe(0);
    expect(deleted).toBe(0);
    const { data: still } = await owner.from("calibration_events").select("id").eq("id", id);
    expect((still ?? []).length).toBe(1);
  });
});

// ── 6.5 Signal card calibration + decision-audit footers ─────────────────────
test.describe("6.5 Signal footers", () => {
  test("6.5.1 signal card renders a calibration footer (data-dependent)", async ({ page }) => {
    // The CalibrationFooter renders only for a (category|confidence) that has a
    // sufficiently-sampled calibration badge. Find such a live signal or skip.
    const { data: badge } = await owner.rpc("get_calibration_badge_map");
    const map = (badge ?? {}) as Record<string, { sample_size_status?: string }>;
    const goodKeys = Object.entries(map)
      .filter(([, v]) => v?.sample_size_status && v.sample_size_status !== "insufficient")
      .map(([k]) => k);
    let target: { aircraft_id: string } | null = null;
    for (const key of goodKeys) {
      const [category, confidence] = key.split("|");
      const { data } = await owner
        .from("signals")
        .select("aircraft_id")
        .eq("is_active", true)
        .eq("category", category)
        .eq("confidence", confidence)
        .not("aircraft_id", "is", null)
        .limit(1);
      if (data && data.length) { target = data[0] as { aircraft_id: string }; break; }
    }
    test.skip(!target, "no active signal in a sufficiently-sampled calibration category");
    await signInAs(page, "owner");
    await page.goto(`/aircraft/${target!.aircraft_id}`);
    await expect(page.getByText(/Calibrated at \d+% · n=\d+/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("6.5.2 signal card exposes decision-audit provenance", async ({ page }) => {
    const { data } = await owner
      .from("signals")
      .select("aircraft_id")
      .eq("is_active", true)
      .not("aircraft_id", "is", null)
      .limit(1);
    test.skip(!data || data.length === 0, "no active signal with an aircraft");
    await signInAs(page, "owner");
    await page.goto(`/aircraft/${(data![0] as { aircraft_id: string }).aircraft_id}`);
    const auditBtn = page.getByRole("button", { name: "View decision audit" }).first();
    await expect(auditBtn).toBeVisible({ timeout: 20_000 });
    await auditBtn.click();
    await expect(page.getByText("DS.AI decision audit")).toBeVisible({ timeout: 15_000 });
    // Provenance: model version + prompt version (+ decided timestamp) in the drawer.
    await expect(page.getByText("Model version").first()).toBeVisible();
    await expect(page.getByText("Prompt version").first()).toBeVisible();
  });
});

// ── 6.x deferred (enterprise-tier) ───────────────────────────────────────────
test.describe("6.x deferred (enterprise-tier)", () => {
  test.fixme("regulatory report generation (11.x) + DS.AI conformance bundle export", async () => {
    // Regulatory report generation and the EASA-NPA conformance bundle export are
    // procurement-stage surfaces (the Regulatory tab lists reports and DS.AI has an
    // Export tab, but full generation/round-trip is enterprise). Deferred.
  });
});
