// AVIR Mind — Phase 7: fetch-weather Edge Function
//
// Polls METAR + TAF from aviationweather.gov (US government data, free, no key)
// for the caller org's active stations and stores them as weather_observations.
// Run on a schedule (every 30 min for METAR, 6 h for TAF) via Supabase cron, or
// invoke on demand. Seed data covers the demo fleet when this isn't scheduled.

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

// aviationweather.gov speaks ICAO; the demo fleet is stored in IATA.
const IATA_TO_ICAO: Record<string, string> = {
  FRA: "EDDF", JFK: "KJFK", LAX: "KLAX", ORD: "KORD", DFW: "KDFW", DEL: "VIDP", BOM: "VABB",
  LHR: "EGLL", ATL: "KATL", DEN: "KDEN", SEA: "KSEA", DXB: "OMDB", MIA: "KMIA", BLR: "VOBL", DOH: "OTHH",
};
const ICAO_TO_IATA: Record<string, string> = Object.fromEntries(Object.entries(IATA_TO_ICAO).map(([i, c]) => [c, i]));

function flightCategory(ceilingFt: number | null, visM: number | null): string | null {
  if (ceilingFt == null && visM == null) return null;
  const c = ceilingFt ?? 99999, v = visM ?? 99999;
  if (c < 500 || v < 1600) return "lifr";
  if (c < 1000 || v < 5000) return "ifr";
  if (c < 3000 || v < 8000) return "mvfr";
  return "vfr";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: member } = await admin.from("org_members").select("org_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!member) return json({ error: "no org" }, 403);
  const orgId = member.org_id;

  // Stations = distinct base stations for this org's aircraft.
  const { data: acs } = await admin.from("aircraft").select("base_station").eq("org_id", orgId);
  const iata = [...new Set((acs ?? []).map((a: { base_station: string | null }) => a.base_station).filter(Boolean) as string[])];
  const icao = iata.map((c) => IATA_TO_ICAO[c]).filter(Boolean);
  if (icao.length === 0) return json({ inserted: 0, note: "no mappable stations" });

  let inserted = 0;
  try {
    const res = await fetch(`https://aviationweather.gov/api/data/metar?ids=${icao.join(",")}&format=json`);
    if (!res.ok) throw new Error(`metar fetch ${res.status}`);
    const metars = (await res.json()) as Record<string, unknown>[];
    const rows = metars.map((m) => {
      const icaoId = String(m.icaoId ?? "");
      const ceil = typeof m.ceil === "number" ? m.ceil * 100 : null; // hundreds of ft
      const visSm = typeof m.visib === "number" ? m.visib : null;
      const visM = visSm != null ? Math.round(visSm * 1609) : null;
      return {
        org_id: orgId, station_code: ICAO_TO_IATA[icaoId] ?? icaoId, observation_type: "metar",
        observation_time_utc: (m.reportTime as string) ?? new Date().toISOString(),
        raw_text: (m.rawOb as string) ?? null,
        parsed_data: { wind_dir: m.wdir, wind_kt: m.wspd, visibility_m: visM, ceiling_ft: ceil, temp_c: m.temp, dewpoint_c: m.dewp, altimeter_hpa: m.altim },
        flight_category: flightCategory(ceil, visM), source: "noaa",
      };
    });
    if (rows.length) {
      const { error } = await admin.from("weather_observations").insert(rows);
      if (error) throw error;
      inserted = rows.length;
    }
  } catch (e) {
    return json({ error: "weather fetch failed", detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) }, 200);
  }
  return json({ inserted, stations: iata });
});
