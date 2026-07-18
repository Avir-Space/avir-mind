# AVIR Mind — Known Issues (as of 2026-07-18)

Documented from Module 1-5 E2E testing. These are bugs found
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

Not fixing yet (enterprise-tier deferred):
- Role-scoped nav gating
- SSO admin enforcement
- Station-scoped Line Maintenance view
- Full FDP lookup tables for non-Part-117 regulators