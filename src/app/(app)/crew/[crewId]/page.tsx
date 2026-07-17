"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { DutyEvaluationPanel } from "@/components/crew/duty-evaluation-panel";
import { MonoText } from "@/components/avir/mono-text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { compliance, crewRole, dutyType, fatigueBand, QUAL_TYPE_LABEL, qualStatusHex, REGULATOR_LABEL } from "@/lib/design/crew";
import { useCrewDetail, useFatigueForecast } from "@/lib/queries/use-crew";
import { useCrewActions } from "@/lib/mutations/use-crew-actions";
import { cn } from "@/lib/utils";

function FatigueChart({ crewId }: { crewId: string }) {
  const { data } = useFatigueForecast(crewId, 14);
  const f = data?.forecast ?? [];
  if (f.length < 2) return <p className="text-sm text-hint">Not enough data to forecast.</p>;
  const W = 640, H = 180, padL = 24, padB = 20, padT = 8;
  const x = (i: number) => padL + (i / (f.length - 1)) * (W - padL - 8);
  const y = (s: number) => padT + (1 - s / 100) * (H - padT - padB);
  const path = f.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.fatigue_score).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
      {[0, 40, 60, 100].map((g) => <g key={g}><line x1={padL} y1={y(g)} x2={W - 8} y2={y(g)} stroke="currentColor" strokeOpacity={g === 60 ? 0.25 : 0.08} strokeWidth={1} strokeDasharray={g === 60 ? "3 3" : undefined} /><text x={2} y={y(g) + 3} className="fill-current text-hint" style={{ fontSize: 9, fontFamily: "monospace" }}>{g}</text></g>)}
      <path d={path} fill="none" stroke="#1019EC" strokeWidth={2} />
      {f.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.fatigue_score)} r={2.5} fill={fatigueBand(p.fatigue_score).hex}><title>{`${p.date}: ${p.fatigue_score}`}</title></circle>)}
      {f.map((p, i) => i % 2 === 0 ? <text key={`t${i}`} x={x(i)} y={H - 6} textAnchor="middle" className="fill-current text-hint" style={{ fontSize: 8, fontFamily: "monospace" }}>{p.date.slice(5)}</text> : null)}
    </svg>
  );
}

export default function CrewDetailPage() {
  const params = useParams<{ crewId: string }>();
  const { data, isLoading } = useCrewDetail(params.crewId);
  const { logCurrency } = useCrewActions();
  const { toast } = useToast();

  if (isLoading || !data?.member) {
    return <div className="p-6"><Skeleton className="h-10 w-64" /><Skeleton className="mt-4 h-64 w-full" /></div>;
  }
  const m = data.member;
  const cr = crewRole(m.role);
  const activeIssues = data.qualifications.filter((q) => q.status !== "valid" || (q.days_to_expiry != null && q.days_to_expiry < 0)).length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pb-4 pt-4">
        <Link href="/crew" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Crew</Link>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-serif text-3xl text-foreground">{m.first_name} {m.last_name}</h1>
          <span className="inline-flex items-center gap-1.5 text-subtext"><cr.icon className="h-4 w-4 text-label" /> {cr.label}</span>
          <MonoText muted className="text-sm">{m.employee_id}</MonoText>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 font-mono text-[11px] text-hint">
          <span>Base {m.home_base_station ?? "—"}</span>
          <span>Seniority #{m.seniority_number ?? "—"}</span>
          <span>{REGULATOR_LABEL[m.primary_jurisdiction ?? ""] ?? m.primary_jurisdiction ?? "—"}</span>
          <span>Hired {m.hire_date ?? "—"}</span>
          <span className="uppercase text-severity-low">{m.employment_status}</span>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="quals">Qualifications</TabsTrigger>
          <TabsTrigger value="history">Duty History</TabsTrigger><TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="fatigue">Fatigue</TabsTrigger><TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList></div>
        <div className="flex-1 overflow-y-auto avir-scroll p-6">
          <TabsContent value="overview">
            <div className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {[["Qualifications", String(data.qualifications.length)], ["Currency issues", String(activeIssues)], ["Duties (60d)", String(data.duty_history.length)], ["Upcoming duties", String(data.upcoming.length)], ["Latest compliance", data.compliance[0]?.overall_result ?? "—"], ["Latest fatigue", data.compliance[0]?.fatigue_score != null ? String(data.compliance[0].fatigue_score) : "—"]].map(([l, v]) => (
                <div key={l}><p className="font-mono text-eyebrow uppercase text-label">{l}</p><p className="mt-0.5 text-sm text-foreground">{v}</p></div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="quals">
            <div className="max-w-3xl overflow-x-auto avir-scroll border border-border">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left">{["Qualification", "Type", "Issued", "Expiry", "Status", ""].map((h) => <th key={h} className="px-3 py-2 font-mono text-eyebrow uppercase text-label">{h}</th>)}</tr></thead>
                <tbody>
                  {data.qualifications.map((q) => (
                    <tr key={q.id} className="border-b border-border/60">
                      <td className="px-3 py-2"><span className="font-medium text-foreground">{q.qualification_name}</span><MonoText muted className="ml-2 text-[10px]">{q.qualification_code}</MonoText></td>
                      <td className="px-3 py-2 text-subtext">{QUAL_TYPE_LABEL[q.qualification_type ?? ""] ?? q.qualification_type}</td>
                      <td className="px-3 py-2 font-mono text-hint">{q.issued_date}</td>
                      <td className="px-3 py-2"><span className="font-mono" style={{ color: qualStatusHex(q.status, q.days_to_expiry) }}>{q.expiry_date ?? "—"}{q.days_to_expiry != null && ` (${q.days_to_expiry}d)`}</span></td>
                      <td className="px-3 py-2"><span className="font-mono text-[11px] uppercase" style={{ color: qualStatusHex(q.status, q.days_to_expiry) }}>{q.status}</span></td>
                      <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => logCurrency.mutate({ qualId: q.id }, { onSuccess: () => toast({ title: "Currency logged", description: "Expiry renewed 12 months." }) })}>Log Currency</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <div className="max-w-3xl border border-border">
              {data.duty_history.map((d) => (
                <div key={d.id} className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
                  <span className="h-3 w-3" style={{ background: dutyType(d.duty_type).hex }} />
                  <span className="w-28 font-mono text-[11px] uppercase text-foreground">{dutyType(d.duty_type).label}</span>
                  <span className="font-mono text-[11px] text-hint">{new Date(d.start_utc).toLocaleDateString()} {new Date(d.start_utc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="font-mono text-[11px] text-subtext">{d.station_from} → {d.station_to}</span>
                  {d.flight_time_minutes && <span className="ml-auto font-mono text-[11px] text-hint">{Math.round(d.flight_time_minutes / 60 * 10) / 10}h</span>}
                </div>
              ))}
              {data.duty_history.length === 0 && <p className="px-3 py-4 text-sm text-hint">No duty history.</p>}
            </div>
          </TabsContent>

          <TabsContent value="upcoming">
            <div className="max-w-3xl border border-border">
              {data.upcoming.map((d) => (
                <div key={d.id} className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
                  <span className="h-3 w-3" style={{ background: dutyType(d.duty_type).hex }} />
                  <span className="w-28 font-mono text-[11px] uppercase text-foreground">{dutyType(d.duty_type).label}</span>
                  <span className="font-mono text-[11px] text-hint">{new Date(d.start_utc).toLocaleString()}</span>
                  <span className="ml-auto font-mono text-[11px] text-subtext">{d.station_from} → {d.station_to}</span>
                </div>
              ))}
              {data.upcoming.length === 0 && <p className="px-3 py-4 text-sm text-hint">No upcoming duties.</p>}
            </div>
          </TabsContent>

          <TabsContent value="fatigue">
            <div className="max-w-3xl">
              <p className="eyebrow mb-3">Fatigue forecast (14 days)</p>
              <FatigueChart crewId={params.crewId} />
              <p className="mt-2 font-mono text-[11px] text-hint">Dashed line at 60 = elevated-risk threshold. Score blends rolling flight hours, night operations, and duty density.</p>
            </div>
          </TabsContent>

          <TabsContent value="compliance">
            <div className="max-w-3xl border border-border">
              {data.compliance.map((c, i) => {
                const rc = compliance(c.overall_result);
                return (
                  <div key={i} className="border-b border-border/60 px-3 py-2 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] uppercase" style={{ color: rc.hex }}>{rc.label}</span>
                      <span className="font-mono text-[11px] text-hint">fatigue {c.fatigue_score ?? "—"}</span>
                      <span className="ml-auto font-mono text-[10px] text-hint">{new Date(c.evaluated_at_utc).toLocaleString()}</span>
                    </div>
                    {(c.violations ?? []).map((v, j) => <p key={j} className="mt-1 text-[12px] text-severity-critical">✕ {v}</p>)}
                    {(c.warnings ?? []).map((w, j) => <p key={j} className="mt-1 text-[12px] text-severity-medium">⚠ {w}</p>)}
                  </div>
                );
              })}
              {data.compliance.length === 0 && <p className="px-3 py-4 text-sm text-hint">No rule checks recorded yet.</p>}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
