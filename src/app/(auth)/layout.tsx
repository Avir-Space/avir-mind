import { Logo } from "@/components/layout/logo";

/**
 * Split-screen auth shell: brand panel on the left, form on the right.
 * Lives outside AppLayout — no sidebar, no topbar.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-page lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between border-r border-border bg-surface/40 p-10 lg:flex">
        <Logo />
        <div className="max-w-md">
          <p className="eyebrow mb-4">Aviation Operating System</p>
          <h1 className="font-serif text-4xl leading-tight text-foreground">
            Every aircraft, every signal, every decision.
          </h1>
          <p className="mt-3 font-serif text-2xl leading-snug text-subtext">
            In one operational picture.
          </p>
          <p className="mt-5 text-sm leading-relaxed text-subtext">
            AVIR Mind unifies fleet state, airworthiness, components, and compliance
            into a single source of truth — from charter operators to global carriers.
          </p>
        </div>
        <p className="font-mono text-eyebrow text-hint">
          © {"2026"} AVIR · Confidential
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
