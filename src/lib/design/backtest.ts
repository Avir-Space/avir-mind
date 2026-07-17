/** Phase 10 — Simulation Backtest design tokens. */

export const BACKTEST_STATUS: Record<string, { label: string; hex: string }> = {
  draft: { label: "Draft", hex: "#94A3B8" },
  ingesting: { label: "Ingesting", hex: "#2563EB" },
  ready_to_run: { label: "Ready to run", hex: "#0891B2" },
  running: { label: "Running", hex: "#CA8A04" },
  complete: { label: "Complete", hex: "#16A34A" },
  failed: { label: "Failed", hex: "#DC2626" },
  archived: { label: "Archived", hex: "#6B7280" },
};
export const backtestStatus = (s: string) => BACKTEST_STATUS[s] ?? { label: s, hex: "#6B7280" };

export const PURPOSE_LABEL: Record<string, string> = {
  sales_demo: "Sales demo",
  customer_evaluation: "Customer evaluation",
  internal_validation: "Internal validation",
  calibration_check: "Calibration check",
};

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  csv_aircraft_events: "CSV · Aircraft events",
  csv_component_events: "CSV · Component events",
  csv_flights: "CSV · Flights",
  csv_maintenance: "CSV · Maintenance",
  json_amos_export: "JSON · AMOS export",
  json_trax_export: "JSON · TRAX export",
  json_sap_export: "JSON · SAP export",
  json_custom: "JSON · Custom",
  csv_custom: "CSV · Custom",
};

export const MATCH_CONFIDENCE: Record<string, { label: string; hex: string }> = {
  exact: { label: "Exact", hex: "#16A34A" },
  likely: { label: "Likely", hex: "#65A30D" },
  uncertain: { label: "Uncertain", hex: "#CA8A04" },
  no_match: { label: "No match", hex: "#94A3B8" },
};
export const matchConfidence = (m: string | null | undefined) => MATCH_CONFIDENCE[m ?? ""] ?? { label: m ?? "—", hex: "#6B7280" };

export function caughtRateHex(pct: number): string {
  if (pct >= 70) return "#16A34A";
  if (pct >= 50) return "#CA8A04";
  return "#EA580C";
}

export const prettyCategory = (c: string) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
export const prettyEventType = (c: string) => c.replace(/_/g, " ");
