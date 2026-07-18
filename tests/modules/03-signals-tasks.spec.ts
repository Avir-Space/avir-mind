import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "../helpers/auth";
import { confirmModalAndWait, dragKanbanCard } from "../helpers/dragDrop";
import { twoContexts } from "../helpers/realtime";
import { clearAllFilters, filterByCategory, filterBySeverity, toggleNeedsYou } from "../helpers/signals";
import { addComment, createTaskFromSignal, logWork } from "../helpers/tasks";
import { getAnonClientAs } from "../helpers/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Module 3 — Signals inbox & Tasks flywheel.
 *
 * Key spec↔app delta (see handback): the /signals page renders the TASKS queue
 * (TaskCards) with an Acknowledge button + a "Details" expander — NOT SignalCards.
 * Create Task / Dismiss (SignalActionBar) live on the signal DETAIL page
 * (/signals/[id]) and the aircraft Signals tab. Tests target each surface where
 * the control actually exists.
 */

let ownerClient: SupabaseClient;
let ownerId: string;
let activeSignals: { id: string; title: string; aircraft_id: string }[] = [];
let anyTaskId: string;
let queued: { id: string; board_rank: number | null }[] = [];
let tailByState: Map<string, { id: string; tail: string }>;

test.beforeAll(async () => {
  ownerClient = await getAnonClientAs("owner");
  ownerId = (await ownerClient.auth.getUser()).data.user!.id;

  const { data: sigs } = await ownerClient
    .from("signals")
    .select("id, title, aircraft_id")
    .eq("is_active", true)
    .neq("severity", "insufficient_data")
    .limit(6);
  activeSignals = (sigs ?? []) as typeof activeSignals;

  const { data: t } = await ownerClient.from("tasks").select("id").neq("status", "done").limit(1);
  anyTaskId = t?.[0]?.id as string;

  const { data: q } = await ownerClient
    .from("tasks")
    .select("id, board_rank")
    .eq("status", "queued")
    .limit(4);
  queued = (q ?? []) as typeof queued;

  const [{ data: aircraft }, { data: states }] = await Promise.all([
    ownerClient.from("aircraft").select("id, tail_number"),
    ownerClient.from("aircraft_state").select("aircraft_id, state"),
  ]);
  const tailById = new Map((aircraft ?? []).map((a) => [a.id as string, a.tail_number as string]));
  tailByState = new Map();
  for (const s of (states ?? []) as { aircraft_id: string; state: string }[]) {
    if (!tailByState.has(s.state) && tailById.has(s.aircraft_id)) {
      tailByState.set(s.state, { id: s.aircraft_id, tail: tailById.get(s.aircraft_id)! });
    }
  }
});

// ── 3.1 Signals inbox ────────────────────────────────────────────────────────
test.describe("3.1 Signals inbox", () => {
  test("3.1.1 /signals renders stats, insights, filters, and a populated queue", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/signals");
    for (const label of ["Active Signals", "Blocking Dispatch", "AOG Aircraft", "Team Load"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("AI Insights")).toBeVisible();
    // Filter row (Severity dropdown is a stable anchor) + ≥5 queue rows.
    await expect(page.getByRole("button", { name: /^Severity/i })).toBeVisible();
    expect(await page.getByRole("button", { name: "Details" }).count()).toBeGreaterThanOrEqual(5);
  });

  test("3.1.2 severity filter narrows the queue", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/signals");
    // Wait for the queue to render before baselining (else `before` is 0 and the
    // post-filter poll can never be satisfied → 15s timeout).
    await expect(page.getByRole("button", { name: "Details" }).first()).toBeVisible({ timeout: 30_000 });
    const before = await page.getByRole("button", { name: "Details" }).count();
    await filterBySeverity(page, ["Critical"]);
    await expect.poll(async () => page.getByRole("button", { name: "Details" }).count()).toBeLessThanOrEqual(before);
    await clearAllFilters(page);
    await expect.poll(async () => page.getByRole("button", { name: "Details" }).count()).toBe(before);
  });

  test("3.1.3 category multi-select shows a filter chip row", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/signals");
    await filterByCategory(page, ["Powerplant", "Avionics"]);
    await expect(page.getByRole("button", { name: "Clear all" })).toBeVisible();
    await clearAllFilters(page);
    await expect(page.getByRole("button", { name: "Clear all" })).toBeHidden();
  });

  test("3.1.4 Needs YOU toggle activates", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/signals");
    await toggleNeedsYou(page);
    await expect(page.getByRole("button", { name: "Needs YOU" }).first()).toHaveClass(/bg-primary/);
  });

  test("3.1.5 time-window segment switches", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/signals");
    // Scope to the Window segment — "24h" also appears as an applied-filter chip
    // once selected, which otherwise makes the bare lookup ambiguous.
    const w = page.getByTestId("filter-window").getByRole("button", { name: "24h", exact: true });
    await w.click();
    await expect(w).toHaveClass(/bg-primary/);
  });
});

// ── 3.2 Signal card interactions ─────────────────────────────────────────────
test.describe("3.2 Signal interactions", () => {
  test("3.2.1 queue row expands to show sources + recent activity", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/signals");
    await page.getByRole("button", { name: "Details" }).first().click();
    await expect(page.getByText("Sources", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Recent activity", { exact: true }).first()).toBeVisible();
  });

  test("3.2.2 acknowledge writes a task_acknowledgements row", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/signals");
    const ack = page.getByRole("button", { name: "Acknowledge" }).first();
    await expect(ack).toBeVisible();
    await ack.click();
    await expect(page.getByText("Acknowledged").first()).toBeVisible({ timeout: 10_000 });
    const { data } = await ownerClient.from("task_acknowledgements").select("task_id").eq("user_id", ownerId).limit(1);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  test("3.2.3 Create Task from a signal (detail page) creates a task + logs the action", async ({ page }) => {
    test.skip(activeSignals.length === 0, "no active signals seeded");
    const sig = activeSignals[0]!;
    await signInAs(page, "owner");
    await page.goto(`/signals/${sig.id}`);
    const title = `E2E task ${Date.now()}`;
    await createTaskFromSignal(page, { title });
    const { data: tasks } = await ownerClient.from("tasks").select("id").eq("title", title).limit(1);
    expect((tasks ?? []).length).toBe(1);
    const { data: actions } = await ownerClient.from("signal_actions").select("action_type").eq("signal_id", sig.id).eq("action_type", "create_task");
    expect((actions ?? []).length).toBeGreaterThan(0);
  });

  test("3.2.4 Dismiss a signal with a reason deactivates it + records the action", async ({ page }) => {
    test.skip(activeSignals.length < 2, "need a spare active signal to dismiss");
    const sig = activeSignals[activeSignals.length - 1]!; // a different signal than 3.2.3
    await signInAs(page, "owner");
    await page.goto(`/signals/${sig.id}`);
    await page.getByRole("button", { name: "Dismiss" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#dismiss-reason").fill("E2E: already handled");
    await dialog.getByRole("button", { name: "Dismiss signal" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    const { data: actions } = await ownerClient.from("signal_actions").select("action_type").eq("signal_id", sig.id).eq("action_type", "dismissed");
    expect((actions ?? []).length).toBeGreaterThan(0);
    const { data: sigRow } = await ownerClient.from("signals").select("is_active").eq("id", sig.id).single();
    expect(sigRow?.is_active).toBe(false);
  });
});

// ── 3.3 Task substrate ───────────────────────────────────────────────────────
test.describe("3.3 Task detail", () => {
  test("3.3.1 task detail renders all 6 tabs", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/tasks/${anyTaskId}`);
    for (const t of ["Overview", "Events", "Comments", "Work Logs", "Attachments", "Dependencies"]) {
      await expect(page.getByRole("tab", { name: t })).toBeVisible();
    }
  });

  test("3.3.2 add comment writes a task_events(comment) row", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/tasks/${anyTaskId}`);
    const body = `E2E comment ${Date.now()}`;
    await addComment(page, body);
    await expect(page.getByText(body).first()).toBeVisible({ timeout: 10_000 });
    const { data } = await ownerClient.from("task_events").select("id").eq("task_id", anyTaskId).eq("event_type", "comment").limit(20);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  test("3.3.3 log work writes a task_events(work_logged) row", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/tasks/${anyTaskId}`);
    const desc = `E2E work ${Date.now()}`;
    await logWork(page, 30, desc);
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 10_000 });
    const { data } = await ownerClient.from("task_events").select("id").eq("task_id", anyTaskId).eq("event_type", "work_logged").limit(20);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  test("3.3.4 status queued→in_progress sets started_at + preserves board_rank", async ({ page }) => {
    test.skip(queued.length === 0, "no queued task seeded");
    const q = queued[0]!;
    await signInAs(page, "owner");
    await page.goto(`/tasks/${q.id}`);
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "In Progress" }).click();
    await expect.poll(async () => {
      const { data } = await ownerClient.from("tasks").select("status, started_at_utc, board_rank").eq("id", q.id).single();
      return data?.status;
    }, { timeout: 10_000 }).toBe("in_progress");
    const { data } = await ownerClient.from("tasks").select("started_at_utc, board_rank").eq("id", q.id).single();
    expect(data?.started_at_utc).not.toBeNull();
    expect(data?.board_rank).toBe(q.board_rank); // rank preserved across the transition
    const { data: ev } = await ownerClient.from("task_events").select("id").eq("task_id", q.id).eq("event_type", "status_change").limit(5);
    expect((ev ?? []).length).toBeGreaterThan(0);
  });
});

// ── 3.4 Fleet Kanban drag-drop ───────────────────────────────────────────────
test.describe("3.4 Fleet Kanban drag", () => {
  test("3.4.1 Under Maintenance→On Ground prompts confirm; cancel is a no-op, confirm persists", async ({ page }) => {
    test.setTimeout(90_000);
    const src = tailByState.get("under_maintenance");
    test.skip(!src, "no under_maintenance aircraft seeded");
    const { id, tail } = src!;
    await signInAs(page, "owner");
    await page.goto("/fleet");

    await dragKanbanCard(page, tail, "On Ground");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Confirm maintenance complete")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    let { data: afterCancel } = await ownerClient.from("aircraft_state").select("state").eq("aircraft_id", id).single();
    expect(afterCancel?.state).toBe("under_maintenance");

    try {
      await dragKanbanCard(page, tail, "On Ground");
      await confirmModalAndWait(page, "Confirm");
      await expect.poll(async () => {
        const { data } = await ownerClient.from("aircraft_state").select("state").eq("aircraft_id", id).single();
        return data?.state;
      }, { timeout: 10_000 }).toBe("on_ground");
    } finally {
      await ownerClient.from("aircraft_state").update({ state: "under_maintenance" }).eq("aircraft_id", id);
    }
  });

  test("3.4.2 On Ground→In Air prompts departure fields and updates state", async ({ page }) => {
    test.setTimeout(90_000);
    const src = tailByState.get("on_ground");
    test.skip(!src, "no on_ground aircraft seeded");
    const { id, tail } = src!;
    const { data: before } = await ownerClient.from("aircraft_state").select("state, current_station").eq("aircraft_id", id).single();
    await signInAs(page, "owner");
    await page.goto("/fleet");
    try {
      await dragKanbanCard(page, tail, "In Air");
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Confirm departure")).toBeVisible();
      await expect(dialog.locator("#dest")).toBeVisible();
      await expect(dialog.locator("#arr")).toBeVisible();
      await dialog.locator("#dest").fill("LHR");
      await confirmModalAndWait(page, "Confirm");
      await expect.poll(async () => {
        const { data } = await ownerClient.from("aircraft_state").select("state").eq("aircraft_id", id).single();
        return data?.state;
      }, { timeout: 10_000 }).toBe("in_air");
    } finally {
      await ownerClient.from("aircraft_state").update({ state: before?.state ?? "on_ground", current_station: before?.current_station ?? null, next_event_type: null, next_event_at: null }).eq("aircraft_id", id);
    }
  });
});

// ── 3.5 Tail-scoped task board ───────────────────────────────────────────────
test.describe("3.5 Tail task board", () => {
  test("3.5.1 /aircraft/[id]/tasks renders Past / Present / Future columns", async ({ page }) => {
    await signInAs(page, "owner");
    const anyAircraft = tailByState.values().next().value;
    test.skip(!anyAircraft, "no aircraft available");
    await page.goto(`/aircraft/${anyAircraft!.id}/tasks`);
    for (const label of ["Past", "Present", "Future"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });
});

// ── 3.6 Two-browser realtime ─────────────────────────────────────────────────
test.describe("3.6 Realtime", () => {
  test.fixme("3.6.1 signal creation propagates to /signals", async () => {
    // /signals renders the derived TASKS queue (get_command_center_queue), not
    // raw signal rows, so "a new signal appears in /signals" does not map to a
    // single realtime insert. Live propagation is covered by 3.6.2 (task detail)
    // and 2.4.1 (fleet-board). Would need the queue to subscribe to `signals`.
  });

  test("3.6.2 task status change propagates across browsers", async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(queued.length < 2, "need a spare queued task");
    const q = queued[1]!;
    const { a, b, close } = await twoContexts(browser, "owner");
    try {
      await a.goto(`/tasks/${q.id}`);
      await b.goto(`/tasks/${q.id}`);
      await a.getByRole("combobox").first().click();
      await a.getByRole("option", { name: "In Progress" }).click();
      // B's status control reflects the change via task realtime invalidation.
      await expect(b.getByRole("combobox").first()).toContainText("In Progress", { timeout: 8_000 });
    } finally {
      await ownerClient.from("tasks").update({ status: "queued" }).eq("id", q.id);
      await close();
    }
  });
});

// ── 3.7 Cross-persona visibility ─────────────────────────────────────────────
test.describe("3.7 Cross-persona", () => {
  test("3.7.1 read-only user is blocked from creating a task (RLS/RPC enforced)", async () => {
    // The UI does not hide/disable Create Task for the viewer role (write-gating
    // is at the RLS/RPC layer, per Module 1). Assert the real enforcement: a
    // viewer's create_task RPC is rejected.
    test.skip(activeSignals.length === 0, "no signal to target");
    const sig = activeSignals[0]!;
    const ro = await getAnonClientAs("read_only");
    const { error } = await ro.rpc("create_task", {
      p_aircraft_id: sig.aircraft_id,
      p_title: "viewer-should-fail",
      p_why_summary: "x",
      p_parent_type: "powerplant",
      p_sub_type: "engine_borescope",
    });
    expect(error).not.toBeNull(); // RLS/permission denies the write
  });

  test.fixme("3.7.2 dispatcher cannot access compliance-category signals", async () => {
    // Categories are not role-gated: every operator member (incl. dispatcher)
    // sees the full Category filter list including Compliance. There is no
    // per-role category restriction to assert. (Same gap family as Module 1's
    // 1.2.3.) Would require role-scoped category filtering.
  });
});
