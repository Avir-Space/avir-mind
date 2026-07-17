"use client";

import { Bell, CalendarClock, SlidersHorizontal, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/avir/page-header";
import { useAuth } from "@/lib/providers/auth-provider";

function Card({ href, icon: Icon, title, desc }: { href: string; icon: LucideIcon; title: string; desc: string }) {
  return (
    <Link href={href} className="flex items-start gap-3 border border-border bg-card p-4 transition-colors hover:border-border-strong">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
      <div><p className="text-sm font-medium text-foreground">{title}</p><p className="mt-0.5 text-[12px] text-subtext">{desc}</p></div>
    </Link>
  );
}

export default function SettingsPage() {
  const { orgRole } = useAuth();
  const isAdmin = orgRole === "owner" || orgRole === "admin";

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Administration" title="Settings" subtitle="Organization, notifications, and integrations." />
      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        <p className="eyebrow mb-2">Communications</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card href="/settings/notifications" icon={Bell} title="Notification preferences" desc="Your channels, quiet hours, and digests." />
          {isAdmin && <Card href="/settings/notifications/policies" icon={SlidersHorizontal} title="Notification policies" desc="Who gets notified, when, and by which channel." />}
          {isAdmin && <Card href="/settings/on-call" icon={CalendarClock} title="On-call scheduler" desc="Per-role on-call rotation and current shift." />}
        </div>
      </div>
    </div>
  );
}
