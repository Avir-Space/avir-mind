# AVIR Mind

The operating system for aviation operations. One product, modular per tenant —
from small charter operators to major international airlines.

This repository is the **Phase 0 foundation**: a beautifully designed empty shell
with working navigation, auth, seeded demo data, and a locked design system.
Feature modules ship in later phases.

## Stack

| Layer          | Choice                                             |
| -------------- | -------------------------------------------------- |
| Framework      | Next.js 15 (App Router), TypeScript strict         |
| Styling        | Tailwind CSS + CSS-variable design tokens          |
| Components     | shadcn/ui base, customized to AVIR (zero radius)   |
| Data + auth    | Supabase (`@supabase/ssr` server + browser)        |
| Server state   | TanStack Query v5                                  |
| Icons          | lucide-react                                       |
| Deploy         | Vercel                                             |

## Design system (locked)

- **Radius: 0** everywhere. Severity dots are the only circles.
- **Primary accent:** `#1019EC` electric blue, used sparingly.
- **Backgrounds:** white light mode, near-black (`#0A0A0B`) dark mode. Both first-class.
- **Type:** Instrument Serif (display), Satoshi (body/UI), JetBrains Mono (technical).
- **Severity palette:** Critical `#DC2626` · High `#EA580C` · Medium `#CA8A04` ·
  Low `#16A34A` · Info `#2563EB`.
- **Motion:** 150ms micro, 250ms panels. No decorative animation.
- **Density:** professional dense, not consumer airy.

Tokens live in `src/app/globals.css`; the Tailwind mapping is in `tailwind.config.ts`.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase keys
pnpm dev                     # http://localhost:3000
```

### Environment variables

| Variable                        | Purpose                                  |
| ------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key (client-safe)       |
| `NEXT_PUBLIC_SITE_URL`          | Base URL for auth email redirects        |

## Database

Migrations live in `supabase/migrations/`. Apply them to the linked project:

```bash
pnpm db:push       # supabase db push
pnpm db:types      # regenerate src/types/database.ts
```

On signup, a Postgres trigger provisions the new user into their own org and
seeds 3 fleets and 24 aircraft with realistic state distributions. All tables
have Row Level Security enabled — a user can only ever see their own org's data.

## Project structure

```
src/
  app/
    (auth)/          login, signup, forgot-password  (outside the app shell)
    (app)/           AppLayout: sidebar + topbar, all 11 module routes
  components/
    ui/              shadcn primitives, zero-radius + AVIR-styled
    avir/            SeverityBadge, StatusBadge, SourceBadge, ConfidenceBadge, MonoText, ...
    layout/          Sidebar, Topbar, RealtimeIndicator, ThemeToggle
  lib/
    supabase/        browser + server clients (@supabase/ssr)
    providers/       Auth, Query, Theme
    queries/         TanStack Query hooks
  types/             generated DB types + domain types
supabase/migrations/ schema, RLS, triggers, seed function
```

## Scripts

| Script            | Does                                      |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Dev server                                |
| `pnpm build`      | Production build                          |
| `pnpm typecheck`  | `tsc --noEmit` (strict)                   |
| `pnpm lint`       | ESLint                                    |
| `pnpm format`     | Prettier                                  |
| `pnpm db:push`    | Apply Supabase migrations                 |
