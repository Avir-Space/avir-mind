/** Phase 11 — Communications design tokens. */

export const CHANNEL: Record<string, { label: string; icon: string; hex: string }> = {
  email: { label: "Email", icon: "mail", hex: "#2563EB" },
  slack: { label: "Slack", icon: "hash", hex: "#611f69" },
  sms: { label: "SMS", icon: "message-square", hex: "#0891B2" },
  in_app: { label: "In-app", icon: "bell", hex: "#1019EC" },
  webhook: { label: "Webhook", icon: "webhook", hex: "#6B7280" },
};
export const channel = (c: string) => CHANNEL[c] ?? { label: c, icon: "bell", hex: "#6B7280" };

export const DELIVERY_STATUS: Record<string, { label: string; hex: string }> = {
  queued: { label: "Queued", hex: "#94A3B8" },
  sending: { label: "Sending", hex: "#2563EB" },
  delivered: { label: "Delivered", hex: "#0891B2" },
  failed: { label: "Failed", hex: "#DC2626" },
  acknowledged: { label: "Acknowledged", hex: "#16A34A" },
  retried: { label: "Retried", hex: "#CA8A04" },
  cancelled: { label: "Cancelled", hex: "#6B7280" },
};
export const deliveryStatus = (s: string) => DELIVERY_STATUS[s] ?? { label: s, hex: "#6B7280" };

export const SEVERITY_HEX: Record<string, string> = {
  critical: "#DC2626", high: "#EA580C", medium: "#CA8A04", low: "#2563EB", info: "#94A3B8",
};
export const severityHex = (s: string | null | undefined) => SEVERITY_HEX[s ?? ""] ?? "#6B7280";

export const EVENT_TYPE_LABEL: Record<string, string> = {
  signal_created: "Signal created",
  signal_severity_changed: "Severity changed",
  task_created: "Task created",
  task_status_changed: "Task status changed",
  task_overdue: "Task overdue",
  prediction_matured: "Prediction matured",
  aog_declared: "AOG declared",
  mel_deferred: "MEL deferred",
  ad_deadline_approaching: "AD deadline approaching",
  crew_currency_gap: "Crew currency gap",
  weather_significant: "Significant weather",
  delay_recorded: "Delay recorded",
  other: "Other",
};
export const eventTypeLabel = (e: string) => EVENT_TYPE_LABEL[e] ?? e.replace(/_/g, " ");

export const SHIFT_PATTERN_LABEL: Record<string, string> = {
  day_shift: "Day shift", night_shift: "Night shift", "24_7_on_call": "24/7 on-call", business_hours: "Business hours",
};

export const QUIET_BEHAVIOR_LABEL: Record<string, string> = {
  respect: "Respect quiet hours", override: "Override (always send)", defer_until_hours_end: "Defer until quiet hours end",
};
