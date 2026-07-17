"use client";

import { Check, ChevronsUpDown, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/avir/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/providers/auth-provider";
import { navForModel } from "@/lib/design/nav";
import { cn } from "@/lib/utils";

function initials(email: string | null | undefined) {
  if (!email) return "AV";
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2);
  return chars.toUpperCase();
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, orgName, orgRole, businessModel, orgs, switchOrg, signOut } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const navItems = navForModel(businessModel);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface/40">
      {/* Brand */}
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link href="/command-center" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>
      </div>

      {/* Tenant switcher (operator ↔ MRO) — only when the user has >1 org */}
      {orgs.length > 1 && (
        <div className="relative border-b border-border px-3 py-2">
          <button type="button" onClick={() => setSwitcherOpen((v) => !v)}
            className="flex w-full items-center gap-2 border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:border-border-strong">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", businessModel === "mro" ? "bg-severity-medium" : "bg-primary")} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-foreground">{orgName}</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-hint">{businessModel} tenant</p>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-label" />
          </button>
          {switcherOpen && (
            <div className="absolute inset-x-3 z-30 mt-1 border border-border bg-card shadow-lg">
              {orgs.map((o) => (
                <button key={o.id} type="button" onClick={() => { setSwitcherOpen(false); if (!o.is_active) switchOrg(o.id); }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-surface/60">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", o.primary_business_model === "mro" ? "bg-severity-medium" : "bg-primary")} />
                  <div className="min-w-0 flex-1"><p className="truncate text-[12px] text-foreground">{o.name}</p><p className="font-mono text-[9px] uppercase text-hint">{o.primary_business_model}</p></div>
                  {o.is_active && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto avir-scroll px-3 py-4">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/command-center" && pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 px-2.5 py-2 text-sm transition-colors duration-micro",
                    active ? "bg-card text-foreground" : "text-subtext hover:text-foreground",
                  )}
                >
                  {active && (
                    <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />
                  )}
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer: user / org / logout / theme */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-2.5 px-1.5 py-1.5">
          <Avatar>
            <AvatarFallback>{initials(user?.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground" title={orgName ?? "AVIR Operations"}>
              {orgName ?? "AVIR Operations"}
            </p>
            <p className="truncate font-mono text-[11px] text-label" title={user?.email ?? undefined}>
              {user?.email ?? "—"}
              {orgRole && <span className="ml-1 uppercase text-hint">· {orgRole}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="flex h-7 w-7 items-center justify-center text-label transition-colors duration-micro hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex justify-end px-1.5">
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
