"use client";

import { Bell, Building2, Search } from "lucide-react";

import { RealtimeIndicator } from "@/components/avir/realtime-indicator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/providers/auth-provider";

function initials(email: string | null | undefined) {
  if (!email) return "AV";
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2);
  return chars.toUpperCase();
}

export function Topbar() {
  const { user, orgName } = useAuth();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-page px-6">
      {/* Global search — placeholder wiring for Phase 0 */}
      <div className="relative w-full max-w-[400px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-hint" />
        <input
          type="search"
          disabled
          placeholder="Search aircraft, fleets, components…"
          className="h-9 w-full border border-input bg-transparent pl-9 pr-12 text-sm text-foreground placeholder:text-hint focus:border-primary focus:outline-none disabled:cursor-not-allowed"
          aria-label="Global search"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 border border-border px-1.5 py-0.5 font-mono text-[10px] leading-none text-hint sm:inline-flex">
          ⌘K
        </kbd>
      </div>

      {/* Right cluster — one aligned group */}
      <div className="flex items-center gap-4">
        <RealtimeIndicator />

        {/* Org context indicator */}
        <div className="hidden items-center gap-2 md:flex">
          <Building2 className="h-4 w-4 shrink-0 text-label" />
          <span className="max-w-[12rem] truncate text-sm text-body">
            {orgName ?? "AVIR Operations"}
          </span>
        </div>

        {/* Notification bell — icon only, unread state is a corner dot */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-8 w-8 items-center justify-center text-label transition-colors duration-micro hover:text-foreground"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
          <span
            className="severity-dot absolute right-1 top-1 ring-2 ring-page bg-primary"
            aria-hidden
          />
        </button>

        <Avatar>
          <AvatarFallback>{initials(user?.email)}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
