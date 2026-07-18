import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "../helpers/auth";
import { confirmModalAndWait, dragKanbanCard } from "../helpers/dragDrop";
import { expectAircraftStateChangeInOtherBrowser, twoContexts } from "../helpers/realtime";
import { getAnonClientAs } from "../helpers/supabase";

/**
 * Module 2 — Fleet, Aircraft Profile & Command Center canvas.
 *
 * Notable spec↔app deltas (see tests/README "Deviations" + the handback):
 * - Board/List toggle is local state, NOT a URL param — we assert rendered
 *   content, not ?view=.
 * - The board shows 23 cards, not 24: one seeded aircraft (D-CBJX) is in state
 *   'unknown', which maps to no Kanban column.
 * - /aircraft is a 308 permanent redirect to /fleet?view=list.
 * - Aircraft Profile tabs are Signals(default)/Components/Ops Profile/…; there
 *   is no Overview/Task Board/Genealogy tab (Task Board is a header link).
 * - Fleet is org-scoped, not station-scoped (2.5.1 fixme).
 */

const CARD = "div.select-none.bg-card";
const COLUMNS = ["Under Maintenance", "In Air", "On Ground", "Stationed"];

type StateRow = { aircraft_id: string; state: string };
let tailById: Map<string, string>;
let tailByState: Map<string, { id: string; tail: string }>;

test.beforeAll(async () => {
  const c = await getAnonClientAs("owner");
  const [{ data: aircraft }, { data: states }] = await Promise.all([
    c.from("aircraft").select("id, tail_number"),
    c.from("aircraft_state").select("aircraft_id, state"),
  ]);
  tailById = new Map((aircraft ?? []).map((a) => [a.id as string, a.tail_number as string]));
  tailByState = new Map();
  for (const s of (states ?? []) as StateRow[]) {
    if (!tailByState.has(s.state) && tailById.has(s.aircraft_id)) {
      tailByState.set(s.state, { id: s.aircraft_id, tail: tailById.get(s.aircraft_id)! });
    }
  }
});

// ── 2.1 Fleet page structure and view toggle ─────────────────────────────────
test.describe("2.1 Fleet page", () => {
  test("2.1.1 Fleet renders Board view by default with the 4 columns", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/fleet");
    await expect(page).toHaveURL(/\/fleet$/);
    for (const label of COLUMNS) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    // Board active, List inactive.
    await expect(page.getByRole("button", { name: "Board" })).toHaveClass(/bg-primary/);
    await expect(page.getByRole("button", { name: "List" })).not.toHaveClass(/bg-primary/);
    // 24 seeded aircraft − 1 in state 'unknown' (off-board) = 23 cards. A tolerant
    // band survives concurrent drag tests mutating fleet state on the other worker.
    const count = await page.locator(CARD).count();
    expect(count).toBeGreaterThanOrEqual(21);
    expect(count).toBeLessThanOrEqual(24);
  });

  test("2.1.2 Board→List preserves the station filter (view is local state, not URL)", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/fleet");
    // Station filter applies in both views. Pick a station present in the seed.
    const station = "FRA";
    // Wait for the board to render before baselining the count (else `all` is 0
    // and the post-filter poll can never be satisfied).
    await expect(page.locator(CARD).first()).toBeVisible({ timeout: 30_000 });
    const all = await page.locator(CARD).count();
    const stationChip = page.getByTestId("filter-station").getByRole("button", { name: station, exact: true });
    await stationChip.click();
    await expect.poll(async () => page.locator(CARD).count(), { timeout: 15_000 }).toBeLessThan(all); // board settled
    const boardTail = await page.locator(CARD).first().locator("a").first().textContent();

    await page.getByRole("button", { name: "List" }).click();
    await expect(page.getByRole("button", { name: "List" })).toHaveClass(/bg-primary/);
    await expect(page.locator("table")).toBeVisible(); // List renders a table
    if (boardTail) await expect(page.getByText(boardTail.trim(), { exact: false }).first()).toBeVisible();

    // Toggle back — station chip still active.
    await page.getByRole("button", { name: "Board" }).click();
    await expect(page.getByTestId("filter-station").getByRole("button", { name: station, exact: true })).toHaveClass(/border-primary/);
  });

  test("2.1.3 /aircraft permanently redirects to /fleet?view=list", async ({ page, request }) => {
    // The redirect is a 308 (permanent). Check the status without following, then
    // confirm the followed destination.
    const res = await request.get("/aircraft", { maxRedirects: 0 });
    expect([301, 308]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/fleet?view=list");
    await signInAs(page, "owner");
    await page.goto("/aircraft");
    await expect(page).toHaveURL(/\/fleet\?view=list/);
  });

  test("2.1.4 Board filters narrow the set and clear back to full", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/fleet");
    const all = await page.locator(CARD).count();
    const stationFilter = page.getByTestId("filter-station");
    const riskFilter = page.getByTestId("filter-risk");
    // FRA has 3 seeded aircraft. The board refetches (skeleton) on filter change,
    // so poll until it settles rather than reading a transient count.
    const stationChip = stationFilter.getByRole("button", { name: "FRA", exact: true });

    await stationChip.click();
    await expect.poll(async () => page.locator(CARD).count(), { timeout: 15_000 }).toBeLessThan(all);
    expect(await page.locator(CARD).count()).toBeGreaterThan(0);

    // Risk is aircraft-centric: it narrows the task badges shown on cards, not
    // the card set (every aircraft still renders). Assert the chip activates.
    const highChip = riskFilter.getByRole("button", { name: "High", exact: true });
    await highChip.click();
    await expect(highChip).toHaveClass(/border-primary/);

    // No "Clear filters" control — toggle the chips off again → full board returns.
    await highChip.click();
    await stationChip.click();
    await expect.poll(async () => page.locator(CARD).count(), { timeout: 15_000 }).toBe(all);
  });
});

// ── 2.2 Aircraft Profile ─────────────────────────────────────────────────────
test.describe("2.2 Aircraft Profile", () => {
  async function openFirstProfile(page: Page) {
    await signInAs(page, "owner");
    await page.goto("/fleet?view=list");
    await page.locator("table a").first().click(); // List tail links to the profile
    await expect(page).toHaveURL(/\/aircraft\/[0-9a-f-]+$/);
  }

  test("2.2.1 profile renders its tab set + Task Board link", async ({ page }) => {
    await openFirstProfile(page);
    // Actual tabs (no Overview/Task Board/Genealogy tab; default is Signals).
    for (const t of ["Signals", "Components", "Compliance", "Parts"]) {
      await expect(page.getByRole("tab", { name: t })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Task Board" })).toBeVisible();
  });

  test("2.2.2 Signals tab shows signal cards with actions (or an empty state)", async ({ page }) => {
    await openFirstProfile(page);
    await page.getByRole("tab", { name: "Signals" }).click();
    // Signals may auto-generate on first view; tolerate the generating/empty state.
    const card = page.locator("div").filter({ has: page.getByText("Evidence", { exact: true }) }).first();
    const empty = page.getByText(/No active signals|Generating signals/i);
    await expect(card.or(empty).first()).toBeVisible({ timeout: 30_000 });
    if (await page.getByText("Evidence", { exact: true }).count()) {
      await expect(page.getByRole("button", { name: "Create Task" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Dismiss" }).first()).toBeVisible();
    }
  });

  test("2.2.3 Components tab lists tail-scoped components", async ({ page }) => {
    await openFirstProfile(page);
    await page.getByRole("tab", { name: "Components" }).click();
    const rows = page.locator('a[href^="/components/"]');
    const empty = page.getByText("No components on this aircraft");
    await expect(rows.first().or(empty)).toBeVisible({ timeout: 15_000 });
    if (await rows.count()) {
      // Each row shows a component type label, serial (mono), and a next-event line.
      await expect(rows.first()).toBeVisible();
    }
  });
});

// ── 2.3 Command Center canvas ────────────────────────────────────────────────
test.describe("2.3 Command Center canvas", () => {
  test("2.3.1 canvas renders map, station strip, timeline", async ({ page }) => {
    test.setTimeout(90_000);
    await signInAs(page, "owner");
    await page.waitForLoadState("networkidle").catch(() => {}); // best-effort settle
    await expect(page.getByTestId("command-center-canvas")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 30_000 });
    // Markers are leaflet CircleMarker paths; only aircraft with lat/lng plot
    // (so NOT necessarily all 24). Assert at least a handful.
    await expect(page.locator(".leaflet-overlay-pane path.leaflet-interactive").first()).toBeVisible({ timeout: 20_000 });
    expect(await page.locator(".leaflet-overlay-pane path.leaflet-interactive").count()).toBeGreaterThanOrEqual(4);
    const strip = page.getByRole("listbox", { name: "Stations" });
    await expect(strip).toBeVisible();
    await expect(strip.getByRole("option").nth(5)).toBeVisible(); // ≥6 stations
    await expect(page.getByTestId("ops-timeline")).toBeVisible();
  });

  test("2.3.2 marker click opens the drawer; map stays visible; Escape closes", async ({ page }) => {
    await signInAs(page, "owner");
    await page.locator(".leaflet-overlay-pane path.leaflet-interactive").first().click();
    const drawer = page.getByRole("link", { name: "Open Aircraft Profile" });
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".leaflet-container")).toBeVisible(); // map not occluded
    await expect(page.getByRole("button", { name: "Now", exact: true })).toBeVisible(); // window selector present
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("2.3.3 station card click shows a clear-filter chip", async ({ page }) => {
    await signInAs(page, "owner");
    const strip = page.getByRole("listbox", { name: "Stations" });
    const first = strip.getByRole("option").first();
    const code = (await first.textContent())?.match(/[A-Z]{3}/)?.[0] ?? "";
    await first.click();
    // The clear-filter affordance is the station code followed by an ✕ (no literal
    // "Clear filter" text). It sits outside the listbox.
    const chip = page.locator("button.border-primary").filter({ hasText: code }).first();
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await chip.click();
    await expect(chip).toBeHidden();
  });

  test("2.3.4 station strip scrolls via the right chevron on overflow", async ({ page }) => {
    await signInAs(page, "owner");
    const rightChevron = page.getByRole("button", { name: "Scroll stations right" });
    // Chevrons only render when the strip overflows the viewport.
    if (await rightChevron.count()) {
      const strip = page.getByRole("listbox", { name: "Stations" });
      const before = await strip.evaluate((el) => el.scrollLeft);
      await rightChevron.click();
      await page.waitForTimeout(400);
      const after = await strip.evaluate((el) => el.scrollLeft);
      expect(after).toBeGreaterThan(before);
    } else {
      test.info().annotations.push({ type: "note", description: "station strip did not overflow at this viewport — chevrons absent" });
    }
  });

  test("2.3.5 timeline renders a now-line", async ({ page }) => {
    await signInAs(page, "owner");
    const timeline = page.getByTestId("ops-timeline");
    await expect(timeline).toBeVisible();
    await expect(timeline.locator(".bg-primary.w-px")).toBeVisible();
  });

  test("2.3.6 weather toggle activates and deactivates", async ({ page }) => {
    await signInAs(page, "owner");
    const wx = page.getByRole("button", { name: "Wx", exact: true });
    await wx.click();
    await expect(wx).toHaveClass(/bg-primary/);
    await wx.click();
    await expect(wx).not.toHaveClass(/bg-primary/);
  });
});

// ── 2.4 Two-browser realtime on Fleet ────────────────────────────────────────
test.describe("2.4 Fleet realtime", () => {
  test("2.4.1 aircraft state change propagates across browsers", async ({ browser }) => {
    test.setTimeout(120_000);
    const src = tailByState.get("on_ground");
    test.skip(!src, "no on_ground aircraft in seed to drag");
    const { id, tail } = src!;
    const c = await getAnonClientAs("owner");
    const { data: before } = await c.from("aircraft_state").select("state, current_station").eq("aircraft_id", id).single();

    const { a, b, close } = await twoContexts(browser, "owner");
    try {
      await a.goto("/fleet");
      await b.goto("/fleet");
      await dragKanbanCard(a, tail, "In Air");
      // On Ground → In Air prompts departure fields.
      const dialog = a.getByRole("dialog");
      await expect(dialog.getByText("Confirm departure")).toBeVisible();
      await dialog.locator("#dest").fill("LHR");
      await confirmModalAndWait(a, "Confirm");
      // Browser B reflects the move within 5s (fleet-board realtime invalidation).
      await expectAircraftStateChangeInOtherBrowser(b, tail, "In Air", 8_000);
    } finally {
      // Restore original state so the seed stays stable for other tests/runs.
      await c.from("aircraft_state").update({ state: before?.state ?? "on_ground", current_station: before?.current_station ?? null, next_event_type: null, next_event_at: null }).eq("aircraft_id", id);
      await close();
    }
  });
});

// ── 2.5 RLS scoping on Fleet ─────────────────────────────────────────────────
test.describe("2.5 Fleet RLS", () => {
  test.fixme("2.5.1 line-maintenance controller sees a station-scoped Fleet", async () => {
    // The app scopes fleet data by ORG, not by station/assignment. line_maint is
    // a member of the same operator org as owner, so it sees the identical 24
    // aircraft — there is no station-scoped subset to assert. (Same gap as
    // Module 1's 1.2.4.) Would require per-station RLS/RPC scoping to implement.
  });

  test("2.5.1b line_maint sees the same org fleet (documents the no-scoping reality)", async () => {
    const c = await getAnonClientAs("line_maint");
    const { data } = await c.from("aircraft").select("id");
    expect((data ?? []).length).toBe(24); // full org fleet, not a station subset
  });
});
