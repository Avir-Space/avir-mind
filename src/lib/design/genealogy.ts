import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BadgeCheck,
  ClipboardCheck,
  FileText,
  Gauge,
  PackagePlus,
  PackageMinus,
  ScrollText,
  ShieldAlert,
  Wrench,
} from "lucide-react";

export const RECORD_TYPE_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  birth_certificate: { label: "Birth Certificate", icon: ScrollText },
  installation: { label: "Installation", icon: PackagePlus },
  removal: { label: "Removal", icon: PackageMinus },
  overhaul: { label: "Overhaul", icon: Wrench },
  repair: { label: "Repair", icon: Wrench },
  finding: { label: "Finding", icon: ShieldAlert },
  cycle_snapshot: { label: "Cycle Snapshot", icon: Gauge },
  hours_snapshot: { label: "Hours Snapshot", icon: Gauge },
  ownership_transfer: { label: "Ownership Transfer", icon: ArrowLeftRight },
  documentation_upload: { label: "Documentation", icon: FileText },
  incident: { label: "Incident", icon: ShieldAlert },
  warranty_claim: { label: "Warranty Claim", icon: FileText },
  return_to_service: { label: "Return to Service", icon: ClipboardCheck },
  sale: { label: "Sale", icon: ArrowLeftRight },
  lease: { label: "Lease", icon: ArrowLeftRight },
};

export function recordType(t: string) {
  return RECORD_TYPE_CONFIG[t] ?? { label: t.replace(/_/g, " "), icon: FileText };
}

export const CONFIDENCE_CONFIG: Record<string, { label: string; hex: string }> = {
  verified: { label: "Verified", hex: "#16A34A" },
  self_reported: { label: "Self-reported", hex: "#CA8A04" },
  inferred: { label: "Inferred", hex: "#6B7280" },
};

export const VERIFICATION_STATE_CONFIG: Record<string, { label: string; hex: string; icon: LucideIcon }> = {
  unverified: { label: "Unverified", hex: "#6B7280", icon: ScrollText },
  tenant_verified: { label: "Tenant Verified", hex: "#CA8A04", icon: ClipboardCheck },
  cross_verified: { label: "Cross Verified", hex: "#16A34A", icon: BadgeCheck },
};

export const TRANSFER_TYPES = [
  { value: "sale", label: "Sale" },
  { value: "lease", label: "Lease" },
  { value: "return_from_lease", label: "Return from lease" },
  { value: "transfer_within_group", label: "Transfer within group" },
  { value: "warranty_return", label: "Warranty return" },
];
