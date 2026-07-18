import {
  Armchair,
  CircuitBoard,
  ClipboardCheck,
  CircleDot,
  Flame,
  ListChecks,
  type LucideIcon,
  Package,
  PlaneTakeoff,
  Layers3,
  Send,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

import type { RiskBand, Severity, SourceSystem, TaskStatus } from "@/types/tasks";

/** Task category (parent_type) → label + icon. Single source of truth. */
export const CATEGORY_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  powerplant: { label: "Powerplant", icon: Flame },
  avionics: { label: "Avionics", icon: CircuitBoard },
  structures: { label: "Structures", icon: Layers3 },
  landing_gear: { label: "Landing Gear", icon: CircleDot },
  interior: { label: "Interior", icon: Armchair },
  flight_ops: { label: "Flight Ops", icon: PlaneTakeoff },
  crew: { label: "Crew", icon: Users },
  compliance: { label: "Compliance", icon: ClipboardCheck },
  inventory: { label: "Inventory", icon: Package },
  ground_ops: { label: "Ground Ops", icon: Truck },
  // Operational insight categories — tasks promoted from AI observation signals.
  dispatch: { label: "Dispatch", icon: Send },
  maintenance: { label: "Maintenance", icon: Wrench },
  task_management: { label: "Task Management", icon: ListChecks },
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_CONFIG);

export function categoryMeta(parentType: string) {
  return CATEGORY_CONFIG[parentType] ?? { label: parentType, icon: CircleDot };
}

/** Humanize a sub_type slug: efis_fault → EFIS Fault-ish (title case). */
export function humanizeSubType(sub: string) {
  return sub
    .split("_")
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Task status → label + dot color. */
export const STATUS_CONFIG: Record<TaskStatus, { label: string; dotHex: string }> = {
  queued: { label: "Queued", dotHex: "#6B7280" },
  in_progress: { label: "In Progress", dotHex: "#2563EB" },
  blocked: { label: "Blocked", dotHex: "#DC2626" },
  monitoring: { label: "Monitoring", dotHex: "#CA8A04" },
  done: { label: "Done", dotHex: "#16A34A" },
};

export const STATUS_KEYS = Object.keys(STATUS_CONFIG) as TaskStatus[];

export const RISK_CONFIG: Record<RiskBand, { label: string; severity: Severity }> = {
  high: { label: "High", severity: "high" },
  medium: { label: "Medium", severity: "medium" },
  low: { label: "Low", severity: "low" },
};

/** Task source systems. `avir` is native (brand); the rest are upstream systems. */
export const SOURCE_SYSTEM_CONFIG: Record<SourceSystem, { label: string; native: boolean }> = {
  amos: { label: "AMOS", native: false },
  trax: { label: "TRAX", native: false },
  sap: { label: "SAP", native: false },
  fr: { label: "FR", native: false },
  avir: { label: "AVIR", native: true },
};

export const SOURCE_SYSTEM_KEYS = Object.keys(SOURCE_SYSTEM_CONFIG) as SourceSystem[];

/** Fleet board columns in display order. */
export const BOARD_COLUMNS: { key: string; label: string }[] = [
  { key: "under_maintenance", label: "Under Maintenance" },
  { key: "in_air", label: "In Air" },
  { key: "on_ground", label: "On Ground" },
  { key: "stationed", label: "Stationed" },
];

/**
 * Client mirror of the SQL task_severity() derivation, for any place we compute
 * severity from a raw task without going through an RPC.
 */
export function severityForTask(risk: RiskBand, blocking: boolean, aog: boolean): Severity {
  if (aog) return "critical";
  if (blocking && risk === "high") return "critical";
  if (risk === "high") return "high";
  if (risk === "medium") return "medium";
  return "low";
}
