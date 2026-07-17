/** Phase 12 — MRO design tokens. */

export const ASSIGNMENT_STATUS: Record<string, { label: string; hex: string }> = {
  expected: { label: "Expected", hex: "#94A3B8" },
  arrived: { label: "Arrived", hex: "#2563EB" },
  in_service: { label: "In Service", hex: "#1019EC" },
  awaiting_parts: { label: "Awaiting Parts", hex: "#EA580C" },
  awaiting_customer: { label: "Awaiting Customer", hex: "#CA8A04" },
  ready_for_release: { label: "Ready for Release", hex: "#16A34A" },
  released: { label: "Released", hex: "#6B7280" },
  cancelled: { label: "Cancelled", hex: "#DC2626" },
};
export const assignmentStatus = (s: string) => ASSIGNMENT_STATUS[s] ?? { label: s, hex: "#6B7280" };

/** Shop-floor kanban column order. */
export const SHOP_COLUMNS = [
  { key: "arrived", label: "Arrived" },
  { key: "in_service", label: "In Service" },
  { key: "awaiting_parts", label: "Awaiting Parts" },
  { key: "awaiting_customer", label: "Awaiting Customer" },
  { key: "ready_for_release", label: "Ready for Release" },
] as const;

export const WP_STATUS: Record<string, { label: string; hex: string }> = {
  planned: { label: "Planned", hex: "#94A3B8" },
  in_progress: { label: "In Progress", hex: "#1019EC" },
  held: { label: "Held", hex: "#EA580C" },
  awaiting_parts: { label: "Awaiting Parts", hex: "#EA580C" },
  awaiting_customer_approval: { label: "Awaiting Approval", hex: "#CA8A04" },
  complete: { label: "Complete", hex: "#16A34A" },
  cancelled: { label: "Cancelled", hex: "#6B7280" },
};
export const wpStatus = (s: string) => WP_STATUS[s] ?? { label: s, hex: "#6B7280" };

export const PACKAGE_TYPE_LABEL: Record<string, string> = {
  scheduled_check: "Scheduled check", line_service: "Line service", ad_compliance: "AD compliance",
  sb_incorporation: "SB incorporation", modification: "Modification", unscheduled: "Unscheduled", warranty_repair: "Warranty repair",
};

export const CONTRACT_TYPE_LABEL: Record<string, string> = {
  power_by_hour: "Power-by-Hour", fixed_fee: "Fixed Fee", time_and_materials: "Time & Materials",
  block_hour: "Block Hour", ad_hoc: "Ad Hoc", mixed: "Mixed",
};

export const CONTRACT_STATUS: Record<string, { label: string; hex: string }> = {
  draft: { label: "Draft", hex: "#94A3B8" },
  active: { label: "Active", hex: "#16A34A" },
  expiring_soon: { label: "Expiring Soon", hex: "#EA580C" },
  expired: { label: "Expired", hex: "#DC2626" },
  terminated: { label: "Terminated", hex: "#6B7280" },
  renewed: { label: "Renewed", hex: "#2563EB" },
};
export const contractStatus = (s: string) => CONTRACT_STATUS[s] ?? { label: s, hex: "#6B7280" };

export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  operator_airline: "Airline", operator_charter: "Charter", operator_corporate: "Corporate",
  operator_government: "Government", lessor: "Lessor", insurer: "Insurer", another_mro: "MRO", oem_warranty: "OEM Warranty", other: "Other",
};

export const FINDING_SEVERITY: Record<string, { label: string; hex: string }> = {
  minor: { label: "Minor", hex: "#2563EB" }, moderate: { label: "Moderate", hex: "#CA8A04" },
  major: { label: "Major", hex: "#EA580C" }, critical: { label: "Critical", hex: "#DC2626" },
};
export const findingSeverity = (s: string) => FINDING_SEVERITY[s] ?? { label: s, hex: "#6B7280" };

export const usd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
