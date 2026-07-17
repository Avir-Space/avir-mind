import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "The AVIR Index — Aviation Reliability, Measured" };

type Pub = {
  index_code: string; index_name: string; index_category: string; unit: string | null; higher_is_better: boolean;
  headline_value: number; period_label: string; headline_narrative: string; participating_tenant_count: number;
  confidence_interval_lower: number | null; confidence_interval_upper: number | null; published_at_utc: string; content_hash: string;
};

export default async function AvirIndexPublicPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_index_public_view");
  const indices = (data as unknown as Pub[]) ?? [];

  // The route does not exist until at least one Index is publicly visible —
  // preserving the "not yet activated" position.
  if (indices.length === 0) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-16" style={{ background: "#0a0a0f", color: "#F5F5F7" }}>
      <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: "#1019EC" }}>The AVIR Index</p>
      <h1 style={{ fontSize: 44, fontWeight: 300, marginTop: 8, lineHeight: 1.1 }}>Aviation Reliability, Measured</h1>
      <p style={{ color: "#8B8B93", fontSize: 16, marginTop: 8, maxWidth: 640 }}>
        Periodically-published, credibly-computed industry benchmarks. Every number is reproducible from source data,
        carries a methodology hash and contributing-operator count, and is corrected — never edited.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginTop: 40 }}>
        {indices.map((i) => (
          <div key={i.index_code} style={{ border: "1px solid #26262f", background: "#14141b", padding: 20 }}>
            <p style={{ fontSize: 13, color: "#C4C4CC" }}>{i.index_name}</p>
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 40, marginTop: 8 }}>
              {Number(i.headline_value).toFixed(1)}<span style={{ fontSize: 14, color: "#8B8B93" }}>{i.unit ? " " + i.unit : ""}</span>
            </p>
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8B8B93", marginTop: 4 }}>
              {i.period_label} · N={i.participating_tenant_count} operators · CI {i.confidence_interval_lower}–{i.confidence_interval_upper}
            </p>
            <p style={{ fontSize: 12, color: "#8B8B93", marginTop: 8, lineHeight: 1.5 }}>{i.headline_narrative}</p>
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, color: "#5a5a63", marginTop: 8 }}>hash {i.content_hash.slice(0, 24)}…</p>
          </div>
        ))}
      </div>

      <section style={{ marginTop: 56, borderTop: "1px solid #26262f", paddingTop: 24 }}>
        <h2 style={{ fontSize: 20 }}>Methodology</h2>
        <p style={{ color: "#8B8B93", fontSize: 14, marginTop: 8, maxWidth: 720, lineHeight: 1.6 }}>
          Each Index aggregates across consenting operators for a fixed period. Participation is opt-in per category and
          aggregate-only by default; no operator is identified without explicit consent. A number is published only when
          the minimum participating-operator threshold is met. Corrections publish as new, hash-chained versions; prior
          versions remain immutable. Full per-Index methodology is linked from each definition.
        </p>
      </section>

      <p style={{ marginTop: 48, fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#5a5a63" }}>
        AVIR Space · avir.space/index · press@avir.space
      </p>
    </main>
  );
}
