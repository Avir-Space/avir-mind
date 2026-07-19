import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { signInAs } from "../helpers/auth";
import { exportGenealogy, healthBand, recordComponentEvent, verifyHashChain } from "../helpers/components";
import { getAnonClientAs } from "../helpers/supabase";

/**
 * Module 4 — Components, Genealogy, LLP, Predictive.
 *
 * Notable spec↔app deltas (see handback):
 * - Health bands are 75/50/25 ("Healthy/Watch/Degraded/Critical"), not 80/60.
 * - Component detail tabs: Overview / Events / Predictions / Health Trend /
 *   Genealogy (no "Related Signals" — predictions live on the Predictions tab).
 * - Event types are cycle_recorded / installed / finding_recorded (not
 *   cycle_snapshot/installation/finding); the UI has no cycles/hours inputs.
 * - LLP is a separate life_limited_parts table (no is_llp/life_used columns on
 *   components) and there is NO 100%-life install guard (product gap).
 * - PDF export is print-to-PDF (no download event) → fixme.
 * - genealogy_records is immutable via RLS using(false) UPDATE/DELETE policies.
 */

let owner: SupabaseClient;
let comp: { id: string; serial_number: string; health_score: number | null; position_code: string | null; aircraft_id: string | null };
let spareOnWing: { id: string; aircraft_id: string | null; position_code: string | null } | null = null;
let genComp: { id: string; serial_id: string };
let predComponentId: string | null = null;

test.beforeAll(async () => {
  owner = await getAnonClientAs("owner");
  const { data: comps } = await owner
    .from("components")
    .select("id, serial_number, health_score, status, position_code, aircraft_id")
    .eq("status", "on_wing")
    .order("serial_number")
    .limit(3);
  comp = comps![0] as typeof comp;
  if (comps && comps.length > 1) {
    spareOnWing = {
      id: comps[1]!.id as string,
      aircraft_id: (comps[1]!.aircraft_id as string | null) ?? null,
      position_code: (comps[1]!.position_code as string | null) ?? null,
    };
  }

  const { data: gr } = await owner
    .from("genealogy_records")
    .select("source_component_id, serial_genealogy_id")
    .not("source_component_id", "is", null)
    .limit(1);
  genComp = { id: gr![0]!.source_component_id as string, serial_id: gr![0]!.serial_genealogy_id as string };

  const { data: preds } = await owner
    .from("signals")
    .select("component_id")
    .eq("signal_class", "prediction")
    .not("component_id", "is", null)
    .limit(1);
  predComponentId = (preds?.[0]?.component_id as string) ?? null;
});

// ── 4.1 Components inventory ──────────────────────────────────────────────────
test.describe("4.1 Components inventory", () => {
  test("4.1.1 /components renders the table with rows + filters", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/components");
    await expect(page.getByText(/\d+ components/)).toBeVisible({ timeout: 20_000 });
    for (const h of ["Serial", "Type", "Part #", "Health", "Next Event"]) {
      await expect(page.getByRole("columnheader", { name: h, exact: false }).first()).toBeVisible();
    }
    expect(await page.locator("tbody tr").count()).toBeGreaterThanOrEqual(10);
    for (const f of ["Type", "Aircraft", "Status", "Health"]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${f}`, "i") }).first()).toBeVisible();
    }
  });

  test("4.1.2 filter by aircraft narrows the list", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/components");
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
    const all = await page.locator("tbody tr").count();
    await page.getByRole("button", { name: /^Aircraft/i }).first().click();
    const panel = page.locator("div.absolute.z-50.w-60");
    await panel.getByRole("button").filter({ hasText: /^[A-Z]{1,2}-?\w/ }).nth(1).click(); // first tail (skip Off-wing)
    await page.keyboard.press("Escape");
    await expect.poll(async () => page.locator("tbody tr").count(), { timeout: 10_000 }).toBeLessThan(all);
  });

  test("4.1.3 filter by component type narrows the list", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/components");
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
    const all = await page.locator("tbody tr").count();
    await page.getByRole("button", { name: /^Type/i }).first().click();
    const panel = page.locator("div.absolute.z-50.w-60");
    await panel.getByRole("button").nth(2).click(); // a type option (after Select all / Clear)
    await page.keyboard.press("Escape");
    await expect.poll(async () => page.locator("tbody tr").count(), { timeout: 10_000 }).toBeLessThan(all);
  });

  test("4.1.4 health readout matches the computed band", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/components/${comp.id}`);
    await expect(page.getByRole("heading", { name: comp.serial_number })).toBeVisible({ timeout: 20_000 });
    const band = comp.health_score == null ? "unknown" : healthBand(comp.health_score);
    const labels: Record<string, RegExp> = { healthy: /Healthy/, watch: /Watch/, degraded: /Degraded/, critical: /Critical/, unknown: /Unknown/ };
    await expect(page.getByText(labels[band]!).first()).toBeVisible();
  });

  test("4.1.5 Status filter (Inventory) narrows the list", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/components");
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
    const all = await page.locator("tbody tr").count();
    await page.getByRole("button", { name: /^Status/i }).first().click();
    const panel = page.locator("div.absolute.z-50.w-60");
    await panel.getByRole("button", { name: /Inventory/i }).click();
    await page.keyboard.press("Escape");
    await expect.poll(async () => page.locator("tbody tr").count(), { timeout: 10_000 }).toBeLessThan(all);
  });

  test("4.1.6 Health band filter narrows the list", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/components");
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
    const all = await page.locator("tbody tr").count();
    await page.getByRole("button", { name: /^Health/i }).first().click();
    const panel = page.locator("div.absolute.z-50.w-60");
    // Prefer Critical — sparse band so the list shrinks; fall back to Watch.
    const critical = panel.getByRole("button", { name: /Critical/i });
    if (await critical.count()) await critical.click();
    else await panel.getByRole("button", { name: /Watch/i }).click();
    await page.keyboard.press("Escape");
    await expect.poll(async () => page.locator("tbody tr").count(), { timeout: 10_000 }).toBeLessThan(all);
  });

  test("4.1.7 serial link navigates to the component detail page", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/components");
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
    const link = page.locator("tbody tr").first().locator("a[href^='/components/']").first();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/components\/[0-9a-f-]+$/i);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible({ timeout: 20_000 });
  });
});

// ── 4.2 Component detail ──────────────────────────────────────────────────────
test.describe("4.2 Component detail", () => {
  test("4.2.1 detail renders its tabs", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/components/${comp.id}`);
    for (const t of ["Overview", "Events", "Health Trend", "Genealogy"]) {
      await expect(page.getByRole("tab", { name: t })).toBeVisible({ timeout: 20_000 });
    }
    await expect(page.getByRole("tab", { name: /Predictions/ })).toBeVisible();
  });

  test("4.2.2 record a cycle event inserts a component_events row", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/components/${comp.id}`);
    const before = (await owner.from("component_events").select("id", { count: "exact", head: true }).eq("component_id", comp.id)).count ?? 0;
    await recordComponentEvent(page, "cycle_recorded");
    await expect.poll(async () =>
      (await owner.from("component_events").select("id", { count: "exact", head: true }).eq("component_id", comp.id)).count ?? 0,
      { timeout: 10_000 }).toBeGreaterThan(before);
  });

  test.fixme("4.2.3 installation event updates ownership history", async () => {
    // record_component_event does NOT write genealogy_ownership_history — that
    // table is only written by the cross-org transfer RPC. Cross-tenant ownership
    // is an enterprise-tier flow (deferred).
  });

  test("4.2.4 record a finding event appears in the Events tab", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/components/${comp.id}`);
    const note = `E2E finding ${Date.now()}`;
    await recordComponentEvent(page, "finding_recorded", { severity: "minor", description: note });
    await page.getByRole("tab", { name: "Events" }).click();
    await expect(page.getByText(note).first()).toBeVisible({ timeout: 10_000 });
    const { data } = await owner.from("component_events").select("id").eq("component_id", comp.id).eq("event_type", "finding_recorded").limit(20);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  test("4.2.5 Overview tab shows life limits and identity fields", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/components/${comp.id}`);
    await expect(page.getByRole("heading", { name: comp.serial_number })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByText("Life & limits")).toBeVisible();
    // Identity grid — prefer scoped labels over bare text that can collide.
    for (const label of ["Current cycles", "Manufacturer", "Position", "Status"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("4.2.6 Change Position updates position_code", async ({ page }) => {
    const original = comp.position_code;
    const next = `E2E-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    await signInAs(page, "owner");
    await page.goto(`/components/${comp.id}`);
    await expect(page.getByRole("heading", { name: comp.serial_number })).toBeVisible({ timeout: 20_000 });
    try {
      await page.getByRole("button", { name: "Change Position" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator("#pos").fill(next);
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
      await expect.poll(async () => {
        const { data } = await owner.from("components").select("position_code").eq("id", comp.id).single();
        return data?.position_code;
      }, { timeout: 10_000 }).toBe(next);
    } finally {
      await owner.from("components").update({ position_code: original }).eq("id", comp.id);
    }
  });

  test("4.2.7 Move Off-wing clears aircraft assignment and sets inventory status", async ({ page }) => {
    test.skip(!spareOnWing, "need a spare on-wing component");
    const target = spareOnWing!;
    await signInAs(page, "owner");
    await page.goto(`/components/${target.id}`);
    await expect(page.getByRole("button", { name: "Move Off-wing" })).toBeVisible({ timeout: 20_000 });
    try {
      await page.getByRole("button", { name: "Move Off-wing" }).click();
      await expect.poll(async () => {
        const { data } = await owner.from("components").select("status, aircraft_id").eq("id", target.id).single();
        return data?.status;
      }, { timeout: 15_000 }).toBe("off_wing_inventory");
      const { data } = await owner.from("components").select("aircraft_id").eq("id", target.id).single();
      expect(data?.aircraft_id).toBeNull();
      const { data: ev } = await owner
        .from("component_events")
        .select("id")
        .eq("component_id", target.id)
        .eq("event_type", "removed")
        .limit(1);
      expect((ev ?? []).length).toBeGreaterThan(0);
    } finally {
      // installed RPC restores status but not aircraft_id — write both back.
      await owner
        .from("components")
        .update({
          status: "on_wing",
          aircraft_id: target.aircraft_id,
          position_code: target.position_code,
          removed_at_utc: null,
        })
        .eq("id", target.id);
    }
  });

  test("4.2.8 Health Trend tab surfaces a chart or empty-history message", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/components/${comp.id}`);
    await page.getByRole("tab", { name: "Health Trend" }).click();
    await expect(page.getByText("Health score over time")).toBeVisible({ timeout: 20_000 });
    const chart = page.locator("svg").first();
    const empty = page.getByText("Not enough history to chart a trend yet.");
    await expect(chart.or(empty).first()).toBeVisible();
  });
});

// ── 4.3 Genealogy hash-chained ledger ────────────────────────────────────────
test.describe("4.3 Genealogy ledger", () => {
  test("4.3.1 Genealogy tab shows the chained record ledger", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/components/${genComp.id}`);
    await page.getByRole("tab", { name: "Genealogy" }).click();
    await expect(page.getByText(/Record ledger · \d+/)).toBeVisible({ timeout: 20_000 });
    // Birth Certificate is the genesis record type label (hash "— genesis —" only
    // appears after expanding a row with a null previous_record_hash).
    await expect(page.getByRole("button", { name: "Birth Certificate" }).first()).toBeVisible();
    await expect(page.getByText(/Hash chain verified/i)).toBeVisible();
  });

  test("4.3.2 hash chain is intact (SQL)", async () => {
    const { data } = await owner
      .from("genealogy_records")
      .select("record_seq, content_hash, previous_record_hash, record_type, record_date_utc")
      .eq("serial_genealogy_id", genComp.serial_id)
      .order("record_seq", { ascending: true });
    const records = data ?? [];
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0]!.previous_record_hash).toBeNull(); // genesis
    expect(verifyHashChain(records as never)).toBe(true);
    // content_hash = SHA-256(record_type|record_date|source_org|payload) over
    // Postgres jsonb::text — not byte-reproducible in JS, so we verify chain
    // linkage (the tamper-evident property) rather than recomputing the digest.
  });

  test("4.3.3 genealogy_records are immutable — UPDATE blocked by RLS", async () => {
    const row = (await owner.from("genealogy_records").select("id, record_type").eq("serial_genealogy_id", genComp.serial_id).limit(1)).data![0]!;
    await owner.from("genealogy_records").update({ record_type: "tampered" }).eq("id", row.id);
    const { data } = await owner.from("genealogy_records").select("record_type").eq("id", row.id).single();
    expect(data?.record_type).toBe(row.record_type); // unchanged under using(false)
  });

  test("4.3.4 genealogy_records are immutable — DELETE blocked by RLS", async () => {
    const id = (await owner.from("genealogy_records").select("id").eq("serial_genealogy_id", genComp.serial_id).limit(1)).data![0]!.id;
    await owner.from("genealogy_records").delete().eq("id", id);
    const { data } = await owner.from("genealogy_records").select("id").eq("id", id);
    expect((data ?? []).length).toBe(1); // still exists
  });

  test("4.3.5 ledger search narrows visible genealogy records", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/components/${genComp.id}`);
    await page.getByRole("tab", { name: "Genealogy" }).click();
    await expect(page.getByText(/Record ledger · \d+/)).toBeVisible({ timeout: 20_000 });
    const search = page.getByPlaceholder("Search records…");
    await expect(search).toBeVisible();
    // Nonsense query empties the ledger; clearing restores rows (and type chips).
    await search.fill("zzzz-no-match-e2e");
    await expect(page.getByText("No records match.")).toBeVisible({ timeout: 10_000 });
    await search.fill("");
    await expect(page.getByText("No records match.")).toBeHidden();
    await expect(page.getByRole("button", { name: "Birth Certificate" }).first()).toBeVisible();
  });
});

// ── 4.4 Genealogy export ─────────────────────────────────────────────────────
test.describe("4.4 Genealogy export", () => {
  test.fixme("4.4.1 export PDF downloads a valid file", async () => {
    // PDF export is browser print-to-PDF (openPrintWindow), not a file download —
    // there is no download event to intercept. Structure is verified via JSON /
    // Portable Bundle (4.4.2 / 4.4.3).
  });

  test("4.4.2 export JSON preserves the hash chain", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/components/${genComp.id}`);
    await page.getByRole("tab", { name: "Genealogy" }).click();
    const download = await exportGenealogy(page, "JSON");
    const dl = await download;
    expect(dl.suggestedFilename()).toMatch(/\.json$/);
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const doc = JSON.parse(Buffer.concat(chunks).toString());
    expect(doc.snapshot_hash).toBeTruthy();
    const records = (doc.records ?? []).slice().sort((a: { record_seq: number }, b: { record_seq: number }) => a.record_seq - b.record_seq);
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0].previous_record_hash ?? null).toBeNull();
    expect(verifyHashChain(records)).toBe(true);
  });

  test("4.4.3 export Portable Bundle is a zip with a manifest", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/components/${genComp.id}`);
    await page.getByRole("tab", { name: "Genealogy" }).click();
    const download = await exportGenealogy(page, "Portable Bundle");
    const dl = await download;
    expect(dl.suggestedFilename()).toMatch(/\.zip$/);
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(Buffer.concat(chunks));
    expect(zip.file("genealogy.json")).toBeTruthy();
    const manifest = await zip.file("MANIFEST.txt")?.async("string");
    expect(manifest).toMatch(/Serial/);
    expect(manifest).toMatch(/Records/);
  });
});

// ── 4.5 Life-Limited Parts ───────────────────────────────────────────────────
test.describe("4.5 LLP", () => {
  test("4.5.1 LLPs exist with a computed percentage_used", async () => {
    // No dedicated LLP view on /components (LLP status is implicit via
    // limit_cycles/limit_flight_hours; life is tracked in life_limited_parts).
    const { data } = await owner
      .from("life_limited_parts")
      .select("component_id, life_limit_value, current_value, percentage_used, remaining")
      .order("percentage_used", { ascending: false })
      .limit(20);
    const llps = data ?? [];
    expect(llps.length).toBeGreaterThanOrEqual(1);
    const r = llps[0]!;
    const expected = Math.round((Number(r.current_value) / Number(r.life_limit_value)) * 10000) / 100;
    expect(Math.abs(Number(r.percentage_used) - expected)).toBeLessThan(0.5); // generated column
  });

  test.fixme("4.5.2 recording a cycle event increases LLP life monotonically", async () => {
    // The Record Event UI has no cycles/hours input — cycles_at_event is
    // auto-filled from the component's CURRENT counters, so a UI-recorded event
    // cannot advance life. percentage_used (generated) is verified in 4.5.1.
  });

  test.fixme("4.5.3 LLP at 100% life blocks installation", async () => {
    // PRODUCT GAP: record_component_event installs with NO life/percentage_used
    // guard — an exhausted LLP can be installed. LLP exhaustion only raises a
    // signal + a compliance counter. Flagged in the handback.
  });
});

// ── 4.6 Predictive ───────────────────────────────────────────────────────────
test.describe("4.6 Predictive", () => {
  test("4.6.1 the inventory shows a predictions indicator column", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/components");
    // The list surfaces an active-predictions COUNT badge (Pred. column), not a
    // future date + confidence.
    await expect(page.getByRole("columnheader", { name: /Pred/ })).toBeVisible({ timeout: 20_000 });
  });

  test("4.6.2 component Predictions tab surfaces predictive signals", async ({ page }) => {
    test.skip(!predComponentId, "no predictive component signal seeded");
    await signInAs(page, "owner");
    await page.goto(`/components/${predComponentId}`);
    await page.getByRole("tab", { name: /Predictions/ }).click();
    // PredictionCard shows a Horizon chip + "confidence" + a historical baseline.
    await expect(page.getByText(/Horizon/i).first().or(page.getByText(/confidence/i).first())).toBeVisible({ timeout: 15_000 });
  });
});

// ── Enterprise-tier deferrals ────────────────────────────────────────────────
test.describe("4.x deferred (enterprise-tier)", () => {
  test.fixme("cross-tenant genealogy transfer / provenance / anonymous export", async () => {
    // Cross-org ownership transfer, anonymous export contexts, and cross-tenant
    // provenance are procurement-stage flows — deferred.
  });
});
