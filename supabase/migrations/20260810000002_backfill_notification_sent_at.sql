-- Bug B (data): the notification detail showed "Sent —" for every notification
-- because sent_at_utc was never populated by the seed, even for delivered ones.
-- Backfill a real sent time for notifications that were actually dispatched
-- (delivered/sent/acknowledged/retried). Genuinely-undispatched states
-- (queued/failed/cancelled) keep a null sent time — the UI now labels those
-- "Not sent yet" instead of a bare dash.
update public.notification_events
set sent_at_utc = coalesce(sent_at_utc, delivered_at_utc, created_at_utc)
where sent_at_utc is null
  and delivery_status in ('sending', 'delivered', 'acknowledged', 'retried');
