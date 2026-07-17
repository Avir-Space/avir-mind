"use client";

import { ChevronLeft, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useEnterpriseActions } from "@/lib/mutations/use-enterprise-actions";
import { useSpMetadata, useSsoConfig } from "@/lib/queries/use-enterprise";

type J = Record<string, unknown>;

export default function SsoPage() {
  const { data: cfg, isLoading } = useSsoConfig();
  const { data: sp } = useSpMetadata();
  const { saveSso } = useEnterpriseActions();
  const { toast } = useToast();

  const [providerType, setProviderType] = useState("saml");
  const [providerName, setProviderName] = useState("");
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [domains, setDomains] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [enforce, setEnforce] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cfg && cfg !== null) {
      const c = cfg as J;
      setProviderType(String(c.provider_type ?? "saml")); setProviderName(String(c.provider_name ?? ""));
      setEntityId(String(c.entity_id ?? "")); setSsoUrl(String(c.sso_url ?? ""));
      setDomains(((c.allowed_email_domains as string[]) ?? []).join(", "));
      setIsActive(Boolean(c.is_active)); setEnforce(Boolean(c.enforce_sso));
    }
  }, [cfg]);

  async function save() {
    setBusy(true);
    try {
      await saveSso({
        provider_type: providerType, provider_name: providerName, entity_id: entityId, sso_url: ssoUrl,
        allowed_email_domains: domains.split(",").map((d) => d.trim()).filter(Boolean),
        attribute_mappings: { email: "user.email", first_name: "user.firstName", last_name: "user.lastName" },
        role_mappings: { "AVIR-Admins": "admin", "AVIR-Members": "editor", "AVIR-Viewers": "viewer" },
        default_role: "viewer", is_active: isActive, enforce_sso: enforce,
      });
      toast({ title: "SSO configuration saved" });
    } catch (e) { toast({ title: "Save failed", description: String((e as Error).message).slice(0, 90) }); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/settings" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Settings</Link></div>
      <PageHeader eyebrow="Identity" title="Single Sign-On" subtitle="SAML 2.0 / OIDC enterprise identity." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
          {/* Config form */}
          <div className="space-y-3">
            <p className="eyebrow">Identity provider</p>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <div className="space-y-3 border border-border bg-card p-4">
                <div><p className="eyebrow mb-1">Provider type</p>
                  <Select value={providerType} onValueChange={setProviderType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="saml">SAML 2.0</SelectItem><SelectItem value="oidc">OIDC</SelectItem></SelectContent></Select>
                </div>
                <div><p className="eyebrow mb-1">Provider name</p><Input value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="Okta / Azure AD / Google Workspace" /></div>
                <div><p className="eyebrow mb-1">{providerType === "saml" ? "IdP Entity ID" : "Client ID"}</p><Input value={entityId} onChange={(e) => setEntityId(e.target.value)} /></div>
                <div><p className="eyebrow mb-1">{providerType === "saml" ? "SSO URL" : "Discovery URL"}</p><Input value={ssoUrl} onChange={(e) => setSsoUrl(e.target.value)} /></div>
                <div><p className="eyebrow mb-1">Allowed email domains (comma-separated)</p><Input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="acme.com, acme.aero" /></div>
                <div className="flex items-center gap-4 pt-1">
                  <label className="inline-flex items-center gap-1.5 text-[12px] text-body"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active</label>
                  <label className="inline-flex items-center gap-1.5 text-[12px] text-body"><input type="checkbox" checked={enforce} onChange={(e) => setEnforce(e.target.checked)} /> Enforce (block password login for domain users)</label>
                </div>
                <Button size="sm" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save configuration</Button>
              </div>
            )}
            <p className="text-[11px] text-hint">Role mappings map IdP groups (AVIR-Admins/Members/Viewers) to AVIR roles. Attribute mappings map email/first/last name. Activation of the auth flow itself is completed in Supabase Auth (enterprise SSO) using the SP metadata → </p>
          </div>

          {/* SP metadata */}
          <div className="space-y-3">
            <p className="eyebrow">Service provider (AVIR) metadata — register these on your IdP</p>
            <div className="space-y-2 border border-border bg-card p-4">
              {Object.entries((sp as J) ?? {}).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><p className="font-mono text-[10px] uppercase text-label">{k.replace(/_/g, " ")}</p><MonoText className="block truncate text-[11px] text-foreground">{String(v)}</MonoText></div>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(String(v)); toast({ title: "Copied" }); }}><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-hint">Test the flow before enabling. When Enforce is on, users on the allowed domains must use SSO; API keys still work.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
