"use client";

import { Ruler } from "lucide-react";
import Link from "next/link";

import { accuracyHex, sampleStatus } from "@/lib/design/calibration";
import { useCalibrationBadgeMap } from "@/lib/queries/use-calibration";

/**
 * "Calibrated at X%" footer for a signal card — shown only where the signal's
 * category+confidence has a sufficient/marginal historical sample.
 */
export function CalibrationFooter({ category, confidence }: { category: string; confidence: string }) {
  const { data: map } = useCalibrationBadgeMap();
  const badge = map?.[`${category}|${confidence}`];
  if (!badge || badge.sample_size_status === "insufficient") return null;

  return (
    <Link href={`/calibration/category/${encodeURIComponent(category)}`}
      className="inline-flex items-center gap-1.5 font-mono text-eyebrow uppercase text-label transition-colors hover:text-primary"
      title={`${badge.measured} measured outcomes · ${sampleStatus(badge.sample_size_status).label} sample`}>
      <Ruler className="h-3 w-3" />
      Calibrated at <span style={{ color: accuracyHex(badge.accuracy_pct) }}>{badge.accuracy_pct}%</span>
      <span className="text-hint">· n={badge.measured}</span>
    </Link>
  );
}
