// Shapes returned by the Phase 1 task RPCs (get_command_center_queue,
// get_fleet_board, get_task_detail). These mirror the jsonb the SQL builds.

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type TaskStatus = "queued" | "in_progress" | "blocked" | "monitoring" | "done";
export type RiskBand = "high" | "medium" | "low";
export type SourceSystem = "amos" | "trax" | "sap" | "fr" | "avir";

export type TaskSourceRef = {
  source_system: SourceSystem;
  source_reference_id: string | null;
  source_url: string | null;
  first_seen_at_utc?: string;
  last_seen_at_utc?: string;
};

export type TaskEventRow = {
  id?: string;
  event_type: string;
  body: string | null;
  event_payload?: Record<string, unknown>;
  actor_user_id: string | null;
  created_at_utc: string;
};

export type QueueItem = {
  task_id: string;
  aircraft_id: string;
  tail_number: string;
  title: string;
  why_summary: string | null;
  parent_type: string;
  sub_type: string;
  status: TaskStatus;
  risk_band: RiskBand;
  severity: Severity;
  dispatch_blocking: boolean;
  aog: boolean;
  station_code: string | null;
  facility: string | null;
  due_at_utc: string | null;
  created_at_utc: string;
  updated_at_utc: string;
  assignee_user_id: string | null;
  sources: TaskSourceRef[];
  acknowledged_by_me: boolean;
  recent_events: TaskEventRow[];
};

export type CommandCenterStats = {
  active_signals: number;
  blocking_dispatch: number;
  aog_aircraft: number;
  team_load: number;
};

export type CommandCenterQueue = {
  stats: CommandCenterStats;
  queue: QueueItem[];
};

export type PrimaryTask = {
  task_id: string;
  title: string;
  why_summary: string | null;
  parent_type: string;
  sub_type: string;
  risk_band: RiskBand;
  severity: Severity;
  dispatch_blocking: boolean;
  aog: boolean;
  facility: string | null;
  sources: TaskSourceRef[];
};

export type BoardCard = {
  aircraft_id: string;
  tail_number: string;
  aircraft_type: string;
  station_code: string | null;
  state: string | null;
  task_count: number;
  dispatch_blocking: boolean;
  aog: boolean;
  severity_summary: { high: number; medium: number; low: number };
  primary_task: PrimaryTask | null;
};

export type BoardColumnKey = "under_maintenance" | "in_air" | "on_ground" | "stationed";

export type FleetInsight = {
  category: string;
  severity: Severity;
  title: string;
  one_liner: string;
  aircraft_count: number;
};

export type FleetBoard = {
  columns: Record<BoardColumnKey, BoardCard[]>;
  insights: FleetInsight[];
};

export type TaskDetail = {
  task: {
    task_id: string;
    org_id: string;
    aircraft_id: string;
    tail_number: string;
    aircraft_type: string;
    title: string;
    why_summary: string | null;
    parent_type: string;
    sub_type: string;
    status: TaskStatus;
    risk_band: RiskBand;
    severity: Severity;
    dispatch_blocking: boolean;
    aog: boolean;
    station_code: string | null;
    facility: string | null;
    due_at_utc: string | null;
    started_at_utc: string | null;
    assignee_user_id: string | null;
    reporter_user_id: string | null;
    pinned: boolean;
    estimated_duration_hours: number | null;
    created_at_utc: string;
    updated_at_utc: string;
    acknowledged_by_me: boolean;
  };
  sources: TaskSourceRef[];
  events: TaskEventRow[];
  acknowledgements: { user_id: string; acknowledged_at_utc: string }[];
  work_logs: {
    id: string;
    user_id: string;
    time_spent_minutes: number;
    description: string | null;
    work_date: string;
    created_at_utc: string;
  }[];
  attachments: {
    id: string;
    filename: string;
    file_size_bytes: number;
    mime_type: string;
    storage_path: string;
    uploaded_by_user_id: string;
    created_at_utc: string;
  }[];
  dependencies: {
    blocks: { task_id: string; title: string; status: TaskStatus }[];
    blocked_by: { task_id: string; title: string; status: TaskStatus }[];
  };
};
