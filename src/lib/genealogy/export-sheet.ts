import type { GenealogyRecord, GenealogyView } from "@/types/genealogy";

export type ExportOptions = {
  purpose?: string;
  recipient?: string;
  coverNote?: string;
  includePredictive?: boolean;
  includeCost?: boolean;
  includeOps?: boolean;
};

export type InstallationSpan = {
  tail: string;
  installedDate: string | null;
  removedDate: string | null;
  cycles: number | null;
  hours: number | null;
  findings: number;
};

/** Pair installation → removal records per aircraft into installation spans. */
export function deriveInstallations(records: GenealogyRecord[]): InstallationSpan[] {
  const asc = [...records].sort((a, b) => a.record_seq - b.record_seq);
  const spans: InstallationSpan[] = [];
  const open = new Map<string, InstallationSpan>();
  for (const r of asc) {
    const tail = r.aircraft_tail ?? "—";
    const cyc = Number(r.record_payload?.cycles_at_event ?? NaN);
    const hrs = Number(r.record_payload?.flight_hours_at_event ?? NaN);
    if (r.record_type === "installation") {
      const span: InstallationSpan = { tail, installedDate: r.record_date_utc, removedDate: null, cycles: null, hours: null, findings: 0 };
      spans.push(span);
      open.set(tail, span);
    } else if (r.record_type === "removal") {
      const span = open.get(tail);
      if (span) {
        span.removedDate = r.record_date_utc;
        const insCyc = Number(deriveInstallCycles(asc, span.installedDate, tail));
        if (!Number.isNaN(cyc) && !Number.isNaN(insCyc)) span.cycles = Math.max(0, cyc - insCyc);
        open.delete(tail);
      }
    } else if (r.record_type === "finding") {
      const span = open.get(tail);
      if (span) span.findings++;
    }
  }
  return spans.reverse();
}
function deriveInstallCycles(asc: GenealogyRecord[], installedDate: string | null, tail: string): number {
  const rec = asc.find((r) => r.record_type === "installation" && r.record_date_utc === installedDate && (r.aircraft_tail ?? "—") === tail);
  return Number(rec?.record_payload?.cycles_at_event ?? 0);
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const short = (h: string | null | undefined) => (h ? h.slice(0, 12) : "—");

function payloadSummary(r: GenealogyRecord, includeCost: boolean): string {
  const p = r.record_payload ?? {};
  const bits: string[] = [];
  if (p.finding_severity && p.finding_severity !== "nil") bits.push(`finding: ${esc(p.finding_severity)}`);
  if (p.finding_description) bits.push(esc(p.finding_description));
  if (p.station) bits.push(`stn ${esc(p.station)}`);
  if (p.facility) bits.push(esc(p.facility));
  if (p.cycles_at_event != null) bits.push(`${Number(p.cycles_at_event).toLocaleString()} cyc`);
  if (includeCost && p.cost_usd != null && Number(p.cost_usd) > 0) bits.push(`$${Number(p.cost_usd).toLocaleString()}`);
  if (p.to_org_id) bits.push(`transfer ${esc(p.transfer_type)}`);
  return bits.join(" · ") || "—";
}

/** Bloomberg-terminal aesthetic: black on white, monospace, dense, hash footer. */
export function buildGenealogyHTML(
  view: GenealogyView,
  opts: ExportOptions,
  snapshotHash: string,
  exportId: string,
  generatedAtISO: string,
): string {
  const s = view.serial;
  const installs = deriveInstallations(view.records);
  const chainOk = view.stats?.chain_ok;
  const generated = new Date(generatedAtISO).toUTCString();

  const ownershipRows = (view.ownership_history ?? [])
    .map(
      (o) => `<tr><td>${esc(o.transfer_date_utc)}</td><td>${esc(o.from_org_name ?? "— external —")}</td>
      <td>${esc(o.to_org_name ?? "—")}</td><td>${esc(o.transfer_type ?? "—")}</td><td class="mono">${esc(o.transfer_reference ?? "—")}</td></tr>`,
    )
    .join("");

  const installRows = installs
    .map(
      (i) => `<tr><td class="mono">${esc(i.tail)}</td><td>${esc(i.installedDate ?? "—")}</td><td>${esc(i.removedDate ?? "on-wing")}</td>
      <td class="num">${i.cycles != null ? i.cycles.toLocaleString() : "—"}</td><td class="num">${i.findings}</td></tr>`,
    )
    .join("");

  const ledgerRows = view.records
    .map(
      (r) => `<tr><td class="num">${r.record_seq}</td><td>${esc(r.record_date_utc)}</td><td>${esc(r.record_type)}</td>
      <td>${esc(r.source_org_name ?? "—")}</td><td>${payloadSummary(r, !!opts.includeCost)}</td>
      <td class="cf ${r.confidence}">${esc(r.confidence)}</td><td class="mono hash">${short(r.content_hash)}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Genealogy — ${esc(s.serial_number)}</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #0a0a0a; background: #fff; margin: 0; font-size: 11px; line-height: 1.45; }
  .mono { font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace; }
  .masthead { border-bottom: 3px solid #0a0a0a; padding-bottom: 8px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: flex-end; }
  .brand { font-weight: 700; letter-spacing: 0.18em; font-size: 12px; }
  .brand span { color: #1019EC; }
  .doc-title { text-align: right; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #444; }
  h1 { font-family: "JetBrains Mono", monospace; font-size: 22px; margin: 12px 0 2px; letter-spacing: 0.02em; }
  .sub { color: #333; font-size: 11px; }
  .verif { display: inline-block; border: 1px solid #0a0a0a; padding: 1px 6px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-left: 8px; }
  .stats { display: flex; flex-wrap: wrap; gap: 0; border: 1px solid #0a0a0a; margin: 12px 0; }
  .stat { flex: 1; min-width: 90px; border-right: 1px solid #ccc; padding: 6px 8px; }
  .stat:last-child { border-right: 0; }
  .stat .k { font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #666; }
  .stat .v { font-family: "JetBrains Mono", monospace; font-size: 15px; }
  h2 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; border-bottom: 1px solid #0a0a0a; padding-bottom: 3px; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; border-bottom: 1px solid #999; padding: 3px 6px; }
  td { padding: 3px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.num, th.num { text-align: right; font-family: "JetBrains Mono", monospace; }
  td.hash { color: #1019EC; font-size: 9px; }
  td.cf { font-size: 8px; text-transform: uppercase; letter-spacing: 0.06em; }
  td.cf.verified { color: #16A34A; } td.cf.self_reported { color: #CA8A04; } td.cf.inferred { color: #888; }
  .cover { border: 1px solid #0a0a0a; padding: 8px 10px; margin: 12px 0; background: #fafafa; }
  .integrity { font-family: "JetBrains Mono", monospace; font-size: 10px; padding: 6px 8px; border: 1px solid ${chainOk ? "#16A34A" : "#DC2626"}; color: ${chainOk ? "#0a7a34" : "#DC2626"}; }
  footer { margin-top: 20px; border-top: 3px solid #0a0a0a; padding-top: 6px; font-family: "JetBrains Mono", monospace; font-size: 8px; color: #444; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
  .footer-hash { color: #1019EC; word-break: break-all; max-width: 60%; }
</style></head><body>
  <div class="masthead">
    <div class="brand">AVIR <span>MIND</span> · GENEALOGY VAULT</div>
    <div class="doc-title">Serialized Component Record<br/>Portable Genealogy Certificate</div>
  </div>

  <h1>${esc(s.serial_number)}<span class="verif">${esc(s.verification_state.replace(/_/g, " "))}</span></h1>
  <div class="sub mono">${esc(s.manufacturer)} · P/N ${esc(s.part_number)} · ${esc(s.component_type)}</div>

  <div class="stats">
    <div class="stat"><div class="k">Birth</div><div class="v">${esc(s.birth_certificate_date ?? "—")}</div></div>
    <div class="stat"><div class="k">Lifetime Cycles</div><div class="v">${Number(s.lifetime_cycles ?? 0).toLocaleString()}</div></div>
    <div class="stat"><div class="k">Lifetime Hours</div><div class="v">${Math.round(Number(s.lifetime_flight_hours ?? 0)).toLocaleString()}</div></div>
    <div class="stat"><div class="k">Installations</div><div class="v">${s.total_installations ?? 0}</div></div>
    <div class="stat"><div class="k">Overhauls</div><div class="v">${s.total_overhauls ?? 0}</div></div>
    <div class="stat"><div class="k">Findings</div><div class="v">${s.total_findings ?? 0}</div></div>
    <div class="stat"><div class="k">Records</div><div class="v">${view.stats?.records_count ?? view.records.length}</div></div>
  </div>

  ${opts.coverNote ? `<div class="cover"><b>Cover note.</b> ${esc(opts.coverNote)}</div>` : ""}

  <div class="integrity">HASH CHAIN: ${chainOk ? "✓ VERIFIED — every record chains to its predecessor" : "✗ BROKEN — chain integrity failed"} · ${view.stats?.verified_count ?? 0}/${view.stats?.records_count ?? 0} records independently verified</div>

  <h2>Ownership History</h2>
  <table><thead><tr><th>Date</th><th>From</th><th>To</th><th>Type</th><th>Reference</th></tr></thead>
  <tbody>${ownershipRows || `<tr><td colspan="5">No recorded transfers — original manufacture-to-operator ownership.</td></tr>`}</tbody></table>

  <h2>Installation History</h2>
  <table><thead><tr><th>Aircraft</th><th>Installed</th><th>Removed</th><th class="num">Cycles</th><th class="num">Findings</th></tr></thead>
  <tbody>${installRows || `<tr><td colspan="5">No installation records.</td></tr>`}</tbody></table>

  <h2>Record Ledger (${view.records.length})</h2>
  <table><thead><tr><th class="num">#</th><th>Date</th><th>Type</th><th>Source</th><th>Detail</th><th>Conf.</th><th>Hash</th></tr></thead>
  <tbody>${ledgerRows}</tbody></table>

  <footer>
    <div>Export ${esc(exportId)}<br/>Generated ${esc(generated)}${opts.purpose ? ` · Purpose: ${esc(opts.purpose)}` : ""}${opts.recipient ? ` · Recipient: ${esc(opts.recipient)}` : ""}</div>
    <div class="footer-hash">SNAPSHOT SHA-256<br/>${esc(snapshotHash)}</div>
  </footer>
</body></html>`;
}
