import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  ClipboardCheck,
  Cpu,
  LayoutDashboard,
  LayoutGrid,
  Package,
  PlaneTakeoff,
  Radio,
  ScrollText,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Modules not yet built show a subtle "soon" affordance but still route. */
  phase?: number;
  expandable?: boolean;
};

/**
 * Primary sidebar navigation. Order reflects the Phase 2.5 IA: the operational
 * canvas (Command Center) is the home surface; the signals inbox lives one step
 * deeper at Signals; Fleet carries its own Board/List toggle (Aircraft merged in).
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Command Center", href: "/command-center", icon: LayoutGrid },
  { label: "Signals", href: "/signals", icon: Radio },
  { label: "Fleet", href: "/fleet", icon: Boxes },
  { label: "Components", href: "/components", icon: Cpu, phase: 4 },
  { label: "Genealogy", href: "/genealogy", icon: ScrollText, phase: 4 },
  { label: "Inventory", href: "/inventory", icon: Package, phase: 5 },
  { label: "Crew", href: "/crew", icon: Users, phase: 6 },
  { label: "Flight Ops", href: "/flight-ops", icon: PlaneTakeoff, phase: 7 },
  { label: "Compliance", href: "/compliance", icon: ClipboardCheck, phase: 8 },
  { label: "Impact", href: "/impact", icon: TrendingUp, phase: 9 },
  { label: "Dashboards", href: "/dashboards", icon: LayoutDashboard },
  { label: "Settings", href: "/settings", icon: Settings },
];
