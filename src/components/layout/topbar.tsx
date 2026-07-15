"use client";

import { Bell, Building2, Search } from "lucide-react";

import { RealtimeIndicator } from "@/components/avir/realtime-indicator";
import { useAuth } from "@/lib/providers/auth-provider";

export function Topbar() {
  const { orgName } = useAuth();

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-page px-6">
      {/* Global search — placeholder wiring for Phase 0 */}
      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-hint" />
        <input
          type="search"
          disabled
          placeholder="Search aircraft, fleets, components…"
          className="h-9 w-full border border-input bg-transparent pl-9 pr-3 text-sm text-foreground placeholder:text-hint focus:border-primary focus:outline-none disabled:cursor-not-allowed"
          aria-label="Global search"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 border border-border px-1.5 font-mono text-[10px] text-hint sm:inline-flex">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-4">
        <RealtimeIndicator />

        {/* Org context indicator */}
        <div className="hidden items-center gap-2 border-l border-border pl-4 md:flex">
          <Building2 className="h-4 w-4 text-label" />
          <span className="max-w-[12rem] truncate text-sm text-body">
            {orgName ?? "AVIR Operations"}
          </span>
        </div>

        {/* Notification bell — placeholder */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-8 w-8 items-center justify-center border border-border text-label transition-colors duration-micro hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1 top-1 severity-dot bg-primary" aria-hidden />
        </button>
      </div>
    </header>
  );
}
