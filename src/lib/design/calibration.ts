/** Phase 9 — Calibration Scoreboard design tokens. */

/** Accuracy % → semantic color (calibration quality, not the brand accent). */
export function accuracyHex(pct: number | null | undefined): string {
  if (pct == null) return "#6B7280";
  if (pct >= 75) return "#16A34A";
  if (pct >= 60) return "#CA8A04";
  if (pct >= 45) return "#EA580C";
  return "#DC2626";
}

export const SAMPLE_STATUS: Record<string, { label: string; hex: string }> = {
  sufficient: { label: "Sufficient", hex: "#16A34A" },
  marginal: { label: "Marginal", hex: "#CA8A04" },
  insufficient: { label: "Insufficient", hex: "#94A3B8" },
};
export const sampleStatus = (s: string | null | undefined) => SAMPLE_STATUS[s ?? ""] ?? { label: s ?? "—", hex: "#6B7280" };

export const SIGNAL_CLASS_LABEL: Record<string, string> = {
  observation: "Observation",
  prediction: "Prediction",
  insufficient_data: "Insufficient data",
};
export const signalClassLabel = (c: string) => SIGNAL_CLASS_LABEL[c] ?? c;

export const CONFIDENCE_LEVEL: Record<string, { label: string; hex: string }> = {
  high: { label: "High", hex: "#1019EC" },
  medium: { label: "Medium", hex: "#2563EB" },
  low: { label: "Low", hex: "#6B7280" },
};
export const confidenceLevel = (c: string) => CONFIDENCE_LEVEL[c] ?? { label: c, hex: "#6B7280" };

export const PUBLICATION_CHANNEL: Record<string, string> = {
  website: "Website",
  api: "API",
  press_release: "Press release",
  customer_report: "Customer report",
  regulator_briefing: "Regulator briefing",
};

export const SCOREBOARD_TYPE_LABEL: Record<string, string> = {
  tenant_internal: "Internal",
  cross_tenant_public: "Public",
  cross_tenant_beta: "Beta",
};

export const CAL_WINDOWS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 180, label: "180d" },
  { value: 365, label: "365d" },
] as const;

/** Pretty a snake_case category. */
export const prettyCategory = (c: string) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

/** Delta arrow glyph + color. */
export function deltaTone(delta: number | null | undefined): { glyph: string; hex: string } {
  if (delta == null || delta === 0) return { glyph: "→", hex: "#6B7280" };
  return delta > 0 ? { glyph: "↑", hex: "#16A34A" } : { glyph: "↓", hex: "#DC2626" };
}
