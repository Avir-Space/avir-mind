"use client";

import { ChevronLeft, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useEnterpriseActions } from "@/lib/mutations/use-enterprise-actions";
import { useApiKeys } from "@/lib/queries/use-enterprise";

type J = Record<string, unknown>;
const dt = (x: unknown) => (x ? new Date(String(x)).toLocaleString() : "—");
const SCOPES = ["read:signals", "read:aircraft", "read:tasks", "read:components", "read:flights", "read:crew", "read:compliance", "read:calibration", "write:tasks", "write:signals"];

export default function ApiKeysPage() {
  const { data: keys, isLoading } = useApiKeys();
  const { createApiKey, revokeApiKey } = useEnterpriseActions();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read:signals"]);
  const [rate, setRate] = useState(60);
  const [creating, setCreating] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    try {
      const r = await createApiKey(name, scopes, rate);
      setRawKey(r.api_key); setName("");
    } catch (e) { toast({ title: "Create failed", description: String((e as Error).message).slice(0, 90) }); }
    finally { setCreating(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/settings" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Settings</Link></div>
      <PageHeader eyebrow="Developer" title="API Keys" subtitle="Programmatic access credentials — scoped and rate-limited."
        actions={<Button size="sm" onClick={() => { setOpen(true); setRawKey(null); }}><Plus className="h-3.5 w-3.5" /> New key</Button>} />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div> : (keys?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center"><KeyRound className="h-8 w-8 text-label" strokeWidth={1.5} /><p className="mt-3 text-sm text-subtext">No API keys yet.</p></div>
        ) : (
          <div className="space-y-2">
            {(keys ?? []).map((k: J) => {
              const revoked = Boolean(k.revoked); const expired = Boolean(k.expired);
              return (
                <div key={String(k.id)} className="border border-border bg-card p-4" style={{ opacity: revoked ? 0.6 : 1 }}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[14px] font-medium text-foreground">{String(k.key_name)}</span>
                    <MonoText muted className="text-[12px]">{String(k.key_prefix)}…</MonoText>
                    {revoked ? <span className="font-mono text-[10px] uppercase text-severity-critical">revoked</span> : expired ? <span className="font-mono text-[10px] uppercase text-severity-high">expired</span> : <span className="font-mono text-[10px] uppercase text-severity-low">active</span>}
                    {!revoked && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => revokeApiKey(String(k.id)).then(() => toast({ title: "Key revoked" }))}>Revoke</Button>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(k.scope as string[] ?? []).map((s) => <span key={s} className="border border-border px-1.5 py-0.5 font-mono text-[10px] text-body">{s}</span>)}
                  </div>
                  <p className="mt-1.5 font-mono text-[11px] text-hint">{String(k.rate_limit_per_minute)}/min · last used {dt(k.last_used_at_utc)}{k.expires_at_utc ? ` · expires ${new Date(String(k.expires_at_utc)).toLocaleDateString()}` : ""}{k.revocation_reason ? ` · ${k.revocation_reason}` : ""}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setRawKey(null); }}>
        <DialogContent>
          {rawKey ? (
            <>
              <DialogHeader><DialogTitle>Copy your API key now</DialogTitle></DialogHeader>
              <p className="text-[13px] text-subtext">This key will not be shown again. Store it in your secrets manager.</p>
              <div className="flex items-center gap-2 border border-primary/40 bg-primary/5 p-3">
                <MonoText className="flex-1 break-all text-[12px] text-foreground">{rawKey}</MonoText>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(rawKey); toast({ title: "Copied" }); }}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
              <DialogFooter><Button onClick={() => { setOpen(false); setRawKey(null); }}>Done</Button></DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader><DialogTitle>New API key</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><p className="eyebrow mb-1">Name</p><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production integration" /></div>
                <div><p className="eyebrow mb-1">Scopes</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SCOPES.map((s) => (
                      <label key={s} className="inline-flex items-center gap-1.5 font-mono text-[11px] text-body">
                        <input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes((cur) => e.target.checked ? [...cur, s] : cur.filter((x) => x !== s))} /> {s}
                      </label>
                    ))}
                  </div>
                </div>
                <div><p className="eyebrow mb-1">Rate limit (per minute)</p><Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-32" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={!name || scopes.length === 0 || creating} onClick={create}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create key</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
