"use client";

import { useState } from "react";

import { FINDING_SEVERITY_HEX, healthBand } from "@/lib/design/components";
import type { ComponentEvent, HealthPoint } from "@/types/components";

/**
 * Hand-rolled SVG line chart of health_score over time, with component events
 * overlaid as markers on the time axis. No chart dependency.
 */
export function HealthTrendChart({ history, events }: { history: HealthPoint[]; events: ComponentEvent[] }) {
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);

  if (history.length < 2) {
    return <p className="text-sm text-hint">Not enough history to chart a trend yet.</p>;
  }

  const W = 640, H = 200, padL = 28, padR = 12, padT = 12, padB = 22;
  const times = history.map((h) => new Date(h.computed_at_utc).getTime());
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const span = Math.max(tMax - tMin, 1);
  const x = (t: number) => padL + ((t - tMin) / span) * (W - padL - padR);
  const y = (s: number) => padT + (1 - s / 100) * (H - padT - padB);

  const path = history.map((h, i) => `${i === 0 ? "M" : "L"} ${x(times[i]!).toFixed(1)} ${y(h.health_score).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(tMax).toFixed(1)} ${(H - padB).toFixed(1)} L ${x(tMin).toFixed(1)} ${(H - padB).toFixed(1)} Z`;
  const last = history[history.length - 1]!;
  const lastBand = healthBand(last.health_score);

  const evPoints = events
    .map((e) => ({ e, t: new Date(e.event_date_utc).getTime() }))
    .filter((p) => p.t >= tMin - span * 0.02 && p.t <= tMax + span * 0.02);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}>
        {/* gridlines */}
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
            <text x={4} y={y(g) + 3} className="fill-current text-hint" style={{ fontSize: 9, fontFamily: "monospace" }}>{g}</text>
          </g>
        ))}
        <path d={area} fill={lastBand.hex} fillOpacity={0.08} />
        <path d={path} fill="none" stroke={lastBand.hex} strokeWidth={2} />
        {history.map((h, i) => (
          <circle
            key={i}
            cx={x(times[i]!)}
            cy={y(h.health_score)}
            r={2.5}
            fill={healthBand(h.health_score).hex}
            onMouseEnter={() => setHover({ x: x(times[i]!), y: y(h.health_score), label: `${h.health_score} · ${new Date(times[i]!).toLocaleDateString()}` })}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {/* event markers along the bottom axis */}
        {evPoints.map(({ e, t }, i) => (
          <line
            key={i}
            x1={x(t)}
            y1={H - padB}
            x2={x(t)}
            y2={H - padB + 6}
            stroke={e.finding_severity ? (FINDING_SEVERITY_HEX[e.finding_severity] ?? "#6B7280") : "#1019EC"}
            strokeWidth={2}
          >
            <title>{`${e.event_type} · ${e.event_date_utc}`}</title>
          </line>
        ))}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-foreground shadow"
          style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}
        >
          {hover.label}
        </div>
      )}
    </div>
  );
}
