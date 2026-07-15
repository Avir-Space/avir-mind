import type {
  AircraftStateValue,
  Severity,
  StateConfidence,
  StateSource,
} from "@/types/domain";

/**
 * Central registry for every state/quality vocabulary in the product.
 * Badges, filters, and future dashboards all read from here so that a color or
 * label is defined exactly once.
 */

export const SEVERITY_CONFIG: Record<Severity, { label: string; hex: string; className: string }> = {
  critical: { label: "Critical", hex: "#DC2626", className: "text-severity-critical" },
  high: { label: "High", hex: "#EA580C", className: "text-severity-high" },
  medium: { label: "Medium", hex: "#CA8A04", className: "text-severity-medium" },
  low: { label: "Low", hex: "#16A34A", className: "text-severity-low" },
  info: { label: "Info", hex: "#2563EB", className: "text-severity-info" },
};

export type StateMeta = {
  label: string;
  /** Whether this counts toward dispatch-readiness. */
  dispatchReady: boolean;
  /** Dot color for the state chip. */
  dotHex: string;
  description: string;
};

export const STATE_CONFIG: Record<AircraftStateValue, StateMeta> = {
  in_air: {
    label: "In Air",
    dispatchReady: true,
    dotHex: "#2563EB",
    description: "Airborne on an active leg.",
  },
  on_ground: {
    label: "On Ground",
    dispatchReady: true,
    dotHex: "#16A34A",
    description: "At a station, dispatch-ready.",
  },
  stationed: {
    label: "Stationed",
    dispatchReady: true,
    dotHex: "#16A34A",
    description: "Positioned at base, available.",
  },
  under_maintenance: {
    label: "Under Maintenance",
    dispatchReady: false,
    dotHex: "#EA580C",
    description: "Out of service for scheduled or unscheduled work.",
  },
  unknown: {
    label: "Unknown",
    dispatchReady: false,
    dotHex: "#6B7280",
    description: "No recent telemetry or ops signal.",
  },
};

export const SOURCE_CONFIG: Record<StateSource, { label: string; description: string }> = {
  telemetry: { label: "Telemetry", description: "Direct from aircraft/ADS-B feed." },
  ops_system: { label: "Ops System", description: "Relayed from an ops/movement system." },
  manual: { label: "Manual", description: "Entered by a person." },
};

export const CONFIDENCE_CONFIG: Record<
  StateConfidence,
  { label: string; severity: Severity }
> = {
  high: { label: "High", severity: "low" },
  medium: { label: "Medium", severity: "medium" },
  low: { label: "Low", severity: "high" },
};
