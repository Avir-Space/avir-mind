import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  ClipboardCheck,
  Command,
  Cpu,
  LayoutDashboard,
  Package,
  Plane,
  PlaneTakeoff,
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
 * Primary sidebar navigation. Order is locked per the Phase 0 spec.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Command Center", href: "/command-center", icon: Command },
  { label: "Fleet", href: "/fleet", icon: Boxes },
  { label: "Aircraft", href: "/aircraft", icon: Plane },
  { label: "Components", href: "/components", icon: Cpu, phase: 4 },
  { label: "Inventory", href: "/inventory", icon: Package, phase: 5 },
  { label: "Crew", href: "/crew", icon: Users, phase: 6 },
  { label: "Flight Ops", href: "/flight-ops", icon: PlaneTakeoff, phase: 7 },
  { label: "Compliance", href: "/compliance", icon: ClipboardCheck, phase: 8 },
  { label: "Impact", href: "/impact", icon: TrendingUp, phase: 9 },
  { label: "Dashboards", href: "/dashboards", icon: LayoutDashboard },
  { label: "Settings", href: "/settings", icon: Settings },
];
