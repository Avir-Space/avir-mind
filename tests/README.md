# AVIR Mind — End-to-end tests (Playwright)

An 8-module E2E suite. **Module 1 (Foundation & Auth) is fully implemented** as
the reference pattern; Modules 2–8 are scaffolded (`test.fixme` placeholders)
and follow the same shape.

## Setup

```bash
pnpm install                 # installs @playwright/test + helpers
npx playwright install chromium
```

The tests authenticate as seeded **personas** (see `fixtures/personas.ts`),
created by migration `supabase/migrations/20260801000001_test_personas.sql`.
That migration seeds 10 confirmed users (bypassing email verification) into the
existing **Laman Operations** (operator) and **AVIR MRO Demo** (mro) tenants.
It is guarded: it only runs when the DB setting `app.allow_test_personas = 'on'`.

## Running

```bash
pnpm test                       # full suite vs http://localhost:3000 (auto-starts pnpm dev)
pnpm run test:module -- 01      # one module (filename filter)
pnpm run test:smoke             # Module 1 vs https://mind.avirspace.com (no local server)
pnpm run test:ui                # Playwright UI mode
```

Override the target for any run:

```bash
AVIR_TEST_TARGET=https://mind.avirspace.com pnpm run test:module -- 01
```

- 2 workers max (so two-browser realtime tests don't overload).
- 60s test / 10s expect timeouts. Traces + screenshots on failure; video off.
- HTML report in `playwright-report/` locally; JSON in CI.

## Environment

Reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the
environment or falls back to the app's `.env.local`. Set
`SUPABASE_SERVICE_ROLE_KEY` to enable the service-role assertions (a few tests
`test.skip` without it).

## Structure

```
tests/
  playwright.config.ts
  fixtures/personas.ts          # 10 typed personas + getPersona()
  helpers/
    auth.ts        signIn / signInAs / signOut / loginError
    supabase.ts    getServiceRoleClient / getAnonClientAs / runSQL / expectRLSBlocks
    realtime.ts    twoContexts / waitForRealtimeUpdate / expectAircraftStateChangeInOtherBrowser / expectSignalToAppearInOtherBrowser
    dragDrop.ts    dragKanbanCard (dnd-kit 8px) / confirmModalAndWait / fleetColumn / fleetCard
    signals.ts     readStatTile / filterBySeverity / filterByCategory / toggleNeedsYou / clearAllFilters
    tasks.ts       addComment / logWork / createTaskFromSignal
    downloads.ts   interceptDownload / assertPDFStructure
    seed.ts        createFreshOrgWithPersonas / resetPersonaState
  modules/01..08-*.spec.ts     # 01,02,03 implemented; 04–08 scaffolded
```

### Modules 2 & 3 deviations (implemented against real app behavior)

| Spec assumption | Reality in the app | Handling |
|---|---|---|
| Fleet board has 24 cards | 1 seeded aircraft is state `unknown` (no column) → 23 on board | count asserted as a tolerant band (parallel drags mutate state) |
| Board/List toggle writes `?view=list` | Toggle is **local state only**; only inbound `?view=list` selects List | assert rendered content, not the URL |
| `/aircraft` → 301/302 | **308** permanent redirect → `/fleet?view=list` | accept 301/308 |
| Profile tabs incl. Overview / Task Board / Genealogy | Tabs are Signals(default)/Components/Ops Profile/Maintenance/Compliance/Parts/Crew/Financial/Impact/Timeline; Task Board is a header **link** | assert the real tabs + the link |
| Canvas shows 24 markers | Only aircraft with lat/lng plot (leaflet CircleMarker paths) | assert ≥4 markers, not 24 |
| `/signals` shows SignalCards with Create Task/Dismiss | `/signals` renders the **tasks queue** (Acknowledge + Details expander); Create Task/Dismiss live on `/signals/[id]` | tests target each surface where the control exists |
| Line-maintenance sees a station-scoped fleet | Fleet is **org-scoped** (no station scoping) | 2.5.1 `test.fixme` + a positive test documenting full-org visibility |
| Dispatcher can't see compliance-category signals | Categories are not role-gated | 3.7.2 `test.fixme` |
| Read-only user's Create Task button is hidden/disabled | Write-gating is at RLS/RPC, not the UI | 3.7.1 asserts the RPC is denied |
| New signal appears on `/signals` (realtime) | Queue is derived tasks, not raw signals | 3.6.1 `test.fixme`; realtime covered by 3.6.2 (task) + 2.4.1 (fleet) |

## Deviations from the spec (important)

| Spec assumption | Reality in the app | Handling |
|---|---|---|
| Routes `/sign-in`, `/sign-up` | App uses `/login`, `/signup` | Helpers target `/login`; 1.1.1 signup `test.fixme` (email confirmation required — personas bypass at DB) |
| `org_members.role = 'member'` | Roles are `owner/admin/editor/viewer` | Persona `member` → `editor`; documented in fixtures |
| Job title stored on membership | No `job_title` column | Stored in `raw_user_meta_data` + a crew row for operator personas |
| Role-gated nav (dispatcher hides Compliance) | Nav filters by business model + founder flag only | 1.2.3 `test.fixme` |
| Station-scoped views | Data is org-scoped | 1.2.4 `test.fixme` |
| Read-only hides write buttons | Write-protection is at RLS/RPC (see 1.7) | 1.2.2 `test.fixme` |
| Route-level SSO/admin gating | SSO page renders for members; save is RPC-gated | 1.3.2 `test.fixme` |
| Login-time MFA challenge | Enroll+verify works (1.4.1, aal2), but the app never challenges for MFA at sign-in (no AAL gate in login/middleware) | 1.4.2/1.4.3 `test.fixme` — need a login-time AAL gate (product change) |
| 2FA-required on API key create | API-key create is admin-gated; step-up only gates Index publish | 1.4.4 `test.fixme` |
| Auth-hook audit of login/failure | Supabase Auth doesn't call `log_audit_event` | 1.6.1/1.6.3 `test.fixme`; 1.6.2 (app RPC) implemented |
| Live session tracking | **Now live**: middleware records `user_sessions` on every authed navigation (insert-once + touch); terminated sessions bounce to `/login` | 1.5.1 asserts the live session; 1.5.2 (cross-context terminate) **implemented** |
| Guard = Supabase secret `AVIR_ALLOW_TEST_PERSONAS` | Migrations can't read edge-fn secrets | Modeled as DB GUC `app.allow_test_personas`; migration opts in for the demo DB |

Everything else in Module 1 (sign-in for all 10 personas, invalid-credential
rejection, sign-out, owner/MRO nav, SSO save, TOTP enrollment + its audit event,
cross-tenant RLS, API-key scope 403, zero-radius + Instrument Serif, the
three-band canvas, station drawer, time-window selector) is implemented against
real app behavior.

### Modules 4 & 5 deviations (implemented against real app behavior)

| Spec assumption | Reality in the app | Handling |
|---|---|---|
| Health bands 80/60 | Bands are 75/50/25 → Healthy/Watch/Degraded/Critical | assert against real bands |
| Component detail incl. "Related Signals" tab | Tabs are Overview/Events/Predictions/Health Trend/Genealogy | assert Predictions tab |
| Event types cycle_snapshot/installation/finding | cycle_recorded/installed/finding_recorded; no cycles/hours inputs (auto-filled) | 4.2.2 asserts the event row; counter/LLP-advance via UI not possible |
| LLP is_llp/life_used columns + 100% install lock | Separate `life_limited_parts` (percentage_used generated); **no install guard** | 4.5.1 SQL; 4.5.3 fixme (product gap) |
| Genealogy export PDF download | PDF is browser print-to-PDF (no download event) | 4.4.1 fixme; JSON/zip verified (4.4.2/4.4.3) |
| Genealogy content_hash recompute in JS | SHA-256 over Postgres jsonb::text (not JS-reproducible) | verify chain linkage instead |
| `supply_chain` signal category | It's `stock_transfer_opportunity` (evidence type `part`) | assert the real category |
| Crew roster list w/ available/on_duty/resting | Roster is a duty GRID; Directory is the table; no such status field | 5.3.1 uses Directory |
| Dispatch releases seeded | 0 seeded | 5.4.2 creates one test-scoped via `create_dispatch_release` |
| `/weather` route with TAF | It's `/flight-ops/weather`; board shows METAR (TAF on flight detail) | assert board + METAR |
| delay_pattern references route | Keys on delay_code (recurring cause), not origin/destination | assert real evidence + note |
