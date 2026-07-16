import { SEVERITY_CONFIG } from "@/lib/design/state";
import type { SignalConfidence, SignalSeverity } from "@/types/signals";

/**
 * Signal severity extends the shared severity palette with `insufficient_data`
 * (neutral gray) — the state where Mind refuses to hallucinate.
 */
export const SIGNAL_SEVERITY: Record<SignalSeverity, { label: string; hex: string }> = {
  critical: { label: "Critical", hex: SEVERITY_CONFIG.critical.hex },
  high: { label: "High", hex: SEVERITY_CONFIG.high.hex },
  medium: { label: "Medium", hex: SEVERITY_CONFIG.medium.hex },
  low: { label: "Low", hex: SEVERITY_CONFIG.low.hex },
  info: { label: "Info", hex: SEVERITY_CONFIG.info.hex },
  insufficient_data: { label: "Insufficient Data", hex: "#6B7280" },
};

/** Rank for sorting signals by urgency. */
export const SIGNAL_SEVERITY_RANK: Record<SignalSeverity, number> = {
  critical: 6,
  high: 5,
  medium: 4,
  low: 3,
  info: 2,
  insufficient_data: 1,
};

/** Confidence tooltips — what each level means for an operator. */
export const CONFIDENCE_MEANING: Record<SignalConfidence, string> = {
  high: "Pattern is clear and evidence is strong.",
  medium: "Pattern is likely but evidence is partial.",
  low: "Interesting observation, but evidence is limited.",
};

export const CONFIDENCE_HEX: Record<SignalConfidence, string> = {
  high: SEVERITY_CONFIG.low.hex, // green — trustworthy
  medium: SEVERITY_CONFIG.medium.hex,
  low: SEVERITY_CONFIG.high.hex,
};

/** Map a signal severity → the risk_band used when creating a task from it. */
export function severityToRiskBand(severity: SignalSeverity): "high" | "medium" | "low" {
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

/** Human labels for signal_action types. */
export const ACTION_LABELS: Record<string, string> = {
  viewed: "Viewed",
  acknowledged: "Acknowledged",
  create_task: "Created task",
  dismissed: "Dismissed",
  what_if_explored: "Explored what-if",
  marked_incorrect: "Marked incorrect",
  marked_correct: "Marked correct",
};
