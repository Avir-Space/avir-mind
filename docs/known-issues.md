# AVIR Mind — Known Issues (as of 2026-07-19)

Documented from Module 1-8 E2E testing. These are bugs found
via test suite that we consciously chose to fix in sequence
rather than defer. Sequence:

Pass 1 (task ecosystem):
- E: /tasks route 404
- F: Duplicate task creation from predictions
- G: No task-created toast/feedback

Pass 2 (data + routing):
- A: Fleet category and risk filters not applying
- B: Component list count shows total not filtered
- C: Inventory /inventory/parts/[id] returns "Part not found"
- D: /signals missing supply_chain category filter option
- H: Flight detail tabs (Dispatch, Crew, Weather, etc.)
  render but content mostly empty due to missing seed data
- I: Weather signals evidence_refs is empty object {}

Test-code drift (fixed / do not re-open as product bugs):
- J: Module 4.3.1 asserted `/genesis/i` on the Genealogy tab.
  UI label is "Birth Certificate"; "— genesis —" only appears
  inside an expanded ledger row's `previous_record_hash` field.
  Spec updated 2026-07-19.
- K: Module 1 settings hub cards use titles "Single sign-on" /
  "Active sessions" (not "SSO" / "Sessions").
- L: Module 2 station drawer filter button often already reads
  "Filtering to this station" because CanvasDrawer hardcodes
  `filtered={true}` when a station target is open.
- M: Module 5 delay attribution writes `delay_attribution`
  (not a `flight_delays` table). Spec assertions updated.
- N: Module 7 Active notifications are recipient-scoped
  (`recipient_user_id = auth.uid()`), while org-wide RLS can
  make `countUnacknowledged` misleading for the owner persona.
  Tests now pick a persona that owns an unacked row.

Seed / env gaps (skip, not product bugs):
- Forgot-password may surface a provider error when SMTP is
  unconfigured; 1.1.6 accepts success or error banner.
- Owner may have no Active notifications after ack runs;
  7.5.4/7.5.5 discover a recipient persona dynamically.

Not fixing yet (enterprise-tier deferred):
- Role-scoped nav gating
- SSO admin enforcement
- Station-scoped Line Maintenance view
- Full FDP lookup tables for non-Part-117 regulators
- Cross-tenant genealogy transfer / provenance / anonymous export
