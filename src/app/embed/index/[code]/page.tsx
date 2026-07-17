import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Pub = { index_code: string; index_name: string; unit: string | null; headline_value: number; period_label: string; participating_tenant_count: number };

/** Iframe-embeddable AVIR Index widget (headline number + trend). Themed. */
export default async function IndexEmbed({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ theme?: string }> }) {
  const { code } = await params;
  const { theme = "brand_avir" } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_index_public_view");
  const pub = ((data as unknown as Pub[]) ?? []).find((p) => p.index_code === code);

  const dark = theme !== "light";
  const bg = dark ? "#0a0a0f" : "#ffffff";
  const fg = dark ? "#F5F5F7" : "#0a0a0f";
  const muted = dark ? "#8B8B93" : "#6b6b76";

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: bg, color: fg, padding: 16, minHeight: 120, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {!pub ? (
        <p style={{ color: muted, fontSize: 13 }}>This AVIR Index is not yet published.</p>
      ) : (
        <>
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#1019EC" }}>AVIR Index</p>
          <p style={{ fontSize: 13, color: fg, marginTop: 2 }}>{pub.index_name}</p>
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 36, marginTop: 4 }}>{Number(pub.headline_value).toFixed(1)}<span style={{ fontSize: 13, color: muted }}>{pub.unit ? " " + pub.unit : ""}</span></p>
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: muted }}>{pub.period_label} · N={pub.participating_tenant_count}</p>
        </>
      )}
      <a href="https://avir.space/index" target="_blank" rel="noreferrer" style={{ fontSize: 10, color: muted, marginTop: 10, textDecoration: "none" }}>Powered by AVIR ↗</a>
    </div>
  );
}
