// AVIR Mind — Phase 10: ingest-backtest-data Edge Function
//
// Accepts an uploaded historical file (CSV or JSON, sent as text in the body)
// plus source_type + backtest_project_id. Parses, normalizes to canonical
// records, and inserts backtest_reconstructed_states (+ backtest_actual_events
// for outcome rows). Robust to: extra columns (ignored), missing optional
// columns (null), multiple date formats (normalized to UTC), row-level errors
// (logged to ingestion_errors, never abort the whole file).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** Parse a CSV string into array of row objects. Handles quoted fields + commas. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((v) => v.trim() !== "")).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}

/** Normalize varied date strings → ISO UTC. Returns null if unparseable. */
function toUtc(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  // dd/mm/yyyy or mm/dd/yyyy heuristic → let Date try ISO-ish first
  let d = new Date(t);
  if (isNaN(d.getTime())) {
    const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(.*)$/);
    if (m) { const [, a, b, y, rest] = m; d = new Date(`${y.length === 2 ? "20" + y : y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}${rest || ""}`); }
  }
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const { backtest_project_id, source_type, source_file_name, content } = await req.json().catch(() => ({}));
    if (!backtest_project_id || !source_type || !content) return json({ error: "backtest_project_id, source_type, content required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: proj, error: pErr } = await userClient.from("backtest_projects").select("id, org_id").eq("id", backtest_project_id).single();
    if (pErr || !proj) return json({ error: "project not found" }, 404);
    const org = proj.org_id as string;

    const errors: { row: number; error: string }[] = [];
    const states: Record<string, unknown>[] = [];
    const events: Record<string, unknown>[] = [];
    const isJson = source_type.startsWith("json");

    let rows: Record<string, string>[] = [];
    if (isJson) {
      try {
        const parsed = JSON.parse(content);
        rows = Array.isArray(parsed) ? parsed : (parsed.records ?? parsed.data ?? parsed.findings ?? []);
      } catch { return json({ error: "invalid JSON" }, 400); }
    } else {
      rows = parseCsv(content);
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as Record<string, string>;
      const g = (k: string) => (r[k] ?? r[k.toLowerCase()] ?? "") as string;
      try {
        if (source_type === "csv_aircraft_events") {
          const ts = toUtc(g("timestamp_utc")); const reg = g("aircraft_registration"); const et = g("event_type");
          if (!ts || !reg || !et) throw new Error("missing timestamp_utc / aircraft_registration / event_type");
          states.push({ org_id: org, backtest_project_id, entity_type: "aircraft", entity_external_id: reg, reconstruction_timestamp_utc: ts,
            state_snapshot: { event_type: et, from_state: g("from_state") || null, to_state: g("to_state") || null, station_code: g("station_code") || null, event_detail: g("event_detail") || null }, state_hash: await sha(reg + ts + et) });
          if (["incident_report", "unscheduled_removal", "aog"].includes(et.toLowerCase()))
            events.push({ org_id: org, backtest_project_id, actual_event_type: et, actual_event_time_utc: ts, entity_external_id: reg, event_description: g("event_detail") || et, severity_at_occurrence: "high" });
        } else if (source_type === "csv_component_events") {
          const ts = toUtc(g("timestamp_utc")); const reg = g("aircraft_registration"); const pn = g("component_part_number"); const sn = g("component_serial"); const et = g("event_type");
          if (!ts || !reg || !pn || !sn || !et) throw new Error("missing timestamp_utc / aircraft_registration / component_part_number / component_serial / event_type");
          const ext = `${pn}/${sn}`;
          states.push({ org_id: org, backtest_project_id, entity_type: "component", entity_external_id: ext, reconstruction_timestamp_utc: ts,
            state_snapshot: { event_type: et, aircraft_registration: reg, finding_severity: g("finding_severity") || null, finding_description: g("finding_description") || null, cycles_at_event: g("cycles_at_event") || null, hours_at_event: g("hours_at_event") || null, signal_category: "engine_borescope" }, state_hash: await sha(ext + ts + et) });
          if (et.toLowerCase() === "removed" || ["major", "critical"].includes((g("finding_severity") || "").toLowerCase()))
            events.push({ org_id: org, backtest_project_id, actual_event_type: et.toLowerCase() === "removed" ? "unscheduled_component_removal" : "major_finding", actual_event_time_utc: ts, entity_external_id: ext, event_description: g("finding_description") || et, severity_at_occurrence: g("finding_severity") || "high" });
        } else if (source_type === "csv_flights") {
          const fd = toUtc(g("flight_date") || g("scheduled_departure_utc")); const reg = g("aircraft_registration"); const fn = g("flight_number");
          if (!fd || !reg || !fn) throw new Error("missing flight_date / aircraft_registration / flight_number");
          const delay = parseInt(g("delay_minutes") || "0", 10) || 0;
          states.push({ org_id: org, backtest_project_id, entity_type: "flight", entity_external_id: reg, reconstruction_timestamp_utc: fd,
            state_snapshot: { flight_number: fn, origin: g("origin_station") || null, destination: g("destination_station") || null, delay_minutes: delay, delay_codes: g("delay_codes") || null, status: g("status") || null }, state_hash: await sha(reg + fd + fn) });
          if (delay >= 45)
            events.push({ org_id: org, backtest_project_id, actual_event_type: "flight_delay", actual_event_time_utc: fd, entity_external_id: reg, event_description: `Delay ${delay} min on ${fn}`, severity_at_occurrence: delay >= 120 ? "high" : "medium" });
        } else {
          // csv_maintenance / json_*_export / *_custom → generic: timestamp + entity + type
          const ts = toUtc(g("timestamp_utc") || g("timestamp") || g("date") || g("event_time"));
          const ext = g("entity_external_id") || g("aircraft_registration") || g("registration") || g("serial") || "unknown";
          const et = g("event_type") || g("type") || "event";
          if (!ts) throw new Error("missing timestamp");
          states.push({ org_id: org, backtest_project_id, entity_type: g("entity_type") || "aircraft", entity_external_id: ext, reconstruction_timestamp_utc: ts,
            state_snapshot: r, state_hash: await sha(ext + ts + et) });
        }
      } catch (rowErr) {
        errors.push({ row: i + 1, error: String((rowErr as Error).message) });
      }
    }

    // Insert in batches.
    let inserted = 0;
    for (let i = 0; i < states.length; i += 500) {
      const { error } = await admin.from("backtest_reconstructed_states").insert(states.slice(i, i + 500));
      if (error) errors.push({ row: -1, error: `state batch: ${error.message}` }); else inserted += Math.min(500, states.length - i);
    }
    let eventCount = 0;
    for (let i = 0; i < events.length; i += 500) {
      const { error } = await admin.from("backtest_actual_events").insert(events.slice(i, i + 500));
      if (error) errors.push({ row: -1, error: `event batch: ${error.message}` }); else eventCount += Math.min(500, events.length - i);
    }

    const { data: src } = await admin.from("backtest_data_sources").insert({
      org_id: org, backtest_project_id, source_type, source_file_name: source_file_name ?? "upload",
      source_file_size_bytes: content.length, source_storage_path: `${org}/${backtest_project_id}/${source_file_name ?? "upload"}`,
      rows_ingested: inserted, ingestion_errors: errors.length ? errors.slice(0, 100) : null, ingested_at_utc: new Date().toISOString(),
    }).select("id").single();

    await admin.from("backtest_projects").update({ status: "ready_to_run", updated_at_utc: new Date().toISOString() }).eq("id", backtest_project_id);

    return json({ ok: true, data_source_id: src?.id, rows_parsed: rows.length, states_ingested: inserted, actual_events_ingested: eventCount, errors: errors.slice(0, 50), error_count: errors.length });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
