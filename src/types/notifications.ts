/** Phase 11 — Communications RPC shapes. */

export type NotificationEvent = {
  id: string;
  trigger_source_type: string | null;
  trigger_source_id: string;
  channel_type: string;
  severity: string | null;
  delivery_status: string;
  notification_content: { subject?: string; body?: string; event_type?: string; deferred?: boolean; escalated?: boolean } | null;
  created_at_utc: string;
  sent_at_utc: string | null;
  delivered_at_utc: string | null;
  acknowledged_at_utc: string | null;
  escalation_of_notification_id: string | null;
  role_name: string | null;
};

export type NotificationChannel = {
  id: string;
  channel_type: string;
  channel_address: string;
  verification_status: string;
  verified_at_utc: string | null;
  is_active: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string | null;
  emergency_override: boolean;
  muted_until_utc: string | null;
};

export type UserPreferences = {
  channels: NotificationChannel[];
  digests: { digest_type: string; sent_at_utc: string | null }[];
};

export type NotificationPolicy = {
  id: string;
  policy_name: string;
  event_type: string;
  filter_criteria: Record<string, unknown>;
  target_role_ids: string[];
  target_user_ids: string[];
  channel_preferences: Record<string, string[]>;
  escalation_ladder: Array<Record<string, unknown>>;
  quiet_hours_behavior: string;
  is_active: boolean;
};

export type OrgRole = {
  id: string;
  role_code: string;
  role_display_name: string;
  typical_shift_pattern: string;
  holders: number;
};

export type OnCallSchedule = {
  id: string;
  schedule_name: string;
  role_id: string;
  role_display_name: string;
  rotation_pattern: Record<string, unknown> | null;
  current_user_id: string | null;
  shifts: Array<{ user_id: string; shift_start_utc: string; shift_end_utc: string; shift_type: string }>;
};

export type SignalNotification = {
  recipient_user_id: string;
  channel_type: string;
  severity: string | null;
  delivery_status: string;
  created_at_utc: string;
  acknowledged_at_utc: string | null;
  role_name: string | null;
};

export type PolicyTestResult = {
  created: number;
  dry_run: boolean;
  targets: Array<{ user_id: string; role_id: string | null; channel_type: string; channel_address: string; deferred: boolean }>;
};

export type Digest = {
  digest_type: string;
  sent_at_utc: string | null;
};
