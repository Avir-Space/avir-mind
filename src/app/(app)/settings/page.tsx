"use client";

import { Bell, Building2, CalendarClock, PlaneTakeoff, SlidersHorizontal, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/providers/auth-provider";
import { cn } from "@/lib/utils";

function Card({ href, icon: Icon, title, desc }: { href: string; icon: LucideIcon; title: string; desc: string }) {
  return (
    <Link href={href} className="flex items-start gap-3 border border-border bg-card p-4 transition-colors hover:border-border-strong">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
      <div><p className="text-sm font-medium text-foreground">{title}</p><p className="mt-0.5 text-[12px] text-subtext">{desc}</p></div>
    </Link>
  );
}

const MODELS = [
  { key: "operator", label: "Operator", icon: PlaneTakeoff, desc: "Airlines, charter, corporate flight ops" },
  { key: "mro", label: "MRO", icon: Wrench, desc: "Part 145 repair stations, base maintenance" },
  { key: "hybrid", label: "Hybrid", icon: Building2, desc: "Both — operator + third-party MRO work" },
] as const;

export default function SettingsPage() {
  const { orgRole, businessModel, orgName } = useAuth();
  const isAdmin = orgRole === "owner" || orgRole === "admin";
  const { toast } = useToast();

  async function setModel(model: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("set_business_model", { p_model: model, p_view_lens: undefined });
    if (error) { toast({ title: "Update failed", description: error.message.slice(0, 90) }); return; }
    toast({ title: "Business model updated", description: "Reloading to apply the new view lens." });
    setTimeout(() => window.location.assign("/command-center"), 800);
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Administration" title="Settings" subtitle="Organization, business model, notifications, and integrations." />
      <div className="flex-1 overflow-y-auto avir-scroll p-6 space-y-8">
        {/* Business model */}
        <section>
          <p className="eyebrow mb-2">Business model — {orgName}</p>
          <p className="mb-3 max-w-2xl text-[13px] text-subtext">What&apos;s your primary business? This sets the default view lens and which modules appear in the nav. Use the tenant switcher in the sidebar to move between your operator and MRO demo tenants.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {MODELS.map((m) => {
              const active = businessModel === m.key; const Icon = m.icon;
              return (
                <button key={m.key} type="button" disabled={!isAdmin || active} onClick={() => setModel(m.key)}
                  className={cn("flex flex-col items-start gap-1.5 border p-4 text-left transition-colors", active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-border-strong", (!isAdmin || active) && "cursor-default")}>
                  <Icon className="h-5 w-5" style={{ color: active ? "#1019EC" : undefined }} strokeWidth={1.75} />
                  <p className="text-sm font-medium text-foreground">{m.label}{active && <span className="ml-2 font-mono text-[10px] uppercase text-primary">current</span>}</p>
                  <p className="text-[12px] text-subtext">{m.desc}</p>
                </button>
              );
            })}
          </div>
          {!isAdmin && <p className="mt-2 text-[11px] text-hint">Only admins can change the business model.</p>}
        </section>

        {/* Communications */}
        <section>
          <p className="eyebrow mb-2">Communications</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card href="/settings/notifications" icon={Bell} title="Notification preferences" desc="Your channels, quiet hours, and digests." />
            {isAdmin && <Card href="/settings/notifications/policies" icon={SlidersHorizontal} title="Notification policies" desc="Who gets notified, when, and by which channel." />}
            {isAdmin && <Card href="/settings/on-call" icon={CalendarClock} title="On-call scheduler" desc="Per-role on-call rotation and current shift." />}
          </div>
        </section>
      </div>
    </div>
  );
}
