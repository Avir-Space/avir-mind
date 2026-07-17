import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Building2,
  Code2,
  ClipboardCheck,
  Gauge,
  Cpu,
  FileSignature,
  FlaskConical,
  Forklift,
  LayoutDashboard,
  LayoutGrid,
  Package,
  PlaneTakeoff,
  Radio,
  ScrollText,
  Settings,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";

export type BusinessModel = "operator" | "mro" | "hybrid";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Modules not yet built show a subtle "soon" affordance but still route. */
  phase?: number;
  expandable?: boolean;
  /** Which business models show this item. Omitted = all. */
  models?: BusinessModel[];
  /** Only shown to the founder (owner) role. */
  founderOnly?: boolean;
};

/**
 * Primary sidebar navigation. Order reflects the Phase 2.5 IA: the operational
 * canvas (Command Center) is the home surface; the signals inbox lives one step
 * deeper at Signals; Fleet carries its own Board/List toggle (Aircraft merged in).
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Command Center", href: "/command-center", icon: LayoutGrid },
  { label: "Signals", href: "/signals", icon: Radio },
  // MRO lens (Phase 12)
  { label: "Shop Floor", href: "/shop-floor", icon: Wrench, phase: 12, models: ["mro", "hybrid"] },
  { label: "Customers", href: "/customers", icon: Building2, phase: 12, models: ["mro", "hybrid"] },
  { label: "Contracts", href: "/contracts", icon: FileSignature, phase: 12, models: ["mro", "hybrid"] },
  { label: "Work Packages", href: "/work-packages", icon: ClipboardCheck, phase: 12, models: ["mro", "hybrid"] },
  // Operator lens
  { label: "Fleet", href: "/fleet", icon: Boxes, models: ["operator", "hybrid"] },
  { label: "Components", href: "/components", icon: Cpu, phase: 4 },
  { label: "Genealogy", href: "/genealogy", icon: ScrollText, phase: 4 },
  { label: "Inventory", href: "/inventory", icon: Package, phase: 5 },
  { label: "Assets", href: "/assets", icon: Forklift, phase: 5 },
  { label: "Crew", href: "/crew", icon: Users, phase: 6, models: ["operator", "hybrid"] },
  { label: "Flight Ops", href: "/flight-ops", icon: PlaneTakeoff, phase: 7, models: ["operator", "hybrid"] },
  { label: "Compliance", href: "/compliance", icon: ClipboardCheck, phase: 8 },
  { label: "Calibration", href: "/calibration", icon: TrendingUp, phase: 9 },
  { label: "Backtest", href: "/backtest", icon: FlaskConical, phase: 10 },
  { label: "Dashboards", href: "/dashboards", icon: LayoutDashboard },
  { label: "Developers", href: "/developers", icon: Code2, phase: 13 },
  { label: "AVIR Index", href: "/admin/index", icon: Gauge, phase: 14, founderOnly: true },
  { label: "Settings", href: "/settings", icon: Settings },
];

/** Nav filtered for a tenant's business model. */
export function navForModel(model: string): NavItem[] {
  const m = (model as BusinessModel) || "operator";
  return NAV_ITEMS.filter((i) => !i.models || i.models.includes(m));
}
