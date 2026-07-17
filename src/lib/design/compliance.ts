/** Phase 8 — compliance + DS.AI design tokens. */

export const AD_CRITICALITY: Record<string, { label: string; hex: string }> = {
  emergency: { label: "Emergency", hex: "#DC2626" },
  mandatory: { label: "Mandatory", hex: "#CA8A04" },
  recommended: { label: "Recommended", hex: "#2563EB" },
};
export const adCriticality = (c: string) => AD_CRITICALITY[c] ?? { label: c, hex: "#6B7280" };

export const COMPLIANCE_STATUS: Record<string, { label: string; hex: string }> = {
  open: { label: "Open", hex: "#CA8A04" },
  in_progress: { label: "In progress", hex: "#2563EB" },
  complied: { label: "Complied", hex: "#16A34A" },
  deferred: { label: "Deferred", hex: "#EA580C" },
  not_applicable: { label: "N/A", hex: "#94A3B8" },
};
export const complianceStatus = (s: string) => COMPLIANCE_STATUS[s] ?? { label: s, hex: "#6B7280" };

export const SB_CLASS: Record<string, { label: string; hex: string }> = {
  alert: { label: "Alert", hex: "#DC2626" },
  recommended: { label: "Recommended", hex: "#CA8A04" },
  optional: { label: "Optional", hex: "#2563EB" },
  informational: { label: "Info", hex: "#94A3B8" },
};
export const sbClass = (c: string) => SB_CLASS[c] ?? { label: c, hex: "#6B7280" };

export const MEL_CATEGORY: Record<string, { label: string; days: string; hex: string }> = {
  a: { label: "A", days: "as specified", hex: "#DC2626" },
  b: { label: "B", days: "3 days", hex: "#EA580C" },
  c: { label: "C", days: "10 days", hex: "#CA8A04" },
  d: { label: "D", days: "120 days", hex: "#2563EB" },
};
export const melCategory = (c: string) => MEL_CATEGORY[c] ?? { label: c.toUpperCase(), days: "—", hex: "#6B7280" };

export const MEL_STATUS: Record<string, { label: string; hex: string }> = {
  open: { label: "Open", hex: "#CA8A04" },
  extended: { label: "Extended", hex: "#EA580C" },
  rectified: { label: "Rectified", hex: "#16A34A" },
  expired: { label: "Expired", hex: "#DC2626" },
};
export const melStatus = (s: string) => MEL_STATUS[s] ?? { label: s, hex: "#6B7280" };

export const LLP_CRITICALITY: Record<string, { label: string; hex: string }> = {
  safety_critical: { label: "Safety critical", hex: "#DC2626" },
  regulatory_required: { label: "Regulatory", hex: "#CA8A04" },
  operator_policy: { label: "Operator policy", hex: "#2563EB" },
};
export const llpCriticality = (c: string) => LLP_CRITICALITY[c] ?? { label: c, hex: "#6B7280" };

export const REPORT_STATUS: Record<string, { label: string; hex: string }> = {
  draft: { label: "Draft", hex: "#94A3B8" },
  filed: { label: "Filed", hex: "#2563EB" },
  acknowledged: { label: "Acknowledged", hex: "#0891B2" },
  closed: { label: "Closed", hex: "#16A34A" },
};
export const reportStatus = (s: string) => REPORT_STATUS[s] ?? { label: s, hex: "#6B7280" };

export const REPORT_TYPE_LABEL: Record<string, string> = {
  mor: "MOR", msr: "MSR", sms_incident: "SMS Incident", srr: "SRR", quality_audit: "Quality Audit", other: "Other",
};

/** % of life used → severity color. */
export function llpToneHex(pct: number): string {
  if (pct >= 95) return "#DC2626";
  if (pct >= 85) return "#EA580C";
  if (pct >= 70) return "#CA8A04";
  return "#16A34A";
}

// ── DS.AI ──
export const DECISION_TYPE_LABEL: Record<string, string> = {
  signal_generation: "Signal generation",
  prediction_generation: "Prediction",
  task_auto_creation: "Task auto-creation",
  recommendation: "Recommendation",
  override_evaluation: "Override evaluation",
  priority_ranking: "Priority ranking",
  insight_synthesis: "Insight synthesis",
};
export const decisionTypeLabel = (t: string) => DECISION_TYPE_LABEL[t] ?? t.replace(/_/g, " ");

export const OVERSIGHT_TYPE: Record<string, { label: string; hex: string }> = {
  reviewed: { label: "Reviewed", hex: "#2563EB" },
  accepted: { label: "Accepted", hex: "#16A34A" },
  dismissed: { label: "Dismissed", hex: "#94A3B8" },
  corrected: { label: "Corrected", hex: "#EA580C" },
  overridden: { label: "Overridden", hex: "#CA8A04" },
  escalated: { label: "Escalated", hex: "#DC2626" },
};
export const oversightType = (t: string) => OVERSIGHT_TYPE[t] ?? { label: t, hex: "#6B7280" };

export const CONFIDENCE: Record<string, { label: string; hex: string }> = {
  high: { label: "High", hex: "#16A34A" },
  medium: { label: "Medium", hex: "#CA8A04" },
  low: { label: "Low", hex: "#EA580C" },
  insufficient_data: { label: "Insufficient data", hex: "#94A3B8" },
};
export const confidence = (c: string | null | undefined) => CONFIDENCE[c ?? ""] ?? { label: c ?? "—", hex: "#6B7280" };

/** Compliance-engine signal categories (footer awareness in the signals inbox). */
export const COMPLIANCE_SIGNAL_CATEGORIES = new Set([
  "ad_deadline_approaching", "sb_recommendation_open", "mel_extension_risk",
  "llp_approaching_limit", "dsai_oversight_gap",
]);
