/**
 * Command Center canvas vocabulary. Marker color + size per operational state.
 * AOG is a derived display state (a dispatch-blocking/AOG task or an AOG-recovery
 * event) — it is NOT a stored aircraft_state value.
 */
export const CANVAS_STATE: Record<
  string,
  { label: string; hex: string; radius: number; emphasis?: boolean }
> = {
  in_air: { label: "In Air", hex: "#1019EC", radius: 6 },
  on_ground: { label: "On Ground", hex: "#6B7280", radius: 5 },
  stationed: { label: "Stationed", hex: "#94A3B8", radius: 5 },
  under_maintenance: { label: "Under Maintenance", hex: "#CA8A04", radius: 6 },
  aog: { label: "AOG", hex: "#DC2626", radius: 9, emphasis: true },
  unknown: { label: "Unknown", hex: "#6B7280", radius: 4 },
};

export function canvasState(state: string | null | undefined) {
  return CANVAS_STATE[state ?? "unknown"] ?? CANVAS_STATE.unknown!;
}

/** Severity → hex, mirrors SEVERITY_CONFIG for the max_severity aggregate. */
export const SEVERITY_HEX: Record<string, string> = {
  critical: "#DC2626",
  high: "#EA580C",
  medium: "#CA8A04",
  low: "#16A34A",
  info: "#2563EB",
  insufficient_data: "#6B7280",
};

export const TIME_WINDOWS = [
  { value: "now", label: "Now", hours: 2 },
  { value: "6h", label: "Next 6h", hours: 6 },
  { value: "12h", label: "Next 12h", hours: 12 },
  { value: "today", label: "Today", hours: 24 },
] as const;

export type TimeWindowValue = (typeof TIME_WINDOWS)[number]["value"];
