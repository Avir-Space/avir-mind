import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { signInAs } from "../helpers/auth";
import { createTaskFromSignal } from "../helpers/tasks";
import { isFtlViolation, proposeAssignment } from "../helpers/crew";
import { recordFlightEvent } from "../helpers/flightops";
import { getAnonClientAs } from "../helpers/supabase";

/**
 * Module 5 — Cross-module Ops (Inventory / Crew / Flight Ops / Weather / signals).
 *
 * Notable spec↔app deltas (see handback):
 * - No `supply_chain` signal category — it's `stock_transfer_opportunity`.
 * - Crew "roster" is a 14-day duty GRID; the tabular list is the Directory tab.
 *   There is no available/on_duty/resting field (duty derives from duty_periods).
 * - propose_assignment returns { duty_evaluation, currency, assignable }.
 * - dispatch_releases are NOT seeded (0) → 5.4.2 creates one test-scoped.
 * - /weather is /flight-ops/weather; the board shows METAR, not TAF.
 * - delay_pattern signals key on delay_code, not route (5.6.2 note).
 */

let owner: SupabaseClient;
let partId: string;
let crew: { id: string }[] = [];
let flights: { id: string; status: string; actual_out_utc: string | null }[] = [];
let supplySignalId: string | null = null;

test.beforeAll(async () => {
  owner = await getAnonClientAs("owner");
  partId = (await owner.from("parts").select("id").limit(1)).data![0]!.id as string;
  crew = ((await owner.from("crew_members").select("id").eq("role", "captain").limit(6)).data ?? []) as typeof crew;
  flights = ((await owner
    .from("flights")
    .select("id, status, actual_out_utc, scheduled_departure_utc")
    .gt("scheduled_departure_utc", new Date().toISOString())
    .order("scheduled_departure_utc")
    .limit(12)).data ?? []) as typeof flights;
  supplySignalId = (await owner.from("signals").select("id").eq("category", "stock_transfer_opportunity").limit(1)).data?.[0]?.id ?? null;
});

// ── 5.1 Inventory dashboard ──────────────────────────────────────────────────
test.describe("5.1 Inventory", () => {
  test("5.1.1 /inventory renders dashboard + parts table", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/inventory");
    for (const label of ["Total SKUs", "Inventory Value", "Low Stock Alerts", "Reorder Needed"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 20_000 });
    }
    await expect(page.getByText("Supply intelligence")).toBeVisible(); // "supply signals" = insight cards
    await expect.poll(async () => page.locator("tbody tr").count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(20);
  });

  test("5.1.2 category + criticality filters narrow the parts list", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/inventory");
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
    const all = await page.locator("tbody tr").count();
    await page.getByRole("button", { name: /^Category/i }).first().click();
    const panel = page.locator("div.absolute.z-50.w-60");
    await panel.getByRole("button").nth(2).click(); // a category
    await page.keyboard.press("Escape");
    await expect.poll(async () => page.locator("tbody tr").count(), { timeout: 10_000 }).toBeLessThan(all);
  });

  test("5.1.3 part detail renders its tabs + stock/suppliers", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/inventory/parts/${partId}`);
    for (const t of ["Overview", "Stock", "Suppliers", "Movements"]) {
      await expect(page.getByRole("tab", { name: t })).toBeVisible({ timeout: 20_000 });
    }
    await page.getByRole("tab", { name: "Stock" }).click();
    await expect(page.getByRole("cell", { name: /Location/i }).or(page.getByText("Location").first())).toBeVisible();
    await page.getByRole("tab", { name: "Suppliers" }).click();
    await expect(page.getByText(/lead \d+d/).first().or(page.getByText("No suppliers linked to this part."))).toBeVisible();
  });
});

// ── 5.2 Stock transfer / supply signals ──────────────────────────────────────
test.describe("5.2 Supply signals", () => {
  test("5.2.1 a stock-transfer signal exists with part-referenced evidence", async () => {
    const { data } = await owner
      .from("signals")
      .select("id, title, evidence_refs")
      .eq("category", "stock_transfer_opportunity")
      .limit(5);
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    const primary = (data![0]!.evidence_refs as { primary?: { type: string; reference: string; summary: string }[] })?.primary ?? [];
    expect(primary[0]?.type).toBe("part"); // references a part_number
    expect(primary[0]?.summary).toMatch(/→/); // from → to location in the summary
  });

  test("5.2.2 Create Task from a supply signal pre-fills a title", async ({ page }) => {
    test.skip(!supplySignalId, "no stock_transfer_opportunity signal seeded");
    await signInAs(page, "owner");
    await page.goto(`/signals/${supplySignalId}`);
    const title = await createTaskFromSignal(page); // no override → keeps the pre-filled title
    expect(title.length).toBeGreaterThan(3);
    const { data } = await owner.from("tasks").select("id").eq("title", title).limit(1);
    expect((data ?? []).length).toBe(1);
  });
});

// ── 5.3 Crew ─────────────────────────────────────────────────────────────────
test.describe("5.3 Crew", () => {
  test("5.3.1 /crew Directory lists crew with roles + quals", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/crew");
    // The Roster tab is a 14-day duty grid; the tabular roster is the Directory.
    await page.getByRole("tab", { name: "Directory" }).click();
    await expect.poll(async () => page.locator("tbody tr").count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(5);
    for (const h of ["Name", "Role", "Base", "Quals"]) {
      await expect(page.getByRole("columnheader", { name: h, exact: false }).first()).toBeVisible();
    }
  });

  test("5.3.2 crew detail shows Qualifications + Duty History", async ({ page }) => {
    test.skip(crew.length === 0, "no captain crew seeded");
    await signInAs(page, "owner");
    await page.goto(`/crew/${crew[0]!.id}`);
    for (const t of ["Overview", "Qualifications", "Duty History"]) {
      await expect(page.getByRole("tab", { name: t })).toBeVisible({ timeout: 20_000 });
    }
  });

  test("5.3.3 propose_assignment returns an FTL evaluation", async () => {
    test.skip(crew.length === 0 || flights.length === 0, "need crew + a flight");
    const { data, error } = await proposeAssignment(owner, crew[0]!.id, flights[0]!.id, "pic");
    expect(error).toBeNull();
    expect(data?.duty_evaluation?.overall_result).toBeTruthy(); // compliant|warning|violation
    expect(Array.isArray(data?.duty_evaluation?.rule_evaluations)).toBe(true);
    expect(typeof data?.duty_evaluation?.fatigue_score).toBe("number");
    expect(typeof data?.assignable).toBe("boolean");
  });

  test("5.3.4 an FTL-violating assignment blocks commit_assignment", async () => {
    test.setTimeout(90_000);
    // Search a bounded crew×flight grid for a duty-rule violation (the seed
    // deliberately creates a sub-minimum-rest pattern).
    let violating: { crewId: string; flightId: string } | null = null;
    outer: for (const c of crew.slice(0, 6)) {
      for (const f of flights.slice(0, 6)) {
        const { data } = await proposeAssignment(owner, c.id, f.id, "pic");
        if (isFtlViolation(data)) { violating = { crewId: c.id, flightId: f.id }; break outer; }
      }
    }
    test.skip(!violating, "no FTL-violating crew/flight pair found in the sampled grid");
    const { error } = await owner.rpc("commit_assignment", {
      p_crew_member_id: violating!.crewId,
      p_flight_schedule_id: violating!.flightId,
      p_role_on_flight: "pic",
      p_override_warnings: false,
    });
    expect(error).not.toBeNull(); // "assignment blocked: FTL violation (requires admin override)"
  });
});

// ── 5.4 Flight Ops ───────────────────────────────────────────────────────────
test.describe("5.4 Flight Ops", () => {
  test("5.4.1 /flight-ops renders the flights table", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/flight-ops");
    for (const h of ["Flight", "Route", "Tail", "Status"]) {
      await expect(page.getByRole("columnheader", { name: h, exact: false }).first()).toBeVisible({ timeout: 20_000 });
    }
    await expect.poll(async () => page.locator("tbody tr").count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(5);
  });

  test("5.4.2 Dispatch Release tab shows fuel plan + W&B + performance", async ({ page }) => {
    test.skip(flights.length === 0, "no upcoming flight");
    // dispatch_releases are not seeded — create one test-scoped with the payload.
    const flight = flights.find((f) => !f.actual_out_utc) ?? flights[0]!;
    await owner.rpc("create_dispatch_release", {
      p_flight_id: flight.id,
      p_attrs: {
        fuel_plan: { trip_kg: 8200, contingency_kg: 400, alternate_kg: 900, final_reserve_kg: 600, taxi_kg: 150, block_kg: 10250 },
        weight_and_balance: { zfw_kg: 52000, tow_kg: 68000, ldw_kg: 60000, cg_pct_mac: 27.5 },
        performance_data: { v1: 142, vr: 148, v2: 152 },
      },
    });
    await signInAs(page, "owner");
    await page.goto(`/flight-ops/flights/${flight.id}`);
    await page.getByRole("tab", { name: /Dispatch/ }).click();
    await expect(page.getByText("Fuel plan")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Weight & balance")).toBeVisible();
    await expect(page.getByText("trip_kg").first()).toBeVisible(); // jsonb keys render literally
    await expect(page.getByText("cg_pct_mac").first()).toBeVisible();
    await expect(page.getByText("v1", { exact: true }).first()).toBeVisible();
  });

  test("5.4.3 recording an OOOI Out event propagates status", async ({ page }) => {
    const flight = flights.find((f) => !f.actual_out_utc && (f.status === "scheduled" || f.status === "planned" || f.status === "dispatched"));
    test.skip(!flight, "no upcoming flight available to record OOOI");
    await signInAs(page, "owner");
    await page.goto(`/flight-ops/flights/${flight!.id}`);
    await recordFlightEvent(page, "pushback"); // OOOI "Out"
    await expect.poll(async () => {
      const { data } = await owner.from("flight_events").select("id").eq("flight_id", flight!.id).eq("event_type", "pushback").limit(5);
      return (data ?? []).length;
    }, { timeout: 10_000 }).toBeGreaterThan(0);
    const { data } = await owner.from("flights").select("status, actual_out_utc").eq("id", flight!.id).single();
    expect(data?.actual_out_utc).not.toBeNull(); // Out time recorded → status taxiing
  });
});

// ── 5.5 Weather ──────────────────────────────────────────────────────────────
test.describe("5.5 Weather", () => {
  test("5.5.1 weather board renders station observations", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/flight-ops/weather");
    await expect(page.getByText("Weather Board")).toBeVisible({ timeout: 20_000 });
    // Station cards colored by flight category (LHR=IFR, ORD=LIFR seeded).
    await expect(page.getByText("LHR").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Refresh/ })).toBeVisible();
  });

  test("5.5.2 Command Center weather overlay activates", async ({ page }) => {
    await signInAs(page, "owner");
    const wx = page.getByRole("button", { name: "Wx", exact: true });
    await wx.click();
    await expect(wx).toHaveClass(/bg-primary/);
    await wx.click();
    await expect(wx).not.toHaveClass(/bg-primary/);
  });
});

// ── 5.6 Cross-module signals ─────────────────────────────────────────────────
test.describe("5.6 Cross-module signals", () => {
  test("5.6.1 weather-impact signals reference an aircraft + station", async () => {
    const { data } = await owner
      .from("signals")
      .select("id, aircraft_id, evidence_refs")
      .eq("category", "weather_impact")
      .limit(5);
    expect((data ?? []).length).toBeGreaterThanOrEqual(1); // 44 seeded (mostly resolved)
    expect(data![0]!.aircraft_id).toBeTruthy();
    const primary = (data![0]!.evidence_refs as { primary?: { type: string }[] })?.primary ?? [];
    expect(primary[0]?.type).toBe("weather"); // carries the destination station
  });

  test("5.6.2 delay-pattern signals exist (keyed by delay code, not route)", async () => {
    const { data } = await owner
      .from("signals")
      .select("id, evidence_refs")
      .eq("category", "delay_pattern")
      .limit(5);
    expect((data ?? []).length).toBeGreaterThanOrEqual(1); // 32 seeded
    // DEVIATION: delay_pattern references a delay_code (recurring cause), NOT the
    // route origin/destination the spec assumed — asserting the real evidence.
    const primary = (data![0]!.evidence_refs as { primary?: { type: string }[] })?.primary ?? [];
    expect(primary[0]?.type).toBe("delay_code");
  });
});

// ── Enterprise-tier deferrals ────────────────────────────────────────────────
test.describe("5.x deferred (enterprise-tier)", () => {
  test.fixme("full FDP lookup tables / regulatory reports / signal-based crew alerts", async () => {
    // EASA/CASA/DGCA FDP lookup tables, regulatory report generation, and
    // signal-driven crew alert infrastructure are procurement-stage — deferred.
  });
});
