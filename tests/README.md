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
    realtime.ts    twoContexts / waitForRealtimeUpdate
    downloads.ts   interceptDownload / assertPDFStructure
    seed.ts        createFreshOrgWithPersonas / resetPersonaState
  modules/01..08-*.spec.ts
```

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
