"use client";

import Link from "next/link";

import { accuracyHex } from "@/lib/design/calibration";
import { useCalibrationDashboard } from "@/lib/queries/use-calibration";

/**
 * Subtle calibration confidence indicator for the AI Insights strip:
 * "Based on N measured predictions with M% historical accuracy."
 */
export function InsightsCalibrationNote() {
  const { data } = useCalibrationDashboard(180);
  const s = data?.stats;
  if (!data?.has_data || !s?.total_measured) return null;

  return (
    <Link href="/calibration" className="font-mono text-[10px] text-hint transition-colors hover:text-primary">
      Based on {s.total_measured.toLocaleString()} measured predictions ·{" "}
      <span style={{ color: accuracyHex(s.overall_accuracy_pct) }}>{s.overall_accuracy_pct}%</span> historical accuracy (180d)
    </Link>
  );
}
