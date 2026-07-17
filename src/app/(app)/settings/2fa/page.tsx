"use client";

import { ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { useEnterpriseActions } from "@/lib/mutations/use-enterprise-actions";
import { use2faStatus } from "@/lib/queries/use-enterprise";

type J = Record<string, unknown>;

export default function TwoFactorSettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { data: status, isLoading, refetch } = use2faStatus();
  const { record2fa, disable2fa } = useEnterpriseActions();
  const { toast } = useToast();
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const methods = (status?.methods as J[]) ?? [];
  const hasTotp = methods.some((m) => m.method_type === "totp");

  async function startEnroll() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `avir-${Date.now()}` });
      if (error) throw error;
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e) { toast({ title: "Enrollment failed", description: String((e as Error).message).slice(0, 90) }); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (!enroll) return;
    setBusy(true);
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId: enroll.factorId, challengeId: ch.id, code });
      if (vErr) throw vErr;
      const codes = Array.from({ length: 8 }, () => Math.random().toString(36).slice(2, 10).toUpperCase());
      await record2fa("totp");
      await record2fa("backup_codes", undefined, codes.join(","));
      setBackupCodes(codes); setEnroll(null); setCode(""); refetch();
      toast({ title: "2FA enabled" });
    } catch (e) { toast({ title: "Verification failed", description: String((e as Error).message).slice(0, 90) }); }
    finally { setBusy(false); }
  }

  async function turnOff() {
    const { data } = await supabase.auth.mfa.listFactors();
    for (const f of data?.totp ?? []) await supabase.auth.mfa.unenroll({ factorId: f.id });
    await disable2fa("totp"); refetch(); toast({ title: "2FA disabled" });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/settings" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Settings</Link></div>
      <PageHeader eyebrow="Security" title="Two-Factor Authentication" subtitle="TOTP authenticator app + backup codes." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        <div className="max-w-lg space-y-5">
          {isLoading ? <Skeleton className="h-24 w-full" /> : (
            <div className="border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" style={{ color: hasTotp ? "#16A34A" : "#94A3B8" }} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Authenticator app (TOTP)</p>
                  <p className="text-[12px] text-subtext">{hasTotp ? "Enabled" : "Not enabled"}</p>
                </div>
                {hasTotp ? <Button size="sm" variant="outline" onClick={turnOff}>Disable</Button> : <Button size="sm" onClick={startEnroll} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Enable</Button>}
              </div>
            </div>
          )}

          {enroll && (
            <div className="border border-primary/40 bg-primary/5 p-4">
              <p className="eyebrow mb-2">Scan with your authenticator</p>
              {/* Supabase returns an SVG QR data URI */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enroll.qr} alt="TOTP QR code" className="h-44 w-44 bg-white p-2" />
              <p className="mt-2 font-mono text-[11px] text-hint">Or enter this secret: <MonoText className="text-foreground">{enroll.secret}</MonoText></p>
              <div className="mt-3 flex items-end gap-2">
                <div><p className="eyebrow mb-1">6-digit code</p><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} className="w-32" /></div>
                <Button size="sm" disabled={code.length !== 6 || busy} onClick={verify}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Verify &amp; activate</Button>
              </div>
            </div>
          )}

          {backupCodes && (
            <div className="border border-border bg-card p-4">
              <p className="eyebrow mb-2">Backup codes — store these safely</p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[13px] text-foreground">{backupCodes.map((c) => <span key={c}>{c}</span>)}</div>
              <p className="mt-2 text-[11px] text-hint">Each code can be used once if you lose your authenticator.</p>
            </div>
          )}

          <div className="border border-border bg-card p-4">
            <p className="text-sm font-medium text-foreground">SMS backup</p>
            <p className="text-[12px] text-subtext">SMS codes via Twilio are supported at the API layer (mocked until Twilio is configured). Configure a phone number to enable.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
