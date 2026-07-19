import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { signInAs } from "../helpers/auth";
import {
  createBacktestProjectViaRpc,
  createBacktestProjectViaUI,
  getBacktestProjectByName,
  ingestSampleCSV,
  runBacktest,
} from "../helpers/backtest";
import {
  acknowledgeFirstActive,
  countByDeliveryStatus,
  countUnacknowledged,
  dryRunFirstPolicy,
} from "../helpers/notifications";
import { getAnonClientAs } from "../helpers/supabase";

/**
 * Module 7 — Simulation (Backtest) & Notifications.
 *
 * Notable spec↔app deltas (see handback + tests/README.md):
 * - Route is `/backtest` (title "Simulation Backtest"); the create control is
 *   "New Project" → `/backtest/new` (button "Create project"), not a modal.
 * - CSV ingest is real but INLINE (text posted to the `ingest-backtest-data` edge
 *   function). No signed-URL / large-file path exists → 7.2.2 fixme.
 * - `backtest_runs.status` is 'running' | 'complete' | 'failed' ('complete', not
 *   'completed').
 * - Executive summary export is browser print (`window.print()` → "Print / Save
 *   PDF"); there is no downloadable server PDF → the >100KB PDF check is fixme.
 * - `notification_events` has no `acknowledged_by_user_id` / `dismissed` columns;
 *   ack sets `acknowledged_at_utc` + `delivery_status='acknowledged'` (recipient =
 *   recipient_user_id).
 * - Escalation is a jsonb `escalation_ladder` on notification_policies, not a
 *   separate stages table. On-call rotation is `/settings/on-call` (its own page).
 */

let owner: SupabaseClient;
let projectA: { id: string } | null = null; // seeded, complete (Northstar ~71% caught)
let projectB: { id: string } | null = null; // seeded, ready_to_run (Part 135 Demo)
let unacked = 0;

test.beforeAll(async () => {
  owner = await getAnonClientAs("owner");
  projectA = await getBacktestProjectByName("Northstar", owner);
  projectB = await getBacktestProjectByName("Part 135 Demo", owner);
  unacked = await countUnacknowledged(owner);
});

// ── 7.1 Backtest project creation ────────────────────────────────────────────
test.describe("7.1 Backtest projects", () => {
  test("7.1.1 /backtest renders the projects list + create button", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/backtest");
    await expect(page.getByRole("heading", { name: "Simulation Backtest", level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: "New Project" }).first()).toBeVisible();
    for (const h of ["Project", "Customer", "Status"]) {
      await expect(page.getByRole("columnheader", { name: h, exact: false }).first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test("7.1.2 create a backtest project end-to-end", async ({ page }) => {
    await signInAs(page, "owner");
    const name = `E2E Backtest ${Date.now()}`;
    const id = await createBacktestProjectViaUI(page, {
      name,
      customer: "E2E Prospect",
      start: "2026-04-01",
      end: "2026-06-30",
    });
    await expect(page).toHaveURL(new RegExp(`/backtest/${id}`));
    const { data } = await owner.from("backtest_projects").select("id, project_name, status").eq("id", id);
    expect((data ?? []).length).toBe(1);
    expect(data![0]!.project_name).toBe(name);
  });
});

// ── 7.2 CSV ingestion (the sales flow) ───────────────────────────────────────
test.describe("7.2 CSV ingestion", () => {
  test("7.2.1 ingest a sample CSV into a project", async ({ page }) => {
    const id = await createBacktestProjectViaRpc(owner, {
      project_name: `E2E Ingest ${Date.now()}`,
      purpose: "internal_validation",
    });
    await signInAs(page, "owner");
    await ingestSampleCSV(page, id);
    const { data } = await owner
      .from("backtest_data_sources")
      .select("id, rows_ingested, ingestion_errors")
      .eq("backtest_project_id", id);
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    expect(Number(data![0]!.rows_ingested)).toBeGreaterThan(0);
    // The fixture includes two malformed rows → ingestion_errors captures them.
    expect(data![0]!.ingestion_errors).not.toBeNull();
  });

  test.fixme("7.2.2 large-file upload via signed URL", async () => {
    // NOT IMPLEMENTED: ingest sends the file text inline in the request body
    // (source_file_size_bytes = content.length). There is no createSignedUploadUrl
    // / direct-to-storage path, so a 20MB+ upload path can't be exercised. Deferred.
  });

  test("7.2.3 Load sample data on a fresh project", async ({ page }) => {
    const id = await createBacktestProjectViaRpc(owner, {
      project_name: `E2E Sample ${Date.now()}`,
      purpose: "internal_validation",
    });
    await signInAs(page, "owner");
    await page.goto(`/backtest/${id}`);
    await page.getByRole("tab", { name: "Data Sources" }).click();
    await page.getByRole("button", { name: "Load sample data" }).click();
    await expect(page.getByText("Sample data loaded").first()).toBeVisible({ timeout: 30_000 });
    const { data } = await owner.from("backtest_data_sources").select("id, rows_ingested").eq("backtest_project_id", id);
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    expect(Number(data![0]!.rows_ingested)).toBeGreaterThan(0);
  });
});

// ── 7.3 Backtest run + would-have-caught report ──────────────────────────────
test.describe("7.3 Backtest run + report", () => {
  test("7.3.1 run a backtest against ingested data", async ({ page }) => {
    test.skip(!projectB, "seeded 'Part 135 Demo — Q2 Sample' (ready_to_run) project not found");
    await signInAs(page, "owner");
    await runBacktest(page, projectB!.id);
    await expect
      .poll(
        async () =>
          (await owner
            .from("backtest_runs")
            .select("*", { count: "exact", head: true })
            .eq("backtest_project_id", projectB!.id)
            .eq("status", "complete")).count ?? 0,
        { timeout: 20_000 },
      )
      .toBeGreaterThanOrEqual(1);
    const { count: sigs } = await owner
      .from("backtest_simulated_signals")
      .select("*", { count: "exact", head: true })
      .eq("backtest_project_id", projectB!.id);
    expect(sigs ?? 0).toBeGreaterThan(0);
  });

  test("7.3.2 would-have-caught is reported honestly (not inflated)", async () => {
    test.skip(!projectA, "seeded 'Northstar' project not found");
    const { count: incidents } = await owner
      .from("backtest_actual_events")
      .select("*", { count: "exact", head: true })
      .eq("backtest_project_id", projectA!.id);
    const { count: caught } = await owner
      .from("backtest_simulated_signals")
      .select("*", { count: "exact", head: true })
      .eq("backtest_project_id", projectA!.id)
      .not("matched_actual_event_id", "is", null);
    expect(incidents ?? 0).toBeGreaterThan(0);
    expect(caught ?? 0).toBeLessThanOrEqual(incidents ?? 0); // can't catch more than occurred
    const { data: sum } = await owner.rpc("get_backtest_summary", { p_project: projectA!.id });
    const pct = Number((sum as { would_have_caught_pct?: number } | null)?.would_have_caught_pct ?? -1);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100); // deterministic replay = a lower bound, never >100
  });

  test("7.3.3 category drill-down + honest LLM-deferral disclosure", async ({ page }) => {
    test.skip(!projectA, "seeded 'Northstar' project not found");
    await signInAs(page, "owner");
    await page.goto(`/backtest/${projectA!.id}`);
    await expect(page.getByText("Would-have-caught").first()).toBeVisible({ timeout: 20_000 });
    const chip = page.locator(`a[href*="/backtest/${projectA!.id}/results/"]`).first();
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await chip.click();
    await page.waitForURL(/\/results\//, { timeout: 15_000 });
    await expect(page.getByText(/Would-have-caught \(/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Missed \(/).first()).toBeVisible();
    // DEVIATION: the honest LLM-deferral note lives on the Configuration tab
    // ("deterministic (~$0) … modeled Opus-equivalent projection").
    await page.goto(`/backtest/${projectA!.id}`);
    await page.getByRole("tab", { name: "Configuration" }).click();
    await expect(page.getByText(/deterministic/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("7.3.4 Results tab match-confidence filter narrows the simulated-signal list", async ({ page }) => {
    test.skip(!projectA, "seeded 'Northstar' project not found");
    await signInAs(page, "owner");
    await page.goto(`/backtest/${projectA!.id}`);
    await page.getByRole("tab", { name: "Results" }).click();
    await expect(page.getByText("Simulated signals").first()).toBeVisible({ timeout: 20_000 });
    const select = page.locator("select");
    await expect(select).toBeVisible({ timeout: 15_000 });

    await select.selectOption("exact");
    await expect
      .poll(async () => page.locator("span").filter({ hasText: "No match" }).count(), { timeout: 10_000 })
      .toBe(0);

    await select.selectOption("no_match");
    const noMatchRows = page.locator("span").filter({ hasText: "No match" }).first();
    const emptyMsg = page.getByText("No signals.");
    await expect(noMatchRows.or(emptyMsg)).toBeVisible({ timeout: 10_000 });
  });
});

// ── 7.4 Executive summary ────────────────────────────────────────────────────
test.describe("7.4 Executive summary", () => {
  test("7.4.1 generate an executive summary with the expected structure", async ({ page }) => {
    test.skip(!projectA, "seeded 'Northstar' project not found");
    const before = (await owner
      .from("backtest_reports")
      .select("*", { count: "exact", head: true })
      .eq("backtest_project_id", projectA!.id)).count ?? 0;
    await signInAs(page, "owner");
    await page.goto(`/backtest/${projectA!.id}`);
    await page.getByRole("tab", { name: "Reports" }).click();
    await page.getByRole("button", { name: "Generate executive summary" }).click();
    await expect(page.getByText("Report generated").first()).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () =>
          (await owner
            .from("backtest_reports")
            .select("*", { count: "exact", head: true })
            .eq("backtest_project_id", projectA!.id)).count ?? 0,
        { timeout: 15_000 },
      )
      .toBeGreaterThan(before);
    // Open the report and assert its presentation structure.
    await page.getByRole("button").filter({ hasText: /executive summary/i }).first().click();
    const dialog = page.getByRole("dialog");
    for (const h of ["Methodology", "Key findings", "Category breakdown", "Limitations & caveats"]) {
      await expect(dialog.getByRole("heading", { name: h })).toBeVisible({ timeout: 15_000 });
    }
    await expect(dialog.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
  });

  test.fixme("7.4.2 downloadable presentation-grade PDF (>100KB)", async () => {
    // Export is browser print (window.print()); storage_path_pdf is never populated
    // and there is no download event, so a file-size assertion isn't possible.
    // Structure is verified via the print HTML in 7.4.1. Deferred.
  });
});

// ── 7.5 Notification center ──────────────────────────────────────────────────
test.describe("7.5 Notification center", () => {
  test("7.5.1 /notifications renders active + recent", async ({ page }) => {
    test.skip(unacked === 0, "no unacknowledged notifications seeded");
    await signInAs(page, "owner");
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("tab", { name: /^Active/ }).click();
    await expect(page.getByRole("tabpanel").getByRole("button").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tab", { name: "Recent" })).toBeVisible();
  });

  test("7.5.2 acknowledge a notification", async ({ page }) => {
    test.skip(unacked === 0, "no unacknowledged notification to acknowledge");
    const before = await countUnacknowledged(owner);
    const ackedBefore = await countByDeliveryStatus("acknowledged", owner);
    await signInAs(page, "owner");
    await acknowledgeFirstActive(page);
    await expect.poll(async () => countUnacknowledged(owner), { timeout: 15_000 }).toBeLessThan(before);
    // acknowledged_at_utc + delivery_status='acknowledged' (no acknowledged_by_user_id column).
    expect(await countByDeliveryStatus("acknowledged", owner)).toBeGreaterThan(ackedBefore);
  });

  test.fixme("7.5.3 realtime notification propagates across two browsers", async () => {
    // There is no supported client path to originate a brand-new notification_events
    // row (inserts happen via SECURITY DEFINER seed/escalation functions). Realtime
    // wiring itself is covered by use-notification-realtime + the ack propagation;
    // a two-browser origination test is deferred (same rationale as 3.6.1).
  });

  test("7.5.4 notification Sheet shows Channel/Severity/Status metadata", async ({ page }) => {
    // Prefer Active (unacked); fall back to Recent so the Sheet journey still
    // runs after ack-heavy suites have drained the Active queue.
    await signInAs(page, "owner");
    await page.goto("/notifications");
    await page.getByRole("tab", { name: /^Active/ }).click();
    let firstRow = page.getByRole("tabpanel").getByRole("button").first();
    const empty = page.getByText("Nothing needs your attention.");
    await expect(firstRow.or(empty)).toBeVisible({ timeout: 15_000 });
    if (await empty.isVisible()) {
      await page.getByRole("tab", { name: /^Recent/ }).click();
      firstRow = page.getByRole("tabpanel").getByRole("button").first();
      await expect(firstRow).toBeVisible({ timeout: 15_000 });
    }
    await firstRow.click();
    for (const label of ["Channel", "Severity", "Status"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test("7.5.5 Escalate an unacknowledged notification runs the escalation check", async ({ page }) => {
    // Escalate is only on Active (unacked) rows. Discover a recipient persona.
    const keys = ["owner", "dom", "dispatcher", "line_maint", "dispatch_supervisor"] as const;
    let persona: (typeof keys)[number] | null = null;
    for (const key of keys) {
      const c = await getAnonClientAs(key);
      const uid = (await c.auth.getUser()).data.user!.id;
      const { count } = await c
        .from("notification_events")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", uid)
        .is("acknowledged_at_utc", null)
        .in("delivery_status", ["queued", "sending", "delivered", "retried"]);
      if ((count ?? 0) > 0) { persona = key; break; }
    }
    test.skip(!persona, "no persona has an unacknowledged notification in seed (Active queue drained)");
    await signInAs(page, persona!);
    await page.goto("/notifications");
    await page.getByRole("tab", { name: /^Active/ }).click();
    const firstRow = page.getByRole("tabpanel").getByRole("button").first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    await firstRow.click();
    const escalateBtn = page.getByRole("button", { name: "Escalate" });
    await expect(escalateBtn).toBeVisible({ timeout: 10_000 });
    await escalateBtn.click();
    await expect(page.getByText("Escalation check run").first()).toBeVisible({ timeout: 15_000 });
  });
});

// ── 7.6 Notification policies + escalation ───────────────────────────────────
test.describe("7.6 Policies + escalation", () => {
  test("7.6.1 /settings/notifications/policies + on-call rotation render", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/settings/notifications/policies");
    await expect(page.getByRole("heading", { name: "Notification Policies", level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("AOG — Critical").first()).toBeVisible({ timeout: 15_000 });
    // DEVIATION: on-call rotation is its own page.
    await page.goto("/settings/on-call");
    await expect(page.getByRole("heading", { name: "On-Call Scheduler", level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Rotate" }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("7.6.2 policy dry-run resolves recipients", async ({ page }) => {
    await signInAs(page, "owner");
    const dialog = await dryRunFirstPolicy(page);
    await expect(
      dialog.getByText(/deferred|immediate|No recipients would be notified/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("7.6.3 a critical policy has a configured escalation chain", async () => {
    const { data } = await owner
      .from("notification_policies")
      .select("policy_name, escalation_ladder")
      .ilike("policy_name", "AOG%")
      .limit(1);
    expect((data ?? []).length).toBe(1);
    // DEVIATION: escalation stages are the jsonb escalation_ladder (seed: 2 rungs).
    const ladder = (data![0]!.escalation_ladder ?? []) as unknown[];
    expect(Array.isArray(ladder)).toBe(true);
    expect(ladder.length).toBeGreaterThanOrEqual(2);
  });

  test("7.6.5 Rotate on-call schedule advances the roster", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/settings/on-call");
    await expect(page.getByRole("heading", { name: "On-Call Scheduler", level: 1 })).toBeVisible({ timeout: 20_000 });
    const rotateBtn = page.getByRole("button", { name: "Rotate" }).first();
    await expect(rotateBtn).toBeVisible({ timeout: 15_000 });
    await rotateBtn.click();
    await expect(page.getByText("Rotated").first()).toBeVisible({ timeout: 15_000 });
  });
});

// ── 7.7 Notification preferences ─────────────────────────────────────────────
test.describe("7.7 Preferences", () => {
  test("7.7.1 /settings/notifications renders channels + mute/verify controls", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/settings/notifications");
    await expect(page.getByRole("heading", { name: "Notification Preferences", level: 1 })).toBeVisible({ timeout: 20_000 });
    const mute = page.getByRole("button", { name: "Mute 60 min" });
    const verify = page.getByRole("button", { name: "Verify" }).first();
    await expect(mute.or(verify)).toBeVisible({ timeout: 15_000 });
  });
});
